import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  completionSchema,
  courseSchema,
  enrollmentSchema,
  evidenceSchema,
  idParams,
  listQuery,
  participationSchema,
  providerSchema,
  sessionSchema,
  transitionSchema,
} from './trainingSchemas.js';
export function createTrainingRouter({
  authenticate,
  authorizationService,
  trainingController: c,
}) {
  const r = Router(),
    p = (permission) => requirePermission(authorizationService, permission);
  r.use(authenticate);
  r.get('/limits', p('training_enrollment.view_own'), c.limits);
  r.get('/courses', p('training_course.view'), validate(listQuery, 'query'), c.listCourses);
  r.post('/courses', p('training_course.create'), validate(courseSchema), c.createCourse);
  r.get('/providers', p('training_provider.view'), validate(listQuery, 'query'), c.listProviders);
  r.post('/providers', p('training_provider.create'), validate(providerSchema), c.createProvider);
  r.get('/sessions', p('training_session.view'), validate(listQuery, 'query'), c.listSessions);
  r.post('/sessions', p('training_session.create'), validate(sessionSchema), c.createSession);
  for (const [path, target, permission] of [
    ['publish', 'published', 'training_session.publish'],
    ['close-enrollment', 'enrollment_closed', 'training_session.close_enrollment'],
    ['start', 'in_progress', 'training_session.start'],
    ['complete', 'completed', 'training_session.complete'],
    ['cancel', 'cancelled', 'training_session.cancel'],
  ])
    r.post(
      `/sessions/:id/${path}`,
      p(permission),
      validate(idParams, 'params'),
      validate(transitionSchema),
      c.sessionTransition(target, permission),
    );
  r.get('/export.csv', p('training.export'), validate(listQuery, 'query'), c.export);
  r.get(
    '/my',
    p('training_enrollment.view_own'),
    validate(listQuery, 'query'),
    c.listEnrollments('training_enrollment.view_own'),
  );
  r.post(
    '/my',
    p('training_enrollment.request'),
    validate(enrollmentSchema),
    c.createEnrollment('self_request', 'training_enrollment.request'),
  );
  r.get(
    '/team',
    p('training_enrollment.view_team'),
    validate(listQuery, 'query'),
    c.listEnrollments('training_enrollment.view_team'),
  );
  r.post(
    '/team/nominations',
    p('training_enrollment.nominate'),
    validate(enrollmentSchema),
    c.createEnrollment('manager_nomination', 'training_enrollment.nominate'),
  );
  r.post(
    '/assignments',
    p('training_enrollment.assign'),
    validate(enrollmentSchema),
    c.createEnrollment('hr_assignment', 'training_enrollment.assign'),
  );
  r.get(
    '/enrollments',
    p('training_enrollment.view'),
    validate(listQuery, 'query'),
    c.listEnrollments('training_enrollment.view'),
  );
  for (const [prefix, permission] of [
    ['my', 'training_enrollment.view_own'],
    ['team', 'training_enrollment.view_team'],
    ['enrollments', 'training_enrollment.view'],
  ]) {
    r.get(
      `/${prefix}/:id`,
      p(permission),
      validate(idParams, 'params'),
      c.getEnrollment(permission),
    );
    r.get(
      `/${prefix}/:id/history`,
      p(permission),
      validate(idParams, 'params'),
      c.history(permission),
    );
  }
  for (const [path, action, permission] of [
    ['submit', 'submit', 'training_enrollment.submit'],
    ['withdraw', 'withdraw', 'training_enrollment.withdraw'],
    ['accept-nomination', 'accept_nomination', 'training_enrollment.accept_nomination'],
    ['decline-nomination', 'decline_nomination', 'training_enrollment.decline_nomination'],
    ['approve', 'approve', 'training_enrollment.approve'],
    ['reject', 'reject', 'training_enrollment.reject'],
    ['request-cancellation', 'request_cancellation', 'training_enrollment.request_cancellation'],
    ['approve-cancellation', 'approve_cancellation', 'training_enrollment.approve_cancellation'],
    ['reject-cancellation', 'reject_cancellation', 'training_enrollment.reject_cancellation'],
  ])
    r.post(
      `/enrollments/:id/${path}`,
      p(permission),
      validate(idParams, 'params'),
      validate(transitionSchema),
      c.enrollmentAction(action, permission),
    );
  r.post(
    '/enrollments/:id/participation',
    p('training_participation.record'),
    validate(idParams, 'params'),
    validate(participationSchema),
    c.participation(false),
  );
  r.post(
    '/enrollments/:id/participation/corrections',
    p('training_participation.correct'),
    validate(idParams, 'params'),
    validate(participationSchema),
    c.participation(true),
  );
  r.post(
    '/enrollments/:id/completion',
    p('training_completion.record'),
    validate(idParams, 'params'),
    validate(completionSchema),
    c.completion(false),
  );
  r.post(
    '/enrollments/:id/completion/corrections',
    p('training_completion.correct'),
    validate(idParams, 'params'),
    validate(completionSchema),
    c.completion(true),
  );
  r.post(
    '/enrollments/:id/evidence-references',
    p('training_evidence.create_reference'),
    validate(idParams, 'params'),
    validate(evidenceSchema),
    c.evidence,
  );
  return r;
}
