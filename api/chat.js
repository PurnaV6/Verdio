// api/chat.js — for Vercel project sme-bi-copilot-proxy
// Put this file at /api/chat.js in your sme-proxy repo (replace existing)
// This is Pages/API Routes style for Vercel, NOT App Router

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY missing');
      return res.status(500).json({ error: 'OPENAI_API_KEY not set in Vercel env vars' });
    }

    const { messages, max_tokens = 700 } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Keep only last 12 messages to stay under limit and avoid timeout
    const trimmed = messages.slice(-12);

    console.log('Calling OpenAI with', trimmed.length, 'messages');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: trimmed,
      max_tokens: max_tokens,
      temperature: 0.3,
    });

    return res.status(200).json(completion);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({
      error: err.message || 'Proxy error',
      details: err.stack?.slice(0, 800),
    });
  }
}
