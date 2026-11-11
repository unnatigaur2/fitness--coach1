// Nutrition management (CF07) against schemas app and coach on the test database: diet templates
// (nutrition filled in by the server from the fixed food list), drafts, scaling to a client's calorie
// target, publishing into app.diet_plans (TCR-004 as proposed), versions and the change log. Synthetic data only.
import { dayTotals } from '@fitsphere-coach/shared';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.ts';
import { createTestAuth, signToken, type TestKeys } from '../helpers/auth.ts';
import { testOnboarding } from '../helpers/onboarding.ts';
import { connect, insertAccount, testDatabaseUrl } from './database.ts';

let client: pg.Client;
let db: pg.Pool;
let keys: TestKeys;
let app: ReturnType<typeof buildApp>;
const PANEER = 'paneer'; // 265 kcal, 18.3 g protein per 100 g
const ROTI = 'wheat-roti'; // 297 kcal, 11 g protein per 100 g

beforeAll(async () => {
  client = await connect();
  db = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
  const testAuth = await createTestAuth();
  keys = testAuth.keys;
  app = buildApp({ db, auth: testAuth.auth, onboarding: testOnboarding().deps });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.end();
  await client.end();
});

async function call(method: 'GET' | 'POST' | 'PUT', url: string, subject: string, payload?: object) {
  const token = await signToken(keys, subject);
  return app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
}
async function link(kind: 'coach_trainee' | 'head_coach_coach', upper: string, lower: string) {
  await client.query(`insert into app.links (kind, upper_user_id, lower_user_id, status, started_at) values ($1, $2, $3, 'active', now())`, [kind, upper, lower]);
}
async function gym() {
  const head = await insertAccount(client, ['personal', 'head_coach']);
  const ravi = await insertAccount(client, ['personal', 'coach']);
  const meera = await insertAccount(client, ['personal', 'coach']);
  for (const [a, n] of [[head, 'Asha Rao'], [ravi, 'Ravi Kumar'], [meera, 'Meera Joshi']] as const) await client.query('insert into coach.profiles (user_id, full_name) values ($1, $2)', [a.id, n]);
  await link('head_coach_coach', head.id, ravi.id);
  await link('head_coach_coach', head.id, meera.id);
  const underRavi = await insertAccount(client);
  const underMeera = await insertAccount(client);
  await link('coach_trainee', ravi.id, underRavi.id);
  await link('coach_trainee', meera.id, underMeera.id);
  return { head, ravi, meera, underRavi, underMeera };
}

const ing = (foodId: string, grams: number, proteinSource = false, label: string | null = null) => ({ foodId, grams, label, proteinSource });
const option = (over: object = {}) => ({ name: 'Paneer bhurji + roti', note: '', ingredients: [ing(ROTI, 80), ing(PANEER, 100, true)], ...over });
const content = (over: object = {}) => ({
  calorieTarget: 1800,
  proteinTarget: 120,
  note: 'Swap rice for roti on rest days',
  slots: [
    { name: 'Breakfast', logsAs: 'breakfast', options: [option()] },
    { name: 'Pre-workout', logsAs: 'snack', options: [option({ name: 'Paneer only', ingredients: [ing(PANEER, 50, true)] })] },
  ],
  ...over,
});
const template = (over: object = {}) => ({ name: 'Lean 1,800', goal: 'weight_loss', visibility: 'gym', content: content(), ...over });
const future = () => new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

async function makeTemplate(subject: string, over: object = {}) {
  const res = await call('POST', '/v1/diet-templates', subject, template(over));
  expect(res.statusCode).toBe(201);
  return res.json().template as { id: string; content: { slots: { options: { ingredients: { name: string; kcal: number; proteinSource: boolean }[] }[] }[] } };
}
const assign = (subject: string, templateId: string, traineeIds: string[], scale = false) => call('POST', '/v1/diet-plans', subject, { templateId, traineeIds, startDate: future(), scale });
const planRow = async (id: string) => (await client.query('select * from coach.diet_plans where id = $1', [id])).rows[0];
const startOf = async (id: string) => (await client.query(`select to_char(start_date, 'YYYY-MM-DD') as d from coach.diet_plans where id = $1`, [id])).rows[0].d as string;
const actions = async (id: string) => (await client.query('select action from coach.diet_plan_changes where plan_id = $1 order by created_at, id', [id])).rows.map((r) => r.action as string);
const appRow = async (id: string) => (await client.query('select * from app.diet_plans where id = $1', [id])).rows[0];

describe('diet templates', () => {
  it('fills in names and nutrition from the food list, scaled to the grams, with the protein source first', async () => {
    const g = await gym();
    const made = await makeTemplate(g.ravi.subject);
    const ingredients = made.content.slots[0]?.options[0]?.ingredients ?? [];
    expect(ingredients.map((i) => i.proteinSource)).toEqual([true, false]);
    expect(ingredients[0]).toMatchObject({ foodId: PANEER, kcal: 265, proteinG: 18.3, grams: 100 });
    expect(ingredients[1]).toMatchObject({ foodId: ROTI, kcal: 237.6, proteinG: 8.8, grams: 80 });
    expect(ingredients[0]?.name).toBe('Paneer');
  });

  it('ignores nutrition the app sends: the app cannot make up totals', async () => {
    const g = await gym();
    const forged = { ...ing(PANEER, 100, true), kcal: 1 };
    const res = await call('POST', '/v1/diet-templates', g.ravi.subject, template({ content: content({ slots: [{ name: 'B', logsAs: 'breakfast', options: [option({ ingredients: [forged] })] }] }) }));
    expect(res.statusCode).toBe(400);
  });

  it('refuses an unknown food, two protein sources, a bad slot type, and too many options', async () => {
    const g = await gym();
    const bad = async (slots: object[]) => (await call('POST', '/v1/diet-templates', g.ravi.subject, template({ content: content({ slots }) }))).statusCode;
    const slot = (over: object = {}) => ({ name: 'B', logsAs: 'breakfast', options: [option()], ...over });
    expect(await bad([slot({ options: [option({ ingredients: [ing('not-a-food', 50, true)] })] })])).toBe(400);
    expect(await bad([slot({ options: [option({ ingredients: [ing(PANEER, 50, true), ing(ROTI, 50, true)] })] })])).toBe(400);
    expect(await bad([slot({ logsAs: 'brunch' })])).toBe(400);
    expect(await bad([slot({ options: [option(), option(), option(), option()] })])).toBe(400);
    expect(await bad([slot({ options: [option({ ingredients: [ing(PANEER, 0.05, true)] })] })])).toBe(400);
    expect(await bad([])).toBe(400);
  });

  it('a Coach makes a gym template; the gym sees it, another gym and other coaches personal ones do not', async () => {
    const g = await gym();
    const other = await gym();
    const made = await makeTemplate(g.ravi.subject);
    expect((await call('GET', '/v1/diet-templates', g.meera.subject)).json().templates.map((t: { id: string }) => t.id)).toContain(made.id);
    expect((await call('GET', `/v1/diet-templates/${made.id}`, other.ravi.subject)).statusCode).toBe(404);
    const mine = await makeTemplate(g.ravi.subject, { visibility: 'personal' });
    expect((await call('GET', `/v1/diet-templates/${mine.id}`, g.head.subject)).statusCode).toBe(404);
  });

  it('another Coach cannot edit a gym template; its author and the Head Coach can; copy and deactivate work', async () => {
    const g = await gym();
    const made = await makeTemplate(g.ravi.subject);
    const edit = (subject: string, name: string) => call('PUT', `/v1/diet-templates/${made.id}`, subject, template({ name }));
    expect((await edit(g.meera.subject, 'x')).statusCode).toBe(403);
    expect((await edit(g.ravi.subject, 'Ravi edit')).statusCode).toBe(200);
    expect((await edit(g.head.subject, 'Head edit')).json().template.name).toBe('Head edit');
    const copy = await call('POST', `/v1/diet-templates/${made.id}/copy`, g.meera.subject);
    expect(copy.json().template).toMatchObject({ name: 'Head edit (copy)', visibility: 'personal' });
    expect((await call('POST', `/v1/diet-templates/${made.id}/deactivate`, g.head.subject)).statusCode).toBe(204);
    expect((await call('GET', '/v1/diet-templates', g.meera.subject)).json().templates.map((t: { id: string }) => t.id)).not.toContain(made.id);
    expect((await assign(g.ravi.subject, made.id, [g.underRavi.id])).statusCode).toBe(404);
  });
});

describe('diet plans', () => {
  async function draft(g: Awaited<ReturnType<typeof gym>>, traineeId = g.underRavi.id) {
    const made = await makeTemplate(g.head.subject);
    return (await assign(g.ravi.subject, made.id, [traineeId])).json().plans[0].id as string;
  }
  const publish = (subject: string, id: string) => call('POST', `/v1/diet-plans/${id}/publish`, subject);

  it('assigns drafts as they are when not scaling, is all or none, and refuses a second draft', async () => {
    const g = await gym();
    const made = await makeTemplate(g.head.subject);
    await client.query(`insert into app.targets (user_id, kind, value, set_at) values ($1, 'calories', 2100, now()), ($1, 'protein', 140, now())`, [g.underRavi.id]);
    expect((await assign(g.ravi.subject, made.id, [g.underMeera.id])).statusCode).toBe(404);
    const stranger = await insertAccount(client);
    expect((await assign(g.head.subject, made.id, [g.underRavi.id, stranger.id])).statusCode).toBe(404);
    expect((await client.query('select 1 from coach.diet_plans where trainee_id = $1', [g.underRavi.id])).rowCount).toBe(0);

    const res = await assign(g.head.subject, made.id, [g.underRavi.id, g.underMeera.id]);
    expect(res.statusCode).toBe(201);
    const id = res.json().plans.find((p: { traineeId: string }) => p.traineeId === g.underRavi.id).id as string;
    const plan = (await call('GET', `/v1/diet-plans/${id}`, g.ravi.subject)).json().plan;
    expect(plan).toMatchObject({ status: 'draft', version: 1, clientTargets: { calories: 2100, proteinG: 140 }, canPublish: true });
    expect(plan.content.slots[0].options[0].ingredients[0].grams).toBe(100);
    expect(await actions(id)).toEqual(['created']);
    const again = await assign(g.head.subject, made.id, [g.underRavi.id]);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('PLAN_DRAFT_EXISTS');
  });

  it("scales the quantities to the client's calorie target and takes their targets; the template is not changed", async () => {
    const g = await gym();
    const made = await makeTemplate(g.head.subject);
    await client.query(`insert into app.targets (user_id, kind, value, set_at) values ($1, 'calories', 2100, now()), ($1, 'protein', 140, now())`, [g.underRavi.id]);
    const res = await assign(g.ravi.subject, made.id, [g.underRavi.id], true);
    expect(res.statusCode).toBe(201);
    const plan = (await call('GET', `/v1/diet-plans/${res.json().plans[0].id}`, g.ravi.subject)).json().plan;
    expect(plan.calorieTarget).toBe(2100);
    expect(plan.content.proteinTarget).toBe(140);
    const total = dayTotals(plan.content).kcal;
    expect(Math.abs(total - 2100) / 2100).toBeLessThan(0.02);
    // Every ingredient grew by about the same factor, and its nutrition was worked out again.
    const original = (await call('GET', `/v1/diet-templates/${made.id}`, g.ravi.subject)).json().template.content;
    expect(plan.content.slots[0].options[0].ingredients[0].grams).toBeGreaterThan(original.slots[0].options[0].ingredients[0].grams * 3);
    expect(plan.content.slots[0].options[0].ingredients[0].kcal).toBeCloseTo((265 * plan.content.slots[0].options[0].ingredients[0].grams) / 100, 0);
    expect(original.slots[0].options[0].ingredients[0].grams).toBe(100);
  });

  it('copies the template as it is when scaling but the client has no calorie target', async () => {
    const g = await gym();
    const made = await makeTemplate(g.head.subject);
    const res = await assign(g.ravi.subject, made.id, [g.underRavi.id], true);
    const plan = (await call('GET', `/v1/diet-plans/${res.json().plans[0].id}`, g.ravi.subject)).json().plan;
    expect(plan.content.slots[0].options[0].ingredients[0].grams).toBe(100);
    expect(plan.calorieTarget).toBe(1800);
  });

  it("a Coach sees only their clients' plans; the Head Coach all; another gym none", async () => {
    const g = await gym();
    const other = await gym();
    const made = await makeTemplate(g.head.subject);
    const plans = (await assign(g.head.subject, made.id, [g.underRavi.id, g.underMeera.id])).json().plans as { id: string; traineeId: string }[];
    const own = plans.find((p) => p.traineeId === g.underRavi.id) as { id: string };
    const theirs = plans.find((p) => p.traineeId === g.underMeera.id) as { id: string };
    expect((await call('GET', '/v1/diet-plans', g.ravi.subject)).json().plans.map((p: { id: string }) => p.id)).toEqual([own.id]);
    expect((await call('GET', '/v1/diet-plans', g.head.subject)).json().plans).toHaveLength(2);
    expect((await call('GET', `/v1/diet-plans/${theirs.id}`, g.ravi.subject)).statusCode).toBe(404);
    expect((await publish(g.ravi.subject, theirs.id)).statusCode).toBe(404);
    expect((await call('GET', `/v1/diet-plans/${own.id}`, other.head.subject)).statusCode).toBe(404);
  });

  it('editing bumps the version and logs who and when; an unchanged save logs nothing; template edits never change the plan', async () => {
    const g = await gym();
    const made = await makeTemplate(g.head.subject);
    const id = (await assign(g.ravi.subject, made.id, [g.underRavi.id])).json().plans[0].id as string;
    const body = { name: 'Arjun cut', startDate: await startOf(id), content: content({ calorieTarget: 1700 }) };
    const edited = await call('PUT', `/v1/diet-plans/${id}`, g.head.subject, body);
    expect(edited.json().plan).toMatchObject({ name: 'Arjun cut', version: 2, calorieTarget: 1700 });
    expect(edited.json().plan.lastChange).toMatchObject({ action: 'edited', actorName: 'Asha Rao', actorRole: 'head_coach' });
    expect((await call('PUT', `/v1/diet-plans/${id}`, g.head.subject, body)).json().plan.version).toBe(2);
    expect(await actions(id)).toEqual(['created', 'edited']);
    await call('PUT', `/v1/diet-templates/${made.id}`, g.head.subject, template({ name: 'Changed' }));
    expect((await planRow(id)).name).toBe('Arjun cut');
  });

  it('refuses to publish without exactly one protein source in every option, and with an empty slot', async () => {
    const g = await gym();
    const id = await draft(g);
    const start = await startOf(id);
    const put = (slots: object[]) => call('PUT', `/v1/diet-plans/${id}`, g.ravi.subject, { name: 'P', startDate: start, content: content({ slots }) });
    await put([{ name: 'B', logsAs: 'breakfast', options: [option({ ingredients: [ing(ROTI, 80)] })] }]);
    expect((await publish(g.ravi.subject, id)).json().error.code).toBe('PLAN_NOT_READY');
    await put([{ name: 'B', logsAs: 'breakfast', options: [] }]);
    expect((await publish(g.ravi.subject, id)).statusCode).toBe(409);
    await put([{ name: 'B', logsAs: 'breakfast', options: [option({ ingredients: [] })] }]);
    expect((await publish(g.ravi.subject, id)).statusCode).toBe(409);
    expect(await appRow(id)).toBeUndefined();
  });

  it('publishes into the trainee table with the slots, records version 1, and is idempotent', async () => {
    const g = await gym();
    const id = await draft(g);
    expect((await publish(g.ravi.subject, id)).statusCode).toBe(204);
    expect(await planRow(id)).toMatchObject({ status: 'active', live_version: 1 });
    expect(await appRow(id)).toMatchObject({ user_id: g.underRavi.id, status: 'active', version: 1, calorie_target: 1800, protein_target: 120, set_by_role: 'coach' });
    expect((await appRow(id)).slots[1]).toMatchObject({ name: 'Pre-workout', logsAs: 'snack' });
    expect((await appRow(id)).slots[0].options[0].ingredients[0].proteinSource).toBe(true);
    expect((await publish(g.ravi.subject, id)).statusCode).toBe(204);
    expect(await actions(id)).toEqual(['created', 'published']);
  });

  it('a new plan replaces the live one; edits to a live plan stay unpublished until the next publish', async () => {
    const g = await gym();
    const first = await draft(g);
    await publish(g.ravi.subject, first);
    const second = await draft(g);
    expect((await publish(g.head.subject, second)).statusCode).toBe(204);
    expect(await planRow(first)).toMatchObject({ status: 'ended' });
    expect((await appRow(first)).status).toBe('ended');
    expect((await appRow(second)).set_by_role).toBe('head_coach');

    const edit = await call('PUT', `/v1/diet-plans/${second}`, g.ravi.subject, { name: 'Block v2', startDate: await startOf(second), content: content({ calorieTarget: 2000 }) });
    expect(edit.json().plan).toMatchObject({ status: 'active', version: 2, liveVersion: 1 });
    expect(await appRow(second)).toMatchObject({ version: 1, calorie_target: 1800 });
    await publish(g.ravi.subject, second);
    expect(await appRow(second)).toMatchObject({ version: 2, calorie_target: 2000, name: 'Block v2' });
    const history = (await call('GET', `/v1/diet-plans/${second}/history`, g.head.subject)).json();
    expect(history.publishedVersions).toEqual([2, 1]);
  });

  it('discard throws away unpublished changes (name too); restore opens an old version as a new draft; a missing version is not found', async () => {
    const g = await gym();
    const id = await draft(g);
    await publish(g.ravi.subject, id);
    const start = await startOf(id);
    await call('PUT', `/v1/diet-plans/${id}`, g.ravi.subject, { name: 'Temp', startDate: start, content: content({ calorieTarget: 1500 }) });
    expect((await call('POST', `/v1/diet-plans/${id}/discard`, g.ravi.subject)).statusCode).toBe(204);
    expect(await planRow(id)).toMatchObject({ name: 'Lean 1,800', version: 1, live_version: 1 });
    await call('PUT', `/v1/diet-plans/${id}`, g.ravi.subject, { name: 'Block 2', startDate: start, content: content({ calorieTarget: 2200 }) });
    await publish(g.ravi.subject, id);
    const restored = await call('POST', `/v1/diet-plans/${id}/restore`, g.ravi.subject, { version: 1 });
    expect(restored.json().plan).toMatchObject({ version: 3, liveVersion: 2, name: 'Lean 1,800', calorieTarget: 1800 });
    expect((await call('POST', `/v1/diet-plans/${id}/restore`, g.ravi.subject, { version: 9 })).statusCode).toBe(404);
  });

  it('discarding a never-published draft deletes it; ending ends it for the trainee and locks the plan', async () => {
    const g = await gym();
    const a = await draft(g);
    expect((await call('POST', `/v1/diet-plans/${a}/discard`, g.ravi.subject)).statusCode).toBe(204);
    expect(await planRow(a)).toBeUndefined();
    const b = await draft(g);
    await publish(g.ravi.subject, b);
    expect((await call('POST', `/v1/diet-plans/${b}/end`, g.ravi.subject)).statusCode).toBe(204);
    expect((await appRow(b)).status).toBe('ended');
    expect((await publish(g.ravi.subject, b)).statusCode).toBe(403);
    expect((await call('PUT', `/v1/diet-plans/${b}`, g.ravi.subject, { name: 'x', startDate: future(), content: content() })).statusCode).toBe(403);
  });

  it('Publish is off (not found) while the trainee app table does not exist', async () => {
    const g = await gym();
    const id = await draft(g);
    await client.query('alter table app.diet_plans rename to diet_plans_hidden');
    try {
      expect((await call('GET', `/v1/diet-plans/${id}`, g.ravi.subject)).json().plan.canPublish).toBe(false);
      expect((await publish(g.ravi.subject, id)).statusCode).toBe(404);
    } finally {
      await client.query('alter table app.diet_plans_hidden rename to diet_plans');
    }
    expect(await planRow(id)).toMatchObject({ status: 'draft' });
  });

  it('a failed publish leaves nothing behind', async () => {
    const g = await gym();
    const id = await draft(g);
    await client.query('alter table app.diet_plans add constraint reject_all check (false) not valid');
    try {
      expect((await publish(g.ravi.subject, id)).statusCode).toBe(500);
    } finally {
      await client.query('alter table app.diet_plans drop constraint reject_all');
    }
    expect(await planRow(id)).toMatchObject({ status: 'draft', live_version: null });
    expect(await actions(id)).toEqual(['created']);
    expect((await client.query('select 1 from coach.diet_plan_versions where plan_id = $1', [id])).rowCount).toBe(0);
  });
});
