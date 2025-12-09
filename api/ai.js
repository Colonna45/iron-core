// api/ai.js

import OpenAI from "openai";

export const config = {
  api: { bodyParser: false },
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Parse Twilio form body
async function parseTwilio(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");

  const out = {};
  const params = new URLSearchParams(raw);
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

// Decode context
function loadCtx(req) {
  try {
    if (!req.query?.ctx) return {
      stage: "intro",
      name: null,
      business: null,
      need: null,
      reason: null,
      appt: null,
      transcript: []
    };
    const json = Buffer.from(req.query.ctx, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {
      stage: "intro",
      name: null,
      business: null,
      need: null,
      reason: null,
      appt: null,
      transcript: []
    };
  }
}

// Encode context
function saveCtx(ctx) {
  return Buffer.from(JSON.stringify(ctx), "utf8").toString("base64url");
}

export default async function handler(req, res) {
  try {
    const body = await parseTwilio(req);
    const callerSpeech = (body.SpeechResult || "").trim();

    let ctx = loadCtx(req);

    if (callerSpeech) {
      ctx.transcript.push({ from: "caller", text: callerSpeech });
      if (ctx.transcript.length > 8) ctx.transcript = ctx.transcript.slice(-8);
    }

    const system = `
You are Michael, the trusted AI intake agent for Iron-Core AI Systems.

Your ONLY goals:
1. Quickly understand what the business needs help with.
2. Ask short, conversational sales-intake questions.
3. Collect:
   - Business name
   - Caller’s name
   - What problem they want AI for (scheduling, reception, sales, admin, payroll, missed calls, automation)
   - Why they're considering AI right now
   - Their preferred appointment time
4. Summarize the info.
5. Confirm.
6. End call politely.

STAGES:
intro → ask_name → ask_business → ask_need → ask_reason → ask_appt → confirm → done

You MUST ALWAYS return strict JSON ONLY:

{
 "reply": "what you say to the caller (short)",
 "ctx": { updated context object },
 "endCall": true or false
}

Keep replies under 1–2 sentences.
Never ramble.
Never reset the conversation.
Never apologize.
    `.trim();

    const user = JSON.stringify({ ctx, caller: callerSpeech });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    let raw = completion.choices[0].message.content.trim();

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      parsed = {
        reply: "Sorry, could you repeat that?",
        ctx,
        endCall: false
      };
    }

    ctx = parsed.ctx || ctx;

    let reply = parsed.reply || "Could you repeat that?";
    let end = parsed.endCall === true;

    // Add agent reply to transcript
    ctx.transcript.push({ from: "agent", text: reply });
    if (ctx.transcript.length > 8) ctx.transcript = ctx.transcript.slice(-8);

    const ctxEncoded = saveCtx(ctx);

    const host = req.headers.host;
    const ttsUrl = `https://${host}/api/tts?text=${encodeURIComponent(reply)}`;

    let twiml;
    if (end) {
      twiml = `
<Response>
  <Play>${ttsUrl}</Play>
  <Hangup/>
</Response>
      `.trim();
    } else {
      twiml = `
<Response>
  <Gather input="speech" action="https://${host}/api/ai?ctx=${ctxEncoded}" method="POST" timeout="6">
    <Play>${ttsUrl}</Play>
  </Gather>
  <Say>I didn't catch that. Goodbye.</Say>
</Response>
      `.trim();
    }

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);

  } catch (err) {
    console.log("AI ERROR:", err);
    res.status(200).send(`
<Response>
  <Say>Sorry, something went wrong.</Say>
  <Hangup/>
</Response>`);
  }
}
