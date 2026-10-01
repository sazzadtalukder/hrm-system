import { sendSuccess } from '../../common/http/responses.js';

const execute = (handler) => async (request, response, next) => {
  try {
    await handler(request, response);
  } catch (error) {
    next(error);
  }
};

export function createPayrollController(service) {
  return {
    limits: execute(async (_r, res) => sendSuccess(res, service.limits)),
    periods: execute(async (r, res) =>
      sendSuccess(res, { items: await service.listPeriods(r.accessContext, r.validated.query) }),
    ),
    createPeriod: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.createPeriod(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    updatePeriod: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.updatePeriod(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    components: execute(async (r, res) =>
      sendSuccess(res, { items: await service.listComponents(r.accessContext, r.validated.query) }),
    ),
    createComponent: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.createComponent(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    updateComponent: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.updateComponent(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    deactivateComponent: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.deactivateComponent(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    compensation: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.listCompensation(r.actor, r.accessContext, r.validated.params.id, r.context),
      ),
    ),
    addCompensation: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.addCompensation(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    addRecurring: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.addRecurring(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    createInput: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.createInput(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    runs: execute(async (r, res) =>
      sendSuccess(res, { items: await service.listRuns(r.accessContext, r.validated.query) }),
    ),
    run: execute(async (r, res) =>
      sendSuccess(res, await service.getRun(r.accessContext, r.validated.params.id)),
    ),
    createRun: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.createRun(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    process: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.process(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    submit: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.submit(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    approve: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.decide(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          'approved',
          r.validated.body,
          r.context,
        ),
      ),
    ),
    reject: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.decide(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          'rejected',
          r.validated.body,
          r.context,
        ),
      ),
    ),
    lock: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.lock(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    publish: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.publish(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    ownPayslips: execute(async (r, res) =>
      sendSuccess(res, { items: await service.listOwnPayslips(r.actor) }),
    ),
    result: execute(async (r, res) =>
      sendSuccess(res, await service.getResult(r.accessContext, r.validated.params.id)),
    ),
    createAdjustment: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.createAdjustment(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    adjustmentAction: (action) =>
      execute(async (r, res) =>
        sendSuccess(
          res,
          await service.adjustmentTransition(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            action,
            r.validated.body,
            r.context,
          ),
        ),
      ),
    reverseResult: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.reverseResult(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    revokePublication: execute(async (r, res) =>
      sendSuccess(
        res,
        await service.revokePublication(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
      ),
    ),
    exportRun: execute(async (r, res) => {
      const csv = await service.exportRun(
        r.actor,
        r.accessContext,
        r.validated.params.id,
        r.context,
      );
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', 'attachment; filename="payroll-results.csv"');
      res.send(csv);
    }),
  };
}
