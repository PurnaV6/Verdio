# Verd.io production health runbook

## Required Vercel variables

- `OPENAI_API_KEY` or `GROQ_API_KEY`
- `AI_MODEL` (optional; must be available to the configured provider key)
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY` and `REPORT_FROM_EMAIL`
- `CRON_SECRET`
- `HEALTH_CHECK_SECRET` (recommended; otherwise detailed health uses `CRON_SECRET`)

Never prefix server-only secrets with `VITE_`.

## Checks

Public liveness:

```sh
curl https://YOUR_DEPLOYMENT/api/health
```

Protected dependency check:

```sh
curl 'https://YOUR_DEPLOYMENT/api/health?details=1' \
  -H 'Authorization: Bearer YOUR_HEALTH_CHECK_SECRET'
```

Frontend smoke test:

```sh
npm run smoke -- https://YOUR_DEPLOYMENT
```

## Supabase verification

Confirm that migrations appear under **Database → Migrations**, then verify:

```sql
select to_regclass('public.workspace_state') as workspace_state,
       to_regclass('public.organizations') as organizations,
       to_regclass('public.organization_members') as organization_members,
       to_regclass('public.organization_projects') as organization_projects,
       to_regclass('public.organization_audit_events') as organization_audit_events,
       to_regclass('public.report_schedules') as report_schedules;

select id, public, file_size_limit
from storage.buckets
where id = 'organization-projects';

select schemaname, tablename, policyname
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;
```

All six relations and the private `organization-projects` bucket must exist. Do not rerun historical migrations manually when they are already recorded.

## Failure interpretation

- `ai` failed: check provider key, quota, model access and `AI_MODEL`/`AI_MODELS` (the check probes the first model in the chain only; a retired first model is skipped automatically by `/api/chat`).
- The top-level `ai` object is the assistant setup checklist (key set, models, whether `consume_ai_quota` exists, next step). See `docs/ai-setup.md`.
- `supabase-auth` failed: check the Supabase URL and service-role key.
- `supabase-database` failed: apply or repair the report-schedule migration.
- `supabase-storage` failed: apply the shared-project migration and verify the bucket.
- `resend` failed: verify the Resend key, sending domain and `REPORT_FROM_EMAIL`.
