import { sendSuccess } from '../../common/http/responses.js';

const execute = (handler) => async (request, response, next) => {
  try {
    await handler(request, response);
  } catch (error) {
    next(error);
  }
};

export function createEmployeeController(service) {
  return {
    list: execute(async (request, response) =>
      sendSuccess(response, await service.list(request.accessContext, request.validated.query)),
    ),
    get: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.get(
          request.validated.params.id,
          request.accessContext,
          request.validated.query.asOfDate,
        ),
      ),
    ),
    create: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.create(
          request.actor,
          request.accessContext,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    update: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.update(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    activate: execute(async (request, response) => {
      await service.setRecordStatus(
        request.actor,
        request.accessContext,
        request.validated.params.id,
        'active',
        request.validated.body,
        request.context,
      );
      response.status(204).end();
    }),
    deactivate: execute(async (request, response) => {
      await service.setRecordStatus(
        request.actor,
        request.accessContext,
        request.validated.params.id,
        'inactive',
        request.validated.body,
        request.context,
      );
      response.status(204).end();
    }),
    history: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.history(
          request.validated.params.id,
          request.accessContext,
          request.validated.query.asOfDate,
        ),
      ),
    ),
    employments: execute(async (request, response) =>
      sendSuccess(
        response,
        (
          await service.history(
            request.validated.params.id,
            request.accessContext,
            request.validated.query.asOfDate,
          )
        ).employments,
      ),
    ),
    assignments: execute(async (request, response) =>
      sendSuccess(
        response,
        (
          await service.history(
            request.validated.params.id,
            request.accessContext,
            request.validated.query.asOfDate,
          )
        ).assignments,
      ),
    ),
    statuses: execute(async (request, response) =>
      sendSuccess(
        response,
        (
          await service.history(
            request.validated.params.id,
            request.accessContext,
            request.validated.query.asOfDate,
          )
        ).statuses,
      ),
    ),
    addAssignment: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.addAssignment(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    transitionStatus: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.transitionStatus(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    createEmployment: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.createEmployment(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    getPersonal: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.getPersonal(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.context,
        ),
      ),
    ),
    updatePersonal: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.updatePersonal(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    getContact: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.getContact(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.context,
        ),
      ),
    ),
    updateContact: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.updateContact(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    createEmergencyContact: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.createEmergencyContact(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
        201,
      ),
    ),
    updateEmergencyContact: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.updateEmergencyContact(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.params.contactId,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    deactivateEmergencyContact: execute(async (request, response) => {
      await service.deactivateEmergencyContact(
        request.actor,
        request.accessContext,
        request.validated.params.id,
        request.validated.params.contactId,
        request.validated.body,
        request.context,
      );
      response.status(204).end();
    }),
    linkUser: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.linkUser(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body.userId,
          request.validated.body.reason,
          request.context,
        ),
      ),
    ),
    unlinkUser: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.unlinkUser(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
  };
}
