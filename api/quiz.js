// Vercel Serverless Function: /api/quiz
// Proxies AI quiz generation requests to Google Gemini API (free tier).
// Uses Gemini 2.5 Flash with thinking disabled for fast, cost-efficient generation.

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server is not configured. GEMINI_API_KEY env variable is missing." });
  }

  const { prompt, max_tokens = 8000 } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'prompt' field" });
  }

  try {
    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: max_tokens,
          temperature: 0.7,
          responseMimeType: "application/json",
          // Disable thinking mode — saves tokens & latency, sufficient for quiz generation
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("Gemini API error:", data);
      return res.status(r.status).json({ error: data.error?.message || "Gemini API request failed" });
    }

    // Extract text from Gemini response
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text || "").join("") || "";

    // Detect truncation
    if (candidate?.finishReason === "MAX_TOKENS") {
      console.warn("Response truncated due to MAX_TOKENS");
      return res.status(500).json({ error: "AI 回應被截斷，請減少出題數量後重試" });
    }

    if (!text) {
      console.error("Empty response. Candidate:", candidate);
      return res.status(500).json({ error: "Gemini 回應為空，可能觸發安全過濾，請重試" });
    }

    // Return in Anthropic-compatible format so frontend doesn't need changes
    return res.status(200).json({ content: [{ type: "text", text }] });
  } catch (e) {
    console.error("Proxy error:", e);
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}
