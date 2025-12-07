export default function handler(req, res) {
  // 1️⃣ Twilio sends data as URL-encoded, so parse it
  const twilioData = req.body || {};

  console.log("Incoming Twilio Data:", twilioData);

  // 2️⃣ Extract useful fields
  const caller = twilioData.From || "Unknown";
  const speech = twilioData.SpeechResult || "";
  const digits = twilioData.Digits || "";

  // 3️⃣ Example logic (we will replace with GPT + ElevenLabs later)
  let reply = "Hello Nick, Iron-Core AI is online.";

  if (speech) {
    reply = `You said: ${speech}. Iron-Core has heard you.`;
  }

  // 4️⃣ Respond in TwiML
  res.setHeader("Content-Type", "text/xml");
  res.send(`
    <Response>
      <Say>${reply}</Say>
      <Pause length="1"/>
      <Say>Iron-Core is ready for the next command.</Say>
    </Response>
  `);
}
