# CF07 — Nutrition management (SPEC-003): UI design

| | |
|---|---|
| **App** | FitSphere Coach (Expo, iOS + Android) |
| **Status** | **UI approved by the owner, 2026-11-11.** Screens are in the "FitSphere Coach Screens" canvas (rows "SPEC-003 · Nutrition management", dark and light). **Built:** the coach API (migration C0005, not yet applied to Supabase), the phone screens (2.1 to 2.8) and tests. **Publish is off** until TCR-004 exists. Owner's phone check pending (`docs/operations/runbook.md` §9). |
| **Source spec** | `spec/SPEC-003-nutrition-management.md` (business draft) and `docs/product/coach-spec.md` CDIET-001…007. Where they disagree with `docs/product/coach-scope.md` v0.4 or a C-D decision, the scope and the decisions win. |
| **Depends on** | CF04 (clients exist), **TCR-004** (diet plans in the trainee app; Developer 1, C-D22; `docs/handoff/trainee-app/TCR-004-diet-plans.md`) |
| **Decisions** | C-D12, C-D13, C-D15, C-D18, C-D22, C-D27, C-D28; ADR-0002 |

Visual values come from `docs/design/design-system.md`. It works like CF06 (`CF06-workout-management-ui.md`); only the differences are written here.

## 1. How SPEC-003 maps to the scope

| SPEC-003 says | What the product does | Why |
|---|---|---|
| "Gym Owner" manages templates and plans | The owner **is** the Head Coach. Any Coach can make a gym-wide template; its author and the Head Coach edit it | owner answers 2026-11-11 |
| Statuses Draft / Active / Completed / Inactive | **Draft, Active, Ended**; the status is shown first | owner answer (CF06 Q3) |
| Breakfast, lunch, dinner, snacks | The four app meals as the default slots, plus **custom slots** (e.g. Pre-workout). A custom slot **logs as** one of the four meal types, so no change to the trainee's `meals` table is needed | owner answer 2026-11-11; `app.meals.meal_type` |
| Food items and quantities | **Ten fixed foods kept in the code for now** (`packages/shared/src/nutrition.ts`: Paneer, Chicken breast, Egg, Toor dal cooked, Wheat roti, Rice cooked, Oats, Whey protein, Banana, Curd), nutrition **per 100 g** (owner confirmed). The coach gives grams or picks a serving; the **server** works out the nutrition and stores it with the plan. The values are approximate starter values to be checked before real use; the FitSphere food table (`app.foods`) replaces the list later | owner answers 2026-11-11 |
| Calorie and nutrient values | Per option and per day: kcal, protein, carbs, fat, fibre. The day total is shown against the client's calorie and protein targets; **more than 10% off is a warning, never a block** | CDIET-005, CQ-23 |
| One protein source | Each option has **exactly one** protein-source ingredient, always shown first; publish is blocked without it | CDIET-004, owner answer |
| Training-day and rest-day plans | **One plan for every day.** Separate plans come later | owner answer |
| Scale a template to a client | **Yes, when assigning.** A switch "Scale to each client's calories" (on by default): every quantity is multiplied by (client's calorie target ÷ the template's day total for option 1 of each slot), in whole grams (1 to 5,000), the nutrition is worked out again, and the plan takes the client's calorie and protein targets. A client with no calorie target gets the template as it is. Switch it off to copy as it is | owner answer 2026-11-11 (CQ-28) |
| Calendar scheduling | Out of CF07 (CF09 / SPEC-004). A published plan is stored so the calendar can use it | CF09 |
| "Not medical advice" | Every plan screen shows "A fitness planning tool. It is not medical advice." | SPEC-003 §5.7 |

## 2. Screens
1. **Nutrition home** (`nutrition.tsx`): Templates and Plans tabs, search, goal chips (Weight loss, Muscle gain, Maintenance, General fitness) or status chips, Head Coach coach filter, Gym or Mine tags, "Show inactive templates", **New template**.
2. **Template editor** (`diet-template.tsx`): name, goal, who can use it, calorie and protein targets, the day total (option 1 of each slot) against them with a warning when more than 10% off, meal slots (name, "logs as", options, add or remove), a note, Save, Assign plan, Copy, Deactivate. Another coach's template is read-only.
3. **Option editor** (a screen inside the editor): option name, ingredients (protein source first, amount in grams, "Protein source" toggle, remove), totals (kcal, protein, carbs, fat, fibre), note, Done, Remove option.
4. **Food picker**: the ten foods, filtered by what is typed; each shows its group and nutrition per 100 g; the amount is grams or one of the food's servings ("1 katori · 150 g").
5. **Assign plan** (`diet-assign.tsx`): clients, start date, the scaling switch, creates drafts only; a client with a draft is blocked; one with an active plan gets a warning.
6. **Plan** (`diet-plan.tsx`): status first, the client's targets against option 1 of each slot, slots with options and ingredients, Publish, Edit plan, History, Discard draft or changes, End plan.
7. **Edit plan** (`diet-plan-edit.tsx`) and 8. **History** (`diet-history.tsx`, restore an old version as a draft).

## 3. Rules the server enforces (not the screens)
- Same access rules as CF06: a Coach opens and changes plans of their own clients only, the Head Coach every client of the gym, never a Coach's own personal data (C-D15). Anything else is "not found".
- The app sends food id, grams, a label and the protein mark. The server reads the name and nutrition from the fixed food list; a request that carries nutrition values, or an unknown food, is refused.
- Limits: 8 slots, 3 options a slot, 15 ingredients an option, 1 to 5,000 g, one decimal. At most one protein source an option on save; exactly one on publish.
- One active plan and at most one draft per client. Publishing a draft ends the active plan in the same transaction. Every create, edit, publish, end, restore and revert is logged with who and when (C-D13).
- Publish writes `app.diet_plans` (TCR-004) and answers "not found" while that table does not exist (ADR-0002 rule 2).

## 4. Built (2026-11-11)
- Migration `C0005_nutrition_management.sql` (schema `coach`): `diet_templates`, `diet_plans`, `diet_plan_versions`, `diet_plan_changes`.
- Shared: `packages/shared/src/nutrition.ts`. API: `apps/api/src/diet.ts`, `routes/diet.ts` (routes listed at the top of the route file).
- Phone: `apps/mobile/src/app/nutrition.tsx`, `diet-template.tsx`, `diet-assign.tsx`, `diet-plan.tsx`, `diet-plan-edit.tsx`, `diet-history.tsx`; `src/nutrition/` (service, texts, `DietEditor.tsx`).
- Tests: `apps/api/test/integration/diet.test.ts`, `apps/mobile/src/nutrition.test.tsx`, `packages/shared/src/nutrition.test.ts`. Test copy of the trainee's table: `apps/api/test/fixtures/proposed-app/0011_tcr004_proposed.sql`.

## 5. Differences from the Canva screens, for the owner to confirm
Options and ingredients are edited in full-screen sheets inside the template (no separate navigation); amounts are in grams; the food picker is a sheet with search above and the quantity below; the start date uses earlier and later day buttons; the scaling switch is new on the Assign screen.

## 6. Owner's answers and what is still open
Answered 2026-11-11: nutrition values are per 100 g; no food sources are left out (the list is ten fixed foods for now); templates are scalable.
Still open (not blocking):
1. **Starter food values.** The ten foods' nutrition is approximate (typical values per 100 g). Who checks it before real clients use it, or should it wait for the FitSphere food table?
2. **How protein is fitted.** Scaling fits **calories**; protein follows the same factor, so it can end up off the client's protein target. The plan screen shows the gap and the 10% warning. Should protein get its own fitting (CQ-28)?
3. **Allergies and preferences** (SPEC-003 §4.2) are not stored; the note fields cover it. Confirm.
