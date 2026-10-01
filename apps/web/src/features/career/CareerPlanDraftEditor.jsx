import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { getOrganizationRecords } from '../organization/api.js';
import { getPerformanceConfig } from '../performance/api.js';
import { getTrainingCourses } from '../training/api.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getCareerPaths } from './api.js';

const field = 'w-full rounded-md border border-subtle p-2';
const date = (value) => String(value ?? '').slice(0, 10);
const newGoal = () => ({ title: '', description: '', targetDate: '', competencyVersionIds: [] });
const newAction = () => ({
  actionType: 'training',
  description: '',
  targetDate: '',
  responsibleParty: 'employee',
  trainingCourseVersionId: '',
});

export function CareerPlanDraftEditor({
  plan,
  goals: savedGoals,
  actions: savedActions,
  onSave,
  pending,
}) {
  const company = useOrganizationCompany();
  const [goals, setGoals] = useState(() =>
    savedGoals.map((goal) => ({
      title: goal.title,
      description: goal.description ?? '',
      targetDate: date(goal.target_date),
      competencyVersionIds: goal.competency_version_ids ?? [],
    })),
  );
  const [actions, setActions] = useState(() =>
    savedActions.map((action) => ({
      actionType: action.action_type,
      description: action.description ?? '',
      targetDate: date(action.target_date),
      responsibleParty: action.responsible_party,
      trainingCourseVersionId: action.training_course_version_id ?? '',
    })),
  );
  const competencies = useQuery({
    queryKey: ['performance-competencies', company.company.id],
    queryFn: () => getPerformanceConfig('competencies', company.company.id),
    retry: false,
  });
  const courses = useQuery({
    queryKey: ['training-courses', company.company.id],
    queryFn: () => getTrainingCourses(company.company.id),
    retry: false,
  });
  const paths = useQuery({
    queryKey: ['career-paths', company.company.id],
    queryFn: () => getCareerPaths(company.company.id),
  });
  const designations = useQuery({
    queryKey: ['career-designations', company.company.id],
    queryFn: () => getOrganizationRecords('designations', company.company.id),
  });
  const changeGoal = (index, values) =>
    setGoals((current) =>
      current.map((goal, at) => (at === index ? { ...goal, ...values } : goal)),
    );
  const changeAction = (index, values) =>
    setActions((current) =>
      current.map((action, at) => (at === index ? { ...action, ...values } : action)),
    );

  if (competencies.isPending || courses.isPending || paths.isPending || designations.isPending)
    return <LoadingState />;
  if (paths.error || designations.error)
    return <ErrorState error={paths.error ?? designations.error} />;

  return (
    <form
      className="space-y-4 rounded border border-subtle p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSave({
          version: plan.version,
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
      <h3 className="font-semibold">Edit draft</h3>
      <select className={field} name="pathVersion" defaultValue={plan.career_path_version_id ?? ''}>
        <option value="">No career path</option>
        {paths.data.map((path) => (
          <option key={path.id} value={path.current_version_id}>
            {path.code} · {path.name}
          </option>
        ))}
      </select>
      <select className={field} name="designation" defaultValue={plan.target_designation_id ?? ''}>
        <option value="">No target designation</option>
        {designations.data.items.map((designation) => (
          <option key={designation.id} value={designation.id}>
            {designation.code} · {designation.name}
          </option>
        ))}
      </select>
      <input
        className={field}
        name="direction"
        defaultValue={plan.career_direction ?? ''}
        placeholder="Career direction"
      />
      <textarea
        className={field}
        name="narrative"
        defaultValue={plan.employee_narrative ?? ''}
        placeholder="Career narrative"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Start
          <input
            className={field}
            name="start"
            type="date"
            defaultValue={date(plan.plan_start)}
            required
          />
        </label>
        <label>
          End
          <input
            className={field}
            name="end"
            type="date"
            defaultValue={date(plan.plan_end)}
            required
          />
        </label>
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Goals ({goals.length}/20)</h4>
          <Button
            type="button"
            disabled={goals.length >= 20}
            onClick={() => setGoals((current) => [...current, newGoal()])}
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
              onChange={(event) => changeGoal(index, { title: event.target.value })}
              placeholder="Title"
              required
            />
            <textarea
              className={field}
              value={goal.description}
              onChange={(event) => changeGoal(index, { description: event.target.value })}
              placeholder="Description"
              required
            />
            <input
              className={field}
              type="date"
              value={goal.targetDate}
              onChange={(event) => changeGoal(index, { targetDate: event.target.value })}
              required
            />
            {competencies.error ? (
              <input
                className={field}
                value={goal.competencyVersionIds.join(',')}
                onChange={(event) =>
                  changeGoal(index, {
                    competencyVersionIds: event.target.value
                      .split(',')
                      .map((value) => Number(value.trim()))
                      .filter((value) => Number.isInteger(value) && value > 0),
                  })
                }
                placeholder="Competency version IDs, comma separated"
              />
            ) : (
              <select
                className={field}
                multiple
                value={goal.competencyVersionIds.map(String)}
                onChange={(event) =>
                  changeGoal(index, {
                    competencyVersionIds: [...event.target.selectedOptions].map((option) =>
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
                onClick={() => setGoals((current) => current.filter((_, at) => at !== index))}
              >
                Remove goal
              </Button>
            )}
          </fieldset>
        ))}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Development actions ({actions.length}/50)</h4>
          <Button
            type="button"
            disabled={actions.length >= 50}
            onClick={() => setActions((current) => [...current, newAction()])}
          >
            Add action
          </Button>
        </div>
        {actions.map((action, index) => (
          <fieldset className="space-y-2 rounded border border-subtle p-3" key={index}>
            <legend>Action {index + 1}</legend>
            <select
              className={field}
              value={action.actionType}
              onChange={(event) =>
                changeAction(index, {
                  actionType: event.target.value,
                  trainingCourseVersionId:
                    event.target.value === 'training' ? action.trainingCourseVersionId : '',
                })
              }
            >
              {['training', 'coaching', 'project', 'self_development', 'other'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <textarea
              className={field}
              value={action.description}
              onChange={(event) => changeAction(index, { description: event.target.value })}
              placeholder="Description"
              required
            />
            <input
              className={field}
              type="date"
              value={action.targetDate}
              onChange={(event) => changeAction(index, { targetDate: event.target.value })}
              required
            />
            <select
              className={field}
              value={action.responsibleParty}
              onChange={(event) => changeAction(index, { responsibleParty: event.target.value })}
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
                  onChange={(event) =>
                    changeAction(index, { trainingCourseVersionId: event.target.value })
                  }
                  placeholder="Training course version ID"
                  required
                />
              ) : (
                <select
                  className={field}
                  value={action.trainingCourseVersionId}
                  onChange={(event) =>
                    changeAction(index, { trainingCourseVersionId: event.target.value })
                  }
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
              onClick={() => setActions((current) => current.filter((_, at) => at !== index))}
            >
              Remove action
            </Button>
          </fieldset>
        ))}
      </section>
      <input
        className={field}
        name="reason"
        placeholder="Reason for draft revision"
        maxLength={500}
        required
      />
      <Button type="submit" disabled={pending || goals.length === 0 || goals.length > 20}>
        Save draft version
      </Button>
      {(competencies.error || courses.error || paths.error || designations.error) && (
        <p className="text-sm">
          A catalog selector was unavailable; enter bounded version IDs instead.
        </p>
      )}
      {competencies.error && <ErrorState error={competencies.error} />}
    </form>
  );
}
