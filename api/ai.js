const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Helper: read Twilio POST body (URL-encoded)
async function readTwilioBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const params = new URLSearchParams(raw);
  const body = {};
  for (const [k, v] of params.entries()) body[k] = v;
  return body;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/xml");

  try {
    // 1) Get what Twilio heard
    const body = await readTwilioBody(req);
    const userText = body.SpeechResult || "The caller said nothing audible.";

    // 2) If we don't have an API key, fall back gracefully
    if (!OPENAI_API_KEY) {
      const fallback = `
<Response>
  <Say>Iron Core AI is online, but my brain is not configured yet. Please add the Open A I key.</Say>
</Response>
`.trim();
      res.status(200).send(fallback);
      return;
    }

    // 3) Ask GPT what to say back
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "You are Iron-Core AI, a fast, confident phone assistant. Answer in 1-2 short sentences, spoken conversation style, no emojis.",
          },
          {
            role: "user",
            content: `The caller said: "${userText}". Reply as if you are talking back to them on a phone call.`,
          },
        ],
      }),
    });

    if (!openaiRes.ok) {
      console.error("OpenAI error:", await openaiRes.text());
      throw new Error("OpenAI request failed");
    }

    const data = await openaiRes.json();
    const replyText =
      data.choices?.[0]?.message?.content?.trim() ||
      "I heard you, but something went wrong generating a reply.";

    // 4) Send GPT reply text to ElevenLabs TTS via our /api/tts endpoint
    const encodedText = encodeURIComponent(replyText);

    const twiml = `
<Response>
  <Play>https://${req.headers.host}/api/tts?text=${encodedText}</Play>
  <Redirect>/api/voice</Redirect>
</Response>
`.trim();

    res.status(200).send(twiml);
  } catch (err) {
    console.error("AI route error:", err);
    const errorTwiml = `
<Response>
  <Say>Iron Core A I ran into an internal error. Please try again later.</Say>
</Response>
`.trim();
    res.status(200).send(errorTwiml);
  }
}
