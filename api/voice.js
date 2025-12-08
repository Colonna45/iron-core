export default function handler(req, res) {
  res.setHeader("Content-Type", "text/xml");

  const twiml = `
<Response>
  <Gather input="speech" action="/api/ai" method="POST">
    <Play>https://iron-core-taupe.vercel.app/api/tts?text=Hello%20Nick%2C%20Iron-Core%20AI%20is%20online.%20What%20can%20I%20do%20for%20you%3F</Play>
  </Gather>
</Response>
`;

  res.status(200).send(twiml.trim());
}
