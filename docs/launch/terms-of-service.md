# Verd.io Terms of Service

> **DRAFT for the owner to review. Not legal advice. Have a solicitor check the Terms and Privacy Policy before charging money.**

**Placeholders to fill before publishing**

- [OWNER NAME OR COMPANY NAME] (and company number if a company)
- [REGISTERED ADDRESS]
- [CONTACT EMAIL]
- [GOVERNING LAW WORDING] (for example which part of the UK law applies, and which courts)
- [PLAN NAMES, PRICES AND BILLING PERIOD] (none are invented here)
- [DATE LAST UPDATED]

Text in this file that says "(draft note)" is for you and must be removed before publishing.

---

## 1. Who we are

Verd.io is run by [OWNER NAME OR COMPANY NAME] of [REGISTERED ADDRESS] ("we", "us"). You can reach us at [CONTACT EMAIL].

"You" means the person using Verd.io. If you use it for a business, "you" also means that business, and you confirm you can accept these terms for it.

## 2. What Verd.io is

Verd.io is a web app. You give it a spreadsheet or CSV file of business data, such as sales. It reads the file in your browser and shows you totals, trends, risks, forecasts and suggested actions. It also has an AI Advisor that answers questions about your own file.

Verd.io is a planning aid. It is not accounting, tax, legal or financial advice.

## 3. Accounts

- You need an account to save your work and to use the AI Advisor. You sign up with an email address and a password.
- Give us a real email address. Keep your password private. You are responsible for what happens under your account.
- Tell us quickly at [CONTACT EMAIL] if you think someone else has got into your account.
- There is also a demo that needs no account. The demo uses sample data and does not call the AI.
- If you are part of an organisation workspace, the organisation owner and admins can invite people and set their roles (owner, admin, analyst or viewer). Members of the organisation can see an audit log of project activity. Invitations expire after 7 days.

## 4. Acceptable use

You agree not to:

- break the law, or upload data you have no right to use;
- upload data that includes other people's personal details unless you have a lawful reason to use it;
- try to get into another user's account, files or data, or ask the AI Advisor for anyone else's data;
- try to get round the limits in section 8, for example with scripts, many accounts, or by calling our servers directly in a way the app does not;
- use the AI Advisor for anything other than analysing your own file and learning how to use Verd.io. It is not a general chatbot. Do not try to make it ignore its rules, reveal its instructions, write code, or discuss unrelated topics;
- send report emails or invitations to people who have not agreed to get them, or use them to send spam;
- probe, scan, overload or damage the service, or reverse engineer it, except where the law allows;
- resell or share your access except through the organisation features.

We can limit or suspend an account that breaks these rules (see section 12).

(draft note: the AI rules above match how the AI route works today. It only accepts a question plus facts built from your own file, it refuses override attempts and requests about other users, and it has daily limits. See `api/chat.js` and `docs/ai-setup.md`.)

## 5. Your data

- **You own your data.** Your files and what you save stay yours. We do not claim ownership.
- **Licence to us.** You give us permission to process your data only as needed to run Verd.io for you. That includes storing saved projects, sending the facts needed for AI answers to our AI provider, and sending report and invitation emails you ask for.
- **Where it is processed.** Your file is read and analysed in your browser. Saved projects are stored in your browser on your device. If you belong to an organisation and can edit, saving a project also uploads a copy to our cloud storage so other members of that organisation can open it. Other things you save while signed in (for example action, target and approval records) are stored in our database. The [Privacy Policy](privacy-policy.md) explains this in full.
- **Your responsibility.** You decide what to upload. Check you are allowed to.
- **Personal data in your files.** If your files include personal data about your customers or staff, you stay responsible for it, and we handle it on your instructions. [Solicitor to confirm whether a separate data processing agreement is needed.]
- **Backups.** Keep your own copy of your original files. Verd.io is not a backup service.

## 6. Plans and payment

- Today Verd.io is offered as a free early access plan. [CONFIRM this is still true at launch.]
- Paid plans: [PLAN NAMES, PRICES AND BILLING PERIOD]. Prices include or exclude VAT: [VAT WORDING].
- Payment is taken by [PAYMENT PROVIDER, for example Stripe]. [Renewal, cancellation and refund wording: SOLICITOR TO WRITE, including the consumer cancellation rights if you sell to individuals.]
- If we change a price we will tell you at least [NOTICE PERIOD] before it applies to you.
- Free plans may have lower limits than paid plans. We may change or end a free plan with [NOTICE PERIOD] notice.

## 7. Using the AI Advisor

- The AI Advisor sends a summary of facts about your file to a third-party AI provider to write an answer. It is not your raw rows. See the Privacy Policy for the exact list.
- AI answers can be wrong. Check any number against your own data before you act on it.
- Answers are marked "AI" or "Built-in" so you can tell which one you got. When the AI is not available, limited or you are not signed in, the app shows a built-in answer.

## 8. Limits and fair use

We set limits to keep the service available and the costs under control. At the time of writing, the defaults are:

| Limit | Default |
| --- | --- |
| AI Advisor questions per user per day (UTC) | 20 |
| AI insight generations per user per day (UTC) | 5 |
| Gap between AI requests | at least 3 seconds |
| AI questions across all users per day | 400 (shared) |
| AI insight generations across all users per day | 60 (shared) |
| Question length | 500 characters |
| Size of a shared project file | 50 MB |

We can change these numbers. The shared daily budget can run out on a busy day, so the AI may be unavailable even if you have questions left. When a limit is hit, the app falls back to built-in answers.

[Add limits for paid plans, number of users, number of files or rows, if any: PLAN LIMITS.]

(draft note: the numbers above are the defaults in `api/chat.js` and the 50 MB bucket limit in `supabase/migrations/202607260001_shared_projects_and_audit.sql`. They can be changed through settings on the server, so check them before you publish.)

## 9. What the results mean

Please read this section carefully.

- Verd.io produces **estimates and planning aids**. They are not facts about the future and not professional advice.
- **Forecasts use a fixed plus or minus 12 percent planning range** around the forecast figure. It is a simple planning range. It is not a statistical confidence interval.
- Some suggestions use fixed planning assumptions, such as a 12 percent growth target or a 5 percent value for better data. These are not worked out from your data. The app says so where it uses them.
- Results depend on your file. If the file is incomplete or wrong, the results will be too. Verd.io does not make up missing values. Rows with a blank or zero sales amount, and exact duplicates, are left out of sales totals and listed. Returns are shown apart from sales. Where revenue is blank but price and quantity are present, revenue is calculated from price times quantity and marked. Rows with no date count in the total but not in monthly trends or forecasts.
- **You are responsible for your business decisions.** We are not responsible for a decision you make using Verd.io. Check important numbers yourself or with an adviser.

## 10. Availability

We aim to keep Verd.io running, but we do not promise it will always be available or error free. We may change, pause or remove features. We may take it down for maintenance. Where we can, we will warn you first.

The service depends on other companies (for example hosting, database, email and AI providers). If one of them has a problem, Verd.io may not work.

## 11. Warranty and liability

- We provide Verd.io "as is". To the extent the law allows, we give no promise that it will meet your needs, be accurate, or be free of errors.
- Nothing in these terms limits liability that cannot lawfully be limited. That includes death or personal injury caused by negligence, fraud or fraudulent misrepresentation, and anything else the law says cannot be excluded.
- Subject to that, we are not liable for loss of profit, loss of revenue, loss of business, loss of data, or indirect or knock-on loss.
- Subject to that, our total liability to you in any 12 months is limited to [LIABILITY CAP, for example the amount you paid us in that period, or £[AMOUNT] if you are on a free plan]. [SOLICITOR TO SET THE CAP.]
- If you are a consumer, your legal rights are not affected.

## 12. Ending your use

- **You** can stop using Verd.io at any time. To close your account and ask for your data to be deleted, email [CONTACT EMAIL]. [See "To confirm": there is no delete-account button in the app today.]
- **We** can suspend or close an account if you break these terms, if we must by law, or if the account is a risk to the service or other users. Where it is fair and safe to do so, we will tell you why and give you a chance to fix it.
- We may also stop the service entirely. If we do, we will give you [NOTICE PERIOD] notice and a way to take your data.
- When an account is closed we delete or anonymise your data as set out in the Privacy Policy, except what we must keep by law.
- Sections that by their nature should continue after the end (for example 9, 11 and 14) do continue.

## 13. Changes to these terms

We may update these terms. We will post the new version here with the date. For big changes we will tell you by email or in the app at least [NOTICE PERIOD] before they apply. If you keep using Verd.io after that, you accept the new terms. If you do not agree, stop using it and close your account.

## 14. Governing law

[GOVERNING LAW WORDING. For example: "These terms are governed by the law of England and Wales and the courts of England and Wales have jurisdiction." Solicitor to confirm, including the position for consumers in Scotland and Northern Ireland.]

## 15. Contact

[OWNER NAME OR COMPANY NAME], [REGISTERED ADDRESS], [CONTACT EMAIL].

---

## To confirm (owner and solicitor)

1. Legal entity: sole trader or company? Name, address and company number if any.
2. Are you allowed to run a business and take payments in your own circumstances? Confirm on gov.uk or with an adviser before you sign up paying customers.
3. Pricing, billing period, VAT status, refunds and cancellation wording, and who the payment provider is. None of this is in the repo.
4. Will you sell to consumers (individuals) as well as businesses? Consumer rules (cooling off, unfair terms) change what the terms must say.
5. Liability cap amount, and whether a free plan gets a different cap.
6. Is the AI provider still Groq by default? It is set by server settings, so the live setting may differ from the code default. Check Vercel settings.
7. Is a data processing agreement needed for customers whose files contain personal data?
8. Are the limits in section 8 the ones you want to promise? They are server settings and can be changed.
9. Delete my data: there is no delete-account feature in the app code today. The terms point to an email route. Decide whether to build a button first.
10. Notice periods for changes, price rises and closing the service.
11. Governing law and courts.
