// api/assistant.js — Vercel serverless function (pure JavaScript)
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "Gemini API key is not configured." });

  try {
    const b = req.body || {};
    const question = String(b.question || "").slice(0, 1200);
    if (!question.trim()) return res.status(400).json({ error: "Question is required." });

    const lang = b.lang === "te" ? "Telugu" : "English";
    const a = b.aqi || {};
    const p = b.profile || {};
    const members = Array.isArray(p.members)
      ? p.members.slice(0, 10).map(m => `${String(m.n).slice(0, 30)} (${String(m.t).slice(0, 20)})`).join(", ")
      : "none";

    const prompt = `You are BreatheWise, a cautious urban air-quality education assistant. Reply in ${lang}. Use plain, practical language.
Context: city ${String(a.city || "unknown")}; US AQI ${a.aqi ?? "unknown"}; PM2.5 ${a.pm2_5 ?? "unknown"} µg/m³; PM10 ${a.pm10 ?? "unknown"} µg/m³; NO2 ${a.no2 ?? "unknown"}; O3 ${a.o3 ?? "unknown"}; cleanest hour ${String(a.best || "unknown")}.
Family members: ${members}. Commute: ${String(p.commute || "unknown")}.
User question: ${question}
Give 3-5 concise, actionable suggestions. Do not diagnose, prescribe, guarantee safety, or invent measurements. For severe symptoms advise urgent medical help. Say AQI is a model estimate and local official advisories take precedence.`;

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    if (!r.ok) return res.status(502).json({ error: "AI request failed." });
    const d = await r.json();
    const answer = (d.candidates?.[0]?.content?.parts || []).map(x => x.text || "").join("").trim();
    return res.status(200).json({ answer: answer || "I could not generate an answer. Please try again." });
  } catch (e) {
    return res.status(502).json({ error: "AI request failed." });
  }
};