import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  try {
    // Twilio sends application/x-www-form-urlencoded
    const body = req.body || {};
    const userText =
      body.SpeechResult ||
      body.TranscriptionText ||
      ""; // fallback

    const promptText = userText || "Customer is on the line. Start the conversation.";

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Iron-Core AI, a virtual receptionist for blue-collar businesses.
You mainly answer for:
- HVAC contractors
- Auto repair / body shops

GOALS:
1) Sound like a friendly but efficient human.
2) ALWAYS collect:
   - Customer name
   - Phone number
   - City/area
   - Brief description of issue
   - Best time today or tomorrow for a callback/appointment.
3) If it's HVAC:
   - Ask if it's AC, furnace, heat pump, or mini-split.
   - Ask age of system (rough guess) and main symptoms.
4) If it's AUTO:
   - Ask year, make, model, mileage.
   - Ask main issue (noise, dash light, braking, AC, etc.).
5) Do NOT quote prices. Say:
   "The technician will confirm pricing after diagnosis."
6) Keep answers SHORT and conversational (2–4 sentences).
7) End EVERY reply with ONE clear question to keep the caller talking.
          `.trim(),
        },
        { role: "user", content: promptText },
      ],
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Sorry, I had trouble understanding that. Could you repeat it?";

    // Build ElevenLabs TTS URL
    const encodedText = encodeURIComponent(reply);
    const ttsUrl = `https://${req.headers.host}/api/tts?text=${encodedText}`;

    // TwiML: play reply, then listen again
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
      .status(500)
      .setHeader("Content-Type", "text/xml")
      .send(
        `<Response><Say>There was an internal error. Please try again later.</Say></Response>`
      );
  }
}
