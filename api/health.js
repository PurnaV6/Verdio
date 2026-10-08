import { aiConfig, aiHealthTarget } from './_lib/aiProvider.js';

const TIMEOUT_MS = 8000;

function timedFetch(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
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

const QUOTA_NEXT_STEP = 'Apply supabase/migrations/202607270001_ai_usage_limits.sql to the production Supabase project.';

/**
 * Is consume_ai_quota in the project? Probed with the anon key only and a body the function
 * rejects anyway (anon cannot execute it). true = exists, false = missing, null = unknown.
 */
async function probeQuotaFunction(supabaseUrl, anonKey) {
  try {
    const response = await timedFetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: 'advisor', p_user_max: 1, p_global_max: 1, p_min_gap_seconds: 1 }),
    });
    const body = typeof response.json === 'function' ? await response.json().catch(() => null) : null;
    const code = typeof body?.code === 'string' ? body.code : '';
    const message = typeof body?.message === 'string' ? body.message : '';
    let present = null;
    if (response.status === 404 || code === 'PGRST202') present = false;
    else if (response.ok || response.status === 401 || response.status === 403 || code === '42501' || /permission denied/i.test(message)) present = true;
    return { present, httpStatus: response.status };
  } catch {
    return { present: null, httpStatus: null };
  }
}

/** Setup checklist for the AI assistant: booleans and fixed strings only, never a key value or user data. */
async function aiSetupChecklist() {
  const config = aiConfig();
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const providerName = config.provider === 'openai-compatible' ? (config.baseURL ? 'groq' : 'openai') : config.provider;
  const quota = supabaseUrl && anonKey ? await probeQuotaFunction(supabaseUrl, anonKey) : { present: null, httpStatus: null };

  let nextStep = 'Setup looks complete. Sign in, ask the Advisor a question, and check Vercel Logs for ai_chat lines.';
  if (!config.apiKey) {
    nextStep = config.provider === 'mock'
      ? 'AI_PROVIDER=mock is ignored on production; remove it and set GROQ_API_KEY (Production), then redeploy.'
      : 'Set GROQ_API_KEY for the Production environment in Vercel, then redeploy.';
  } else if (!supabaseUrl || !anonKey) {
    nextStep = 'Set SUPABASE_URL and SUPABASE_ANON_KEY for the Production environment in Vercel, then redeploy.';
  } else if (quota.present === false) {
    nextStep = QUOTA_NEXT_STEP;
  } else if (quota.present === null) {
    nextStep = 'Could not confirm consume_ai_quota; check that Supabase is reachable and the AI usage migration is applied.';
  }

  return {
    supabase_url_set: Boolean(supabaseUrl),
    supabase_anon_key_set: Boolean(anonKey),
    provider_key_set: Boolean(config.apiKey),
    provider_key_env: config.apiKeyName,
    provider_name: providerName,
    model_chain: config.models,
    quota_function_present: quota.present,
    quota_function_http_status: quota.httpStatus,
    next_step: nextStep,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const detailed = req.query?.details === '1';
  if (!detailed) return res.status(200).json({ status: 'operational', service: 'verd.io', timestamp: new Date().toISOString() });

  const secret = process.env.HEALTH_CHECK_SECRET || process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const aiTarget = aiHealthTarget(aiConfig());
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const reportFrom = process.env.REPORT_FROM_EMAIL;
  const supabaseHeaders = { apikey: serviceKey || '', Authorization: `Bearer ${serviceKey || ''}` };

  const [aiSetup, ...services] = await Promise.all([
    aiSetupChecklist(),
    check('ai', Boolean(aiTarget), () => timedFetch(aiTarget.url, { headers: aiTarget.headers })),
    check('supabase-auth', Boolean(supabaseUrl && serviceKey), () => timedFetch(`${supabaseUrl}/auth/v1/settings`, { headers: supabaseHeaders })),
    check('supabase-database', Boolean(supabaseUrl && serviceKey), () => timedFetch(`${supabaseUrl}/rest/v1/report_schedules?select=id&limit=1`, { headers: supabaseHeaders })),
    check('supabase-storage', Boolean(supabaseUrl && serviceKey), () => timedFetch(`${supabaseUrl}/storage/v1/bucket/organization-projects`, { headers: supabaseHeaders })),
    check('resend', Boolean(resendKey && reportFrom), () => timedFetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${resendKey}` } })),
  ]);
  const healthy = services.every(service => service.status === 'operational');
  return res.status(healthy ? 200 : 503).json({ status: healthy ? 'operational' : 'degraded', service: 'verd.io', timestamp: new Date().toISOString(), services, ai: aiSetup });
}
