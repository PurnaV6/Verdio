# Verd.io cookies and browser storage

> **DRAFT for the owner to review. Not legal advice. Have a solicitor check the Terms and Privacy Policy before charging money.**

**Placeholders to fill before publishing**

- [OWNER NAME OR COMPANY NAME]
- [REGISTERED ADDRESS]
- [CONTACT EMAIL]
- [GOVERNING LAW WORDING] (only if you mention it here)
- [DATE LAST UPDATED]

---

## 1. Short version

- The app code sets **no cookies**.
- It uses your browser's **localStorage**, **sessionStorage** and **IndexedDB** to keep you signed in, to save your work on your device, and to remember a few settings.
- There are **no analytics, advertising or tracking tools** in the app today. There are no third-party scripts in the page. Fonts are served from our own site.
- On my reading, a consent banner is **not needed** while the app only does this. The owner must confirm (section 5).

## 2. What is stored

This list comes from searching the code for `localStorage`, `sessionStorage`, `document.cookie` and `indexedDB`.

### localStorage

| Key | What it holds | Why | Who writes it | Strictly necessary? |
| --- | --- | --- | --- | --- |
| A key starting `sb-` and ending `-auth-token` (exact name not set in our code) | Your sign-in session (tokens) | To keep you signed in and refresh the session | The Supabase sign-in library, set to keep sessions (`persistSession: true`) in `src/lib/auth/supabaseClient.ts` | Yes, for signed-in features. [CONFIRM the exact key name in browser dev tools.] |
| `verdio_history_v2` | Up to 20 past analyses: file name, file type, row count, health and quality scores, top risk, top action, summary, value at risk | To show what you analysed before | `src/lib/history/historyStore.ts`, saved automatically after each analysis | Arguable. See section 5. |
| `verdio_actions_v2_<file name>`, `verdio_outcomes_v2_<file name>`, `verdio_approvals_v2_<file name>` | Action, outcome and approval records you type in for that file. The older `_v1_` keys are read too. | To keep your records between visits. When you are signed in they are also stored in our database. | `src/lib/workspace/useWorkspaceState.ts` | Needed for a feature you use |
| `verdio_operational_preferences_v1` | Alert switches, health and quality thresholds, report cadence, report email address | To remember your alert and report settings | `src/components/operational/OperationalPages.tsx` | Needed for a feature you use |

### sessionStorage

| Key | What it holds | Why | Who writes it | Strictly necessary? |
| --- | --- | --- | --- | --- |
| `verdio_chunk_reload` | The value `1` | After we release a new version, the page may fail to load a file. The app reloads once and uses this flag to avoid reloading in a loop. Removed after a good load. | `src/components/workspace/lazy.ts` | Yes. No personal data. |

### IndexedDB

| Database / store | What it holds | Why | Who writes it | Strictly necessary? |
| --- | --- | --- | --- | --- |
| `verdio-workspace` / `projects` | Saved projects: the full analysis result for a file, **including the processed rows** | To reopen your work later | `src/lib/projects/projectStore.ts`, saved automatically when an analysis finishes | Needed for a feature you use |

This is the most sensitive item because it holds your data. It stays on your device unless you are an organisation member with an edit role, in which case a copy is also uploaded (see the [Privacy Policy](privacy-policy.md)).

### Cookies

None are set by the app code. The sign-in library uses localStorage here, not cookies. [CONFIRM in browser dev tools on the live site that no cookie is set by the host (Vercel) or any other service.]

### Third parties in the page

The page loads its script, styles, fonts and images from our own site. We found no analytics, tag manager, advertising, social media or chat widget code in `index.html`, `src` or `package.json`. [CONFIRM again before launch, and after adding anything such as error monitoring.]

## 3. How to clear it

- Delete a saved project in the app. This removes it from your device and, if it was shared with your organisation, from the organisation.
- "Clear preferences" on the Trust Center page removes the settings key.
- Clearing your browser data (site data) removes everything above, including the sign-in session.
- The analysis history in localStorage has a clear function in the code (`clearHistory`), but we found no button that calls it. [See launch checklist.]

## 4. Notes for a public cookie notice

You can publish a short notice, not a banner:

> Verd.io does not use advertising or analytics cookies. It stores a sign-in session, your saved projects and a few settings in your browser so the app works. You can clear them any time by clearing site data in your browser. See our Privacy Policy.

## 5. Is a consent banner needed? (my reasoning, for the owner to confirm)

- The UK rule (PECR, regulation 6) covers storing or reading anything on a person's device, not only cookies. It includes localStorage, sessionStorage and IndexedDB.
- Consent is not needed where the storage is **strictly necessary** to give a service the user has asked for.
- The sign-in session is strictly necessary for signed-in features.
- The `verdio_chunk_reload` flag is strictly necessary for the page to load.
- Saved projects, workspace records and preferences are stored so features the user chose to use can work. This fits the exemption most clearly when the user asks to save. Saved projects and analysis history are written **automatically** after every analysis, not after a click. That makes them less clear cut.
- My reading: all of this is plausibly exempt because it is part of the service, nothing is shared with anyone for tracking or advertising, and the privacy policy tells people about it. So a consent banner is probably not needed. The weakest point is the automatic history and project save.
- Options if you want to be safer: save a project only when the user clicks Save, or add a clear on/off setting for history, or ask the solicitor to confirm.
- If you later add analytics, error monitoring that sets identifiers, advertising or a chat widget, this must be re-checked. Those usually need consent.

**Owner to confirm this reading with a solicitor or the ICO's guidance on storage and access technologies before launch.**

---

## To confirm

1. The exact name of the Supabase session key, and that no cookies appear on the live site (use browser dev tools, Application tab).
2. Whether Vercel or any other service sets a cookie on your production domain.
3. Whether automatic saving of history and projects needs consent, or a notice is enough.
4. Whether the demo (no sign-in) also writes history and a saved project to the visitor's browser. The save step in `src/app/App.tsx` does not check for sign-in.
5. Whether error monitoring is added before launch, and if it sets storage.
