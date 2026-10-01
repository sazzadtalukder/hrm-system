import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import * as s from './recruitmentSchemas.js';
export function createRecruitmentRouter({
  authenticate,
  authorizationService,
  recruitmentController: c,
}) {
  const r = Router(),
    p = (x) => requirePermission(authorizationService, x),
    action = (base, kind, to, permission) =>
      r.post(
        `${base}/${to}`,
        p(permission),
        validate(s.idParams, 'params'),
        validate(s.transitionSchema),
        c.transition(kind, to, permission),
      );
  r.use(authenticate);
  r.get('/dashboard', validate(s.dashboardQuery, 'query'), c.dashboard);
  r.get(
    '/manpower-plans',
    p('manpower_plan.view'),
    validate(s.listQuery, 'query'),
    c.list('manpower', 'manpower_plan.view'),
  );
  r.post(
    '/manpower-plans',
    p('manpower_plan.create'),
    validate(s.manpowerSchema),
    c.create('createManpower'),
  );
  r.get(
    '/manpower-plans/:id',
    p('manpower_plan.view'),
    validate(s.idParams, 'params'),
    c.detail('manpower', 'manpower_plan.view'),
  );
  for (const x of ['submitted', 'approved', 'rejected', 'closed', 'cancelled'])
    action(
      '/manpower-plans/:id',
      'manpower',
      x,
      x === 'approved' || x === 'rejected' ? 'manpower_plan.approve' : 'manpower_plan.update',
    );
  r.get(
    '/requisitions',
    p('job_requisition.view'),
    validate(s.listQuery, 'query'),
    c.list('requisition', 'job_requisition.view'),
  );
  r.post(
    '/requisitions',
    p('job_requisition.create'),
    validate(s.requisitionSchema),
    c.create('createRequisition'),
  );
  r.get(
    '/requisitions/:id',
    p('job_requisition.view'),
    validate(s.idParams, 'params'),
    c.detail('requisition', 'job_requisition.view'),
  );
  for (const x of ['submitted', 'approved', 'rejected', 'open', 'filled', 'closed', 'cancelled'])
    action(
      '/requisitions/:id',
      'requisition',
      x,
      x === 'approved' || x === 'rejected' ? 'job_requisition.approve' : 'job_requisition.update',
    );
  r.get(
    '/postings',
    p('job_posting.view'),
    validate(s.listQuery, 'query'),
    c.list('posting', 'job_posting.view'),
  );
  r.post(
    '/postings',
    p('job_posting.create'),
    validate(s.postingSchema),
    c.create('createPosting'),
  );
  r.get(
    '/postings/:id',
    p('job_posting.view'),
    validate(s.idParams, 'params'),
    c.detail('posting', 'job_posting.view'),
  );
  for (const x of ['published', 'closed', 'withdrawn'])
    action('/postings/:id', 'posting', x, 'job_posting.update');
  r.get(
    '/candidates',
    p('candidate.view'),
    validate(s.listQuery, 'query'),
    c.list('recruitment_candidates', 'candidate.view'),
  );
  r.post(
    '/candidates',
    p('candidate.create'),
    validate(s.candidateSchema),
    c.create('createCandidate'),
  );
  r.get(
    '/candidates/:id',
    p('candidate.view'),
    validate(s.idParams, 'params'),
    c.detail('recruitment_candidates', 'candidate.view'),
  );
  r.get(
    '/candidates/:id/sensitive',
    p('recruitment_sensitive.view'),
    validate(s.idParams, 'params'),
    c.detail('recruitment_candidates', 'recruitment_sensitive.view', true),
  );
  r.get(
    '/applications',
    p('recruitment_application.view'),
    validate(s.listQuery, 'query'),
    c.list('candidate_applications', 'recruitment_application.view'),
  );
  r.post(
    '/applications',
    p('recruitment_application.create'),
    validate(s.applicationSchema),
    c.create('createApplication'),
  );
  r.get(
    '/applications/:id',
    p('recruitment_application.view'),
    validate(s.idParams, 'params'),
    c.detail('candidate_applications', 'recruitment_application.view'),
  );
  r.post(
    '/applications/:id/screen',
    p('recruitment_application.screen'),
    validate(s.idParams, 'params'),
    validate(s.screeningSchema),
    c.screen,
  );
  r.get(
    '/interviews',
    p('recruitment_interview.view'),
    validate(s.listQuery, 'query'),
    c.list('recruitment_interviews', 'recruitment_interview.view'),
  );
  r.post(
    '/interviews',
    p('recruitment_interview.create'),
    validate(s.interviewSchema),
    c.create('createInterview'),
  );
  r.get(
    '/interviews/:id',
    p('recruitment_interview.view'),
    validate(s.idParams, 'params'),
    c.detail('recruitment_interviews', 'recruitment_interview.view'),
  );
  r.get(
    '/assessments',
    p('recruitment_assessment.view'),
    validate(s.listQuery, 'query'),
    c.list('recruitment_assessments', 'recruitment_assessment.view'),
  );
  r.post(
    '/assessments',
    p('recruitment_assessment.create'),
    validate(s.assessmentSchema),
    c.create('createAssessment'),
  );
  r.get(
    '/assessments/:id',
    p('recruitment_assessment.view'),
    validate(s.idParams, 'params'),
    c.detail('recruitment_assessments', 'recruitment_assessment.view'),
  );
  r.get(
    '/offers',
    p('recruitment_offer.view'),
    validate(s.listQuery, 'query'),
    c.list('offer', 'recruitment_offer.view'),
  );
  r.post(
    '/offers',
    p('recruitment_offer.create'),
    validate(s.offerSchema),
    c.create('createOffer'),
  );
  r.get(
    '/offers/:id',
    p('recruitment_offer.view'),
    validate(s.idParams, 'params'),
    c.detail('offer', 'recruitment_offer.view'),
  );
  for (const x of [
    'submitted',
    'approved',
    'rejected',
    'issued',
    'accepted',
    'declined',
    'expired',
    'withdrawn',
  ])
    action(
      '/offers/:id',
      'offer',
      x,
      x === 'approved' || x === 'rejected'
        ? 'recruitment_offer.approve'
        : 'recruitment_offer.update',
    );
  r.post(
    '/offers/:id/convert',
    p('recruitment_hire.convert'),
    validate(s.idParams, 'params'),
    validate(s.convertSchema),
    c.convert,
  );
  return r;
}
