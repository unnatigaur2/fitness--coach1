# TCR-004: Coach diet plans in the Diet plan tab

| | |
|---|---|
| Status | **Ready for owner** (CF07 UI approved 2026-11-11; the coach side is built. Review §12, then send to Developer 1) |
| Written by | Coach team (Developer 2), 2026-11-11 |
| For | Developer 1 — trainee app (`fitsphere`) |
| Coach feature that depends on it | CF07 (nutrition management, SPEC-003) |
| Coach decisions | C-D13, C-D22, C-D27, C-D28; ADR-0002 (rules 2–4) |
| Trainee-repo items it delivers | New (Developer 1 to assign IDs); relates to REQ-DIET and the planned-meal logging (CDIET-006 AC5) |

Design source: `docs/design/CF07-nutrition-management-ui.md`. **Depends on TCR-001** (a link exists). Same pattern as TCR-003 (training plans).

## 1. Why
A coach builds a diet plan for a trainee in FitSphere Coach: meal slots, each with up to three options, each option a list of foods with grams and a protein source. The trainee sees it in the Diet plan tab and can log a planned option as a meal in one tap. The trainee cannot edit it (REQ-PLAN-001).

## 2. User flow
1. The coach saves a draft and then publishes (drafts never reach the trainee app).
2. On the trainee's next sync the Diet plan tab shows "Plan from {Coach name}" with the slots and options.
3. The trainee taps **Log** on an option; the meal is logged with the option's ingredients and totals, under the slot's meal type ("logs as"), with the plan id and version remembered.
4. A new published version appears at the next sync; meals already logged keep the version they followed.
5. When the coach ends the plan, or the link ends (C-D28), the plan stops being current.

## 3. Screens and states
- **Diet plan tab, plan card:** "{Plan name}" · "Set by {Coach name} (C|HC)" · calorie and protein targets (if set) · coach note · slots in order (name; the meal it logs as) · options (name, kcal and protein; ingredients with grams, the protein source first, and the option's note) · **Log** per option. Lock icon; no edit controls. The line "A fitness planning tool. It is not medical advice." sits under the plan.
- States: loading; no plan (existing screen, unchanged); offline (the last synced plan is usable); plan ended (card removed, history keeps the name).

## 4. Exact copy
"Plan from {Coach name}" · "Set by {Coach name} (Head coach)" / "(Coach)" · "Your coach built this plan. You can't edit it." · "Log" · "Logs as {Breakfast|Lunch|Snack|Dinner}" · "Protein source" · "A fitness planning tool. It is not medical advice." · toast "Your coach updated your diet plan."

## 5. Data (schema `app`; Developer 1 writes the migration)
Follow the sync pattern of the existing tables (`change_seq`, touch trigger, row level security on, no policies, `on delete cascade` from `app.users`).

```sql
-- One row per live or ended diet plan of a trainee. Written by the coach server only, when the coach
-- publishes. Drafts and unpublished edits stay in schema `coach`. A new version updates the same row.
create table app.diet_plans (
  id uuid primary key,                       -- the coach server's plan id
  user_id uuid not null references app.users (id) on delete cascade,
  version int not null check (version >= 1), -- the published version the trainee sees
  name text not null check (char_length(name) between 1 and 80),
  status text not null check (status in ('active', 'ended')),
  start_date date not null,                  -- IST day
  calorie_target int check (calorie_target is null or calorie_target between 500 and 10000),
  protein_target int check (protein_target is null or protein_target between 10 and 500),
  note text check (note is null or char_length(note) <= 300),
  slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) <= 8),
  set_by_user_id uuid not null references app.users (id),
  set_by_role text not null check (set_by_role in ('head_coach', 'coach')),
  published_at timestamptz not null,
  ended_at timestamptz,
  change_seq bigint not null default nextval('app.change_seq'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index diet_plans_one_active on app.diet_plans (user_id) where status = 'active';
create index diet_plans_user_change_seq on app.diet_plans (user_id, change_seq);
create trigger diet_plans_touch before update on app.diet_plans
  for each row execute function app.touch_synced_row();
alter table app.diet_plans enable row level security;

-- A logged meal remembers the plan, the published version and the option it came from (CDIET-006 AC5).
alter table app.meals
  add column plan_id uuid references app.diet_plans (id) on delete set null,
  add column plan_version int,
  add column plan_slot int,
  add column plan_option int;
```

`slots` shape (what the coach server writes; checked by the coach API): `[{ "name": "Pre-workout", "logsAs": "snack", "options": [{ "name": "Paneer only", "note": "", "ingredients": [{ "foodId": "<app.foods.id>", "name": "Paneer", "grams": 50, "label": null, "proteinSource": true, "kcal": 132.5, "proteinG": 9, "carbsG": 1.5, "fatG": 10, "fibreG": 0 }] }] }]`.
- `logsAs` is one of `breakfast`, `lunch`, `snack`, `dinner`, the existing `app.meals.meal_type` values, so **no change to the meals constraint is needed**. A custom slot is only a name.
- For now the coach app has **ten fixed foods** and `foodId` is one of their ids (`paneer`, `chicken-breast`, `egg-whole`, `toor-dal-cooked`, `wheat-roti`, `rice-cooked`, `oats`, `whey-protein`, `banana`, `curd`), **not** an `app.foods.id`. Each ingredient already carries its name and the nutrition for its grams (per-100 g values times the grams, one decimal), so the trainee app needs no food lookup to show or log it. When the coach app moves to the FitSphere food table, `foodId` becomes `app.foods.id`; the trainee app must treat `foodId` as an opaque string. The protein source is always first in its option. Max 3 options a slot, 15 ingredients an option.
- Offline: the phone stores the active plan and can log an option offline; `plan_*` ride the meal's normal outbox push.
- `calorie_target` and `protein_target` are the plan's own planning targets. Applying coach targets to the trainee is TCR-002.

## 6. API changes in the trainee server
Sync pull includes the trainee's own plans. No route lets the trainee create, edit or delete a plan (403 `plan_read_only`). The meal push accepts optional `plan_id`, `plan_version`, `plan_slot`, `plan_option`; the server checks the plan belongs to the user, else 400 `invalid_plan`.

## 7. Rules and permissions
Only the coach server's database role writes `app.diet_plans` (TCR-005 gives it its own login). A trainee sees only their own plans. Plans of an ended link stay visible but not current (C-D28). Deleting the account cascades.

## 8. Acceptance criteria
- Given a published plan, when the trainee syncs, then the card, slots and options show with the copy of §4.
- Given the coach has unpublished edits, then the trainee sees only the last published version.
- Given the trainee taps Log on an option, then a meal of the slot's `logsAs` type is logged with the option's ingredients and totals, and remembers plan, version, slot and option.
- Given the trainee tries to edit or delete a plan, then the server refuses (403) and the UI offers no control.
- Given another user's plan id in `plan_id`, then the push is refused (400).
- Given the link ends, then no new plan appears and the active plan stops being current.
- Offline: the plan shows and Log works without internet; it syncs later.

## 9. Tests Developer 1 should add
Migration test (constraints, one-active index, cascade); API tests (read-only, `invalid_plan`, cross-user isolation); sync test (publish, new version, ended); UI test (card, Log, locked); phone check with a synthetic plan.

## 10. How the coach side depends on it
The coach server checks that `app.diet_plans` exists (ADR-0002 rule 2). If absent, Publish answers "not found" and plans stay drafts. The coach side is built and tested against this exact table, copied into `apps/api/test/fixtures/proposed-app/0011_tcr004_proposed.sql`. If Developer 1 changes the SQL, tell the coach team so the copy and the publish query change too. On publish the coach server writes the row with the plan's own id (insert, or update on a new version) and sets the replaced plan's row to `ended` first, in one transaction.

## 11. Rollout
1. Owner reviews §12 and sends this to Developer 1.
2. Developer 1 merges and applies the migration; the owner tells the coach team.
3. Publish starts working with no coach change. Either side may ship first safely (drafts only until then).

## 12. Open questions
1. A plan option can hold up to 15 ingredients; does the trainee's meal logging accept that many items in `app.meals.items` today? (Proposed: yes.)
2. The coach side uses ten fixed foods for now (nutrition per 100 g, confirmed by the owner). No action; when the coach app moves to `app.foods`, a later change request will say so.
3. Should the trainee be able to change the grams when logging a planned option? (Proposed: yes, like any logged meal; the plan itself is unchanged.)
4. What the trainee sees when the link ends. Proposed: the plan stops being current and history stays.
