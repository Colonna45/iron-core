const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const text = url.searchParams.get("text") || "Iron-Core AI is online.";

  const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`;

  const elevenRes = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8
      }
    })
  });

  if (!elevenRes.ok) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "audio/mpeg");
    res.end();
    return;
  }

  // Stream audio back to Twilio
  res.statusCode = 200;
  res.setHeader("Content-Type", "audio/mpeg");

  for await (const chunk of elevenRes.body) {
    res.write(chunk);
  }
  res.end();
}
