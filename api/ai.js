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
    const body = await readTwilioBody(req);

    // What Twilio heard from your voice
    const userText = body.SpeechResult || "I didn't hear anything clearly.";
    const reply = `You said: ${userText}.`;

    // Send that reply to ElevenLabs via /api/tts
    const encodedText = encodeURIComponent(reply);

    const twiml = `
<Response>
  <Play>https://${req.headers.host}/api/tts?text=${encodedText}</Play>
  <Redirect>/api/voice</Redirect>
</Response>
`.trim();

    res.status(200).send(twiml);
  } catch (err) {
    console.error("AI route error:", err);
    const twiml = `
<Response>
  <Say>Something went wrong on the server. Goodbye.</Say>
</Response>
`.trim();
    res.status(200).send(twiml);
  }
}
