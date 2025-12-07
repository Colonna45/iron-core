export default function handler(req, res) {
  res.setHeader("Content-Type", "text/xml");
  res.send(`
    <Response>
      < Say >Hello Nick, Iron-Core AI is online.< /Say >
    < /Response >
  `);
}
