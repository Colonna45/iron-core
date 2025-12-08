import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,  // ✅ correct key name
});

export default async function handler(req, res) {
  try {
    // Accept ?text=... from URL OR JSON body { text: "..." }
    const queryText = req.query?.text;
    const bodyText = req.body?.text;

    const text =
      (queryText && decodeURIComponent(queryText)) ||
      bodyText ||
      "Hello, this is Iron-Core AI speaking.";

    const audio = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text,
    });

    const buffer = Buffer.from(await audio.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.status(200).send(buffer);
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: "TTS failed" });
  }
}
