import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getEmployees } from '../employees/api.js';
import { getOrganizationRecords } from '../organization/api.js';
import { getPerformanceConfig } from '../performance/api.js';
import { getTrainingCourses } from '../training/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { createCareerPlan, getCareerPaths } from './api.js';

const field = 'w-full rounded-md border border-subtle p-2';
const newGoal = () => ({ title: '', description: '', targetDate: '', competencyVersionIds: [] });
const newAction = () => ({
  actionType: 'training',
  description: '',
  targetDate: '',
  responsibleParty: 'employee',
  trainingCourseVersionId: '',
});

export function CareerPlanCreatePage() {
  const company = useOrganizationCompany();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [goals, setGoals] = useState([newGoal()]);
  const [actions, setActions] = useState([]);
  const competencies = useQuery({
    queryKey: ['performance-competencies', company.company?.id],
    queryFn: () => getPerformanceConfig('competencies', company.company.id),
    enabled: Boolean(company.company),
    retry: false,
  });
  const courses = useQuery({
    queryKey: ['training-courses', company.company?.id],
    queryFn: () => getTrainingCourses(company.company.id),
    enabled: Boolean(company.company),
    retry: false,
  });
  const employees = useQuery({
    queryKey: ['career-plan-employees', company.company?.id],
    queryFn: () => getEmployees(company.company.id, { pageSize: 100 }),
    enabled: Boolean(company.company),
  });
  const paths = useQuery({
    queryKey: ['career-paths', company.company?.id],
    queryFn: () => getCareerPaths(company.company.id),
    enabled: Boolean(company.company),
  });
  const designations = useQuery({
    queryKey: ['career-designations', company.company?.id],
    queryFn: () => getOrganizationRecords('designations', company.company.id),
    enabled: Boolean(company.company),
  });
  const mutation = useMutation({
    mutationFn: createCareerPlan,
    onSuccess: (result) => navigate(`../${result.id}`),
    onError: (requestError) => setError(requestError.message),
  });

  if (
    company.isPending ||
    competencies.isPending ||
    courses.isPending ||
    employees.isPending ||
    paths.isPending ||
    designations.isPending
  )
    return <LoadingState />;
  if (
    company.error ||
    competencies.error ||
    courses.error ||
    employees.error ||
    paths.error ||
    designations.error
  )
    return (
      <ErrorState
        error={
          company.error ??
          competencies.error ??
          courses.error ??
          employees.error ??
          paths.error ??
          designations.error
        }
      />
    );

  const updateGoal = (index, values) =>
    setGoals((current) =>
      current.map((goal, position) => (position === index ? { ...goal, ...values } : goal)),
    );
  const updateAction = (index, values) =>
    setActions((current) =>
      current.map((action, position) => (position === index ? { ...action, ...values } : action)),
    );

  return (
    <form
      className="grid max-w-4xl gap-4 rounded-lg border border-subtle bg-surface p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        mutation.mutate({
          companyId: company.company.id,
          employmentId: Number(data.get('employment')),
          careerPathVersionId: data.get('pathVersion') ? Number(data.get('pathVersion')) : null,
          targetDesignationId: data.get('designation') ? Number(data.get('designation')) : null,
          careerDirection: data.get('direction') || null,
          employeeNarrative: data.get('narrative') || null,
          planStart: data.get('start'),
          planEnd: data.get('end'),
          goals,
          actions: actions.map((action) => ({
            ...action,
            trainingCourseVersionId: action.trainingCourseVersionId
              ? Number(action.trainingCourseVersionId)
              : null,
          })),
          reason: data.get('reason'),
          idempotencyKey: crypto.randomUUID(),
        });
      }}
    >
      <h2 className="text-xl font-semibold">New career plan</h2>
      <select className={field} name="employment" required>
        <option value="">Select employee</option>
        {employees.data.items
          .filter((employee) => employee.employment)
          .map((employee) => (
            <option key={employee.employment.id} value={employee.employment.id}>
              {employee.displayName} · {employee.employment.employeeCode} · Employment #
              {employee.employment.id}
            </option>
          ))}
      </select>
      <select className={field} name="pathVersion">
        <option value="">No career path</option>
        {paths.data.map((path) => (
          <option key={path.id} value={path.current_version_id}>
            {path.code} · {path.name}
          </option>
        ))}
      </select>
      <select className={field} name="designation">
        <option value="">No target designation</option>
        {designations.data.items.map((designation) => (
          <option key={designation.id} value={designation.id}>
            {designation.code} · {designation.name}
          </option>
        ))}
      </select>
      <input className={field} name="direction" placeholder="Career direction" />
      <textarea className={field} name="narrative" placeholder="Career narrative" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Start
          <input className={field} name="start" type="date" required />
        </label>
        <label>
          End
          <input className={field} name="end" type="date" required />
        </label>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Goals ({goals.length}/20)</h3>
          <Button
            type="button"
            disabled={goals.length >= 20}
            onClick={() => setGoals([...goals, newGoal()])}
          >
            Add goal
          </Button>
        </div>
        {goals.map((goal, index) => (
          <fieldset className="space-y-2 rounded border border-subtle p-3" key={index}>
            <legend>Goal {index + 1}</legend>
            <input
              className={field}
              value={goal.title}
              onChange={(e) => updateGoal(index, { title: e.target.value })}
              placeholder="Title"
              required
            />
            <textarea
              className={field}
              value={goal.description}
              onChange={(e) => updateGoal(index, { description: e.target.value })}
              placeholder="Description"
              required
            />
            <input
              className={field}
              type="date"
              value={goal.targetDate}
              onChange={(e) => updateGoal(index, { targetDate: e.target.value })}
              required
            />
            {competencies.error ? (
              <input
                className={field}
                placeholder="Competency version IDs, comma separated"
                onChange={(e) =>
                  updateGoal(index, {
                    competencyVersionIds: e.target.value
                      .split(',')
                      .map((value) => Number(value.trim()))
                      .filter(Number.isInteger),
                  })
                }
              />
            ) : (
              <select
                className={field}
                multiple
                value={goal.competencyVersionIds.map(String)}
                onChange={(e) =>
                  updateGoal(index, {
                    competencyVersionIds: [...e.target.selectedOptions].map((option) =>
                      Number(option.value),
                    ),
                  })
                }
              >
                {competencies.data.map((competency) => (
                  <option key={competency.version_id} value={competency.version_id}>
                    {competency.code} - {competency.name}
                  </option>
                ))}
              </select>
            )}
            {goals.length > 1 && (
              <Button
                type="button"
                onClick={() => setGoals(goals.filter((_, position) => position !== index))}
              >
                Remove goal
              </Button>
            )}
          </fieldset>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Development actions</h3>
          <Button type="button" onClick={() => setActions([...actions, newAction()])}>
            Add action
          </Button>
        </div>
        {actions.map((action, index) => (
          <fieldset className="space-y-2 rounded border border-subtle p-3" key={index}>
            <legend>Action {index + 1}</legend>
            <select
              className={field}
              value={action.actionType}
              onChange={(e) => updateAction(index, { actionType: e.target.value })}
            >
              {['training', 'coaching', 'project', 'self_development', 'other'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <textarea
              className={field}
              value={action.description}
              onChange={(e) => updateAction(index, { description: e.target.value })}
              placeholder="Description"
              required
            />
            <input
              className={field}
              type="date"
              value={action.targetDate}
              onChange={(e) => updateAction(index, { targetDate: e.target.value })}
              required
            />
            <select
              className={field}
              value={action.responsibleParty}
              onChange={(e) => updateAction(index, { responsibleParty: e.target.value })}
            >
              {['employee', 'manager', 'hr'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            {action.actionType === 'training' &&
              (courses.error ? (
                <input
                  className={field}
                  type="number"
                  value={action.trainingCourseVersionId}
                  onChange={(e) => updateAction(index, { trainingCourseVersionId: e.target.value })}
                  placeholder="Training course version ID"
                  required
                />
              ) : (
                <select
                  className={field}
                  value={action.trainingCourseVersionId}
                  onChange={(e) => updateAction(index, { trainingCourseVersionId: e.target.value })}
                  required
                >
                  <option value="">Select Training course</option>
                  {courses.data.map((course) => (
                    <option key={course.course_version_id} value={course.course_version_id}>
                      {course.code} - {course.name}
                    </option>
                  ))}
                </select>
              ))}
            <Button
              type="button"
              onClick={() => setActions(actions.filter((_, position) => position !== index))}
            >
              Remove action
            </Button>
          </fieldset>
        ))}
      </section>

      <input className={field} name="reason" placeholder="Reason" maxLength={500} required />
      <Button type="submit" disabled={mutation.isPending}>
        Create draft
      </Button>
      {error && <p role="alert">{error}</p>}
      {(competencies.error || courses.error) && (
        <p className="text-sm">
          A catalog selector was unavailable; bounded version-ID entry is shown instead.
        </p>
      )}
      {mutation.error && <ErrorState error={mutation.error} />}
    </form>
  );
}
