# Verd.io pre-launch checklist

> **DRAFT for the owner to review. Not legal advice. Have a solicitor check the Terms and Privacy Policy before charging money.**

**Placeholders to fill**

- [OWNER NAME OR COMPANY NAME]
- [REGISTERED ADDRESS]
- [CONTACT EMAIL]
- [GOVERNING LAW WORDING]
- [PRODUCTION DOMAIN]
- [PAYMENT PROVIDER] and [VAT STATUS]

Tick each box when done. "Code today" notes say what the repo shows now.

---

## 1. Legal pages

- [ ] Fill every placeholder in `terms-of-service.md`, `privacy-policy.md` and `cookies-and-storage.md`.
- [ ] Have a solicitor read the Terms and the Privacy Policy before you charge money.
- [ ] Publish them as real pages on the site (these drafts are documentation only and are **not** linked from the app).
- [ ] Link them from the landing page footer, the sign-up screen and the sign-in screen. *Code today: the footer has only "Log in" and "Create account". The sign-up form has no terms or privacy link.*
- [ ] Add a line at sign-up such as "By creating an account you agree to the Terms and Privacy Policy".
- [ ] Add a contact email page or footer link.
- [ ] Check the Trust Center page and landing page claims ("Private by design", "row-level data controls") still match the policy text.

## 2. Data protection (UK)

- [ ] Pay the ICO data protection fee, or confirm you are exempt (check the ICO's self-assessment on ico.org.uk). Put the registration number in the Privacy Policy.
- [ ] Complete the "locations" and "international transfers" parts of the Privacy Policy for Supabase, Vercel, the AI provider and Resend.
- [ ] Sign or accept the data processing terms offered by each provider (Supabase, Vercel, AI provider, Resend).
- [ ] Decide if you need a data processing agreement for customers who upload personal data.
- [ ] Decide retention periods. *Code today: no automatic deletion jobs. Usage counters, invitations and audit events are kept with no clean-up.*
- [ ] Write a short breach plan: who decides, who tells the ICO within 72 hours, who tells users.
- [ ] Enable Zero Data Retention in the AI provider console if the provider offers it (recommended in `docs/ai-setup.md`).

## 3. Delete-my-data and export-my-data

| Flow | Exists in the code today? |
| --- | --- |
| Delete a saved project | **Yes.** `deleteProject` in `src/lib/projects/projectStore.ts`, used in `src/app/App.tsx`. Removes the local copy and, for non-viewer organisation members, the shared copy and its record. |
| Clear preferences in the browser | **Yes.** "Clear preferences" on the Trust Center page. |
| Turn off a scheduled report | **Yes.** Setting the cadence to off deletes the schedule row. |
| Clear analysis history | **No button found.** `clearHistory` exists in `src/lib/history/historyStore.ts` but nothing calls it. |
| Delete my account and all data | **No.** No account deletion in the app code. Needs an email-based manual process, or a new feature. |
| Export all my data | **No.** There is a report export (`src/lib/export/reportGenerator.ts`), but no export of everything held about a user. |

- [ ] Decide: build both flows before launch, or handle by email and say so in the Privacy Policy (the draft already says requests are handled by hand).
- [ ] If handling by hand, write the exact steps and check them once on a test account.
- [ ] Test deleting a user in Supabase. Some tables point to the user without automatic deletion (`organization_projects.owner_user_id`, `organization_invitations.invited_by` and `accepted_by`, `organization_audit_events.actor_user_id`). Deleting such a user may fail until those records are removed or reassigned.
- [ ] Know that the browser copy (IndexedDB, localStorage) cannot be deleted by us. Tell users to clear site data.

## 4. Supabase

- [ ] Apply all five migrations in `supabase/migrations/` to the production project and run the verification queries in `docs/production-health.md`.
- [ ] **Turn email confirmation on** in Supabase Auth settings. *Code today: the sign-up screen handles both cases, and shows "Check your email to confirm" if confirmation is on.*
- [ ] Set a stronger password rule. *Code today: the sign-up screen only checks for 6 characters.*
- [ ] Check the sign-up confirmation email looks right, and use your own sender and domain if you can. *Code today: no password reset screen was found, so decide how users recover a lost password.*
- [ ] Consider Supabase Pro before charging. Free projects can pause and have limited backups. Check Supabase's current plan terms.
- [ ] Turn on and test **backups** (and point-in-time recovery if you want it). Do one restore test.
- [ ] Set the Site URL and Redirect URLs in Supabase Auth to [PRODUCTION DOMAIN] (and any preview domain you use). Otherwise sign-in fails on the new domain. *See `docs/ai-setup.md` "Previews and custom domains".*
- [ ] Check the `organization-projects` storage bucket is private.
- [ ] Never expose the service-role key. It is only used by the report and invitation server routes. It must not start with `VITE_`.

## 5. Vercel and the domain

- [ ] **Vercel plan.** Vercel's Hobby plan is for non-commercial use. Check Vercel's current terms. Move to Pro (or another paid plan) before you take money.
- [ ] Add [PRODUCTION DOMAIN] in Vercel and set DNS.
- [ ] Set `APP_ORIGINS` in Vercel to the allowed browser origins, for example your custom domain, only if the page and `/api` are on different hosts. Same-origin works without it. Invitation links are built from the request origin if it is same-origin or listed in `APP_ORIGINS`, then the first `APP_ORIGINS` entry, then (only if `APP_ORIGINS` is unset) the Vercel production URL (`api/_lib/origin.js`). Send a test invitation and check the link points at [PRODUCTION DOMAIN].
- [ ] Set all environment variables for the **Production** environment, then redeploy (Vercel applies changes only to new deployments): `GROQ_API_KEY` (or the key for your provider), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REPORT_FROM_EMAIL`, `CRON_SECRET`, `HEALTH_CHECK_SECRET`. List from `docs/ai-setup.md` and `docs/production-health.md`. Do not paste values into chat or code.
- [ ] Check the daily job in `vercel.json` (`/api/scheduled-reports`, once a day at 08:00 UTC) runs on your plan. Check Vercel's current limits on cron jobs for your plan.
- [ ] Send a test scheduled report and a test invitation. Check Resend has a verified sending domain.
- [ ] Run `curl` against `/api/health?details=1` (see `docs/production-health.md`) and `npm run smoke -- https://[PRODUCTION DOMAIN]`.
- [ ] Check Deployment Protection settings so `/api` is reachable on production.

## 6. AI provider

- [ ] Create a **spend cap** or budget alert with the provider. If you are on a free tier, set the shared daily limits to fit it (`AI_GLOBAL_ADVISOR_DAILY_LIMIT=60` and `AI_GLOBAL_INSIGHTS_DAILY_LIMIT=15` are suggested in `docs/ai-setup.md` for a free key).
- [ ] Check the model list and that the provider still offers the models in the chain. One model in the default chain has a published shutdown date that `docs/ai-setup.md` mentions.
- [ ] Ask the Advisor a question while signed in on production and read the `ai_chat` log line (see `docs/ai-setup.md`).
- [ ] Decide on per-plan AI limits for paid plans (the code has one default for everyone).

## 7. Monitoring

- [ ] Add error monitoring (a Sentry-style tool). *Code today: none. There is a React error boundary in `src/components/ErrorBoundary.tsx`, and server logs in Vercel.*
- [ ] Before adding it, check what it stores in the browser and update `cookies-and-storage.md` and the Privacy Policy. Add it as a sub-processor.
- [ ] Add an uptime check on `/api/health`.
- [ ] Decide who reads the alerts, and how often.

## 8. Payments, tax and money

- [ ] Choose a payment provider (for example Stripe) and set it up with a business account. *Code today: no payment code. The landing page shows a free early access plan, and the Connections page lists Stripe only as a possible data source.*
- [ ] Decide the plans and prices: [PLAN NAMES AND PRICES]. Do not publish prices until you have costed AI, Supabase and Vercel use.
- [ ] VAT: check the current UK VAT registration threshold on gov.uk and whether you need to register. State prices as including or excluding VAT. [VAT STATUS]
- [ ] Decide on invoices and receipts, refunds and cancellation (the Terms have placeholders).
- [ ] Put refund and cancellation wording in front of the solicitor, especially if you sell to individuals.
- [ ] Keep records for tax (an accountant can tell you how long).

## 9. You (the owner)

- [ ] **Visa:** you hold a UK Graduate visa. Confirm self-employment rules on gov.uk or with an adviser before you start trading or taking payments.
- [ ] Register as a sole trader with HMRC (or set up a company) before the first payment. Confirm the right route with an accountant.
- [ ] Open a separate business bank account if you can.
- [ ] Consider business insurance (professional indemnity and cyber). Ask a broker.
- [ ] Check the Verd.io name and domain for trade mark conflicts.

## 10. Product honesty (quick checks)

- [ ] The landing page and app say the forecast uses a fixed plus or minus 12 percent planning range and that it is not a statistical interval.
- [ ] The app tells users when rows were left out, when revenue was calculated, and when rows have no date.
- [ ] Anything marked "Backend setup required" or "Requires OAuth" (for example connections and single sign-on on the Trust Center and Connections pages) is not sold as working.
- [ ] Run `npm run lint`, `npm run test`, `npm run build`.

---

## To confirm

1. Which of the delete and export flows you will build before launch.
2. Your ICO fee tier, or exemption.
3. Whether Supabase Pro and Vercel Pro are in your budget, and their current terms.
4. The live Vercel environment variables and whether Resend is set up in production (the repo only lists the names).
5. Whether the cron schedule suits weekly and monthly reports. The job runs daily and sends a report when it is due.
6. Whether email confirmation is currently on in the live Supabase project. The repo cannot show this.
7. Your visa and self-employment position.
