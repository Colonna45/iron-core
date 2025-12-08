export default function handler(req, res) {
  const firstLine =
    "Hey, this is Iron-Core answering for the shop. Are you calling about your HVAC system or your vehicle today?";

  const encoded = encodeURIComponent(firstLine);
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
}
