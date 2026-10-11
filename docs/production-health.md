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

## Migrations are safe to re-run

Every file in `supabase/migrations/` can be applied again to a database that already has its objects. Tables, indexes and added columns use `if not exists`, functions use `create or replace`, and each policy is preceded by `drop policy if exists`. This matters because the first migrations were applied by hand in the SQL editor, so Supabase's migration history does not list them; the GitHub integration therefore tries to run all of them from the start on every merge to `main`.

- **Order.** Files run in file-name order and must keep running as a full set. Do not run `202607220001_organizations_and_schedules.sql` on its own after `202607230001_invitation_acceptance.sql` has been applied: it recreates the broader "Users manage own schedules" policy, which the later file drops again.
- **Reading the Supabase Preview check.** Open the check's details on the pull request or the merge commit. The message ends with the failing file, the Postgres error and SQLSTATE, and `At statement: N` followed by the statement text. `42710` (already exists) on a `create` statement means a new migration was added without a guard; add `if not exists`, `create or replace` or `drop ... if exists` as above.
- **New migrations.** Write them re-runnable from the start, with the same guards. Data statements (`insert`, `update`, `delete`) need their own guard such as `on conflict` or a `where not exists`; the `insert into storage.buckets` in `202607260001` uses `on conflict (id) do update`.
- **What a failed check does to the database.** Not confirmed. A migration file is normally sent as one batch, so a failure part way through should not leave that file half applied, but this repository cannot prove how the integration executes it. After a failed check, run the verification queries above before assuming the database is unchanged.

## Failure interpretation

- `ai` failed: check provider key, quota, model access and `AI_MODEL`/`AI_MODELS` (the check probes the first model in the chain only; a retired first model is skipped automatically by `/api/chat`).
- The top-level `ai` object is the assistant setup checklist (key set, models, whether `consume_ai_quota` exists, next step). See `docs/ai-setup.md`.
- `supabase-auth` failed: check the Supabase URL and service-role key.
- `supabase-database` failed: apply or repair the report-schedule migration.
- `supabase-storage` failed: apply the shared-project migration and verify the bucket.
- `resend` failed: verify the Resend key, sending domain and `REPORT_FROM_EMAIL`.
