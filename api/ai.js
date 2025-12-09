// api/ai.js

import OpenAI from "openai";

export const config = {
  api: { bodyParser: false }, // Twilio sends form data
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Parse Twilio x-www-form-urlencoded body
async function parseTwilio(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");

  const params = new URLSearchParams(raw);
  const body = {};
  for (const [k, v] of params.entries()) body[k] = v;
  return body;
}

// Load context from ?ctx=...
function loadCtx(req) {
  try {
    const raw = req.query?.ctx;
    if (!raw) {
      return {
        stage: "intro",          // intro → ask_name → ask_business → ask_need → ask_reason → ask_appt → confirm → done
        callerName: null,
        businessName: null,
        mainNeed: null,          // scheduling / reception / sales / admin / payroll / missed calls / automation / other
        reason: null,            // why now
        apptTime: null,          // preferred time
        transcript: [],
      };
    }
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {
      stage: "intro",
      callerName: null,
      businessName: null,
      mainNeed: null,
      reason: null,
      apptTime: null,
      transcript: [],
    };
  }
}

// Save context to base64url
function saveCtx(ctx) {
  return Buffer.from(JSON.stringify(ctx), "utf8").toString("base64url");
}

export default async function handler(req, res) {
  try {
    const host = req.headers.host;
    const body = await parseTwilio(req);

    const callerSpeech = (body.SpeechResult || "").trim();
    let ctx = loadCtx(req);

    if (callerSpeech) {
      ctx.transcript.push({ from: "caller", text: callerSpeech });
      if (ctx.transcript.length > 8) ctx.transcript = ctx.transcript.slice(-8);
    }

    const system = `
You are Michael, a trusted, fast-talking intake agent for Iron-Core AI Systems.

Iron-Core builds custom AI automations for small businesses:
- missed call capture
- receptionist & scheduling
- sales follow ups & lead qualification
- admin & back-office tasks
- payroll & basic bookkeeping
- customer service & FAQ

You are on a LIVE PHONE CALL. Speed matters more than personality.
Keep EVERY reply under 15 words and 1 sentence.

Conversation goal:
1) Understand what they want AI for (scheduling, reception, sales, admin, payroll, missed calls, automation, or other).
2) Collect:
   - callerName (their name)
   - businessName
   - mainNeed (their top AI use case)
   - reason ("why now" / pain)
   - apptTime (when they want a demo or strategy call)
3) Summarize the info.
4) Confirm it's correct.
5) End the call politely once confirmed.

Stages in ctx.stage:
- "intro"       : welcome + high-level question about what they want AI to help with.
- "ask_name"    : ask for their name.
- "ask_business": ask business name.
- "ask_need"    : ask what they want AI to help with (scheduling, reception, sales, admin, payroll, etc).
- "ask_reason"  : ask why they are considering AI now / main pain.
- "ask_appt"    : ask what day/time they'd like to set a demo or strategy call.
- "confirm"     : repeat key details and ask if it's correct.
- "done"        : they confirmed; just thank them and end.

Rules:
- Use callerSpeech plus ctx to decide the next stage and update fields.
- Do NOT re-ask questions you've already clearly answered, unless they correct something.
- When moving to "confirm", your reply should be a short summary question, e.g.:
  "So I have you as [name] from [business], needing AI for [need] because [reason], and you prefer [apptTime]. Is that correct?"
- When they confirm, set ctx.stage = "done" and endCall = true with a short closing line.

Output format (IMPORTANT):
You MUST return STRICT JSON ONLY:
{
  "reply": "what you say next to the caller (1 short sentence)",
  "ctx": { ...updated ctx object... },
  "endCall": true or false
}
No extra keys. No prose. No code fences.
    `.trim();

    const userPayload = JSON.stringify({
      ctx,
      caller: callerSpeech,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 180,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPayload },
      ],
    });

    let raw = (completion.choices[0]?.message?.content || "").trim();

    let reply = "Could you repeat that for me?";
    let endCall = false;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.reply === "string") reply = parsed.reply.trim() || reply;
        if (parsed.ctx && typeof parsed.ctx === "object") ctx = parsed.ctx;
        if (typeof parsed.endCall === "boolean") endCall = parsed.endCall;
      }
    } catch (e) {
      // If model ever sends non-JSON, fall back gracefully
      console.warn("JSON parse failed from model, raw:", raw);
    }

    // Track our reply in transcript too
    ctx.transcript.push({ from: "agent", text: reply });
    if (ctx.transcript.length > 8) ctx.transcript = ctx.transcript.slice(-8);

    const ctxEncoded = saveCtx(ctx);
    const encodedReply = encodeURIComponent(reply);
    const ttsUrl = `https://${host}/api/tts?text=${encodedReply}`;

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
      // Continue conversation; carry ctx forward in the URL
      const actionUrl = `https://${host}/api/ai?ctx=${ctxEncoded}`;
      twiml = `
<Response>
  <Gather input="speech"
          action="${actionUrl}"
          method="POST"
          timeout="3"
          speechTimeout="auto">
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
      .status(200)
      .send(
        `<Response><Say>Sorry, something went wrong on our end.</Say><Hangup/></Response>`
      );
  }
      }
