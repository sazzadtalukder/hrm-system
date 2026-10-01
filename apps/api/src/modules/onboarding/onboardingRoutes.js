import { Router } from 'express';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import * as s from './onboardingSchemas.js';
export function createOnboardingRouter({
  authenticate,
  authorizationService,
  onboardingController: c,
}) {
  const r = Router(),
    p = (x) => requirePermission(authorizationService, x);
  r.use(authenticate);
  r.get(
    '/templates',
    p('onboarding_template.view'),
    validate(s.listQuery, 'query'),
    c.list('onboarding_templates', 'onboarding_template.view'),
  );
  r.post(
    '/templates',
    p('onboarding_template.create'),
    validate(s.templateSchema),
    c.createTemplate,
  );
  r.get(
    '/templates/:id',
    p('onboarding_template.view'),
    validate(s.idParams, 'params'),
    c.get('onboarding_templates', 'onboarding_template.view'),
  );
  r.post(
    '/templates/:id/tasks',
    p('onboarding_template.update'),
    validate(s.idParams, 'params'),
    validate(s.templateTaskSchema),
    c.addTemplateTask,
  );
  for (const x of ['active', 'inactive'])
    r.post(
      `/templates/:id/${x}`,
      p('onboarding_template.update'),
      validate(s.idParams, 'params'),
      validate(s.actionSchema),
      c.templateTransition(x),
    );
  r.get(
    '/cases',
    p('onboarding_case.view'),
    validate(s.listQuery, 'query'),
    c.list('onboarding_cases', 'onboarding_case.view'),
  );
  r.get(
    '/cases/my',
    p('onboarding_case.view_own'),
    validate(s.listQuery, 'query'),
    c.list('onboarding_cases', 'onboarding_case.view_own'),
  );
  r.post('/cases', p('onboarding_case.create'), validate(s.caseSchema), c.createCase);
  r.get(
    '/cases/my/:id',
    p('onboarding_case.view_own'),
    validate(s.idParams, 'params'),
    c.get('onboarding_cases', 'onboarding_case.view_own'),
  );
  r.get(
    '/cases/:id',
    p('onboarding_case.view'),
    validate(s.idParams, 'params'),
    c.get('onboarding_cases', 'onboarding_case.view'),
  );
  for (const x of ['in_progress', 'joined', 'completed', 'cancelled'])
    r.post(
      `/cases/:id/${x}`,
      p('onboarding_case.update'),
      validate(s.idParams, 'params'),
      validate(s.actionSchema),
      c.caseTransition(x),
    );
  for (const x of ['complete', 'waive', 'start'])
    r.post(
      `/cases/tasks/:id/${x}`,
      p(x === 'waive' ? 'onboarding_task.waive' : 'onboarding_task.update'),
      validate(s.idParams, 'params'),
      validate(s.taskActionSchema),
      c.taskAction(x === 'complete' ? 'completed' : x === 'start' ? 'in_progress' : 'waived'),
    );
  r.post(
    '/cases/:id/readiness',
    p('onboarding_readiness.confirm'),
    validate(s.idParams, 'params'),
    validate(s.readinessSchema),
    c.readiness,
  );
  r.get(
    '/cases/:id/tasks',
    p('onboarding_case.view'),
    validate(s.idParams, 'params'),
    c.children('onboarding_case_tasks', 'onboarding_case.view'),
  );
  r.get(
    '/cases/:id/documents',
    p('onboarding_case.view'),
    validate(s.idParams, 'params'),
    c.children('onboarding_document_requirements', 'onboarding_case.view'),
  );
  r.post(
    '/cases/:id/documents',
    p('onboarding_case.update'),
    validate(s.idParams, 'params'),
    validate(s.documentSchema),
    c.addDocument,
  );
  r.get(
    '/cases/:id/resource-requests',
    p('onboarding_case.view'),
    validate(s.idParams, 'params'),
    c.children('onboarding_resource_requests', 'onboarding_case.view'),
  );
  r.post(
    '/cases/:id/resource-requests',
    p('onboarding_case.update'),
    validate(s.idParams, 'params'),
    validate(s.resourceSchema),
    c.addResource,
  );
  r.get(
    '/cases/:id/milestones',
    p('onboarding_case.view'),
    validate(s.idParams, 'params'),
    c.children('onboarding_probation_milestones', 'onboarding_case.view'),
  );
  r.get(
    '/cases/:id/readiness',
    p('onboarding_case.view'),
    validate(s.idParams, 'params'),
    c.children('onboarding_readiness_checks', 'onboarding_case.view'),
  );
  r.get(
    '/cases/:id/history',
    p('onboarding_case.view'),
    validate(s.idParams, 'params'),
    c.children('onboarding_case_state_events', 'onboarding_case.view'),
  );
  r.get(
    '/cases/:id/task-history',
    p('onboarding_case.view'),
    validate(s.idParams, 'params'),
    c.children('onboarding_case_task_state_events', 'onboarding_case.view'),
  );
  return r;
}
