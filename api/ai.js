import OpenAI from "openai";

// Helper to read Twilio's x-www-form-urlencoded body
async function readTwilioBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      try {
        const params = new URLSearchParams(data);
        const body = {};
        for (const [key, value] of params.entries()) {
          body[key] = value;
        }
        resolve(body);
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  try {
    // Only allow POST from Twilio
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // 1️⃣ Read Twilio body (speech text is in SpeechResult)
    const twilioBody =
      typeof req.body === "object" && Object.keys(req.body || {}).length > 0
        ? req.body
        : await readTwilioBody(req);

    console.log("Incoming Twilio body:", twilioBody);

    const userText =
      twilioBody.SpeechResult ||
      twilioBody.Body ||
      "The caller said nothing. Introduce yourself as Iron-Core AI.";

    // 2️⃣ Call OpenAI
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Iron-Core AI, a friendly but efficient phone assistant for HVAC companies and auto shops.",
        },
        { role: "user", content: userText },
      ],
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ||
      "Sorry, I had trouble coming up with a reply.";

    // 3️⃣ Build TwiML that plays ElevenLabs audio and then listens again
    const encoded = encodeURIComponent(reply);
    const host = req.headers.host; // e.g. iron-core-taupe.vercel.app
    const ttsUrl = `https://${host}/api/tts?text=${encoded}`;

    const twiml = `
      <Response>
        <Play>${ttsUrl}</Play>
        <Gather input="speech" action="/api/ai" method="POST">
          <Say>What else can I help you with?</Say>
        </Gather>
      </Response>
    `.trim();

    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml);
  } catch (error) {
    console.error(
      "AI route error:",
      error.status || "",
      error.message,
      error.response?.data || ""
    );

    const fallback = `
      <Response>
        <Say>Sorry, Iron-Core AI ran into an error. Please try again later.</Say>
      </Response>
    `.trim();

    res.setHeader("Content-Type", "text/xml");
    res.status(500).send(fallback);
  }
               }
