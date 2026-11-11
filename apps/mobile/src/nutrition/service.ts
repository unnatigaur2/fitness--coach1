// Nutrition management calls (CF07). The server decides who sees and changes what; the app shows what
// it answers and decides from the error code, never the message.
import type {
  DietInput,
  DietPlanDetail,
  DietPlanListResponse,
  DietPlanSummary,
  DietTemplateDetail,
  DietTemplateSummary,
  PlanHistoryResponse,
} from '@fitsphere-coach/shared';
import type { AuthDeps } from '../auth/service';
import { call, type Result } from '../workouts/service';

const enc = encodeURIComponent;
const unwrap = <T, K extends string>(result: Result<Record<K, T>>, key: K): Result<T> => (result.kind === 'ok' ? { kind: 'ok', body: result.body[key] } : result);

export async function loadDietTemplates(deps: AuthDeps, filter: { q?: string; goal?: string; includeInactive?: boolean } = {}): Promise<Result<DietTemplateSummary[]>> {
  const params = new URLSearchParams();
  if (filter.q?.trim()) params.set('q', filter.q.trim());
  if (filter.goal) params.set('goal', filter.goal);
  if (filter.includeInactive) params.set('includeInactive', 'true');
  const query = params.toString();
  return unwrap(await call<{ templates: DietTemplateSummary[] }>(deps, `/diet-templates${query ? `?${query}` : ''}`), 'templates');
}

export async function loadDietTemplate(deps: AuthDeps, id: string): Promise<Result<DietTemplateDetail>> {
  return unwrap(await call<{ template: DietTemplateDetail }>(deps, `/diet-templates/${enc(id)}`), 'template');
}

export type DietTemplateBody = { name: string; goal: string; visibility: 'gym' | 'personal'; content: DietInput };

/** Creates a template, or edits one when `id` is given. */
export async function saveDietTemplate(deps: AuthDeps, request: DietTemplateBody, id?: string): Promise<Result<DietTemplateDetail>> {
  const result = id
    ? await call<{ template: DietTemplateDetail }>(deps, `/diet-templates/${enc(id)}`, 'PUT', request)
    : await call<{ template: DietTemplateDetail }>(deps, '/diet-templates', 'POST', request);
  return unwrap(result, 'template');
}

export async function copyDietTemplate(deps: AuthDeps, id: string): Promise<Result<DietTemplateDetail>> {
  return unwrap(await call<{ template: DietTemplateDetail }>(deps, `/diet-templates/${enc(id)}/copy`, 'POST', {}), 'template');
}

export async function setDietTemplateActive(deps: AuthDeps, id: string, active: boolean): Promise<Result<null>> {
  const result = await call<unknown>(deps, `/diet-templates/${enc(id)}/${active ? 'activate' : 'deactivate'}`, 'POST', {});
  return result.kind === 'ok' ? { kind: 'ok', body: null } : result;
}

export async function loadDietPlans(deps: AuthDeps, filter: { q?: string; status?: string; coachId?: string } = {}): Promise<Result<DietPlanListResponse>> {
  const params = new URLSearchParams();
  if (filter.q?.trim()) params.set('q', filter.q.trim());
  if (filter.status) params.set('status', filter.status);
  if (filter.coachId) params.set('coachId', filter.coachId);
  const query = params.toString();
  return call<DietPlanListResponse>(deps, `/diet-plans${query ? `?${query}` : ''}`);
}

export async function loadDietPlan(deps: AuthDeps, id: string): Promise<Result<DietPlanDetail>> {
  return unwrap(await call<{ plan: DietPlanDetail }>(deps, `/diet-plans/${enc(id)}`), 'plan');
}

export async function assignDietPlans(deps: AuthDeps, templateId: string, traineeIds: string[], startDate: string, scale: boolean): Promise<Result<DietPlanSummary[]>> {
  return unwrap(await call<{ plans: DietPlanSummary[] }>(deps, '/diet-plans', 'POST', { templateId, traineeIds, startDate, scale }), 'plans');
}

export async function saveDietPlan(deps: AuthDeps, id: string, request: { name: string; startDate: string; content: DietInput }): Promise<Result<DietPlanDetail>> {
  return unwrap(await call<{ plan: DietPlanDetail }>(deps, `/diet-plans/${enc(id)}`, 'PUT', request), 'plan');
}

async function action(deps: AuthDeps, id: string, name: 'publish' | 'end' | 'discard'): Promise<Result<null>> {
  const result = await call<unknown>(deps, `/diet-plans/${enc(id)}/${name}`, 'POST', {});
  return result.kind === 'ok' ? { kind: 'ok', body: null } : result;
}
export const publishDietPlan = (deps: AuthDeps, id: string) => action(deps, id, 'publish');
export const endDietPlan = (deps: AuthDeps, id: string) => action(deps, id, 'end');
export const discardDietPlan = (deps: AuthDeps, id: string) => action(deps, id, 'discard');

export async function restoreDietPlan(deps: AuthDeps, id: string, version: number): Promise<Result<DietPlanDetail>> {
  return unwrap(await call<{ plan: DietPlanDetail }>(deps, `/diet-plans/${enc(id)}/restore`, 'POST', { version }), 'plan');
}

export const loadDietHistory = (deps: AuthDeps, id: string): Promise<Result<PlanHistoryResponse>> => call<PlanHistoryResponse>(deps, `/diet-plans/${enc(id)}/history`);
