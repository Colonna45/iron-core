// api/voice.js

export default function handler(req, res) {
  const host = req.headers.host;

  const opening =
    "Hey, my name is Michael with Iron-Core AI Systems. Are you looking for AI to help with scheduling, reception, sales follow ups, admin, payroll, or something else in your business?";

  const encoded = encodeURIComponent(opening);
  const ttsUrl = `https://${host}/api/tts?text=${encoded}`;

  const twiml = `
<Response>
  <Gather input="speech"
          action="https://${host}/api/ai"
          method="POST"
          timeout="3"
          speechTimeout="auto">
    <Play>${ttsUrl}</Play>
  </Gather>
  <Say>I didn't catch that. Goodbye.</Say>
</Response>
  `.trim();

  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml);
}
