import { sendSuccess } from '../../common/http/responses.js';
const run = (handler) => async (request, response, next) => {
  try {
    await handler(request, response);
  } catch (error) {
    next(error);
  }
};
export function createBenefitController(service) {
  return {
    limits: run(async (_r, res) => sendSuccess(res, service.limits)),
    listPlans: run(async (r, res) =>
      sendSuccess(res, {
        items: await service.listPlans(r.actor, r.accessContext, r.validated.query),
      }),
    ),
    getPlan: run(async (r, res) =>
      sendSuccess(res, await service.getPlan(r.actor, r.accessContext, r.validated.params.id)),
    ),
    createPlan: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createPlan(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    updatePlan: run(async (r, res) =>
      sendSuccess(
        res,
        await service.updatePlan(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    versionPlan: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createPlanVersion(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    correctPlan: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createPlanVersion(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
          true,
        ),
        201,
      ),
    ),
    deactivatePlan: run(async (r, res) =>
      sendSuccess(
        res,
        await service.deactivatePlan(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    listEnrollments: run(async (r, res) =>
      sendSuccess(res, {
        items: await service.listEnrollments(r.actor, r.accessContext, r.validated.query),
      }),
    ),
    listOwn: run(async (r, res) =>
      sendSuccess(res, {
        items: await service.listOwn(r.actor, r.accessContext, r.validated.query),
      }),
    ),
    getEnrollment: run(async (r, res) =>
      sendSuccess(
        res,
        await service.getEnrollment(r.actor, r.accessContext, r.validated.params.id),
      ),
    ),
    getOwnEnrollment: run(async (r, res) =>
      sendSuccess(
        res,
        await service.getEnrollment(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          'benefit_enrollment.view_own',
        ),
      ),
    ),
    createEnrollment: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createEnrollment(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    createHistorical: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createEnrollment(r.actor, r.accessContext, r.validated.body, r.context, true),
        201,
      ),
    ),
    updateDraft: run(async (r, res) =>
      sendSuccess(
        res,
        await service.updateDraft(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    transition: (action) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.transition(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            action,
            r.validated.body,
            r.context,
          ),
        ),
      ),
    history: run(async (r, res) =>
      sendSuccess(res, await service.history(r.accessContext, r.validated.params.id)),
    ),
    export: run(async (r, res) => {
      const csv = await service.exportEnrollments(
        r.actor,
        r.accessContext,
        r.validated.query,
        r.context,
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="benefit-enrollments.csv"');
      res.send(csv);
    }),
  };
}
