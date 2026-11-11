# Feature board — FitSphere Coach

Scope of record: `docs/product/coach-scope.md` (v0.4). Trainee-app change requests (TCR) for Developer 1: `docs/handoff/trainee-app/` (C-D22). One feature at a time: UI designed → owner approves → build (API, database, screens, tests) → owner
tries it on the phone → DONE.

| # | Feature | Spec IDs | Status |
|---|---|---|---|
| CF00 | Foundation: repo, coach API skeleton (token check, access rules, `GET /v1/me`), coach schema and migration runner, phone app shell with the FitSphere theme, CI | CNFR-001…006 | **Done** (merged; C0001 applied 2026-11-03) |
| CF01 | Coach sign-in, sign-up, verify (link), coaching off, password, log out | CAUTH-001, 003, 004, 005, 006 | **Built — owner's phone check pending** |
| CF01b | Accepting a coach invite (link and in-app card) — built with CF03 | CAUTH-002 | Moved to CF03 |
| CF02 | **Gym onboarding and FitSphere approval code** (scope v0.4 §4, C-D10): gym form, request, 6-digit code emailed to the approval inbox, enter code, 7-day expiry. Owner's answers recorded (coach-scope §11); C-D16 accepted (ADR-0005). UI locked 2026-11-11 (`docs/design/CF02-gym-onboarding-ui.md`); migration C0003 | — | **Built — owner's phone check pending** (migration C0003 not yet applied to Supabase) |
| CF03 | Head Coach invites Coaches (invitation only, C-D11), "already a Coach" check (C-D14), accept; Head Coach removes Coaches after moving their trainees (C-D20), Coaches cannot leave (C-D18) | — | After CF02 |
| CF04 | Coach or Head Coach adds and removes trainees (C-D18), once per gym (C-D19); Head Coach adds under self or under a Coach (C-D21); trainee list and profile; Head Coach sees each trainee's Coach — needs **TCR-001** (Developer 1) | TRNE-*, TPRO-* | **UI approved 2026-11-11** (`docs/design/CF04-client-management-ui.md`, from SPEC-001). **Coach side built** (list, profile, move, remove, invite, invited list, cancel and resend); no migration. **Invite is switched off** (`TRAINEE_INVITES_ENABLED=false`) until TCR-001 is built by Developer 1; trainee names and the Inactive filter also wait for it (TCR-001 written, ready for the owner). Owner's phone check pending |
| CF05 | Targets by Coach or Head Coach, with change log (C-D13) — needs **TCR-002** (Developer 1) | CTGT-* | Not started |
| CF06 | Exercise library and training plans, with change log — needs **TCR-003** (Developer 1) | EXL-*, CTRN-* | **UI approved 2026-11-11** (SPEC-002; `docs/design/CF06-workout-management-ui.md`; screens in the Canvas). **Built (coach API and phone screens)** — templates, exercise picker (10 fixed), assign drafts, plan, edit, history; migration C0004 not yet applied to Supabase. **Owner's phone check pending** (runbook §8). **Publish is off** until TCR-003 (ready for the owner) is built by Developer 1 |
| CF07 | Diet plans, with change log — needs **TCR-004** (Developer 1) | CDIET-* | **UI approved 2026-11-11** (SPEC-003; `docs/design/CF07-nutrition-management-ui.md`; screens in the Canvas). **Built (coach API and phone screens)** — templates, ten fixed foods, assign drafts (scalable to each client's calories), plan, edit, history; migration C0005 not yet applied to Supabase. **Owner's phone check pending** (runbook §9). **Publish is off** until TCR-004 (ready for the owner) is built by Developer 1 |
| CF08 | Templates | TPL-* | Not started |
| CF09 | Dashboard, adherence, flags, activity | MON-001…004 | Not started |
| CF10 | Notes, comments, notifications | COMM-001…003 | Not started |
| CF11 | Weekly check-ins | MON-005 | Not started |
| CF12 | Reports, team view, audit log | RPT-*, TEAM-005, AUD-001 | Not started |
