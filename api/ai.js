// api/ai.js

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Twilio sends x-www-form-urlencoded; we'll parse it manually
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper: parse Twilio body
async function getTwilioBody(req) {
  if (
    req.body &&
    typeof req.body === "object" &&
    Object.keys(req.body).length > 0
  ) {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");

  const params = new URLSearchParams(raw);
  const body = {};
  for (const [key, value] of params.entries()) {
    body[key] = value;
  }

  return body;
}

// Helper: decode context from ?ctx=...
function decodeCtx(req) {
  try {
    const ctxParam = req.query?.ctx;
    if (!ctxParam) return null;
    const json = Buffer.from(ctxParam, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch (e) {
    console.warn("Failed to decode ctx:", e);
    return null;
  }
}

// Helper: encode context into base64url for next turn
function encodeCtx(ctx) {
  try {
    const json = JSON.stringify(ctx);
    return Buffer.from(json, "utf8").toString("base64url");
  } catch (e) {
    console.warn("Failed to encode ctx:", e);
    return "";
  }
}

// Initial context for a new call
function initialCtx() {
  return {
    callType: null, // "HVAC" | "vehicle"
    name: null,
    phone: null,
    vehicle: null, // e.g. "2018 Toyota Camry"
    issue: null,
    apptTime: null, // e.g. "tomorrow at 3 PM"
    stage: "start", // "start" | "collecting" | "confirm" | "done"
    transcript: [], // {from: "caller" | "agent", text: string}[]
  };
}

export default async function handler(req, res) {
  try {
    const body = await getTwilioBody(req);
    const host = req.headers.host;

    const callSid = body.CallSid || "unknown-call";
    const from = body.From || "unknown-from";

    // Twilio <Gather input="speech"> sends SpeechResult
    const rawSpeech = body.SpeechResult || body.Body || "";
    const speech = String(rawSpeech || "").trim();

    // Load or create context
    let ctx = decodeCtx(req) || initialCtx();

    if (speech) {
      ctx.transcript.push({ from: "caller", text: speech });
      // Keep transcript short so it's fast
      if (ctx.transcript.length > 10) {
        ctx.transcript = ctx.transcript.slice(-10);
      }
    }

    const userText =
      speech ||
      "The caller did not say anything clearly. Politely ask them to repeat what they need.";

    // Build a small, fast prompt with explicit JSON output
    const systemPrompt = `
You are Iron-Core AI, a fast receptionist for a local shop handling HVAC systems and vehicles.
You are given a current state object "ctx" and the caller's latest message "caller".

Your job:
- Update ctx based on what the caller just said.
- Decide the next short thing to say (1–2 sentences).
- Move the call forward to scheduling and confirmation as quickly as possible.
- End the call once everything is confirmed.

Fields in ctx (state):
- callType: null | "HVAC" | "vehicle"
- name: string | null
- phone: string | null
- vehicle: string | null (for vehicle calls only)
- issue: string | null
- apptTime: string | null (e.g. "tomorrow at 3 PM")
- stage: "start" | "collecting" | "confirm" | "done"
- transcript: recent short history of the conversation (you may read it but don't rewrite it)

Call flow rules:

1) If ctx.callType is null:
   - If the caller's message indicates HVAC, set ctx.callType = "HVAC".
   - If it indicates a vehicle, set ctx.callType = "vehicle".
   - If unclear, ask once: "Are you calling about your HVAC system or your vehicle today?"
   - reply should be that question in that case.

2) Once callType is known:
   - Set ctx.stage = "collecting" if not already set.
   - For HVAC:
       Collect in this order, one at a time:
         a) name
         b) phone
         c) issue
         d) preferred appointment day/time
   - For vehicle:
       Collect in this order, one at a time:
         a) name
         b) phone
         c) vehicle year/make/model
         d) issue
         e) preferred appointment day/time

   When the caller answers a question, fill the corresponding field in ctx.
   Do NOT re-ask for information you already have, unless the caller corrects it.

3) When all required fields for this callType are filled:
   - Set ctx.stage = "confirm".
   - Build a short summary:
       For HVAC:
         "So I have you as [name], phone number [phone]. Your HVAC issue is: [issue]. You'd like an appointment at [apptTime]. Is that correct?"
       For vehicle:
         "So I have you as [name], phone number [phone], driving a [vehicle]. Your issue is: [issue]. You'd like an appointment at [apptTime]. Is that correct?"
   - reply should be that summary question.

4) If the caller confirms (says yes / sounds like confirmation):
   - Set ctx.stage = "done".
   - reply: "Perfect. You're all set. Our team will follow up to finalize your appointment. Thank you for calling."
   - Set endCall = true.

5) If the caller corrects or changes something:
   - Update the relevant ctx field(s).
   - If still missing something, ask ONLY for what's missing.
   - If everything is filled, go back to confirm step.

Output format:
- You MUST respond with STRICT JSON and nothing else.
- The JSON structure MUST be:
  {
    "reply": "what I say next, short and spoken-friendly",
    "ctx": { ...updated ctx object... },
    "endCall": true or false
  }

Do not add any extra keys.
Do not include explanations.
Do not include code blocks.
Only valid JSON.
    `.trim();

    const userPayload = {
      ctx,
      caller: userText,
    };

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", // fast model
      temperature: 0.2, // low for speed + consistency
      max_tokens: 256,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    });

    let raw = completion.choices[0]?.message?.content || "";
    raw = raw.trim();

    let replyText = "Sorry, I had trouble understanding that. How can I help with your HVAC or vehicle today?";
    let endCall = false;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.reply === "string") {
          replyText = parsed.reply.trim();
        }
        if (parsed.ctx && typeof parsed.ctx === "object") {
          ctx = parsed.ctx;
        }
        if (typeof parsed.endCall === "boolean") {
          endCall = parsed.endCall;
        }
      }
    } catch (e) {
      console.warn("Failed to parse JSON from model:", raw, e);
      // fall back to raw text if it's at least something
      if (raw) replyText = raw;
    }

    // Append agent reply to transcript
    if (replyText) {
      ctx.transcript.push({ from: "agent", text: replyText });
      if (ctx.transcript.length > 10) {
        ctx.transcript = ctx.transcript.slice(-10);
      }
    }

    const ctxBase64 = encodeCtx(ctx);
    const ctxQuery = ctxBase64 ? `?ctx=${encodeURIComponent(ctxBase64)}` : "";
    const encodedSpeech = encodeURIComponent(replyText);
    const ttsUrl = `https://${host}/api/tts?text=${encodedSpeech}`;

    let twiml;

    if (endCall || ctx.stage === "done") {
      // Final message + hang up
      twiml = `
<Response>
  <Play>${ttsUrl}</Play>
  <Hangup/>
</Response>
      `.trim();
    } else {
      // Continue conversation, preserving ctx via query param
      const actionUrl = `https://${host}/api/ai${ctxQuery}`;

      twiml = `
<Response>
  <Gather input="speech" action="${actionUrl}" method="POST" timeout="6">
    <Play>${ttsUrl}</Play>
  </Gather>
  <Say>I didn't catch that. Goodbye.</Say>
</Response>
      `.trim();
    }

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);
  } catch (err) {
    console.error("AI route error:", err);
    res
      .status(500)
      .send(
        `<Response><Say>Sorry, something went wrong on our end.</Say></Response>`
      );
  }
                  }  }

  return body;
}

export default async function handler(req, res) {
  try {
    const body = await getTwilioBody(req);

    // For debugging if needed:
    console.log("TWILIO BODY:", body);

    const callSid = body.CallSid || "unknown-call";
    const from = body.From || "unknown-from";

    // What Twilio sends from <Gather input="speech">
    const rawSpeech = body.SpeechResult || body.Body || "";
    const speech = String(rawSpeech || "").trim();

    const userText =
      speech ||
      "The caller did not say anything. Politely ask what they need help with.";

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `
You are Iron-Core AI, a receptionist for a local shop that handles HVAC systems and vehicles.

Information you have:
- You do NOT have the full conversation history.
- You will only see the caller's latest answer (what they just said).
- Use that answer to move the conversation forward. Do NOT restart from the beginning unless the caller sounds totally confused.

Call flow:
1. If the caller clearly says they are calling about HVAC or a vehicle, do NOT ask again.
   - For "HVAC" calls:
     Ask, one question at a time:
       a) Their full name
       b) Their callback phone number
       c) A short description of the HVAC problem
       d) Their preferred date and time for an appointment
   - For "vehicle" calls:
     Ask, one question at a time:
       a) Their full name
       b) Their callback phone number
       c) Year, make, and model of the vehicle
       d) A short description of the issue
       e) Their preferred date and time for an appointment

2. After you have all required information, clearly REPEAT it back in a summary:
   - Name
   - Phone number
   - (For vehicles) vehicle year/make/model
   - Problem
   - Preferred appointment day and time

   Then ask: "Is that correct?"

3. If the caller says "yes" or confirms:
   - Say: "Perfect. You're all set. Our team will follow up to finalize your appointment. Thank you for calling."
   - Then end your message with the exact text: [END_CALL]

4. If the caller says "no" or corrects something:
   - Politely correct the piece that was wrong.
   - Repeat the updated summary.
   - Ask again if it is correct.

Rules:
- NEVER say "[END_CALL]" out loud. It is only a hidden marker for the system.
- Keep responses short and clear (1–3 sentences at a time).
- Always move the caller closer to a confirmed appointment and ending the call.
- Do not ramble. Do not ask the same question twice if the caller already answered it.
        `.trim(),
        },
        {
          role: "user",
          content: userText,
        },
      ],
    });

    let reply = completion.choices[0]?.message?.content || "";
    reply = reply.trim();

    // Check if AI wants to end the call
    const shouldEnd = reply.includes("[END_CALL]");
    const spokenText = reply.replace("[END_CALL]", "").trim();

    const host = req.headers.host;
    const encoded = encodeURIComponent(spokenText);
    const ttsUrl = `https://${host}/api/tts?text=${encoded}`;

    let twiml;

    if (shouldEnd) {
      // Final message: play TTS and hang up
      twiml = `
<Response>
  <Play>${ttsUrl}</Play>
  <Hangup/>
</Response>
      `.trim();
    } else {
      // Keep the conversation going
      twiml = `
<Response>
  <Gather input="speech" action="/api/ai" method="POST" timeout="6">
    <Play>${ttsUrl}</Play>
  </Gather>
  <Say>I didn't catch that. Goodbye.</Say>
</Response>
      `.trim();
    }

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);
  } catch (err) {
    console.error("AI route error:", err);
    res
      .status(500)
      .send(
        `<Response><Say>Sorry, something went wrong on our end.</Say></Response>`
      );
  }
}
