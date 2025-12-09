// api/tts.js

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  try {
    // Text can come from ?text=... or JSON body { text: "..." }
    const queryText = req.query?.text;
    let bodyText = null;

    if (
      req.method === "POST" &&
      req.headers["content-type"]?.includes("application/json")
    ) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        const json = JSON.parse(raw);
        bodyText = json.text;
      } catch {
        bodyText = null;
      }
    }

    const text =
      (queryText && decodeURIComponent(queryText)) ||
      bodyText ||
      "Hey, my name is Michael with Iron-Core AI Systems. How can I help today?";

    const audio = await client.audio.speech.create({
      model: "gpt-4o-mini-tts", // fast TTS
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
