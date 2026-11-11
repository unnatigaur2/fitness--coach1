// CF07 nutrition management: the list, the template editor with the food list, assigning, a plan and its history.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { useAccount } from './account/AccountProvider';
import DietAssign from './app/diet-assign';
import DietHistory from './app/diet-history';
import DietPlan from './app/diet-plan';
import DietTemplate from './app/diet-template';
import Nutrition from './app/nutrition';
import { FOODS, type Food } from '@fitsphere-coach/shared';
import { deps, errorBody, fakeApi, fakeClient, Providers, session } from './testing/fakes';
import { deviationText, ingredientFrom, newDietContent, offTarget, toInput, withGrams, withProteinSource } from './nutrition/texts';
import { addDays, todayIst } from './workouts/texts';

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false, dismissAll: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

const ME = '0b6f2a52-6f4b-4c38-9d1f-2b8e4c1a7d10';
const ARJUN = '33333333-3333-4333-8333-333333333333';
const PRIYA = '44444444-4444-4444-8444-444444444444';
const TEMPLATE = '55555555-5555-4555-8555-555555555555';
const PLAN = '66666666-6666-4666-8666-666666666666';
const PANEER = 'paneer';
const me = (roles: string[]) => ({ user: { id: ME, email: 'coach@example.test', createdAt: '2026-11-03T08:00:00Z' }, roles, coach: { fullName: 'Asha Rao' } });

const ingredient = (over: object = {}) => ({ foodId: PANEER, name: 'Paneer', grams: 100, label: null, proteinSource: true, kcal: 265, proteinG: 18.3, carbsG: 1.2, fatG: 20.8, fibreG: 0, ...over });
const content = (over: object = {}) => ({
  calorieTarget: 2100,
  proteinTarget: 140,
  note: 'Swap rice for roti on rest days',
  slots: [
    { name: 'Breakfast', logsAs: 'breakfast', options: [{ name: 'Paneer bhurji', note: '', ingredients: [ingredient()] }] },
    { name: 'Pre-workout', logsAs: 'snack', options: [{ name: 'Paneer only', note: '', ingredients: [ingredient({ grams: 50, kcal: 132.5, proteinG: 9 })] }] },
  ],
  ...over,
});
const summary = (over: object = {}) => ({ id: TEMPLATE, name: 'Lean 1,800', goal: 'weight_loss', visibility: 'gym', active: true, slots: 2, options: 2, calorieTarget: 1800, canEdit: true, updatedAt: '2026-11-09T10:00:00.000Z', ...over });
const planSummary = (over: object = {}) => ({ id: PLAN, traineeId: ARJUN, traineeName: 'arjun@example.test', coachId: ME, coachName: 'Asha Rao', name: 'Lean 1,800', status: 'draft', startDate: '2026-11-17', calorieTarget: 2100, liveVersion: null, version: 2, updatedAt: '2026-11-11T10:12:00.000Z', ...over });
const planDetail = (over: object = {}) => ({
  ...planSummary(),
  content: content(),
  lastChange: { id: 'c1', action: 'edited', version: 2, actorId: ME, actorName: 'Ravi Kumar', actorRole: 'coach', summary: null, at: '2026-11-11T10:42:00.000Z' },
  clientTargets: { calories: 2100, proteinG: 140 },
  canPublish: true,
  ...over,
});

function Prime({ children }: { children: ReactNode }) {
  const { refresh } = useAccount();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void refresh().then(() => setReady(true));
  }, [refresh]);
  return ready ? <>{children}</> : null;
}
async function open(element: React.ReactElement, roles: string[], responses: { status: number; body: unknown }[]) {
  const api = fakeApi([{ status: 200, body: me(roles) }, ...responses]);
  const authClient = fakeClient({ getSession: async () => ({ data: { session: session() }, error: null }) }).client;
  await render(
    <Providers authDeps={deps(authClient, api.fetchImpl)}>
      <Prime>{element}</Prime>
    </Providers>,
  );
  return api;
}

describe('nutrition texts', () => {
  it('scales a food to the grams the way the server does, and keeps the protein source first', () => {
    const roti = ingredientFrom(FOODS.find((food) => food.id === 'wheat-roti') as Food, 80, '2 pieces', false);
    expect(roti).toMatchObject({ name: 'Wheat roti', kcal: 237.6, proteinG: 8.8, grams: 80, label: '2 pieces' });
    const sorted = withProteinSource([roti, ingredient() as never], 1, true);
    expect(sorted.map((i) => i.name)).toEqual(['Paneer', 'Wheat roti']);
    expect(sorted.filter((i) => i.proteinSource)).toHaveLength(1);
    expect(withProteinSource([ingredient() as never], 0, false)[0]?.proteinSource).toBe(false);
  });

  it('keeps nutrition in step when the grams change', () => {
    expect(withGrams(ingredient() as never, 150)).toMatchObject({ grams: 150, kcal: 397.5, proteinG: 27.5 });
  });

  it('sends only what the server needs: no names or nutrition', () => {
    const input = toInput(content() as never);
    expect(input.slots[0]?.options[0]?.ingredients[0]).toEqual({ foodId: PANEER, grams: 100, label: null, proteinSource: true });
  });

  it('says how far off target a day is, and warns only beyond 10%', () => {
    expect(deviationText(2142, 2100)).toBe('2% over');
    expect(deviationText(1830, 2100)).toBe('13% under');
    expect(deviationText(2100, 2100)).toBe('on target');
    expect(deviationText(1000, null)).toBe('no target');
    expect(offTarget(1830, 2100)).toBe(true);
    expect(offTarget(2142, 2100)).toBe(false);
    expect(offTarget(1000, null)).toBe(false);
  });

  it('starts a new diet with the four app meals and no options', () => {
    expect(newDietContent().slots.map((s) => [s.name, s.logsAs, s.options.length])).toEqual([
      ['Breakfast', 'breakfast', 0], ['Lunch', 'lunch', 0], ['Snack', 'snack', 0], ['Dinner', 'dinner', 0],
    ]);
  });
});

describe('Nutrition home', () => {
  it('lists templates with who can use them and opens one', async () => {
    await open(<Nutrition />, ['coach'], [{ status: 200, body: { templates: [summary(), summary({ id: 'x', name: 'Veg maintenance', visibility: 'personal', goal: 'maintenance' })] } }]);
    expect(await screen.findByText('Weight loss')).toBeTruthy();
    expect(screen.getByText('GYM')).toBeTruthy();
    expect(screen.getByText('MINE')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Lean 1,800' }));
    expect(mockRouter.push).toHaveBeenCalledWith(`/diet-template?id=${TEMPLATE}`);
  });

  it('filters by goal on the server', async () => {
    const api = await open(<Nutrition />, ['coach'], [{ status: 200, body: { templates: [summary()] } }, { status: 200, body: { templates: [] } }]);
    await screen.findByText('Weight loss');
    await fireEvent.press(screen.getByRole('radio', { name: 'Maintenance' }));
    expect(await screen.findByText('Nothing matches.')).toBeTruthy();
    expect(api.requests.at(-1)?.url).toBe('http://api.test/v1/diet-templates?goal=maintenance');
  });

  it("shows clients' diet plans with their status", async () => {
    mockParams = { tab: 'plans' };
    const api = await open(<Nutrition />, ['head_coach', 'personal'], [
      { status: 200, body: { plans: [planSummary(), planSummary({ id: 'p2', traineeName: 'priya@example.test', status: 'active', coachId: 'c9', coachName: 'Meera Joshi' })], coaches: [{ id: 'c9', name: 'Meera Joshi' }] } },
    ]);
    expect(await screen.findByLabelText('Status: Draft')).toBeTruthy();
    expect(screen.getByLabelText('Status: Active')).toBeTruthy();
    expect(api.requests.at(-1)?.url).toBe('http://api.test/v1/diet-plans');
    expect(screen.getByRole('radio', { name: 'Meera Joshi' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'arjun@example.test, Lean 1,800' }));
    expect(mockRouter.push).toHaveBeenCalledWith(`/diet-plan?id=${PLAN}`);
  });

  it('says there are no templates yet, and shows a calm message when the server fails', async () => {
    await open(<Nutrition />, ['coach'], [{ status: 200, body: { templates: [] } }]);
    expect(await screen.findByText(/Make a template once/)).toBeTruthy();
  });

  it('shows a calm message when the server is unavailable', async () => {
    await open(<Nutrition />, ['coach'], [{ status: 500, body: null }]);
    expect(await screen.findByText('Something went wrong. Try again later.')).toBeTruthy();
  });
});

describe('Template editor', () => {
  it('asks for a name before saving, and sends nothing', async () => {
    const api = await open(<DietTemplate />, ['coach'], []);
    await fireEvent.press(await screen.findByRole('button', { name: 'Save template' }));
    expect(await screen.findByText('Enter a name.')).toBeTruthy();
    expect(api.requests).toHaveLength(1);
  });

  it('builds an option from the food list, marks the protein source, and saves without sending nutrition', async () => {
    const api = await open(<DietTemplate />, ['coach'], [{ status: 201, body: { template: { ...summary(), content: content() } } }]);
    await fireEvent.changeText(await screen.findByLabelText('Template name'), 'Lean 1,800');
    await fireEvent.press(screen.getByRole('button', { name: 'Add option (3 max)' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add ingredient' }));
    await fireEvent.changeText(await screen.findByLabelText('Search foods'), 'pan');
    expect(screen.queryByRole('radio', { name: 'Banana' })).toBeNull();
    await fireEvent.press(await screen.findByRole('radio', { name: 'Paneer' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add Paneer' }));
    expect(await screen.findByRole('button', { name: 'Paneer, 100 g' })).toBeTruthy();
    expect(screen.getAllByLabelText('Totals: 265 kcal · 18.3 g protein').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Protein source/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save template' }));
    await screen.findByText('Template saved.');
    expect(api.requests.some((r) => r.url.includes('/foods'))).toBe(false);
    const post = api.requests.at(-1);
    expect(post).toMatchObject({ method: 'POST', url: 'http://api.test/v1/diet-templates' });
    const sent = post?.body as { name: string; content: { slots: { logsAs: string; options: { ingredients: object[] }[] }[] } };
    expect(sent.name).toBe('Lean 1,800');
    expect(sent.content.slots.map((s) => s.logsAs)).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    expect(sent.content.slots[0]?.options[0]?.ingredients).toEqual([{ foodId: 'paneer', grams: 100, label: null, proteinSource: true }]);
    expect(mockRouter.replace).toHaveBeenCalledWith(`/diet-template?id=${TEMPLATE}`);
  });

  it('adds a custom slot that logs as one of the four meals', async () => {
    const api = await open(<DietTemplate />, ['coach'], [{ status: 201, body: { template: { ...summary(), content: content() } } }]);
    await fireEvent.changeText(await screen.findByLabelText('Template name'), 'Cut');
    await fireEvent.press(screen.getByRole('button', { name: 'Add slot' }));
    await fireEvent.changeText(await screen.findByLabelText('Slot name'), 'Pre-workout');
    await fireEvent.press(screen.getByRole('radio', { name: 'Snack' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save template' }));
    await screen.findByText('Template saved.');
    const sent = api.requests.at(-1)?.body as { content: { slots: { name: string; logsAs: string }[] } };
    expect(sent.content.slots.at(-1)).toMatchObject({ name: 'Pre-workout', logsAs: 'snack' });
  });

  it('warns, without blocking, when the day is more than 10% off the target', async () => {
    mockParams = { id: TEMPLATE };
    await open(<DietTemplate />, ['coach'], [{ status: 200, body: { template: { ...summary(), content: content({ calorieTarget: 1000 }) } } }]);
    expect(await screen.findByText(/More than 10% off target/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save template' })).toBeTruthy();
  });

  it("opens another coach's gym template read-only, with Copy and Assign but no Save", async () => {
    mockParams = { id: TEMPLATE };
    await open(<DietTemplate />, ['coach'], [{ status: 200, body: { template: { ...summary({ canEdit: false }), content: content() } } }]);
    expect(await screen.findByText(/another coach's template/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save template' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy template' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assign plan' })).toBeTruthy();
  });

  it('deactivates only after confirming', async () => {
    mockParams = { id: TEMPLATE };
    const api = await open(<DietTemplate />, ['coach'], [{ status: 200, body: { template: { ...summary(), content: content() } } }, { status: 204, body: null }]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Deactivate template' }));
    expect(await screen.findByText(/Plans already made from it are not changed/)).toBeTruthy();
    expect(api.requests.some((r) => r.url.endsWith('/deactivate'))).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Deactivate' }));
    await screen.findByRole('button', { name: 'Deactivate template' });
    expect(api.requests.at(-1)).toMatchObject({ method: 'POST', url: `http://api.test/v1/diet-templates/${TEMPLATE}/deactivate` });
    expect(mockRouter.replace).toHaveBeenCalledWith('/nutrition');
  });

  it('says what to check when the server refuses the values', async () => {
    await open(<DietTemplate />, ['coach'], [{ status: 400, body: errorBody('VALIDATION_FAILED') }]);
    await fireEvent.changeText(await screen.findByLabelText('Template name'), 'Cut');
    await fireEvent.press(screen.getByRole('button', { name: 'Save template' }));
    expect(await screen.findByText(/Some values are not valid/)).toBeTruthy();
  });
});

describe('Assign diet plan', () => {
  const clients = {
    clients: [
      { id: ARJUN, name: 'arjun@example.test', coachId: ME, coachName: 'Asha Rao', startedAt: '2026-11-03T08:00:00.000Z', lastLoggedAt: null },
      { id: PRIYA, name: 'priya@example.test', coachId: ME, coachName: 'Asha Rao', startedAt: '2026-11-03T08:00:00.000Z', lastLoggedAt: null },
    ],
    coaches: [],
    canInvite: false,
    invitations: [],
  };
  const load = (plans: object[]) => [
    { status: 200, body: { template: { ...summary(), content: content() } } },
    { status: 200, body: clients },
    { status: 200, body: { plans, coaches: [] } },
  ];

  it('makes a draft for each chosen client, warns about an active plan, and blocks a client with a draft', async () => {
    mockParams = { templateId: TEMPLATE };
    const api = await open(<DietAssign />, ['coach'], [
      ...load([planSummary({ traineeId: ARJUN, status: 'active', liveVersion: 1 }), planSummary({ id: 'd', traineeId: PRIYA, status: 'draft' })]),
      { status: 201, body: { plans: [planSummary()] } },
    ]);
    await screen.findByText('Lean 1,800');
    expect(screen.getByRole('checkbox', { name: 'priya@example.test', disabled: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'arjun@example.test' }));
    expect(screen.getByText(/arjun@example.test already has an active plan/)).toBeTruthy();
    expect(screen.getByText(/Quantities are scaled so option 1 of each slot adds up to the client's calorie target/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Create 1 draft' }));
    await screen.findByText('Lean 1,800');
    const post = api.requests.at(-1);
    expect(post).toMatchObject({ method: 'POST', url: 'http://api.test/v1/diet-plans' });
    expect(post?.body).toMatchObject({ templateId: TEMPLATE, traineeIds: [ARJUN], startDate: addDays(todayIst(), 1), scale: true });
    expect(mockRouter.replace).toHaveBeenCalledWith('/nutrition?tab=plans');
  });

  it('can copy the template as it is: the scaling switch sends scale false', async () => {
    mockParams = { templateId: TEMPLATE };
    const api = await open(<DietAssign />, ['coach'], [...load([]), { status: 201, body: { plans: [planSummary()] } }]);
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'arjun@example.test' }));
    await fireEvent(screen.getByLabelText("Scale to each client's calories"), 'valueChange', false);
    expect(await screen.findByText('Quantities are copied as they are.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Create 1 draft' }));
    await screen.findByLabelText("Scale to each client's calories");
    expect(api.requests.at(-1)?.body).toMatchObject({ scale: false });
  });

  it('shows the server answer when a client already has a draft, and asks for a client first', async () => {
    mockParams = { templateId: TEMPLATE };
    await open(<DietAssign />, ['coach'], [...load([]), { status: 409, body: errorBody('PLAN_DRAFT_EXISTS') }]);
    expect(await screen.findByRole('button', { name: 'Pick clients', disabled: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'arjun@example.test' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create 1 draft' }));
    expect(await screen.findByText(/already has a draft plan/)).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('Diet plan', () => {
  beforeEach(() => {
    mockParams = { id: PLAN };
  });

  it("shows the status first, then the client's targets against the plan, and the slots", async () => {
    await open(<DietPlan />, ['coach'], [{ status: 200, body: { plan: planDetail() } }]);
    expect(await screen.findByLabelText('Status: Draft')).toBeTruthy();
    expect(screen.getByText("Draft, version 2. arjun can't see this yet.")).toBeTruthy();
    expect(screen.getByText('397.5 kcal')).toBeTruthy();
    expect(screen.getByText(/target 2100 · 81% under/)).toBeTruthy();
    expect(screen.getByText(/More than 10% off target/)).toBeTruthy();
    expect(screen.getByText('Ravi Kumar (C), 11 Nov, 4:12 pm')).toBeTruthy();
    expect(screen.getByText('Protein · Paneer · 100 g')).toBeTruthy();
    expect(screen.getByText('A fitness planning tool. It is not medical advice.')).toBeTruthy();
  });

  it('hides Publish and says why while the trainee app cannot show diet plans yet', async () => {
    await open(<DietPlan />, ['coach'], [{ status: 200, body: { plan: planDetail({ canPublish: false }) } }]);
    expect(await screen.findByText(/Publishing waits for the FitSphere app update/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it('publishes only after confirming, then reloads', async () => {
    const api = await open(<DietPlan />, ['coach'], [
      { status: 200, body: { plan: planDetail() } },
      { status: 204, body: null },
      { status: 200, body: { plan: planDetail({ status: 'active', liveVersion: 2 }) } },
    ]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(/sees this plan in their Diet plan tab straight away/)).toBeTruthy();
    expect(api.requests.some((r) => r.url.endsWith('/publish'))).toBe(false);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Publish' }).at(-1) as never);
    expect(await screen.findByLabelText('Status: Active')).toBeTruthy();
    expect(api.requests.find((r) => r.url.endsWith('/publish'))).toMatchObject({ method: 'POST', url: `http://api.test/v1/diet-plans/${PLAN}/publish` });
  });

  it('tells the coach when an option has no protein source', async () => {
    await open(<DietPlan />, ['coach'], [{ status: 200, body: { plan: planDetail() } }, { status: 409, body: errorBody('PLAN_NOT_READY') }]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Publish' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Publish' }).at(-1) as never);
    expect(await screen.findByText(/exactly one protein source, before publishing/)).toBeTruthy();
  });

  it('has no Publish, Edit or End for an ended plan; says unavailable for a plan that is not this coach’s', async () => {
    await open(<DietPlan />, ['coach'], [{ status: 200, body: { plan: planDetail({ status: 'ended', liveVersion: 2 }) } }]);
    expect(await screen.findByText(/This plan has ended/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'End plan' })).toBeNull();
  });

  it('says the plan is no longer available when it is not this coach’s', async () => {
    await open(<DietPlan />, ['coach'], [{ status: 404, body: errorBody('NOT_FOUND') }]);
    expect(await screen.findByText('This is no longer available.')).toBeTruthy();
  });

  it('discards a draft after confirming and returns to the plans', async () => {
    const api = await open(<DietPlan />, ['coach'], [{ status: 200, body: { plan: planDetail() } }, { status: 204, body: null }]);
    await fireEvent.press(await screen.findByRole('button', { name: 'Discard draft' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Discard' }));
    await screen.findByLabelText('Status: Draft');
    expect(api.requests.at(-1)).toMatchObject({ method: 'POST', url: `http://api.test/v1/diet-plans/${PLAN}/discard` });
    expect(mockRouter.replace).toHaveBeenCalledWith('/nutrition?tab=plans');
  });
});

describe('Diet plan history', () => {
  beforeEach(() => {
    mockParams = { id: PLAN };
  });
  const history = {
    changes: [
      { id: 'c2', action: 'published', version: 1, actorId: ME, actorName: 'Ravi Kumar', actorRole: 'coach', summary: null, at: '2026-11-09T13:10:00.000Z' },
      { id: 'c1', action: 'created', version: 1, actorId: ME, actorName: 'Asha Rao', actorRole: 'head_coach', summary: null, at: '2026-11-03T05:22:00.000Z' },
    ],
    publishedVersions: [1],
  };

  it('lists who changed what and when, and restores a published version as a draft', async () => {
    const api = await open(<DietHistory />, ['coach'], [{ status: 200, body: history }, { status: 200, body: { plan: planDetail() } }]);
    expect(await screen.findByText('Published version 1')).toBeTruthy();
    expect(screen.getByText('Asha Rao (Head coach)')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Restore as draft' }));
    await screen.findByText('Published version 1');
    expect(api.requests.at(-1)).toMatchObject({ method: 'POST', url: `http://api.test/v1/diet-plans/${PLAN}/restore`, body: { version: 1 } });
    expect(mockRouter.replace).toHaveBeenCalledWith(`/diet-plan?id=${PLAN}`);
  });
});
