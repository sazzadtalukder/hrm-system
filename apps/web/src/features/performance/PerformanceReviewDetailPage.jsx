import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ActionDialog } from '../../components/ui/ActionDialog.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { getEmployees } from '../employees/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createGoal, getPerformanceReview, performanceAction, updateGoal } from './api.js';

const field = 'mt-1 w-full rounded-md border border-subtle bg-surface p-2';
const editableStates = ['goals_draft', 'goals_returned'];
const cancellableStates = [
  'goals_draft',
  'goals_submitted',
  'goals_returned',
  'goals_approved',
  'self_review_submitted',
];

function GoalForm({ goal, pending, onCancel, onSubmit }) {
  return (
    <form
      className="grid gap-3 rounded-md border border-subtle p-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          title: data.get('title'),
          description: data.get('description'),
          measurementCriteria: data.get('criteria'),
          targetValue: data.get('target'),
          weight: data.get('weight') ? Number(data.get('weight')) : null,
          dueDate: data.get('due'),
          reason: data.get('reason'),
          ...(goal ? { version: goal.version } : {}),
        });
      }}
    >
      <label>
        Goal title
        <input className={field} defaultValue={goal?.title ?? ''} name="title" required />
      </label>
      <label>
        Target value
        <input className={field} defaultValue={goal?.target_value ?? ''} name="target" required />
      </label>
      <label className="sm:col-span-2">
        Description
        <textarea
          className={field}
          defaultValue={goal?.description ?? ''}
          name="description"
          required
        />
      </label>
      <label className="sm:col-span-2">
        Measurement criteria
        <textarea
          className={field}
          defaultValue={goal?.measurement_criteria ?? ''}
          name="criteria"
          required
        />
      </label>
      <label>
        Weight
        <input
          className={field}
          defaultValue={goal?.weight ?? ''}
          max="100"
          min="1"
          name="weight"
          type="number"
        />
      </label>
      <label>
        Due date
        <input
          className={field}
          defaultValue={goal?.due_date ? String(goal.due_date).slice(0, 10) : ''}
          name="due"
          type="date"
          required
        />
      </label>
      <label className="sm:col-span-2">
        Reason
        <input className={field} maxLength={500} name="reason" required />
      </label>
      <div className="flex gap-2">
        <Button disabled={pending} type="submit">
          {goal ? 'Save goal version' : 'Add goal'}
        </Button>
        {goal && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel edit
          </Button>
        )}
      </div>
    </form>
  );
}

function AssessmentForm({ review, manager, pending, submit }) {
  return (
    <form
      className="space-y-4 rounded-lg border border-subtle bg-surface p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const rating = (name) => (data.get(name) ? Number(data.get(name)) : null);
        const goalRatings = review.goals
          .map((goal) => ({
            targetId: goal.goal_version_id,
            ratingLevelId: rating(`goal-${goal.goal_version_id}`),
            comment: data.get(`goal-comment-${goal.goal_version_id}`) || null,
          }))
          .filter((item) => item.ratingLevelId);
        const competencyRatings = review.competencies
          .map((competency) => ({
            targetId: competency.competency_version_id,
            ratingLevelId: rating(`competency-${competency.competency_version_id}`),
            comment: data.get(`competency-comment-${competency.competency_version_id}`) || null,
          }))
          .filter((item) => item.ratingLevelId);
        if (
          !globalThis.confirm(
            `Submit ${manager ? 'manager' : 'self'} assessment? This submission is immutable.`,
          )
        )
          return;
        submit({
          path: manager ? 'manager-assessment/submit' : 'self-assessment/submit',
          body: {
            workflowVersion: review.workflow_version,
            overallComment: data.get('comment'),
            strengthsComment: data.get('strengths') || null,
            developmentComment: data.get('development') || null,
            overallRatingLevelId: manager ? Number(data.get('overallRating')) : null,
            goalRatings,
            competencyRatings,
            reason: data.get('reason'),
            idempotencyKey: crypto.randomUUID(),
          },
        });
      }}
    >
      <h3 className="font-semibold">{manager ? 'Manager assessment' : 'Self-assessment'}</h3>
      <p className="text-sm text-secondary">
        {manager
          ? 'Select the authoritative overall rating. Individual ratings support, but do not calculate, that decision.'
          : 'Your ratings are advisory. The manager selects the authoritative overall rating.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Overall comments
          <textarea className={field} name="comment" required />
        </label>
        <label>
          Strengths
          <textarea className={field} name="strengths" />
        </label>
        <label>
          Development needs
          <textarea className={field} name="development" />
        </label>
        {manager && (
          <label>
            Authoritative overall rating
            <select className={field} name="overallRating" required>
              <option value="">Select rating</option>
              {review.ratingLevels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.label} ({level.level_value})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {review.goals.length > 0 && (
        <div>
          <h4 className="font-medium">Goal ratings</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {review.goals.map((goal) => (
              <div className="rounded border border-subtle p-3" key={goal.id}>
                <p className="font-medium">{goal.title}</p>
                <select className={field} name={`goal-${goal.goal_version_id}`}>
                  <option value="">Not rated</option>
                  {review.ratingLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
                <input
                  className={field}
                  maxLength={1000}
                  name={`goal-comment-${goal.goal_version_id}`}
                  placeholder="Optional comment"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {review.competencies.length > 0 && (
        <div>
          <h4 className="font-medium">Competency ratings</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {review.competencies.map((competency) => (
              <div
                className="rounded border border-subtle p-3"
                key={competency.competency_version_id}
              >
                <p className="font-medium">{competency.name}</p>
                <p className="text-sm text-secondary">{competency.description}</p>
                <select className={field} name={`competency-${competency.competency_version_id}`}>
                  <option value="">Not rated</option>
                  {review.ratingLevels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
                <input
                  className={field}
                  maxLength={1000}
                  name={`competency-comment-${competency.competency_version_id}`}
                  placeholder="Optional comment"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <label>
        Submission reason
        <input className={field} maxLength={500} name="reason" required />
      </label>
      <Button disabled={pending} type="submit">
        Submit assessment
      </Button>
    </form>
  );
}

export function PerformanceReviewDetailPage({ view = 'all' }) {
  const { id } = useParams();
  const auth = useAuth();
  const company = useOrganizationCompany();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [editingGoal, setEditingGoal] = useState(null);
  const query = useQuery({
    queryKey: ['performance-review', id, view],
    queryFn: () => getPerformanceReview(id, view),
  });
  const managers = useQuery({
    queryKey: ['performance-managers', company.company?.id],
    queryFn: () => getEmployees(company.company.id, { pageSize: 100 }),
    enabled: Boolean(
      company.company && auth.permissions.includes('performance_review.reassign_manager'),
    ),
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ['performance-review', id] });
    client.invalidateQueries({ queryKey: ['performance-reviews'] });
    client.invalidateQueries({ queryKey: ['performance-history', id] });
  };
  const actionMutation = useMutation({
    mutationFn: ({ path, body }) => performanceAction(id, path, body),
    onSuccess: (result) => {
      setMessage(
        `Action completed${result.status ? `: ${result.status.replaceAll('_', ' ')}` : ''}.`,
      );
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  const goalMutation = useMutation({
    mutationFn: ({ goalId, body }) =>
      goalId ? updateGoal(id, goalId, body) : createGoal(id, body),
    onSuccess: () => {
      setMessage(editingGoal ? 'Goal version updated.' : 'Goal created.');
      setEditingGoal(null);
      refresh();
    },
    onError: (error) => setMessage(error.message),
  });
  if (
    query.isPending ||
    company.isPending ||
    (auth.permissions.includes('performance_review.reassign_manager') && managers.isPending)
  )
    return <LoadingState />;
  if (
    query.error ||
    company.error ||
    (auth.permissions.includes('performance_review.reassign_manager') && managers.error)
  )
    return <ErrorState error={query.error ?? company.error ?? managers.error} />;
  const review = query.data;
  const weightTotal = review.goals.reduce((total, goal) => total + Number(goal.weight ?? 0), 0);
  const goalCountValid =
    review.goals.length >= review.template.minimum_goal_count &&
    review.goals.length <= review.template.maximum_goal_count;
  const weightsValid = !review.template.goal_weights_enabled || weightTotal === 100;
  const canEditGoals = editableStates.includes(review.status);
  const historyPath =
    view === 'own'
      ? `/performance/my/${id}/history`
      : view === 'team'
        ? `/performance/team/${id}/history`
        : `/performance/${id}/history`;
  const ratingLabel = (idValue) =>
    review.ratingLevels.find((level) => Number(level.id) === Number(idValue))?.label ?? 'Not rated';
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{review.employee_name_snapshot}</h2>
            <p>
              {review.employee_code_snapshot} · {review.cycle_name}
            </p>
            <p className="text-sm text-secondary">
              Review period {String(review.review_period_start).slice(0, 10)}–
              {String(review.review_period_end).slice(0, 10)}
            </p>
          </div>
          <StatusBadge status={review.status} />
        </div>
        <Link className="mt-3 inline-block text-accent" to={historyPath}>
          View history
        </Link>
      </section>
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <h3 className="font-semibold">Goals</h3>
            <p className="text-sm text-secondary">
              Required {review.template.minimum_goal_count}–{review.template.maximum_goal_count}
              {review.template.goal_weights_enabled ? ` · Current weight ${weightTotal}/100` : ''}
            </p>
          </div>
        </div>
        {!review.goals.length ? (
          <EmptyState message="No goals have been drafted." />
        ) : (
          <div className="mt-3 space-y-3">
            {review.goals.map((goal) => (
              <article className="rounded border border-subtle p-3" key={goal.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-medium">{goal.title}</p>
                    <p className="text-sm text-secondary">
                      Target: {goal.target_value} · Due {String(goal.due_date).slice(0, 10)}
                      {review.template.goal_weights_enabled ? ` · Weight ${goal.weight ?? 0}` : ''}
                    </p>
                    <p className="mt-1 text-sm">{goal.measurement_criteria}</p>
                  </div>
                  <StatusBadge status={goal.status} />
                </div>
                {canEditGoals && auth.permissions.includes('performance_goal.update_draft') && (
                  <Button className="mt-2" variant="secondary" onClick={() => setEditingGoal(goal)}>
                    Edit goal
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}
        {canEditGoals && auth.permissions.includes('performance_goal.create') && (
          <div className="mt-4">
            <h4 className="mb-2 font-medium">{editingGoal ? 'Edit goal' : 'Add goal'}</h4>
            <GoalForm
              goal={editingGoal}
              pending={goalMutation.isPending}
              onCancel={() => setEditingGoal(null)}
              onSubmit={(body) => goalMutation.mutate({ goalId: editingGoal?.id, body })}
            />
          </div>
        )}
        {canEditGoals && auth.permissions.includes('performance_goal.submit') && (
          <div className="mt-4">
            <Button
              disabled={!goalCountValid || !weightsValid || actionMutation.isPending}
              onClick={() => setPendingAction('goals/submit')}
            >
              Submit goals for approval
            </Button>
            {!goalCountValid && (
              <p className="mt-2 text-sm text-red-700">
                Create between {review.template.minimum_goal_count} and{' '}
                {review.template.maximum_goal_count} goals before submission.
              </p>
            )}
            {!weightsValid && (
              <p className="mt-2 text-sm text-red-700">
                Goal weights must total exactly 100 before submission.
              </p>
            )}
          </div>
        )}
      </section>
      {review.competencies.length > 0 && (
        <section className="rounded-lg border border-subtle bg-surface p-6">
          <h3 className="font-semibold">Competencies</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {review.competencies.map((competency) => (
              <article
                className="rounded border border-subtle p-3"
                key={competency.competency_version_id}
              >
                <p className="font-medium">
                  {competency.code} · {competency.name}
                </p>
                <p className="text-sm text-secondary">{competency.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      {review.status === 'goals_submitted' && (
        <div className="flex flex-wrap gap-2">
          {auth.permissions.includes('performance_goal.approve') && (
            <Button onClick={() => setPendingAction('goals/approve')}>Approve goals</Button>
          )}
          {auth.permissions.includes('performance_goal.return') && (
            <Button variant="secondary" onClick={() => setPendingAction('goals/return')}>
              Return goals
            </Button>
          )}
        </div>
      )}
      {review.status === 'goals_approved' &&
        auth.permissions.includes('performance_self_assessment.submit') && (
          <AssessmentForm
            pending={actionMutation.isPending}
            review={review}
            submit={(variables) => actionMutation.mutate(variables)}
          />
        )}
      {review.status === 'self_review_submitted' &&
        auth.permissions.includes('performance_manager_assessment.submit') && (
          <AssessmentForm
            manager
            pending={actionMutation.isPending}
            review={review}
            submit={(variables) => actionMutation.mutate(variables)}
          />
        )}
      {review.assessments.length > 0 && (
        <section className="rounded-lg border border-subtle bg-surface p-6">
          <h3 className="font-semibold">Submitted assessments</h3>
          <div className="mt-3 space-y-3">
            {review.assessments.map((assessment) => (
              <article className="rounded border border-subtle p-4" key={assessment.id}>
                <div className="flex justify-between gap-2">
                  <p className="font-medium">
                    {assessment.assessment_type === 'manager'
                      ? 'Manager assessment'
                      : 'Self-assessment'}
                  </p>
                  {assessment.assessment_type === 'manager' && (
                    <span>{ratingLabel(assessment.overall_rating_level_id)}</span>
                  )}
                </div>
                <p className="mt-2">{assessment.overall_comment}</p>
                {assessment.strengths_comment && (
                  <p className="mt-1 text-sm">
                    <strong>Strengths:</strong> {assessment.strengths_comment}
                  </p>
                )}
                {assessment.development_comment && (
                  <p className="mt-1 text-sm">
                    <strong>Development:</strong> {assessment.development_comment}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      {review.status === 'manager_review_submitted' &&
        auth.permissions.includes('performance_review.acknowledge') && (
          <form
            className="grid gap-3 rounded-lg border border-subtle bg-surface p-6 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              if (!globalThis.confirm('Acknowledge receipt of this review?')) return;
              actionMutation.mutate({
                path: 'acknowledgment',
                body: {
                  workflowVersion: review.workflow_version,
                  acknowledgment: data.get('acknowledgment'),
                  comment: data.get('comment') || null,
                  reason: data.get('reason'),
                  idempotencyKey: crypto.randomUUID(),
                },
              });
            }}
          >
            <h3 className="sm:col-span-2 font-semibold">Employee acknowledgment</h3>
            <label>
              Acknowledgment
              <select className={field} name="acknowledgment" required>
                <option value="acknowledged">Acknowledged</option>
                <option value="acknowledged_with_comment">
                  Acknowledged with disagreement/comment
                </option>
              </select>
            </label>
            <label>
              Comment
              <textarea className={field} name="comment" />
            </label>
            <label className="sm:col-span-2">
              Reason
              <input className={field} name="reason" required />
            </label>
            <Button disabled={actionMutation.isPending} type="submit">
              Acknowledge receipt
            </Button>
          </form>
        )}
      <div className="flex flex-wrap gap-2">
        {review.status === 'employee_acknowledged' &&
          auth.permissions.includes('performance_review.finalize') && (
            <Button onClick={() => setPendingAction('finalize')}>Finalize review</Button>
          )}
        {review.status === 'manager_review_submitted' &&
          auth.permissions.includes('performance_review.finalize_without_acknowledgment') && (
            <Button
              variant="secondary"
              onClick={() => setPendingAction('finalize-without-acknowledgment')}
            >
              Finalize without acknowledgment
            </Button>
          )}
        {cancellableStates.includes(review.status) &&
          auth.permissions.includes('performance_review.cancel') && (
            <Button variant="secondary" onClick={() => setPendingAction('cancel')}>
              Cancel review
            </Button>
          )}
      </div>
      {auth.permissions.includes('performance_review.reassign_manager') &&
        ![
          'manager_review_submitted',
          'employee_acknowledged',
          'finalized',
          'finalized_without_acknowledgment',
          'cancelled',
        ].includes(review.status) && (
          <form
            className="grid gap-3 rounded-lg border border-subtle bg-surface p-6 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              if (!globalThis.confirm('Reassign this review manager?')) return;
              actionMutation.mutate({
                path: 'reassign-manager',
                body: {
                  workflowVersion: review.workflow_version,
                  managerEmploymentId: Number(data.get('managerEmploymentId')),
                  reason: data.get('reason'),
                  idempotencyKey: crypto.randomUUID(),
                },
              });
            }}
          >
            <h3 className="sm:col-span-2 font-semibold">Reassign manager</h3>
            <label>
              Replacement manager
              <select className={field} name="managerEmploymentId" required>
                <option value="">Select manager</option>
                {managers.data.items
                  .filter(
                    (employee) =>
                      employee.employment &&
                      Number(employee.employment.id) !== Number(review.employment_id),
                  )
                  .map((employee) => (
                    <option key={employee.employment.id} value={employee.employment.id}>
                      {employee.displayName} · {employee.employment.employeeCode} · Employment #
                      {employee.employment.id}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Reason
              <input className={field} name="reason" required />
            </label>
            <Button disabled={actionMutation.isPending} type="submit">
              Reassign manager
            </Button>
          </form>
        )}
      {message && <p role="status">{message}</p>}
      {pendingAction && (
        <ActionDialog
          busy={actionMutation.isPending}
          confirmLabel={pendingAction.replaceAll('/', ' ')}
          onCancel={() => setPendingAction(null)}
          onConfirm={({ reason }) => {
            actionMutation.mutate({
              path: pendingAction,
              body: {
                workflowVersion: review.workflow_version,
                reason,
                idempotencyKey: crypto.randomUUID(),
              },
            });
            setPendingAction(null);
          }}
          title={`Confirm ${pendingAction.replaceAll('/', ' ')}`}
        />
      )}
    </div>
  );
}
