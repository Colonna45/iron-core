export default function handler(req, res) {
  res.setHeader("Content-Type", "text/xml");

  // Text ElevenLabs should speak for the greeting
  const greeting = encodeURIComponent(
    "Hello Nick, Iron-Core AI is online. What can I do for you?"
  );

  const twiml = `
<Response>
  <Gather input="speech" action="/api/ai" method="POST">
    <Play>https://${req.headers.host}/api/tts?text=${greeting}</Play>
  </Gather>
</Response>
`.trim();

  res.status(200).send(twiml);
}
