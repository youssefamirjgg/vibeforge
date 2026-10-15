
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Youssef Amir

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    project_name: { type: 'STRING' },
    summary: { type: 'STRING' },
    files: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          path: { type: 'STRING' },
          content: { type: 'STRING' },
        },
        required: ['path', 'content'],
      },
    },
    next_steps: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['project_name', 'summary', 'files'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function parseModelJson(text) {
  const cleaned = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

export async function generateProject({ apiKey, model, system, prompt, retries = 2 }) {
  const base = (process.env.VIBEFORGE_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  };

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      lastErr = new Error(`Network error: ${e.cause?.code || e.message}`);
      if (attempt < retries) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      throw lastErr;
    }

    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.error?.message || '';
      } catch {
        /* ignore */
      }
      const retryable = res.status === 429 || res.status >= 500;
      lastErr = new Error(`Gemini API error ${res.status}${detail ? `: ${detail}` : ''}`);
      lastErr.status = res.status;
      if (retryable && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw lastErr;
    }

    const data = await res.json();
    const cand = data?.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) {
      const why = data?.promptFeedback?.blockReason || cand?.finishReason || 'empty response';
      throw new Error(`Gemini returned no content (${why}). Try rephrasing your request.`);
    }
    try {
      return parseModelJson(text);
    } catch {
      if (cand?.finishReason === 'MAX_TOKENS') {
        throw new Error('The response was cut off (too large). Ask for a smaller project or split it up.');
      }
      throw new Error('Gemini returned malformed JSON. Please try again.');
    }
  }
  throw lastErr;
}
