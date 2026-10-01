import { sendSuccess } from '../../common/http/responses.js';
import { parseAttendanceCsv } from './attendanceService.js';

const execute = (handler) => async (request, response, next) => {
  try {
    await handler(request, response);
  } catch (error) {
    next(error);
  }
};

export function createAttendanceController(service) {
  return {
    limits: execute(async (_request, response) => sendSuccess(response, service.limits)),
    employmentOptions: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listEmploymentOptions(request.accessContext, request.validated.query),
      ),
    ),
    listRecords: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listRecords(request.accessContext, request.validated.query),
      ),
    ),
    getRecord: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.getRecord(request.validated.params.id, request.accessContext),
      ),
    ),
    listShifts: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listShifts(request.accessContext, request.validated.query.companyId),
      ),
    ),
    createShift: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.createShift(
          request.actor,
          request.accessContext,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    updateShift: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.updateShift(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    deactivateShift: execute(async (request, response) => {
      await service.deactivateShift(
        request.actor,
        request.accessContext,
        request.validated.params.id,
        request.validated.body,
        request.context,
      );
      response.status(204).end();
    }),
    assignShift: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.assignShift(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    listShiftAssignments: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listShiftAssignments(request.accessContext, request.validated.params.id),
      ),
    ),
    createManualEvent: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.createManualEvent(
          request.actor,
          request.accessContext,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    listEvents: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listEvents(
          request.actor,
          request.accessContext,
          request.validated.query,
          request.context,
        ),
      ),
    ),
    setDisposition: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.setDisposition(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    importJson: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.importEvents(
          request.actor,
          request.accessContext,
          { ...request.validated.body, format: 'json' },
          request.context,
        ),
        201,
      ),
    ),
    importCsv: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.importEvents(
          request.actor,
          request.accessContext,
          {
            companyId: request.csvImport.companyId,
            idempotencyKey: request.csvImport.idempotencyKey,
            sourceReference: request.csvImport.sourceReference,
            format: 'csv',
            rows: parseAttendanceCsv(request.body),
          },
          request.context,
        ),
        201,
      ),
    ),
    getImport: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.getImport(
          request.accessContext,
          request.validated.params.id,
          request.validated.query.companyId,
        ),
      ),
    ),
    calculate: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.calculate(
          request.actor,
          request.accessContext,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    createCorrection: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.createCorrection(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    submitCorrection: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.transitionCorrection(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          'submit',
          request.validated.body,
          request.context,
        ),
      ),
    ),
    cancelCorrection: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.transitionCorrection(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          'cancel',
          request.validated.body,
          request.context,
        ),
      ),
    ),
    approveCorrection: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.decideCorrection(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          'approve',
          request.validated.body,
          request.context,
        ),
      ),
    ),
    rejectCorrection: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.decideCorrection(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          'reject',
          request.validated.body,
          request.context,
        ),
      ),
    ),
    listCorrections: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listCorrections(request.accessContext, request.validated.query.companyId),
      ),
    ),
    correctionHistory: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.correctionHistory(request.accessContext, request.validated.params.id),
      ),
    ),
    createLock: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.createLock(
          request.actor,
          request.accessContext,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    reverseLock: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.reverseLock(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    listLocks: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.listLocks(request.accessContext, request.validated.query.companyId),
      ),
    ),
  };
}
