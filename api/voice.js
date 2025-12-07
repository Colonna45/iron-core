export default function handler(req, res) {
  res.setHeader("Content-Type", "text/xml");

  const twiml = `
    <Response>
      <Gather input="speech" action="/api/ai" method="POST">
        <Say>Hello Nick, Iron-Core AI is online. What can I do for you?</Say>
      </Gather>
      <Say>I didn't catch that. Goodbye.</Say>
    </Response>
  `;

  res.status(200).send(twiml.trim());
}
