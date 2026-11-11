# Runbook — FitSphere Coach

## 1. Set up a computer (once)
1. Install **Git**, **Node.js 24** and **VS Code**. For the integration tests, also a local
   **PostgreSQL 17** (or Docker).
2. Clone: `git clone https://github.com/pradeepKumawatPalara/fitsphere-coach D:\fitsphere-coach`
3. Copy `apps/api/.env.example` to `apps/api/.env` and fill it in (never committed).
4. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill it in.
5. `npm install` in the repo folder.
6. Install **Expo Go** on your phone.

## 2. Configuration names

| Name | Where | What | Secret? |
|---|---|---|---|
| `DATABASE_URL` | `apps/api/.env` | Supabase → **Connect** → *Session pooler* connection string, with the database password. Same project as the trainee app. | **Yes** |
| `SUPABASE_URL` | `apps/api/.env` | `https://<project-ref>.supabase.co` | No |
| `SUPABASE_PUBLISHABLE_KEY` | `apps/api/.env` | Supabase → Project Settings → API keys → publishable key (`sb_publishable_…`) | No |
| `PORT` | `apps/api/.env` | Optional; default `3100` (the trainee API uses 3000, so both can run on one PC) | No |
| `APPROVAL_INBOX`, `SENDER_EMAIL`, `SENDER_DISPLAY_NAME` | `apps/api/.env` | Where the gym request and its approval code are emailed, and who sends it (ADR-0005, ADR-0008). Starting values are in `.env.example`. | No |
| `APPROVAL_CODE_LENGTH`, `GYM_REQUEST_VALID_DAYS`, `APPROVAL_WRONG_TRIES`, `GYM_REQUESTS_PER_DAY` | `apps/api/.env` | Code digits (4–8), days a request is valid (1–30), wrong tries (1–10), requests per person per day (1–10). The server refuses to start with a missing or out-of-range value and names it. | No |
| `APPROVAL_CODE_SECRET` | `apps/api/.env` | The key that scrambles approval codes before they are stored (ADR-0004): 32+ random characters, e.g. `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`. Changing it makes open requests' codes stop working. | **Yes** |
| `SMTP_APP_PASSWORD` | `apps/api/.env` | The Google app password of `SENDER_EMAIL` (ADR-0005 "Owner set-up": 2-Step Verification, then App passwords). | **Yes** |
| `TRAINEE_INVITE_VALID_DAYS`, `INVITES_PER_DAY` | `apps/api/.env` | Days a trainee invitation stays valid (1–30, the same number as the trainee app, TCR-001) and invitations one person may send a day (1–100). | No |
| `TRAINEE_INVITES_ENABLED` | `apps/api/.env` | `true` or `false`. Keep **false** until Developer 1 has built TCR-001 and its tables exist in the shared database; while false the invite routes answer "not found" and the app hides Invite client (C-D22). | No |
| `TEST_DATABASE_URL` | `apps/api/.env` or CI | Local test database, e.g. `postgres://postgres:postgres@localhost:5432/fitsphere_coach_test`. **Never Supabase**: the tests drop and recreate schemas `app` and `coach` | No |
| `EXPO_PUBLIC_SUPABASE_URL` | `apps/mobile/.env` | Same as `SUPABASE_URL` | No |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `apps/mobile/.env` | Same as `SUPABASE_PUBLISHABLE_KEY` | No |
| `EXPO_PUBLIC_API_URL` | `apps/mobile/.env` | Where the phone reaches the coach API, e.g. `http://192.168.1.20:3100` on the same Wi-Fi, or a tunnel address while testing. Never commit a tunnel address. | No |

## 3. Commands

| Command | What it does |
|---|---|
| `npm run dev -w @fitsphere-coach/api` | Runs the coach API on this PC (port 3100) |
| `npm run migrate -w @fitsphere-coach/api` | Applies new `coach` migrations to `DATABASE_URL`. **Only after the pull request is merged, and tell Developer 1 first** (contract rule 8). Prints "Connected" first, so it also checks the database password. |
| `npm start -w @fitsphere-coach/mobile` | Starts the phone app; scan the QR code with Expo Go |
| `npm run lint` / `npm run typecheck` / `npm test` | Checks and unit tests |
| `npm run test:integration` | API and database tests against `TEST_DATABASE_URL` |

## 4. Reaching the API from the phone
The API listens on this PC. For Expo Go on the same Wi-Fi, set `HOST=0.0.0.0` in `apps/api/.env`
and `EXPO_PUBLIC_API_URL=http://<this PC's Wi-Fi address>:3100`. Use test accounts only, and turn
`HOST` back off after testing.

## 5. Supabase settings for the coach app's email links (CF01, once)
The verify and reset emails link back to the app that asked for them. Supabase only follows links it
has been told about, so add the coach app's addresses under **Authentication → URL Configuration →
Redirect URLs** (click **Add URL** for each):

| Address | Used by |
|---|---|
| `fitspherecoach://**` | FitSphere Coach builds (later) |
| `exp://**` | FitSphere Coach in **Expo Go** (now) |

This only **adds** entries to the list. Keep every existing entry (the trainee app's
`fitsphere://**` and any others) exactly as it is, and change nothing else on that page, so the
trainee app is not affected (C-D22). Both apps send the same emails, with the same wording.

## 6. Trying CF01 on your phone
1. After the CF01 pull request is merged: `npm run migrate -w @fitsphere-coach/api` (adds C0002: coach names and coach terms; schema `coach` only).
2. In `apps/api/.env` set `HOST=0.0.0.0`; in `apps/mobile/.env` set `EXPO_PUBLIC_API_URL=http://<this PC's Wi-Fi address>:3100`.
3. Start the API: `npm run dev -w @fitsphere-coach/api`. Start the app: `npm start -w @fitsphere-coach/mobile` and scan the QR code with Expo Go (phone on the same Wi-Fi).
4. Use a **test email** you can read. Turn `HOST` off again afterwards.
5. The shared Supabase project has **Confirm email** off (C-D9): a new sign-up sends no email and goes straight to **Coaching is off**. A sign-up with an email that already has an account (for example, from the trainee app) shows "Verify your email" but sends nothing (invariant 3): use **Log in** with that account's password instead. Do not change the Supabase setting (C-D7).

## 7. Trying CF02 (gym onboarding) on your phone
1. Set the new variables in `apps/api/.env` (names in §2): copy the CF02 block from `.env.example`, make an `APPROVAL_CODE_SECRET`, and add `SMTP_APP_PASSWORD` (ADR-0005 "Owner set-up"). The server will not start until every one is valid, and it names the one that is not.
2. After the CF02 pull request is merged: `npm run migrate -w @fitsphere-coach/api` (adds C0003: `coach.gym_onboarding_requests` and `coach.gyms`; schema `coach` only). Tell Developer 1 first (contract rule 8).
3. Start the API and the app as in §6. Use a **test email**.
4. Create an account → the gym form → fill it in → **Send request**. The email with the code arrives in the approval inbox (`APPROVAL_INBOX`).
5. Enter the code on the phone → "You're a Head Coach" → home. Try a wrong code (tries left), five wrong codes (locked), and a new request after a lock.
6. Log in on another phone with the same account: it goes straight into the app (approved for good).
7. Expiry is 7 days by default; to test it quickly, set `GYM_REQUEST_VALID_DAYS=1` for a test gym, or ask for the request's `expires_at` to be moved back in the test database. Never on Supabase without telling the owner.

## 8. Trying CF06 (workout management) on your phone
Needs migration **C0004** applied (after the pull request is merged and the owner says so; `npm run migrate`). Until Developer 1 builds TCR-003, **Publish is hidden** ("Publishing waits for the FitSphere app update") and you can try everything else.
1. Start the API and the app as in §6. Sign in as a Head Coach or Coach who has at least one client.
2. Home → **Workouts**. Templates tab: **New template** → name, goal, difficulty, "Whole gym" or "Only me", schedule (Weekdays or Rotating), weekly and daily target switches. Open a day → **Add exercise** (ten exercises) → open an exercise to set sets, reps, weight, RPE, rest, note; try Up, Down and **Superset**. Save.
3. Open the template again: Copy, Assign plan, Deactivate (sheet), and "Show inactive templates". As a Coach, open a gym template made by another coach: it is read-only.
4. **Assign plan** → pick clients and a start date → **Create drafts**. A client who already has a draft cannot be picked; one with an active plan shows a warning.
5. Plans tab: the status chip (Draft, Active, Ended) is first. Open a plan: days, last change, **Edit plan**, **History**, **Discard draft**.
6. After TCR-003: **Publish** (sheet) → the plan is Active; edit it → "changes that are not published" → Publish again; History → **Restore as draft**; **End plan**.
7. A Coach must not see a plan of another Coach's client; the Head Coach sees all (with the coach filter).

## 9. Trying CF07 (nutrition management) on your phone
Needs migration **C0005** applied (after the pull request is merged and the owner says so; `npm run migrate` also applies any other pending file, such as C0003). Until Developer 1 builds TCR-004, **Publish is hidden** ("Publishing waits for the FitSphere app update") and you can try everything else.
1. Start the API and the app as in §6. Sign in as a Head Coach or Coach who has at least one client.
2. Home → **Nutrition**. Templates tab: **New template** → name, goal, "Whole gym" or "Only me", calorie and protein targets. Open **Breakfast** → **Add option** → **Add ingredient** → pick a food (ten are listed; type to filter, e.g. "pan"), choose grams or a serving → **Add**. The first high-protein food becomes the **protein source**; try changing it. Add a second option and a custom slot (**Add slot**, "logs as" Snack).
3. Watch the day total against the targets: more than 10% off shows a warning, but you can still save. Save, then open the template again: Copy, Assign plan, Deactivate (sheet), "Show inactive templates". As a Coach, open a gym template made by another coach: it is read-only.
4. **Assign plan** → pick clients and a start date. Keep **Scale to each client's calories** on (a client with a calorie target gets bigger or smaller quantities; open the draft to see) or switch it off to copy as it is → **Create drafts**. A client who has a draft cannot be picked; one with an active plan shows a warning.
5. Plans tab: the status chip is first. Open a plan: the client's calorie and protein targets against option 1 of each slot, slots and ingredients, **Edit plan**, **History**, **Discard draft**.
6. After TCR-004: **Publish** (sheet) → Active; edit → "changes that are not published" → Publish again; History → **Restore as draft**; **End plan**.
7. A Coach must not see another Coach's client's plan; the Head Coach sees all.
