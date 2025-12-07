const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function readTwilioBody(req) {
  // Twilio sends URL-encoded data; manually parse it
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

  const body = await readTwilioBody(req);
  const userText = body.SpeechResult || body.TranscriptionText || "";

  const prompt = userText || "Say hello and explain you are Iron-Core AI.";

  // 🔹 Call OpenAI for the reply text
  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Iron-Core AI, a friendly but efficient phone assistant." },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await openaiRes.json();
  const reply =
    data?.choices?.[0]?.message?.content?.trim() ||
    "I am Iron-Core AI. Something went wrong, but I am online.";

  // Encode reply so we can send it to the TTS endpoint as a query param
  const encodedText = encodeURIComponent(reply);

  const twiml = `
    <Response>
      <Play>https://${req.headers.host}/api/tts?text=${encodedText}</Play>
      <Redirect>/api/voice</Redirect>
    </Response>
  `;

  res.status(200).send(twiml.trim());
}
