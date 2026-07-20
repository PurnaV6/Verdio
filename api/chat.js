// api/chat.js — for Vercel project sme-bi-copilot-proxy
// Put this file at /api/chat.js in your sme-proxy repo (replace existing)
// This is Pages/API Routes style for Vercel, NOT App Router

import OpenAI from 'openai';

function getAIConfig() {
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  const isGroq = Boolean(process.env.GROQ_API_KEY) || apiKey?.startsWith('gsk_');

  return {
    apiKey,
    model: process.env.AI_MODEL || (isGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'),
    baseURL: isGroq ? 'https://api.groq.com/openai/v1' : undefined,
  };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed, use POST' });
  }

  try {
    const config = getAIConfig();
    if (!config.apiKey) {
      console.error('AI provider key missing');
      return res.status(503).json({ error: 'AI service is not configured' });
    }

    const { messages, max_tokens = 700 } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Keep only last 12 messages to stay under limit and avoid timeout
    const trimmed = messages.slice(-12);

    const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
    console.log('Calling AI provider with', trimmed.length, 'messages');

    const completion = await client.chat.completions.create({
      model: config.model,
      messages: trimmed,
      max_tokens: max_tokens,
      temperature: 0.3,
    });

    return res.status(200).json(completion);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'AI provider request failed' });
  }
}
