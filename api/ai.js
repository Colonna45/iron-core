import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// helper to parse Twilio body if needed
async function readTwilioBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        const params = new URLSearchParams(data);
        const body = {};
        for (const [k, v] of params.entries()) body[k] = v;
        resolve(body);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res
        .status(200)
        .setHeader("Content-Type", "text/xml")
        .send(`<Response><Say>Iron Core AI debug endpoint.</Say></Response>`);
      return;
    }

    const body =
      typeof req.body === "object" && Object.keys(req.body || {}).length
        ? req.body
        : await readTwilioBody(req);

    const callSid = body.CallSid || "unknown-call";
    const from = body.From || "unknown-from";
    const speech = body.SpeechResult || "";

    const userText =
      speech || "The caller said nothing. Start by asking what they need help with.";

    // 🔥 log every turn so you have a record
    console.log("IRON-CORE CALL", {
      callSid,
      from,
      userText,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 80,          // keep replies short (faster)
      temperature: 0.5,        // more stable answers
      messages: [
        {
          role: "system",
          content: `
You are Iron-Core AI, a fast intake agent for HVAC and auto shops.
Keep replies under 2 sentences.
Always sound confident and human.
On each turn, confirm one key detail (name, issue, location, timing) and ask ONE next question.
`.trim(),
        },
        { role: "user", content: userText },
      ],
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I had trouble understanding that. Could you repeat what you need help with?";

    // log the reply too so you have full transcript
    console.log("IRON-CORE REPLY", { callSid, reply });

    const encoded = encodeURIComponent(reply);
    const ttsUrl = `https://${req.headers.host}/api/tts?text=${encoded}`;

    const twiml = `
<Response>
  <Gather input="speech" action="/api/ai" method="POST" timeout="6">
    <Play>${ttsUrl}</Play>
  </Gather>
  <Say>I didn't catch that. Goodbye.</Say>
</Response>
`.trim();

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);
  } catch (error) {
    console.error("AI route error:", error);
    res
      .status(200)
      .setHeader("Content-Type", "text/xml")
      .send(
        `<Response><Say>Iron Core A I hit an internal error. Please try again later.</Say></Response>`
      );
  }
}
