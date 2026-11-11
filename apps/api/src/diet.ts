// Nutrition management (CF07, SPEC-003): the food list, diet templates and diet plans.
//
// Same rules as workouts (workouts.ts, plans.ts); only what differs is noted here:
// - The app sends foods by id and grams. The server reads each food's name and nutrition (per 100 g) from
//   the fixed food list in the shared package (ten foods for now) and stores them with the quantity, so
//   totals cannot be made up and a plan keeps the numbers it was made with. The protein source is
//   always stored first.
// - Giving a template to a client can scale its quantities to the client's calorie target (`scale`).
// - A plan is published when every slot has an option and every option has exactly one protein source.
//   Publish writes the trainee's row in app.diet_plans and answers "not found" while that table does
//   not exist (TCR-004, C-D22, ADR-0002 rule 2).
import {
  dietIsReady,
  foodById,
  nutritionFor,
  proteinFirst,
  scaleContent,
  scaleFactor,
  type AssignDietPlanRequest,
  type DietContent,
  type DietInput,
  type DietPlanDetail,
  type DietPlanListResponse,
  type DietPlanSummary,
  type DietTemplateDetail,
  type DietTemplateInput,
  type DietTemplateSummary,
  type PlanChange,
  type PlanHistoryResponse,
  type PlanStatus,
  type UpdateDietPlanRequest,
} from '@fitsphere-coach/shared';
import type pg from 'pg';
import type { Account } from './accounts.ts';
import { isHeadCoach, VISIBLE_UPPERS } from './clients.ts';
import { ApiError } from './errors.ts';
import { canonical, transaction } from './plans.ts';
import { gymOf, NOT_FOUND, roleOf } from './workouts.ts';

type Queryable = Pick<pg.Pool, 'query'>;
// --- Foods ---

/** Fills in each ingredient's name and nutrition from the food list. An unknown food is refused (the shared schema already does). */
export async function resolveContent(_db: Queryable, input: DietInput): Promise<DietContent> {
  return {
    calorieTarget: input.calorieTarget,
    proteinTarget: input.proteinTarget,
    note: input.note,
    slots: input.slots.map((slot) => ({
      name: slot.name,
      logsAs: slot.logsAs,
      options: slot.options.map((option) => ({
        name: option.name,
        note: option.note,
        ingredients: proteinFirst(option.ingredients).map((ingredient) => {
          const food = foodById(ingredient.foodId);
          if (!food) throw new ApiError('VALIDATION_FAILED', [{ field: 'content.slots', issue: 'invalid_format' }]);
          return {
            foodId: ingredient.foodId,
            name: food.name,
            grams: ingredient.grams,
            label: ingredient.label || null,
            proteinSource: ingredient.proteinSource,
            ...nutritionFor(food, ingredient.grams),
          };
        }),
      })),
    })),
  };
}

// --- Templates ---

type TemplateRow = {
  id: string;
  gym_head_coach_id: string;
  created_by: string;
  visibility: 'gym' | 'personal';
  name: string;
  goal: DietTemplateSummary['goal'];
  content: DietContent;
  active: boolean;
  updated_at: Date;
};
const T_COLUMNS = 'id, gym_head_coach_id, created_by, visibility, name, goal, content, active, updated_at';
const T_VISIBLE = `gym_head_coach_id = $1 and (visibility = 'gym' or created_by = $2)`;

function canEdit(viewer: Account, row: TemplateRow): boolean {
  if (row.created_by === viewer.id) return true;
  return row.visibility === 'gym' && isHeadCoach(viewer) && row.gym_head_coach_id === viewer.id;
}

const toTemplate = (viewer: Account, row: TemplateRow): DietTemplateSummary => ({
  id: row.id,
  name: row.name,
  goal: row.goal,
  visibility: row.visibility,
  active: row.active,
  slots: row.content.slots.length,
  options: row.content.slots.reduce((total, slot) => total + slot.options.length, 0),
  calorieTarget: row.content.calorieTarget,
  canEdit: canEdit(viewer, row),
  updatedAt: row.updated_at.toISOString(),
});

export async function listDietTemplates(
  db: Queryable,
  viewer: Account,
  filter: { q?: string | undefined; goal?: string | undefined; includeInactive?: boolean },
): Promise<DietTemplateSummary[]> {
  const gym = await gymOf(db, viewer);
  const { rows } = await db.query<TemplateRow>(
    `select ${T_COLUMNS} from coach.diet_templates
     where ${T_VISIBLE} and ($3::boolean or active)
       and ($4::text is null or name ilike '%' || $4 || '%') and ($5::text is null or goal = $5)
     order by active desc, updated_at desc`,
    [gym, viewer.id, filter.includeInactive ?? false, filter.q?.trim() || null, filter.goal ?? null],
  );
  return rows.map((row) => toTemplate(viewer, row));
}

export async function findDietTemplate(db: Queryable, viewer: Account, id: string): Promise<TemplateRow | null> {
  const gym = await gymOf(db, viewer);
  const { rows } = await db.query<TemplateRow>(`select ${T_COLUMNS} from coach.diet_templates where id = $3 and ${T_VISIBLE}`, [gym, viewer.id, id]);
  return rows[0] ?? null;
}

export async function getDietTemplate(db: Queryable, viewer: Account, id: string): Promise<DietTemplateDetail> {
  const row = await findDietTemplate(db, viewer, id);
  if (!row) throw NOT_FOUND();
  return { ...toTemplate(viewer, row), content: row.content };
}

export async function createDietTemplate(db: Queryable, viewer: Account, request: DietTemplateInput): Promise<DietTemplateDetail> {
  const gym = await gymOf(db, viewer);
  const content = await resolveContent(db, request.content);
  const { rows } = await db.query<TemplateRow>(
    `insert into coach.diet_templates (gym_head_coach_id, created_by, visibility, name, goal, content)
     values ($1, $2, $3, $4, $5, $6) returning ${T_COLUMNS}`,
    [gym, viewer.id, request.visibility, request.name.trim(), request.goal, JSON.stringify(content)],
  );
  const row = rows[0] as TemplateRow;
  return { ...toTemplate(viewer, row), content: row.content };
}

export async function updateDietTemplate(db: Queryable, viewer: Account, id: string, request: DietTemplateInput): Promise<DietTemplateDetail> {
  const row = await findDietTemplate(db, viewer, id);
  if (!row) throw NOT_FOUND();
  if (!canEdit(viewer, row)) throw new ApiError('NOT_PERMITTED');
  if (request.visibility !== row.visibility && row.created_by !== viewer.id) throw new ApiError('NOT_PERMITTED');
  const content = await resolveContent(db, request.content);
  const { rows } = await db.query<TemplateRow>(
    `update coach.diet_templates set visibility = $2, name = $3, goal = $4, content = $5, updated_at = now()
     where id = $1 returning ${T_COLUMNS}`,
    [id, request.visibility, request.name.trim(), request.goal, JSON.stringify(content)],
  );
  const updated = rows[0] as TemplateRow;
  return { ...toTemplate(viewer, updated), content: updated.content };
}

/** A copy is always the copier's own personal template. */
export async function copyDietTemplate(db: Queryable, viewer: Account, id: string): Promise<DietTemplateDetail> {
  const row = await findDietTemplate(db, viewer, id);
  if (!row) throw NOT_FOUND();
  const { rows } = await db.query<TemplateRow>(
    `insert into coach.diet_templates (gym_head_coach_id, created_by, visibility, name, goal, content)
     values ($1, $2, 'personal', $3, $4, $5) returning ${T_COLUMNS}`,
    [row.gym_head_coach_id, viewer.id, `${row.name.slice(0, 73)} (copy)`, row.goal, JSON.stringify(row.content)],
  );
  const copy = rows[0] as TemplateRow;
  return { ...toTemplate(viewer, copy), content: copy.content };
}

export async function setDietTemplateActive(db: Queryable, viewer: Account, id: string, active: boolean): Promise<void> {
  const row = await findDietTemplate(db, viewer, id);
  if (!row) throw NOT_FOUND();
  if (!canEdit(viewer, row)) throw new ApiError('NOT_PERMITTED');
  await db.query('update coach.diet_templates set active = $2, updated_at = now() where id = $1', [id, active]);
}

// --- Plans ---

type PlanRow = {
  id: string;
  trainee_id: string;
  trainee_name: string;
  coach_id: string;
  coach_name: string | null;
  name: string;
  status: PlanStatus;
  start_date: string;
  content: DietContent;
  version: number;
  live_version: number | null;
  updated_at: Date;
};

const SELECT_PLANS = `
  select p.id, p.trainee_id,
         coalesce(nullif(to_jsonb(u) ->> 'full_name', ''), u.email) as trainee_name,
         l.upper_user_id as coach_id, cp.full_name as coach_name,
         p.name, p.status, to_char(p.start_date, 'YYYY-MM-DD') as start_date,
         p.content, p.version, p.live_version, p.updated_at
  from coach.diet_plans p
  join app.links l on l.lower_user_id = p.trainee_id and l.kind = 'coach_trainee' and l.status = 'active'
       and l.upper_user_id in (${VISIBLE_UPPERS})
  join app.users u on u.id = p.trainee_id
  left join coach.profiles cp on cp.user_id = l.upper_user_id`;

const toSummary = (row: PlanRow): DietPlanSummary => ({
  id: row.id,
  traineeId: row.trainee_id,
  traineeName: row.trainee_name,
  coachId: row.coach_id,
  coachName: row.coach_name,
  name: row.name,
  status: row.status,
  startDate: row.start_date,
  calorieTarget: row.content.calorieTarget,
  liveVersion: row.live_version,
  version: row.version,
  updatedAt: row.updated_at.toISOString(),
});

async function requirePlan(db: Queryable, viewer: Account, id: string): Promise<PlanRow> {
  const { rows } = await db.query<PlanRow>(`${SELECT_PLANS} where p.id = $3`, [viewer.id, isHeadCoach(viewer), id]);
  if (!rows[0]) throw NOT_FOUND();
  return rows[0];
}

async function requirePlanForUpdate(tx: pg.PoolClient, viewer: Account, id: string): Promise<PlanRow> {
  await requirePlan(tx, viewer, id);
  const { rows } = await tx.query<PlanRow>(`${SELECT_PLANS} where p.id = $3 for update of p`, [viewer.id, isHeadCoach(viewer), id]);
  if (!rows[0]) throw NOT_FOUND();
  return rows[0];
}

const today = async (db: Queryable): Promise<string> =>
  ((await db.query<{ d: string }>(`select ((now() at time zone 'Asia/Kolkata')::date)::text as d`)).rows[0] as { d: string }).d;

async function log(tx: Queryable, planId: string, viewer: Account, action: PlanChange['action'], version: number, summary: string | null = null) {
  await tx.query(`insert into coach.diet_plan_changes (plan_id, action, version, actor_id, actor_role, summary) values ($1, $2, $3, $4, $5, $6)`, [
    planId,
    action,
    version,
    viewer.id,
    roleOf(viewer),
    summary,
  ]);
}

const appPlansExist = async (db: Queryable): Promise<boolean> => (await db.query(`select to_regclass('app.diet_plans') as t`)).rows[0]?.t !== null;

export async function listDietPlans(
  db: Queryable,
  viewer: Account,
  filter: { q?: string | undefined; status?: string | undefined; coachId?: string | undefined },
): Promise<DietPlanListResponse> {
  const head = isHeadCoach(viewer);
  const { rows } = await db.query<PlanRow>(
    `${SELECT_PLANS}
     where ($3::text is null or p.status = $3) and ($4::uuid is null or l.upper_user_id = $4)
       and ($5::text is null or p.name ilike '%' || $5 || '%' or u.email ilike '%' || $5 || '%' or to_jsonb(u) ->> 'full_name' ilike '%' || $5 || '%')
     order by case p.status when 'draft' then 0 when 'active' then 1 else 2 end, p.updated_at desc`,
    [viewer.id, head, filter.status ?? null, filter.coachId ?? null, filter.q?.trim() || null],
  );
  const coaches = head
    ? (
        await db.query<{ id: string; full_name: string | null }>(
          `select l.lower_user_id as id, p.full_name from app.links l left join coach.profiles p on p.user_id = l.lower_user_id
           where l.kind = 'head_coach_coach' and l.status = 'active' and l.upper_user_id = $1 order by lower(coalesce(p.full_name, ''))`,
          [viewer.id],
        )
      ).rows.map((row) => ({ id: row.id, name: row.full_name }))
    : [];
  return { plans: rows.map(toSummary), coaches };
}

async function changes(db: Queryable, planId: string, limit: number): Promise<PlanChange[]> {
  const { rows } = await db.query<{
    id: string; action: PlanChange['action']; version: number; actor_id: string; actor_name: string | null;
    actor_role: PlanChange['actorRole']; summary: string | null; created_at: Date;
  }>(
    `select c.id, c.action, c.version, c.actor_id, p.full_name as actor_name, c.actor_role, c.summary, c.created_at
     from coach.diet_plan_changes c left join coach.profiles p on p.user_id = c.actor_id
     where c.plan_id = $1 order by c.created_at desc, c.id desc limit $2`,
    [planId, limit],
  );
  return rows.map((row) => ({
    id: row.id, action: row.action, version: row.version, actorId: row.actor_id, actorName: row.actor_name,
    actorRole: row.actor_role, summary: row.summary, at: row.created_at.toISOString(),
  }));
}

export async function getDietPlan(db: Queryable, viewer: Account, id: string): Promise<DietPlanDetail> {
  const row = await requirePlan(db, viewer, id);
  const { rows: targets } = await db.query<{ kind: string; value: number }>(`select kind, value from app.targets where user_id = $1 and kind in ('calories', 'protein')`, [row.trainee_id]);
  const target = (kind: string) => targets.find((t) => t.kind === kind)?.value ?? null;
  return {
    ...toSummary(row),
    content: row.content,
    lastChange: (await changes(db, id, 1))[0] ?? null,
    clientTargets: { calories: target('calories'), proteinG: target('protein') },
    canPublish: row.status !== 'ended' && (await appPlansExist(db)),
  };
}

export async function dietPlanHistory(db: Queryable, viewer: Account, id: string): Promise<PlanHistoryResponse> {
  await requirePlan(db, viewer, id);
  const { rows } = await db.query<{ version: number }>('select version from coach.diet_plan_versions where plan_id = $1 order by version desc', [id]);
  return { changes: await changes(db, id, 200), publishedVersions: rows.map((row) => row.version) };
}

export async function assignDietPlans(db: pg.Pool, viewer: Account, request: AssignDietPlanRequest): Promise<DietPlanSummary[]> {
  const gym = await gymOf(db, viewer);
  const template = await findDietTemplate(db, viewer, request.templateId);
  if (!template || !template.active) throw NOT_FOUND();
  if (request.startDate < (await today(db))) throw new ApiError('VALIDATION_FAILED', [{ field: 'startDate', issue: 'out_of_range' }]);
  const traineeIds = [...new Set(request.traineeIds)];

  const ids = await transaction(db, async (tx) => {
    const created: string[] = [];
    for (const traineeId of traineeIds) {
      const { rowCount } = await tx.query(
        `select 1 from app.links l where l.kind = 'coach_trainee' and l.status = 'active' and l.lower_user_id = $3
           and l.upper_user_id in (${VISIBLE_UPPERS})`,
        [viewer.id, isHeadCoach(viewer), traineeId],
      );
      if (!rowCount) throw NOT_FOUND();
      if ((await tx.query(`select 1 from coach.diet_plans where trainee_id = $1 and status = 'draft'`, [traineeId])).rowCount) throw new ApiError('PLAN_DRAFT_EXISTS');
      // With `scale`, the quantities are fitted to this client's calorie target (the template's day total
      // becomes their target) and the plan takes their targets; with no calorie target, or without
      // `scale`, the template is copied as it is.
      let content = template.content;
      if (request.scale) {
        const { rows: targets } = await tx.query<{ kind: string; value: number }>(`select kind, value from app.targets where user_id = $1 and kind in ('calories', 'protein')`, [traineeId]);
        const calories = targets.find((t) => t.kind === 'calories')?.value ?? null;
        const protein = targets.find((t) => t.kind === 'protein')?.value ?? null;
        const factor = scaleFactor(template.content, calories);
        if (factor !== null) content = { ...scaleContent(template.content, factor), calorieTarget: calories, proteinTarget: protein ?? template.content.proteinTarget };
      }
      const { rows } = await tx.query<{ id: string }>(
        `insert into coach.diet_plans (trainee_id, gym_head_coach_id, created_by, template_id, name, status, start_date, content)
         values ($1, $2, $3, $4, $5, 'draft', $6, $7) returning id`,
        [traineeId, gym, viewer.id, template.id, template.name, request.startDate, JSON.stringify(content)],
      );
      const id = (rows[0] as { id: string }).id;
      await log(tx, id, viewer, 'created', 1, `From template ${template.name}`.slice(0, 200));
      created.push(id);
    }
    return created;
  });
  const plans: DietPlanSummary[] = [];
  for (const id of ids) plans.push(toSummary(await requirePlan(db, viewer, id)));
  return plans;
}

export async function updateDietPlan(db: pg.Pool, viewer: Account, id: string, request: UpdateDietPlanRequestParsed): Promise<DietPlanDetail> {
  const content = await resolveContent(db, request.content);
  await transaction(db, async (tx) => {
    const plan = await requirePlanForUpdate(tx, viewer, id);
    if (plan.status === 'ended') throw new ApiError('NOT_PERMITTED');
    if (request.startDate !== plan.start_date && (plan.status !== 'draft' || request.startDate < (await today(tx)))) {
      throw new ApiError('VALIDATION_FAILED', [{ field: 'startDate', issue: 'out_of_range' }]);
    }
    const changed = request.name.trim() !== plan.name || request.startDate !== plan.start_date || canonical(content) !== canonical(plan.content);
    if (!changed) return;
    const version = plan.version + 1;
    await tx.query(`update coach.diet_plans set name = $2, start_date = $3, content = $4, version = $5, updated_at = now() where id = $1`, [
      id, request.name.trim(), request.startDate, JSON.stringify(content), version,
    ]);
    await log(tx, id, viewer, 'edited', version);
  });
  return getDietPlan(db, viewer, id);
}
type UpdateDietPlanRequestParsed = Omit<UpdateDietPlanRequest, 'content'> & { content: DietInput };

export async function publishDietPlan(db: pg.Pool, viewer: Account, id: string): Promise<void> {
  if (!(await appPlansExist(db))) throw NOT_FOUND();
  await transaction(db, async (tx) => {
    const plan = await requirePlanForUpdate(tx, viewer, id);
    if (plan.status === 'ended') throw new ApiError('NOT_PERMITTED');
    if (!dietIsReady(plan.content)) throw new ApiError('PLAN_NOT_READY');
    if (plan.status === 'active' && plan.live_version === plan.version) return;

    if (plan.status === 'draft') {
      const old = await tx.query<{ id: string; version: number }>(
        `update coach.diet_plans set status = 'ended', ended_at = now(), updated_at = now()
         where trainee_id = $1 and status = 'active' returning id, coalesce(live_version, version) as version`,
        [plan.trainee_id],
      );
      for (const row of old.rows) {
        await tx.query(`update app.diet_plans set status = 'ended', ended_at = now() where id = $1`, [row.id]);
        await log(tx, row.id, viewer, 'ended', row.version, 'Replaced by a new plan');
      }
    }
    await tx.query(`update coach.diet_plans set status = 'active', live_version = version, published_at = now(), updated_at = now() where id = $1`, [id]);
    await tx.query(`insert into coach.diet_plan_versions (plan_id, version, name, content, published_by) values ($1, $2, $3, $4, $5)`, [
      id, plan.version, plan.name, JSON.stringify(plan.content), viewer.id,
    ]);
    await tx.query(
      `insert into app.diet_plans (id, user_id, version, name, status, start_date, calorie_target, protein_target, note, slots, set_by_user_id, set_by_role, published_at)
       values ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, now())
       on conflict (id) do update set
         version = excluded.version, name = excluded.name, status = 'active', start_date = excluded.start_date,
         calorie_target = excluded.calorie_target, protein_target = excluded.protein_target, note = excluded.note,
         slots = excluded.slots, set_by_user_id = excluded.set_by_user_id, set_by_role = excluded.set_by_role,
         published_at = excluded.published_at`,
      [
        id, plan.trainee_id, plan.version, plan.name, plan.start_date, plan.content.calorieTarget, plan.content.proteinTarget,
        plan.content.note || null, JSON.stringify(plan.content.slots), viewer.id, roleOf(viewer),
      ],
    );
    await log(tx, id, viewer, 'published', plan.version);
  });
}

export async function endDietPlan(db: pg.Pool, viewer: Account, id: string): Promise<void> {
  await transaction(db, async (tx) => {
    const plan = await requirePlanForUpdate(tx, viewer, id);
    if (plan.status !== 'active') throw new ApiError('NOT_PERMITTED');
    await tx.query(`update coach.diet_plans set status = 'ended', ended_at = now(), updated_at = now() where id = $1`, [id]);
    if (await appPlansExist(tx)) await tx.query(`update app.diet_plans set status = 'ended', ended_at = now() where id = $1`, [id]);
    await log(tx, id, viewer, 'ended', plan.live_version ?? plan.version);
  });
}

export async function discardDietPlan(db: pg.Pool, viewer: Account, id: string): Promise<void> {
  await transaction(db, async (tx) => {
    const plan = await requirePlanForUpdate(tx, viewer, id);
    if (plan.status === 'ended') throw new ApiError('NOT_PERMITTED');
    if (plan.status === 'draft') {
      await tx.query('delete from coach.diet_plans where id = $1', [id]);
      return;
    }
    if (plan.live_version === null || plan.version === plan.live_version) return;
    const live = await tx.query<{ name: string; content: DietContent }>('select name, content from coach.diet_plan_versions where plan_id = $1 and version = $2', [id, plan.live_version]);
    if (!live.rows[0]) throw NOT_FOUND();
    await tx.query(`update coach.diet_plans set name = $2, content = $3, version = $4, updated_at = now() where id = $1`, [
      id, live.rows[0].name, JSON.stringify(live.rows[0].content), plan.live_version,
    ]);
    await log(tx, id, viewer, 'reverted', plan.live_version, 'Unpublished changes discarded');
  });
}

export async function restoreDietPlan(db: pg.Pool, viewer: Account, id: string, version: number): Promise<DietPlanDetail> {
  await transaction(db, async (tx) => {
    const plan = await requirePlanForUpdate(tx, viewer, id);
    if (plan.status === 'ended') throw new ApiError('NOT_PERMITTED');
    const old = await tx.query<{ name: string; content: DietContent }>('select name, content from coach.diet_plan_versions where plan_id = $1 and version = $2', [id, version]);
    if (!old.rows[0]) throw NOT_FOUND();
    const next = plan.version + 1;
    await tx.query(`update coach.diet_plans set name = $2, content = $3, version = $4, updated_at = now() where id = $1`, [
      id, old.rows[0].name, JSON.stringify(old.rows[0].content), next,
    ]);
    await log(tx, id, viewer, 'restored', next, `Restored version ${version}`);
  });
  return getDietPlan(db, viewer, id);
}
