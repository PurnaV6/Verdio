const TIMEOUT_MS = 8000;

function timedFetch(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function aiConfig() {
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  const groq = Boolean(process.env.GROQ_API_KEY) || apiKey?.startsWith('gsk_');
  return {
    apiKey,
    model: process.env.AI_MODEL || (groq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'),
    modelUrl: groq ? 'https://api.groq.com/openai/v1/models' : 'https://api.openai.com/v1/models',
  };
}

async function check(name, configured, operation) {
  if (!configured) return { name, status: 'unconfigured' };
  const started = Date.now();
  try {
    const response = await operation();
    return { name, status: response.ok ? 'operational' : 'failed', latencyMs: Date.now() - started, httpStatus: response.status };
  } catch (error) {
    return { name, status: 'failed', latencyMs: Date.now() - started, reason: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const detailed = req.query?.details === '1';
  if (!detailed) return res.status(200).json({ status: 'operational', service: 'verd.io', timestamp: new Date().toISOString() });

  const secret = process.env.HEALTH_CHECK_SECRET || process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const ai = aiConfig();
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const reportFrom = process.env.REPORT_FROM_EMAIL;
  const supabaseHeaders = { apikey: serviceKey || '', Authorization: `Bearer ${serviceKey || ''}` };

  const services = await Promise.all([
    check('ai', Boolean(ai.apiKey), () => timedFetch(`${ai.modelUrl}/${encodeURIComponent(ai.model)}`, { headers: { Authorization: `Bearer ${ai.apiKey}` } })),
    check('supabase-auth', Boolean(supabaseUrl && serviceKey), () => timedFetch(`${supabaseUrl}/auth/v1/settings`, { headers: supabaseHeaders })),
    check('supabase-database', Boolean(supabaseUrl && serviceKey), () => timedFetch(`${supabaseUrl}/rest/v1/report_schedules?select=id&limit=1`, { headers: supabaseHeaders })),
    check('supabase-storage', Boolean(supabaseUrl && serviceKey), () => timedFetch(`${supabaseUrl}/storage/v1/bucket/organization-projects`, { headers: supabaseHeaders })),
    check('resend', Boolean(resendKey && reportFrom), () => timedFetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${resendKey}` } })),
  ]);
  const healthy = services.every(service => service.status === 'operational');
  return res.status(healthy ? 200 : 503).json({ status: healthy ? 'operational' : 'degraded', service: 'verd.io', timestamp: new Date().toISOString(), services });
}
