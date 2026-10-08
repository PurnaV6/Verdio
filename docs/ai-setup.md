# Verd.io AI assistant: setup and safety

## Purpose

`/api/chat` powers two things: the Advisor chat and the written insights generated after an upload. It is deliberately narrow. The assistant may only discuss the signed-in user's own uploaded file and how to use Verd.io. It is not a general chatbot, it cannot see any other user's data, and it has hard daily limits. When it is unavailable, limited, or the visitor is not signed in, the app uses its built-in answers instead.

## Environment variables (names only)

Set these in the Vercel project settings. Never put a value in code, in the repository, or in a chat.

| Name | Required | Meaning |
| --- | --- | --- |
| `GROQ_API_KEY` | yes (default provider) | Free key created by the owner at console.groq.com. |
| `AI_PROVIDER` | no | `openai-compatible` (default, covers Groq and OpenAI), `anthropic` (optional, paid), or `mock` (tests only; ignored on production deployments). |
| `AI_MODEL` | no | Use exactly one model instead of the default chain (see "Model chain"). Default for Anthropic is `claude-haiku-5-5`. |
| `AI_MODELS` | no | Comma-separated ordered model chain. Takes precedence over `AI_MODEL`. |
| `ANTHROPIC_API_KEY` | only if `AI_PROVIDER=anthropic` | Anthropic has no ongoing free API tier. |
| `APP_ORIGINS` | yes for any browser origin other than the deployment's own host | Comma-separated allowed origins, for example your custom domain. Unset means only same-origin requests work. |
| `SUPABASE_URL` | yes | Project URL, used to verify the user's session and call the quota function. |
| `SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`) | yes | Public anon key. The service-role key is never used by `/api/chat`. |
| `AI_ADVISOR_DAILY_LIMIT` | no | Advisor questions per user per UTC day. Default 20. |
| `AI_INSIGHTS_DAILY_LIMIT` | no | Insight generations per user per UTC day. Default 5. |
| `AI_GLOBAL_ADVISOR_DAILY_LIMIT` | no | Advisor questions across all users per UTC day. Default 400. |
| `AI_GLOBAL_INSIGHTS_DAILY_LIMIT` | no | Insight generations across all users per UTC day. Default 60. |
| `AI_BURST_GAP_MS` | no | Per-instance burst guard in milliseconds. Default 1000. Best effort only (see below). |

`OPENAI_API_KEY` still works as an alternative to `GROQ_API_KEY` for the default provider. The database function also enforces a minimum 3 second gap between calls per user and hard ceilings (advisor 100 per user and 2000 global per day, insights 20 and 400); raising a ceiling needs a new migration.

## Setup, in order

The Advisor stays on built-in answers until all three steps are done. Skipping the first is the most common cause: `/api/chat` fails closed and every call returns the "busy" fallback.

1. **Apply the migration.** Run `supabase/migrations/202607270001_ai_usage_limits.sql` against the production Supabase project (SQL editor or `supabase db push`). It creates the `ai_usage` and `ai_usage_global` tables (row level security enabled, no client policies) and the `consume_ai_quota` function (callable by signed-in users only).
2. **Set the environment variables for the Production environment in Vercel, then redeploy.** At minimum `GROQ_API_KEY`, `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Vercel only applies environment variable changes to new deployments, so after saving them trigger a redeploy (Deployments, then Redeploy on the latest production deployment). A variable saved for Preview or Development only does not reach production.
3. **Test while signed in.** The no-login demo never calls the AI. Sign in, ask the Advisor a question, then check the logs (below).

To check steps 1 and 2 without guessing, call the protected health endpoint:

```sh
curl 'https://YOUR_DEPLOYMENT/api/health?details=1' -H 'Authorization: Bearer YOUR_HEALTH_CHECK_SECRET'
```

The `ai` object in the response is a setup checklist of booleans and fixed strings (never a key value): `supabase_url_set`, `supabase_anon_key_set`, `provider_key_set` and `provider_key_env` (the variable name that supplied the key), `provider_name`, `model_chain`, `quota_function_present` (`true`, `false`, or `null` for unknown; probed with the anon key only) and a one-sentence `next_step`. `quota_function_present: false` means the migration in step 1 has not been applied.

## Reading the logs

In Vercel, open the project, then Logs, and filter by the path `/api/chat` (or search for `ai_chat`). Each request writes one JSON line:

```json
{"event":"ai_chat","user":"3f9a1c0b7d2e","task":"advisor","status":503,"latencyMs":212,"reason":"quota_rpc_missing","upstreamStatus":404}
```

`user` is a hashed id, never an email. Successful calls have no `reason` and log the model that answered plus token counts. Failures carry a `reason`. Prompts, replies, keys and provider error bodies are never logged. The `reason` is for operators only: the browser always receives the same fixed generic message and status code.

| `reason` | Status | Cause | Fix |
| --- | --- | --- | --- |
| `no_token` | 401 | No `Authorization: Bearer` header: the visitor is not signed in. | Expected for the no-login demo. If a signed-in user hits it, check the client sends the Supabase session token. |
| `invalid_token` | 401 | Supabase rejected the token (expired or forged). | Sign in again. |
| `auth_unavailable` | 503 | The Supabase auth check failed (outage, timeout, wrong `SUPABASE_URL`). | Check `SUPABASE_URL` and Supabase status. |
| `supabase_not_configured` | 503 | `SUPABASE_URL` or the anon key is missing in this deployment (the log shows which, as booleans). | Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for Production and redeploy. |
| `provider_not_configured` | 503 | No provider key in this deployment (or `AI_PROVIDER=mock` on production, which is ignored). | Set `GROQ_API_KEY` for Production and redeploy. |
| `quota_rpc_missing` | 503 | The quota function returned HTTP 404 or `PGRST202`: `consume_ai_quota` does not exist in this Supabase project. | Apply the migration (setup step 1). |
| `quota_rpc_failed` | 503 | The quota call failed some other way; `upstreamStatus` is the HTTP status (absent for a timeout or network error). | 401 or 403: the user token is not accepted, check the anon key belongs to the same project as `SUPABASE_URL`. 5xx: check Supabase status and its Postgres logs. |
| `quota_unexpected_answer` | 503 | The quota function returned a value the server does not know. | The deployed code and the migration are out of step; reapply the migration. |
| `quota_user_limit` | 429 | The signed-in user used their daily allowance. | Expected. Raise `AI_ADVISOR_DAILY_LIMIT` or `AI_INSIGHTS_DAILY_LIMIT` if too low. |
| `quota_global_limit` | 503 | The shared daily budget across all users is used up. | Expected on a busy day. Resets at UTC midnight; raise the `AI_GLOBAL_*` limits only if the provider quota allows. |
| `too_fast` | 429 | Calls too close together (`guard` is `memory` for the per-instance guard, `database` for the Postgres one). | Expected; the client waits a moment. |
| `provider_rate_limited` | 503 | The provider returned HTTP 429. Groq limits are per organisation. | Wait, lower the global limits, or move to a paid tier. |
| `provider_model_unavailable` | 502 | Every model in the chain is gone or unknown to the provider. | Set `AI_MODELS` to models listed on the provider's models page. |
| `provider_error` | 502 or 503 | Other provider failure; `upstreamStatus` is the HTTP status (absent for a timeout or network error). | 401: the key is wrong or revoked. 5xx: provider outage. 400: a request the provider rejects; check the chain. |
| `provider_empty_reply` | 502 | The provider answered with no visible text, even after trying the next model. | Usually a reasoning model that used its whole budget thinking. Put a non-reasoning model such as `llama-3.1-8b-instant` first via `AI_MODELS`. |
| `scrubbed_reply` | 502 | The reply was withheld because it had a code block or link, or insights JSON was too long or empty. | Expected occasionally. If constant, check the model. |
| `bad_request` | 400 | The request failed validation (unknown field, oversized input). | Client bug if seen from the real app. |
| `origin_forbidden` | 403 | The request came from an origin not in `APP_ORIGINS` and not the deployment host. | Add the custom domain to `APP_ORIGINS`. |
| `method_not_allowed` | 405 | The route only accepts `POST`. | None. |
| `internal_error` | 502 | An unexpected server error before the provider answered. | Check the function logs around that time. |

## Model chain

The server tries an ordered list of models. With a Groq key and neither `AI_MODEL` nor `AI_MODELS` set, the chain is:

1. `openai/gpt-oss-120b`
2. `llama-3.3-70b-versatile`
3. `llama-3.1-8b-instant`

Behaviour:

- If the provider says a model is gone or unknown (HTTP 404, or 400/410 with a model-not-found or decommissioned error), the request moves to the next model, and the dead model is remembered and skipped for the rest of that serverless instance's life. A fresh instance tries it once again.
- A rate limit (429) or a 5xx never advances the chain: switching model does not help with those, so they are reported as "busy".
- If every model is gone, the response is the generic "unavailable" and the log shows `provider_model_unavailable`.
- `openai/gpt-oss-*` models are reasoning models. Their hidden reasoning tokens count against the output limit, so the server sends `reasoning_effort: low`, `include_reasoning: false` and a `max_completion_tokens` of the task's visible limit plus 1,500. If the visible reply is still empty, the next model is tried once (`provider_empty_reply` if that fails too). The visible answer is still capped by the usual length limits. Other models use plain `max_tokens`.

To override: set `AI_MODELS` (comma-separated, in order, for example `llama-3.1-8b-instant,llama-3.3-70b-versatile`) or `AI_MODEL` for exactly one model. `AI_MODELS` wins if both are set. The chain in effect is shown as `model_chain` in the health checklist. Redeploy after changing it.

Groq's own documentation is inconsistent about `llama-3.3-70b-versatile`: its models page lists it as a production model while its deprecations page gives a shutdown date of 16 August 2026 for the free and developer tiers. The chain works whichever is true: if the model is gone it is skipped automatically, and if it is not it remains a working fallback.

## Free-tier facts

- Groq's free-tier limits apply to the whole organisation, so all Verd.io users share them. That is why there is a global daily budget as well as a per-user one. A provider 429 includes a `retry-after`; the app treats it as "busy" and shows the built-in answer.
- For `openai/gpt-oss-*` on a free key Groq's limits are about 30 requests per minute, 1,000 requests per day, 8K tokens per minute and 200K tokens per day. 200K tokens a day is only about 80 Advisor questions, so with a free key set `AI_GLOBAL_ADVISOR_DAILY_LIMIT=60` and `AI_GLOBAL_INSIGHTS_DAILY_LIMIT=15`. The defaults (400 and 60) are meant for a paid tier and would let the provider run out first. Check the current numbers on Groq's rate limits page, since they change.
- Groq states that it does not retain inference data by default (logs may be kept up to 30 days for reliability and abuse purposes) and that every customer can enable Zero Data Retention in its console. Recommendation: the owner enables Zero Data Retention in the Groq console. Groq does not state anything about model training, so Verd.io does not claim that data is "not used for training".
- Google's Gemini free tier is excluded: Google says free-tier content may be used to improve its products.
- Anthropic has no ongoing free API tier, so the Anthropic adapter is optional.

## What happens when limits are hit

| Situation | Response | What the user sees |
| --- | --- | --- |
| Not signed in (no-login demo) | No request is made | Built-in answers and fallback insights |
| Per-user daily limit, or calls too close together | 429 with `Retry-After` | A short notice and the built-in answer |
| Shared daily budget used up, provider rate limit or outage, or migration missing | 503 `Assistant busy` | A short notice and the built-in answer |
| Provider error or an unusable reply | 502 `Assistant unavailable` | The built-in answer |
| Invalid or oversized request | 400 | The built-in answer |

Counters live in Postgres, so they hold across serverless instances. The in-memory burst guard does not (each instance has its own memory and instances are recycled); it only trims rapid repeats before they reach the database.

## How scope is limited

1. The server builds the prompt. The browser can send only a question, short history and the data context of its own file; a client-supplied system prompt, `messages` or `max_tokens` is rejected or dropped.
2. A fixed server-side system prompt lists the allowed topics and the refusal texts.
3. The user's data is placed in a delimited data block in a user message, never in the system prompt, and is described to the model as data and not instructions.
4. A cheap pre-check refuses override attempts ("ignore previous", "system prompt", "you are now", "developer mode", code fences, URLs), requests about other users and obvious code-writing requests before any tokens are spent.
5. Hard caps on input sizes, output tokens and requests per day. Replies containing code blocks or links are withheld and the built-in answer is used.

No prompt-based limit is perfect. A determined user can sometimes talk a model into a short off-topic reply. The mitigations above shrink that to a few hundred tokens inside a daily cap, and the data exposed is only the user's own. A later change adds a check that every number in an answer exists in the file's facts and answers common questions from the built-in router first.

## Isolation

The model gets no tools and no database access. Its only input is the one request. The server never queries user data for the AI, keeps no conversation memory, and does not log prompts or replies (only a hashed user id, status, a failure reason code, the model name, token counts and latency). The usage tables are protected by row level security with no client policies. Raw rows of organisation-shared projects live in a private storage bucket, which the AI path never reads.

## Testing without a provider

Set `AI_PROVIDER=mock` (never on production; it is ignored there) to use canned answers. `AI_MOCK_MODE` picks the behaviour: `grounded` (default), `off-topic`, `injection-following`, `busy` or `throws`. The unit tests use this with a mocked `fetch`, so they need no network and no keys:

```sh
npm test
```
