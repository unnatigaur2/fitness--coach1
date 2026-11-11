// Nutrition management routes (CF07). For a Coach or Head Coach; every handler also checks that the
// template or client is theirs to see (invariant 1).
//   GET/POST /v1/diet-templates              list (?q ?goal ?includeInactive) / create
//   GET/PUT  /v1/diet-templates/{id}         one / edit
//   POST /v1/diet-templates/{id}/copy | /deactivate | /activate
//   GET/POST /v1/diet-plans                  list (?q ?status ?coachId) / draft copies for chosen clients
//   GET/PUT  /v1/diet-plans/{id}             one / edit the working copy
//   GET  /v1/diet-plans/{id}/history
//   POST /v1/diet-plans/{id}/publish         off until TCR-004 (answers not found)
//   POST /v1/diet-plans/{id}/end | /discard | /restore
import {
  API_BASE_PATH,
  assignDietPlanRequestSchema,
  DIET_GOALS,
  dietTemplateRequestSchema,
  idSchema,
  PLAN_STATUSES,
  restorePlanRequestSchema,
  updateDietPlanRequestSchema,
  validationDetails,
} from '@fitsphere-coach/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { z } from 'zod';
import { requireAccount } from '../access.ts';
import {
  assignDietPlans, copyDietTemplate, createDietTemplate, dietPlanHistory, discardDietPlan, endDietPlan, getDietPlan, getDietTemplate,
  listDietPlans, listDietTemplates, publishDietPlan, restoreDietPlan, setDietTemplateActive, updateDietPlan, updateDietTemplate,
} from '../diet.ts';
import { ApiError } from '../errors.ts';

export function registerDietRoutes(app: FastifyInstance, deps: { db: pg.Pool | Pick<pg.Pool, 'query'> }) {
  function pool(): pg.Pool {
    if (!('connect' in deps.db)) throw new Error('Nutrition management needs a database pool');
    return deps.db;
  }
  function pathId(params: unknown): string {
    const parsed = idSchema.safeParse((params as { id?: unknown }).id);
    if (!parsed.success) throw new ApiError('NOT_FOUND');
    return parsed.data;
  }
  function body<S extends z.ZodType>(request: FastifyRequest, schema: S): z.output<S> {
    const input: unknown = request.body;
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', validationDetails(parsed.error, input));
    return parsed.data;
  }
  function option(query: Record<string, unknown>, name: string, allowed: readonly string[] | null): string | undefined {
    const value = query[name];
    if (value === undefined) return undefined;
    const ok = typeof value === 'string' && (allowed ? allowed.includes(value) : value.length <= 100);
    if (!ok) throw new ApiError('VALIDATION_FAILED', [{ field: name, issue: 'invalid_format' }]);
    return value;
  }
  const route = { config: { access: 'coach' as const } };

  app.get(`${API_BASE_PATH}/diet-templates`, route, async (request) => {
    const query = request.query as Record<string, unknown>;
    return {
      templates: await listDietTemplates(deps.db, requireAccount(request), {
        q: option(query, 'q', null),
        goal: option(query, 'goal', DIET_GOALS),
        includeInactive: option(query, 'includeInactive', ['true', 'false']) === 'true',
      }),
    };
  });
  app.post(`${API_BASE_PATH}/diet-templates`, route, async (request, reply) =>
    reply.status(201).send({ template: await createDietTemplate(deps.db, requireAccount(request), body(request, dietTemplateRequestSchema)) }),
  );
  app.get(`${API_BASE_PATH}/diet-templates/:id`, route, async (request) => ({
    template: await getDietTemplate(deps.db, requireAccount(request), pathId(request.params)),
  }));
  app.put(`${API_BASE_PATH}/diet-templates/:id`, route, async (request) => ({
    template: await updateDietTemplate(deps.db, requireAccount(request), pathId(request.params), body(request, dietTemplateRequestSchema)),
  }));
  app.post(`${API_BASE_PATH}/diet-templates/:id/copy`, route, async (request, reply) =>
    reply.status(201).send({ template: await copyDietTemplate(deps.db, requireAccount(request), pathId(request.params)) }),
  );
  app.post(`${API_BASE_PATH}/diet-templates/:id/deactivate`, route, async (request, reply) => {
    await setDietTemplateActive(deps.db, requireAccount(request), pathId(request.params), false);
    return reply.status(204).send();
  });
  app.post(`${API_BASE_PATH}/diet-templates/:id/activate`, route, async (request, reply) => {
    await setDietTemplateActive(deps.db, requireAccount(request), pathId(request.params), true);
    return reply.status(204).send();
  });

  app.get(`${API_BASE_PATH}/diet-plans`, route, async (request) => {
    const query = request.query as Record<string, unknown>;
    const coachId = query.coachId === undefined ? undefined : idSchema.safeParse(query.coachId);
    if (coachId && !coachId.success) throw new ApiError('VALIDATION_FAILED', [{ field: 'coachId', issue: 'invalid_format' }]);
    return listDietPlans(deps.db, requireAccount(request), { q: option(query, 'q', null), status: option(query, 'status', PLAN_STATUSES), coachId: coachId?.data });
  });
  app.post(`${API_BASE_PATH}/diet-plans`, route, async (request, reply) => {
    const plans = await assignDietPlans(pool(), requireAccount(request), body(request, assignDietPlanRequestSchema));
    request.log.info({ event: 'diet_plans_assigned', userId: requireAccount(request).id, count: plans.length }, 'diet plans assigned');
    return reply.status(201).send({ plans });
  });
  app.get(`${API_BASE_PATH}/diet-plans/:id`, route, async (request) => ({ plan: await getDietPlan(deps.db, requireAccount(request), pathId(request.params)) }));
  app.put(`${API_BASE_PATH}/diet-plans/:id`, route, async (request) => ({
    plan: await updateDietPlan(pool(), requireAccount(request), pathId(request.params), body(request, updateDietPlanRequestSchema)),
  }));
  app.get(`${API_BASE_PATH}/diet-plans/:id/history`, route, async (request) => dietPlanHistory(deps.db, requireAccount(request), pathId(request.params)));
  app.post(`${API_BASE_PATH}/diet-plans/:id/publish`, route, async (request, reply) => {
    await publishDietPlan(pool(), requireAccount(request), pathId(request.params));
    request.log.info({ event: 'diet_plan_published', userId: requireAccount(request).id }, 'diet plan published');
    return reply.status(204).send();
  });
  app.post(`${API_BASE_PATH}/diet-plans/:id/end`, route, async (request, reply) => {
    await endDietPlan(pool(), requireAccount(request), pathId(request.params));
    return reply.status(204).send();
  });
  app.post(`${API_BASE_PATH}/diet-plans/:id/discard`, route, async (request, reply) => {
    await discardDietPlan(pool(), requireAccount(request), pathId(request.params));
    return reply.status(204).send();
  });
  app.post(`${API_BASE_PATH}/diet-plans/:id/restore`, route, async (request) => ({
    plan: await restoreDietPlan(pool(), requireAccount(request), pathId(request.params), body(request, restorePlanRequestSchema).version),
  }));
}
