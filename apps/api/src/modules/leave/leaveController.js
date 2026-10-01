import { sendSuccess } from '../../common/http/responses.js';

const execute = (handler) => async (request, response, next) => {
  try {
    await handler(request, response);
  } catch (error) {
    next(error);
  }
};
export function createLeaveController(service) {
  return {
    limits: execute(async (_request, response) => sendSuccess(response, service.limits)),
    ownEmployment: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.getOwnEmployment(request.accessContext, request.validated.query.companyId),
      ),
    ),
    listTypes: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listTypes(request.accessContext, request.validated.query.companyId),
      ),
    ),
    createType: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.createType(
          request.actor,
          request.accessContext,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    listPolicies: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listPolicies(request.accessContext, request.validated.query.companyId),
      ),
    ),
    createPolicy: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.createPolicy(
          request.actor,
          request.accessContext,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    assignments: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listPolicyAssignments(request.accessContext, request.validated.params.id),
      ),
    ),
    assignPolicy: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.assignPolicy(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    createRequest: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.createRequest(
          request.actor,
          request.accessContext,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    createHistorical: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.createRequest(
          request.actor,
          request.accessContext,
          request.validated.body,
          request.context,
          { historical: true },
        ),
        201,
      ),
    ),
    updateDraft: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.updateDraft(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    listRequests: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listRequests(
          request.actor,
          request.accessContext,
          request.validated.query,
          request.context,
        ),
      ),
    ),
    getRequest: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.getRequest(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.context,
        ),
      ),
    ),
    submit: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.submit(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    submitHistorical: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.submit(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
          { historical: true },
        ),
      ),
    ),
    withdraw: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.withdrawDraft(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    approve: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.decide(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          'approve',
          request.validated.body,
          request.context,
        ),
      ),
    ),
    reject: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.decide(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          'reject',
          request.validated.body,
          request.context,
        ),
      ),
    ),
    requestCancellation: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.requestCancellation(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    approveCancellation: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.decide(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          'approve',
          request.validated.body,
          request.context,
          { cancellation: true },
        ),
      ),
    ),
    rejectCancellation: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.decide(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          'reject',
          request.validated.body,
          request.context,
          { cancellation: true },
        ),
      ),
    ),
    balances: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listBalances(
          request.accessContext,
          request.validated.params.id,
          request.validated.query.asOfDate ?? new Date().toISOString().slice(0, 10),
        ),
      ),
    ),
    exportBalances: execute(async (request, response) => {
      const csv = await service.exportBalances(
        request.actor,
        request.accessContext,
        request.validated.params.id,
        request.validated.query.asOfDate ?? new Date().toISOString().slice(0, 10),
        request.context,
      );
      response.set('Content-Type', 'text/csv; charset=utf-8');
      response.set('Content-Disposition', 'attachment; filename="leave-balances.csv"');
      response.send(csv);
    }),
    ledger: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.ledger(
          request.accessContext,
          request.validated.params.id,
          request.validated.query.asOfDate ?? new Date().toISOString().slice(0, 10),
        ),
      ),
    ),
    adjust: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.adjustBalance(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    reverse: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.reverseLedger(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
  };
}
