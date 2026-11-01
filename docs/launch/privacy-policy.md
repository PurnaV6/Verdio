# Verd.io Privacy Policy

> **DRAFT for the owner to review. Not legal advice. Have a solicitor check the Terms and Privacy Policy before charging money.**

**Placeholders to fill before publishing**

- [OWNER NAME OR COMPANY NAME] (the controller)
- [REGISTERED ADDRESS]
- [CONTACT EMAIL] (for privacy requests)
- [ICO REGISTRATION NUMBER] (after you pay the data protection fee)
- [GOVERNING LAW WORDING] (only if you mention it here)
- [DATA LOCATIONS] for each provider (see section 6)
- [DATE LAST UPDATED]

This policy uses UK GDPR terms. It says what Verd.io does today, based on the code. Anything the code cannot prove is in the "To confirm" list at the end.

---

## 1. Who is responsible for your data

[OWNER NAME OR COMPANY NAME] of [REGISTERED ADDRESS] is the "controller" for the personal data described in this policy. Contact: [CONTACT EMAIL]. ICO registration: [ICO REGISTRATION NUMBER].

**A note on your files.** If your uploaded files contain personal data about other people (for example customer IDs or names), you are the controller of that data and we handle it for you as a "processor". This policy covers our own role as controller for account and service data. [Solicitor to decide whether a separate processing agreement is needed.]

## 2. What data we handle, and why

| Data | What it is | Where it lives | Why we use it | Lawful basis (UK GDPR) |
| --- | --- | --- | --- | --- |
| Account details | Your email address and a password (stored as a hash by the sign-in service), and the account ID | Supabase Auth | To create and secure your account and let you sign in | Contract |
| Your uploaded file | The spreadsheet or CSV you analyse, including its rows | **Your browser only** while you analyse it. It is not uploaded just by analysing it. | To produce totals, trends, risks and forecasts | Contract |
| Saved projects | The analysis result for a file, including the processed rows. Saved automatically when an analysis finishes. | Always in your browser (IndexedDB). If you are a member of an organisation with an owner, admin or analyst role, a copy is also uploaded to private cloud storage so other members can open it. | To let you reopen your work, and to let your organisation share it | Contract |
| Project records | Name, file name, row count, health and quality scores, status, who saved it, and times | Supabase database | To list shared projects | Contract |
| Organisation data | Organisation name, members (user ID, email, role), invitations (invited email, role, token, expiry, status) | Supabase database | To run team workspaces | Contract |
| Audit log | Which member did what to a project or schedule (event type, project name, row count, the member's email, time). Visible to members of that organisation. | Supabase database | Accountability inside an organisation | Legitimate interests (security and accountability) |
| Workspace records | Action, target, outcome and approval records you type in, tied to a file name | Your browser, and Supabase database when you are signed in | To keep your records between visits and devices | Contract |
| Analysis history | A short list (up to 20) of past analyses: file name, row count, scores, top risk, top action, summary | Your browser (localStorage) | To show what you analysed before | Contract |
| Preferences | Alert thresholds, report cadence, and the report email address | Your browser (localStorage), and for scheduled reports, Supabase | To remember your settings | Contract |
| Scheduled reports | The schedule (weekly or monthly), recipient email, and a snapshot of scores, risks and recommendations | Supabase database. Sent by email through Resend. | To send the report you asked for | Contract |
| AI context | A text summary built from your file, plus your question. See section 3. | Sent to the AI provider for one request. Not stored by us. | To produce an AI answer or written insights | Contract |
| Usage counters | Per-user and shared daily counts of AI requests, and the time of your last AI request | Supabase database | To enforce limits and control cost | Legitimate interests (preventing abuse and cost) |
| Server logs | For AI requests: a shortened hash of your user ID, the task, status, a failure reason, model name, token counts and time. Never your question, the facts, or the reply. For other requests: the hosting provider's normal request logs. | Vercel | To keep the service working and secure | Legitimate interests |
| Support emails | What you send us | Our email | To reply to you | Legitimate interests / contract |
| Payment details | [Only if you add payments: handled by PAYMENT PROVIDER. We do not store card numbers.] | [PAYMENT PROVIDER] | To take payment and keep tax records | Contract, legal obligation |

We do not use analytics, advertising or tracking tools in the app today. See [cookies-and-storage.md](cookies-and-storage.md).

## 3. What is sent to the AI provider

When you ask the AI Advisor a question, or generate AI insights, the app sends our server a request, and our server sends it to an AI provider. It includes:

- your question (up to 500 characters);
- a text summary of facts built from your own file: number of rows, health and quality scores, up to the last 12 monthly values of the main series, seasonality by month, the titles and descriptions of risks and recommendations, and the IDs and titles of charts. If you use an organisation view with several files, it also lists those file names, their row counts, the column pairs you confirmed as related, and connected indicators.

It does **not** include your raw rows.

Risk and recommendation text is written from your data, so it can mention things from your file, such as a product or category name. Do not put sensitive personal data into your file or your questions.

- The summary is capped at 12,000 characters.
- Our server builds the instructions to the AI. The browser cannot supply them.
- The AI has no tools and no access to our database. It only sees that one request.
- We do not store the conversation. We do not log your question, the summary or the answer.
- If you are not signed in (including the demo), nothing is sent to the AI provider.

The AI provider is chosen in our server settings. The default is **Groq**. The code can also use OpenAI-compatible providers or Anthropic. [CONFIRM which provider is live.] The provider processes this data for us as a processor. The provider keeps its own logs under its own terms. Groq says it does not keep inference data by default, with logs kept up to 30 days for reliability and abuse purposes, and offers Zero Data Retention as an option. [CONFIRM current Groq terms and whether Zero Data Retention is switched on.] We do not claim that data is not used to train models. [CONFIRM with the provider.]

## 4. Who we share data with (processors and sub-processors)

We use these companies to run Verd.io. For each, the code shows the role. **Locations must be confirmed** from each provider's dashboard and contract before you publish.

| Provider | What they do | Role | Data they see | Location |
| --- | --- | --- | --- | --- |
| Supabase | Sign-in, database, file storage | Processor | Account email and password hash, database records, shared project files (private bucket) | [DATA LOCATION: check the region of your Supabase project] |
| Vercel | Hosts the website and the server routes, runs the daily report job, keeps request logs | Processor | Everything sent to our server routes, including AI requests in transit, and request logs | [DATA LOCATION: check Vercel's terms and data processing agreement] |
| AI provider (default Groq) | Writes AI answers and insights | Processor | The question and the facts summary from section 3 | [DATA LOCATION: check the provider] |
| Resend | Sends scheduled report emails and invitation emails | Processor | Recipient email, organisation name, role, report content | [DATA LOCATION: check Resend's terms] |
| [PAYMENT PROVIDER, if used] | Takes payment | Usually an independent controller for payment data | Payment and billing details | [DATA LOCATION] |

Resend is used by the server code for the report job and invitations. Check the live settings to confirm it is in use.

We do not sell your data. We share data with authorities only when the law requires it.

## 5. How long we keep data

[Owner to confirm the periods below. The code has no automatic deletion jobs today, so most data stays until the user or an admin deletes it.]

| Data | Kept for |
| --- | --- |
| Account | Until you close your account |
| Saved projects in your browser | Until you delete them or clear your browser data |
| Shared project files and records | Until a member with edit rights deletes the project, or the organisation or account is deleted |
| Workspace records, schedules | Until you change them or delete your account |
| Invitations | Seven-day expiry. The record stays after that. [DECIDE how long.] |
| Audit log | [DECIDE: for example 12 months] |
| Usage counters | [DECIDE: the code keeps them with no clean-up job] |
| Analysis history in your browser | Until you clear your browser data (latest 20 kept) |
| Server logs | [Per Vercel plan: CONFIRM] |
| Payment and invoice records | [Usually 6 years for UK tax: CONFIRM with an accountant] |

When an account is deleted, the database removes the user's workspace records, schedules and usage counters automatically, and organisations they own. Some records point to the user without automatic deletion (for example audit entries, invitations they sent and projects they saved in someone else's organisation), so a manual clean-up step is needed. [See launch checklist.]

## 6. International transfers

[PLACEHOLDER. Fill in after checking the locations in section 4. If any provider stores or accesses data outside the UK, say which safeguard applies, for example the UK adequacy regulations, the UK Addendum to the EU standard contractual clauses, or the UK-US data bridge. Solicitor to check.]

## 7. Your rights

Under UK GDPR you can ask us to:

- tell you what we hold about you and give you a copy (access);
- correct data that is wrong;
- delete your data (erasure);
- restrict how we use it;
- give you your data in a portable format;
- stop using it where we rely on legitimate interests (object);
- not make decisions about you only by automated means. We do not do this.

To use any of these, email [CONTACT EMAIL]. We will reply within one month. We may need to check who you are first. It is free unless the request is clearly unreasonable.

Today there is no button in the app to delete your account or export your data, so these requests are handled by hand. You can delete saved projects in the app, and you can clear your browser data at any time.

If you are a member of an organisation, the organisation's owner may decide what happens to shared projects. We will tell you if your request affects other members.

## 8. Security

What the code does today:

- **Row-level security** is switched on for every table. A signed-in user can only read or change their own workspace records and schedules. Organisation data is only visible to members of that organisation, with write access limited by role.
- **The usage-counter tables** can only be reached through one database function, and only for your own user ID. The function cannot be told to raise your own limit past a fixed ceiling.
- **Shared project files** are in a private storage bucket. Only JSON files up to 50 MB are accepted. Reading needs membership of the organisation and writing needs an edit role.
- **The AI route checks your session token** with Supabase on each request. It does not use the powerful service key. It accepts only requests from allowed origins.
- **Quotas** limit AI use per user and across all users.
- **The AI route** refuses override attempts and requests about other users before anything is sent to the provider. Replies with code or links are withheld.
- **Invitations** use a random token, expire after 7 days, and can only be accepted by the invited email address.
- **The scheduled-report job** needs a secret that only our server holds.
- **Logs** hold a shortened hash of your user ID, not your email, and not your questions or answers.
- **Secrets** (API keys) are server settings. They are not in the code.

Not claimed here until confirmed: encryption at rest and in transit settings at each provider, backups, penetration testing, and any certification. [CONFIRM.]

No system is perfectly safe. If we find a personal data breach that puts you at risk, we will tell you and the ICO as the law requires.

## 9. Children

Verd.io is for businesses. It is not meant for anyone under 18, and we do not knowingly collect children's data. If you think a child has given us data, email [CONTACT EMAIL] and we will delete it.

## 10. Cookies and similar storage

The app stores a sign-in session, saved projects and a few settings in your browser. We do not set advertising or analytics cookies. Details are in [cookies-and-storage.md](cookies-and-storage.md).

## 11. Changes

We will post changes here with a new date. For big changes we will tell you by email or in the app.

## 12. Contact and complaints

Questions or requests: [CONTACT EMAIL], [OWNER NAME OR COMPANY NAME], [REGISTERED ADDRESS].

If you are unhappy with how we handle your data you can complain to the Information Commissioner's Office (ICO): ico.org.uk, 0303 123 1113. We would like the chance to fix it first, but you do not have to contact us before the ICO.

---

## To confirm (owner and solicitor)

1. Controller identity, address, and ICO registration number.
2. Region of the Supabase project, Vercel region and data processing terms, AI provider location and terms, Resend location and terms. The repo does not say any of these.
3. Which AI provider is live (Groq is the code default) and whether Zero Data Retention is on. Also whether the provider uses data for training.
4. Whether Resend is live in production. The code sends scheduled reports and invitation emails through it, and `docs/production-health.md` lists its keys as required, but live settings are not in the repo.
5. Whether Supabase Auth email confirmation is on, and what Supabase logs about sign-ins (IP addresses, for example).
6. Retention periods for the items marked DECIDE, and whether to add clean-up jobs.
7. Whether payments will be added, and which provider.
8. Whether risk and recommendation text can include personal data from files (for example a named customer). The code builds those texts from the file's columns, so a sensitive column could appear.
9. Whether a data processing agreement is needed for business customers who put personal data in files.
10. Whether the demo also saves history and a project in the visitor's browser. The save step in `src/app/App.tsx` does not check for sign-in, so it probably does.
11. A delete-my-data and export-my-data process. There is no button for either in the code. Deleting a user in Supabase can also be blocked by records that point to the user (audit events, projects saved in an organisation, invitations sent) because those links have no automatic deletion.
12. Backups and breach procedure.
