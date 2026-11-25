// api/assistant.js — Vercel serverless function (pure JavaScript)
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) {
    return res.status(503).json({
      error: "GEMINI_API_KEY is not set in Vercel. Add it in Settings > Environment Variables, then Redeploy."
    });
  }

  try {
    let b = req.body || {};
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }

    const question = String(b.question || "").slice(0, 1200);
    if (!question.trim()) return res.status(400).json({ error: "Question is required." });

    const lang = b.lang === "te" ? "Telugu" : "English";
    const a = b.aqi || {};
    const p = b.profile || {};
    const members = Array.isArray(p.members) && p.members.length
      ? p.members.slice(0, 10).map(m => `${String(m.n).slice(0, 30)} (${String(m.t).slice(0, 20)})`).join(", ")
      : "none";

    const prompt = `You are BreatheWise, a cautious urban air-quality education assistant. Reply in ${lang}. Use plain, practical language.
Context: city ${String(a.city || "unknown")}; US AQI ${a.aqi ?? "unknown"}; PM2.5 ${a.pm2_5 ?? "unknown"} µg/m³; PM10 ${a.pm10 ?? "unknown"} µg/m³; NO2 ${a.no2 ?? "unknown"}; O3 ${a.o3 ?? "unknown"}; cleanest hour ${String(a.best || "unknown")}.
Family members: ${members}. Commute: ${String(p.commute || "unknown")}.
User question: ${question}
Give 3-5 concise, actionable suggestions. Do not diagnose, prescribe, guarantee safety, or invent measurements. For severe symptoms advise urgent medical help. Say AQI is a model estimate and local official advisories take precedence.`;

    const models = [...new Set([
      (process.env.GEMINI_MODEL || "").trim(),
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-flash-latest"
    ].filter(Boolean))];

    let lastErr = "";
    for (const model of models) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );

      if (r.ok) {
        const d = await r.json();
        const answer = (d.candidates?.[0]?.content?.parts || []).map(x => x.text || "").join("").trim();
        if (answer) return res.status(200).json({ answer });
        lastErr = `Empty answer from ${model} (possibly blocked).`;
        continue;
      }

      const tx = await r.text();
      lastErr = `Gemini ${r.status} (${model}): ${tx.slice(0, 250)}`;
      // Key problems: retrying other models will not help
      if (r.status === 400 || r.status === 401 || r.status === 403) break;
    }

    return res.status(502).json({ error: lastErr || "AI request failed." });
  } catch (e) {
    return res.status(502).json({ error: "Server error: " + e.message });
  }
};