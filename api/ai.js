// api/ai.js

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// We handle Twilio's x-www-form-urlencoded manually
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper: read Twilio POST body (form-encoded)
async function getTwilioBody(req) {
  // If body already parsed and non-empty, use it
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
