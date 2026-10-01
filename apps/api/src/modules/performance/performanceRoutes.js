import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  acknowledgmentSchema,
  assessmentSchema,
  competencySchema,
  cycleSchema,
  exportQuery,
  goalParams,
  idParams,
  listQuery,
  populationSchema,
  reassignmentSchema,
  scaleSchema,
  templateSchema,
  transitionSchema,
  goalSchema,
} from './performanceSchemas.js';
export function createPerformanceRouter({
  authenticate,
  authorizationService,
  performanceController: c,
}) {
  const r = Router(),
    p = (x) => requirePermission(authorizationService, x);
  r.use(authenticate);
  r.get('/limits', p('performance_review.view_own'), c.limits);
  r.get(
    '/rating-scales',
    p('performance_rating_scale.view'),
    validate(listQuery, 'query'),
    c.scales,
  );
  r.post(
    '/rating-scales',
    p('performance_rating_scale.create'),
    validate(scaleSchema),
    c.createScale,
  );
  r.get(
    '/competencies',
    p('performance_competency.view'),
    validate(listQuery, 'query'),
    c.competencies,
  );
  r.post(
    '/competencies',
    p('performance_competency.create'),
    validate(competencySchema),
    c.createCompetency,
  );
  r.get('/templates', p('performance_template.view'), validate(listQuery, 'query'), c.templates);
  r.post(
    '/templates',
    p('performance_template.create'),
    validate(templateSchema),
    c.createTemplate,
  );
  r.get('/cycles', p('performance_cycle.view'), validate(listQuery, 'query'), c.cycles);
  r.post('/cycles', p('performance_cycle.create'), validate(cycleSchema), c.createCycle);
  r.post(
    '/cycles/:id/population',
    p('performance_cycle.populate'),
    validate(idParams, 'params'),
    validate(populationSchema),
    c.populate,
  );
  for (const [x, t] of [
    ['activate', 'active'],
    ['open-review', 'review_open'],
    ['close', 'closed'],
    ['cancel', 'cancelled'],
  ])
    r.post(
      `/cycles/:id/${x}`,
      p(`performance_cycle.${x === 'open-review' ? 'open_review' : x}`),
      validate(idParams, 'params'),
      validate(transitionSchema),
      c.cycleTransition(t, `performance_cycle.${x === 'open-review' ? 'open_review' : x}`),
    );
  r.get('/export.csv', p('performance_review.export'), validate(exportQuery, 'query'), c.export);
  r.get(
    '/my',
    p('performance_review.view_own'),
    validate(listQuery, 'query'),
    c.list('performance_review.view_own'),
  );
  r.get(
    '/team',
    p('performance_review.view_team'),
    validate(listQuery, 'query'),
    c.list('performance_review.view_team'),
  );
  r.get(
    '/',
    p('performance_review.view'),
    validate(listQuery, 'query'),
    c.list('performance_review.view'),
  );
  r.get(
    '/my/:id',
    p('performance_review.view_own'),
    validate(idParams, 'params'),
    c.get('performance_review.view_own'),
  );
  r.get(
    '/my/:id/history',
    p('performance_review.view_own'),
    validate(idParams, 'params'),
    c.history('performance_review.view_own'),
  );
  r.get(
    '/team/:id',
    p('performance_review.view_team'),
    validate(idParams, 'params'),
    c.get('performance_review.view_team'),
  );
  r.get(
    '/team/:id/history',
    p('performance_review.view_team'),
    validate(idParams, 'params'),
    c.history('performance_review.view_team'),
  );
  r.get(
    '/:id',
    p('performance_review.view'),
    validate(idParams, 'params'),
    c.get('performance_review.view'),
  );
  r.post(
    '/:id/goals',
    p('performance_goal.create'),
    validate(idParams, 'params'),
    validate(goalSchema),
    c.goal,
  );
  r.patch(
    '/:id/goals/:goalId',
    p('performance_goal.update_draft'),
    validate(goalParams, 'params'),
    validate(goalSchema),
    c.updateGoal(false),
  );
  r.post(
    '/:id/goals/:goalId/corrections',
    p('performance_review.correct_history'),
    validate(goalParams, 'params'),
    validate(goalSchema),
    c.updateGoal(true),
  );
  for (const [x, t, permission] of [
    ['submit', 'goals_submitted', 'performance_goal.submit'],
    ['approve', 'goals_approved', 'performance_goal.approve'],
    ['return', 'goals_returned', 'performance_goal.return'],
  ])
    r.post(
      `/:id/goals/${x}`,
      p(permission),
      validate(idParams, 'params'),
      validate(transitionSchema),
      c.goalTransition(t, permission),
    );
  r.post(
    '/:id/self-assessment/submit',
    p('performance_self_assessment.submit'),
    validate(idParams, 'params'),
    validate(assessmentSchema),
    c.assessment('self', 'performance_self_assessment.submit'),
  );
  r.post(
    '/:id/manager-assessment/submit',
    p('performance_manager_assessment.submit'),
    validate(idParams, 'params'),
    validate(assessmentSchema),
    c.assessment('manager', 'performance_manager_assessment.submit'),
  );
  r.post(
    '/:id/acknowledgment',
    p('performance_review.acknowledge'),
    validate(idParams, 'params'),
    validate(acknowledgmentSchema),
    c.acknowledge,
  );
  for (const [x, t, permission] of [
    ['finalize', 'finalized', 'performance_review.finalize'],
    [
      'finalize-without-acknowledgment',
      'finalized_without_acknowledgment',
      'performance_review.finalize_without_acknowledgment',
    ],
    ['cancel', 'cancelled', 'performance_review.cancel'],
  ])
    r.post(
      `/:id/${x}`,
      p(permission),
      validate(idParams, 'params'),
      validate(transitionSchema),
      c.finalTransition(t, permission),
    );
  r.post(
    '/:id/reassign-manager',
    p('performance_review.reassign_manager'),
    validate(idParams, 'params'),
    validate(reassignmentSchema),
    c.reassign,
  );
  r.get(
    '/:id/history',
    p('performance_review.view'),
    validate(idParams, 'params'),
    c.history('performance_review.view'),
  );
  return r;
}
