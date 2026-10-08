# Verd.io AI assistant: setup and safety

## Purpose

`/api/chat` powers two things: the Advisor chat and the written insights generated after an upload. It is deliberately narrow. The assistant may only discuss the signed-in user's own uploaded file and how to use Verd.io. It is not a general chatbot, it cannot see any other user's data, and it has hard daily limits. When it is unavailable, limited, or the visitor is not signed in, the app uses its built-in answers instead.

## Environment variables (names only)

Set these in the Vercel project settings. Never put a value in code, in the repository, or in a chat.

| Name | Required | Meaning |
| --- | --- | --- |
| `GROQ_API_KEY` | yes (default provider) | Free key created by the owner at console.groq.com. |
| `AI_PROVIDER` | no | `openai-compatible` (default, covers Groq and OpenAI), `anthropic` (optional, paid), or `mock` (tests only; ignored on production deployments). |
| `AI_MODEL` | no | Overrides the default model (`llama-3.3-70b-versatile` for Groq, `claude-haiku-5-5` for Anthropic). |
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

## Migration to apply before deploying

Apply `supabase/migrations/202607270001_ai_usage_limits.sql` to the Supabase project (SQL editor or `supabase db push`) before merging or deploying this change. It creates the `ai_usage` and `ai_usage_global` tables (row level security enabled, no client policies) and the `consume_ai_quota` function (callable by signed-in users only). If it has not been applied, `/api/chat` fails closed: every call returns the "busy" fallback and the app shows built-in answers.

## Free-tier facts

- Groq's free-tier limits apply to the whole organisation, so all Verd.io users share them. That is why there is a global daily budget as well as a per-user one. A provider 429 includes a `retry-after`; the app treats it as "busy" and shows the built-in answer.
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

The model gets no tools and no database access. Its only input is the one request. The server never queries user data for the AI, keeps no conversation memory, and does not log prompts or replies (only a hashed user id, status, token counts and latency). The usage tables are protected by row level security with no client policies. Raw rows of organisation-shared projects live in a private storage bucket, which the AI path never reads.

## Testing without a provider

Set `AI_PROVIDER=mock` (never on production; it is ignored there) to use canned answers. `AI_MOCK_MODE` picks the behaviour: `grounded` (default), `off-topic`, `injection-following`, `busy` or `throws`. The unit tests use this with a mocked `fetch`, so they need no network and no keys:

```sh
npm test
```
