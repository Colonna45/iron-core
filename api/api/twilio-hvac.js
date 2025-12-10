export default async function handler(req, res) {
  const sipTarget = process.env.RETELL_SIP_AGENT_HVAC;

  if (!sipTarget) {
    res.status(500).send('Missing RETELL_SIP_AGENT_HVAC env var');
    return;
  }

  const twiml = `
    <Response>
      <Dial>
        <Sip>${sipTarget}</Sip>
      </Dial>
    </Response>
  `.trim();

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml);
}
