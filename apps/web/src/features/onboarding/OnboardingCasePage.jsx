import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { ConfirmActionDialog } from '../../components/ui/ConfirmActionDialog.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import {
  onboardingAction,
  onboardingCaseRequest,
  onboardingGet,
  onboardingTaskAction,
} from './api.js';
export function OnboardingCasePage() {
  const { id } = useParams();
  const location = useLocation();
  const ownCase = location.pathname.startsWith('/onboarding/my/');
  const auth = useAuth();
  const client = useQueryClient();
  const [reason, setReason] = useState('');
  const [document, setDocument] = useState({
    taskId: '',
    documentTypeCode: '',
    documentId: '',
    documentVersionId: '',
    externalReference: '',
  });
  const [resource, setResource] = useState({
    taskId: '',
    requestType: 'equipment',
    resourceName: '',
  });
  const [readiness, setReadiness] = useState({
    readinessType: 'attendance',
    status: 'ready',
    assessedOn: new Date().toISOString().slice(0, 10),
  });
  const result = useQuery({
    queryKey: ['onboarding-case', id, ownCase],
    queryFn: () => onboardingGet(id, ownCase),
  });
  const transition = useMutation({
    mutationFn: (action) =>
      onboardingAction(id, action, {
        workflowVersion: result.data.workflow_version,
        reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['onboarding-case', id] }),
  });
  const taskMutation = useMutation({
    mutationFn: ({ taskId, action, workflowVersion }) =>
      onboardingTaskAction(taskId, action, {
        workflowVersion,
        note: reason || null,
        reason: reason || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['onboarding-case', id] }),
  });
  const documentMutation = useMutation({
    mutationFn: () =>
      onboardingCaseRequest(id, 'documents', {
        onboardingCaseTaskId: Number(document.taskId),
        documentTypeCode: document.documentTypeCode,
        documentId: document.documentId ? Number(document.documentId) : null,
        documentVersionId: document.documentVersionId ? Number(document.documentVersionId) : null,
        externalReference: document.externalReference.trim() || null,
        reason: reason || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['onboarding-case', id] }),
  });
  const resourceMutation = useMutation({
    mutationFn: () =>
      onboardingCaseRequest(id, 'resource-requests', {
        onboardingCaseTaskId: Number(resource.taskId),
        requestType: resource.requestType,
        resourceName: resource.resourceName,
        reason: reason || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['onboarding-case', id] }),
  });
  const readinessMutation = useMutation({
    mutationFn: () =>
      onboardingCaseRequest(id, 'readiness', {
        ...readiness,
        reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['onboarding-case', id] }),
  });
  if (result.isPending) return <LoadingState />;
  if (result.error) return <ErrorState error={result.error} />;
  const row = result.data;
  return (
    <section>
      <Link className="text-sm text-blue-700" to="..">
        ← Cases
      </Link>
      <h2 className="mt-3 text-xl font-semibold">Onboarding case #{id}</h2>
      <p className="mt-1">
        <span className="rounded bg-slate-100 px-2 py-1">{row.status}</span>
      </p>
      <label className="mt-4 block text-sm">
        Action reason
        <textarea
          className="mt-1 w-full rounded border p-2"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {(
          {
            pre_joining: ['in_progress', 'cancelled'],
            in_progress: ['joined', 'cancelled'],
            joined: ['completed', 'cancelled'],
          }[row.status] ?? []
        ).map((action) => (
          <ConfirmActionDialog
            key={action}
            label={action.replaceAll('_', ' ')}
            disabled={
              !reason ||
              transition.isPending ||
              !auth.permissions.includes('onboarding_case.update')
            }
            onConfirm={() => transition.mutate(action)}
          />
        ))}
      </div>
      {transition.error ? <ErrorState error={transition.error} /> : null}
      <section className="mt-5">
        <h3 className="font-semibold">Checklist</h3>
        <div className="mt-2 divide-y rounded border bg-white">
          {row.tasks?.map((task) => (
            <div className="p-3" key={task.id}>
              <strong>{task.title_snapshot}</strong>
              <span className="ml-2 text-sm text-slate-600">{task.status}</span>
              {task.is_mandatory ? (
                <span className="ml-2 text-xs text-amber-700">Required</span>
              ) : null}
              {auth.permissions.includes('onboarding_task.update') &&
              ['pending', 'in_progress'].includes(task.status) ? (
                <div className="mt-2 flex gap-2">
                  {task.status === 'pending' ? (
                    <ConfirmActionDialog
                      label="Start"
                      disabled={taskMutation.isPending}
                      onConfirm={() =>
                        taskMutation.mutate({
                          taskId: task.id,
                          action: 'start',
                          workflowVersion: task.workflow_version,
                        })
                      }
                    />
                  ) : null}
                  <ConfirmActionDialog
                    label="Complete"
                    disabled={taskMutation.isPending}
                    onConfirm={() =>
                      taskMutation.mutate({
                        taskId: task.id,
                        action: 'complete',
                        workflowVersion: task.workflow_version,
                      })
                    }
                  />
                </div>
              ) : null}
              {auth.permissions.includes('onboarding_task.waive') &&
              !['completed', 'waived'].includes(task.status) ? (
                <div className="mt-2">
                  <ConfirmActionDialog
                    label="Waive"
                    disabled={!reason || taskMutation.isPending}
                    onConfirm={() =>
                      taskMutation.mutate({
                        taskId: task.id,
                        action: 'waive',
                        workflowVersion: task.workflow_version,
                      })
                    }
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {taskMutation.error ? <ErrorState error={taskMutation.error} /> : null}
      </section>
      {auth.permissions.includes('onboarding_case.update') ? (
        <section className="mt-5 grid gap-4 rounded border bg-white p-4 lg:grid-cols-2">
          <div>
            <h3 className="font-semibold">Document evidence</h3>
            <select
              className="mt-2 w-full rounded border p-2"
              value={document.taskId}
              onChange={(event) => setDocument({ ...document, taskId: event.target.value })}
            >
              <option value="">Select case task</option>
              {row.tasks?.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title_snapshot}
                </option>
              ))}
            </select>
            <input
              className="mt-2 w-full rounded border p-2"
              placeholder="Document type"
              value={document.documentTypeCode}
              onChange={(event) =>
                setDocument({ ...document, documentTypeCode: event.target.value })
              }
            />
            <input
              className="mt-2 w-full rounded border p-2"
              min="1"
              placeholder="Document ID (optional)"
              type="number"
              value={document.documentId}
              onChange={(event) => setDocument({ ...document, documentId: event.target.value })}
            />
            <input
              className="mt-2 w-full rounded border p-2"
              min="1"
              placeholder="Document version ID (optional)"
              type="number"
              value={document.documentVersionId}
              onChange={(event) =>
                setDocument({ ...document, documentVersionId: event.target.value })
              }
            />
            <input
              className="mt-2 w-full rounded border p-2"
              placeholder="External evidence reference"
              value={document.externalReference}
              onChange={(event) =>
                setDocument({ ...document, externalReference: event.target.value })
              }
            />
            <ConfirmActionDialog
              label="Record document evidence"
              disabled={
                !document.taskId ||
                !document.documentTypeCode ||
                (!document.documentId &&
                  !document.documentVersionId &&
                  !document.externalReference.trim()) ||
                documentMutation.isPending
              }
              onConfirm={() => documentMutation.mutate()}
            />
          </div>
          <div>
            <h3 className="font-semibold">Resource request</h3>
            <select
              className="mt-2 w-full rounded border p-2"
              value={resource.taskId}
              onChange={(event) => setResource({ ...resource, taskId: event.target.value })}
            >
              <option value="">Select case task</option>
              {row.tasks?.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title_snapshot}
                </option>
              ))}
            </select>
            <select
              className="mt-2 w-full rounded border p-2"
              value={resource.requestType}
              onChange={(event) => setResource({ ...resource, requestType: event.target.value })}
            >
              <option value="equipment">Equipment</option>
              <option value="access">Access</option>
            </select>
            <input
              className="mt-2 w-full rounded border p-2"
              placeholder="Resource name"
              value={resource.resourceName}
              onChange={(event) => setResource({ ...resource, resourceName: event.target.value })}
            />
            <ConfirmActionDialog
              label="Create resource request"
              disabled={!resource.taskId || !resource.resourceName || resourceMutation.isPending}
              onConfirm={() => resourceMutation.mutate()}
            />
          </div>
        </section>
      ) : null}
      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded border bg-white p-4">
          <h3 className="font-semibold">Documents</h3>
          {row.documents?.length ? (
            <div className="mt-2 space-y-2">
              {row.documents.map((item) => (
                <div className="rounded border p-2" key={item.id}>
                  <p className="font-medium">{item.document_type_code}</p>
                  <p className="text-sm text-slate-600">
                    {item.task_title_snapshot} · {item.status}
                  </p>
                  {item.evidence_id ? (
                    <p className="text-sm text-slate-600">
                      Evidence recorded
                      {item.evidence_external_reference
                        ? `: ${item.evidence_external_reference}`
                        : ''}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No document requirements recorded.</p>
          )}
        </div>
        <div className="rounded border bg-white p-4">
          <h3 className="font-semibold">Resource requests</h3>
          {row.resourceRequests?.length ? (
            <div className="mt-2 space-y-2">
              {row.resourceRequests.map((item) => (
                <div className="rounded border p-2" key={item.id}>
                  <p className="font-medium">{item.resource_name}</p>
                  <p className="text-sm text-slate-600">
                    {item.task_title_snapshot} · {item.request_type} · {item.status}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No resource requests recorded.</p>
          )}
        </div>
      </section>
      {auth.permissions.includes('onboarding_readiness.confirm') ? (
        <section className="mt-5 rounded border bg-white p-4">
          <h3 className="font-semibold">Readiness confirmation</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <select
              className="rounded border p-2"
              value={readiness.readinessType}
              onChange={(event) =>
                setReadiness({ ...readiness, readinessType: event.target.value })
              }
            >
              <option value="attendance">Attendance</option>
              <option value="payroll">Payroll</option>
            </select>
            <select
              className="rounded border p-2"
              value={readiness.status}
              onChange={(event) => setReadiness({ ...readiness, status: event.target.value })}
            >
              <option value="ready">Ready</option>
              <option value="not_ready">Not ready</option>
              <option value="waived">Waived</option>
            </select>
            <input
              className="rounded border p-2"
              type="date"
              value={readiness.assessedOn}
              onChange={(event) => setReadiness({ ...readiness, assessedOn: event.target.value })}
            />
          </div>
          <div className="mt-3">
            <ConfirmActionDialog
              label="Confirm readiness"
              disabled={!reason || readinessMutation.isPending}
              onConfirm={() => readinessMutation.mutate()}
            />
          </div>
          {readinessMutation.isSuccess ? (
            <p className="mt-3 text-sm text-emerald-700">Readiness confirmation saved.</p>
          ) : null}
          {readinessMutation.error ? <ErrorState error={readinessMutation.error} /> : null}
          <div className="mt-4 border-t pt-3">
            <h4 className="text-sm font-medium">Recorded readiness</h4>
            {row.readiness?.length ? (
              <div className="mt-2 space-y-2">
                {row.readiness.map((item) => (
                  <p className="rounded border p-2 text-sm" key={item.id}>
                    {item.readiness_type} · {item.status} · {item.assessed_on}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No readiness confirmations recorded.</p>
            )}
          </div>
        </section>
      ) : null}
      <section className="mt-5">
        <h3 className="font-semibold">History</h3>
        {row.history?.map((e) => (
          <p className="mt-2 rounded border p-2" key={e.id}>
            Case: {e.from_status ?? 'created'} → {e.to_status}
            {e.reason ? ` · ${e.reason}` : ''}
            <span className="block text-xs text-slate-600">
              User #{e.created_by} · {new Date(e.created_at).toLocaleString()}
            </span>
          </p>
        ))}
        {row.taskHistory?.map((e) => {
          const task = row.tasks?.find((item) => item.id === e.onboarding_case_task_id);
          return (
            <p className="mt-2 rounded border p-2" key={`task-${e.id}`}>
              {task?.title_snapshot ?? `Task #${e.onboarding_case_task_id}`}: {e.from_status} →{' '}
              {e.to_status}
              {e.reason ? ` · ${e.reason}` : ''}
              <span className="block text-xs text-slate-600">
                User #{e.created_by} · {new Date(e.created_at).toLocaleString()}
              </span>
            </p>
          );
        })}
      </section>
    </section>
  );
}
