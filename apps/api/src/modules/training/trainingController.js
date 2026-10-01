import { sendSuccess } from '../../common/http/responses.js';
const run = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
export function createTrainingController(service) {
  return {
    limits: run(async (_r, res) => sendSuccess(res, service.limits)),
    listCourses: run(async (r, res) =>
      sendSuccess(res, { items: await service.listCourses(r.accessContext, r.validated.query) }),
    ),
    createCourse: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createCourse(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    listProviders: run(async (r, res) =>
      sendSuccess(res, { items: await service.listProviders(r.accessContext, r.validated.query) }),
    ),
    createProvider: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createProvider(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    listSessions: run(async (r, res) =>
      sendSuccess(res, { items: await service.listSessions(r.accessContext, r.validated.query) }),
    ),
    createSession: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createSession(r.actor, r.accessContext, r.validated.body, r.context),
        201,
      ),
    ),
    sessionTransition: (target, permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.sessionTransition(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            target,
            r.validated.body,
            permission,
            r.context,
          ),
        ),
      ),
    createEnrollment: (source, permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.createEnrollment(
            r.actor,
            r.accessContext,
            r.validated.body,
            source,
            permission,
            r.context,
          ),
          201,
        ),
      ),
    listEnrollments: (permission) =>
      run(async (r, res) =>
        sendSuccess(res, {
          items: await service.listEnrollments(
            r.actor,
            r.accessContext,
            r.validated.query,
            permission,
            r.context,
          ),
        }),
      ),
    getEnrollment: (permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.getEnrollment(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            permission,
            r.context,
          ),
        ),
      ),
    enrollmentAction: (action, permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.enrollmentAction(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            action,
            r.validated.body,
            permission,
            r.context,
          ),
        ),
      ),
    participation: (correction) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.recordParticipation(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            r.validated.body,
            correction,
            r.context,
          ),
          correction ? 200 : 201,
        ),
      ),
    completion: (correction) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.recordCompletion(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            r.validated.body,
            correction,
            r.context,
          ),
          correction ? 200 : 201,
        ),
      ),
    evidence: run(async (r, res) =>
      sendSuccess(
        res,
        await service.createEvidence(
          r.actor,
          r.accessContext,
          r.validated.params.id,
          r.validated.body,
          r.context,
        ),
        201,
      ),
    ),
    history: (permission) =>
      run(async (r, res) =>
        sendSuccess(
          res,
          await service.history(
            r.actor,
            r.accessContext,
            r.validated.params.id,
            permission,
            r.context,
          ),
        ),
      ),
    export: run(async (r, res) => {
      const csv = await service.export(r.actor, r.accessContext, r.validated.query, r.context);
      res.type('text/csv').send(csv);
    }),
  };
}
