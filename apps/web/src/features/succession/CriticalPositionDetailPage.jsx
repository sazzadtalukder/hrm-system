import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import {
  criticalPositionStatus,
  getCriticalPosition,
  getCriticalPositionHistory,
  versionCriticalPosition,
} from './api.js';

export function CriticalPositionDetailPage() {
  const { id } = useParams();
  const { permissions } = useAuth();
  const client = useQueryClient();
  const [description, setDescription] = useState('');
  const [criticality, setCriticality] = useState('critical');
  const [effectiveStart, setEffectiveStart] = useState('');
  const [versionReason, setVersionReason] = useState('');
  const detail = useQuery({
    queryKey: ['critical-position', id],
    queryFn: () => getCriticalPosition(id),
  });
  const history = useQuery({
    queryKey: ['critical-position-history', id],
    queryFn: () => getCriticalPositionHistory(id),
  });
  const mutation = useMutation({
    mutationFn: ({ action, body }) =>
      action === 'version'
        ? versionCriticalPosition(id, body)
        : criticalPositionStatus(id, action, body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['critical-position', id] });
      client.invalidateQueries({ queryKey: ['critical-position-history', id] });
    },
  });

  if (detail.isPending || history.isPending) return <LoadingState />;
  if (detail.error || history.error) return <ErrorState error={detail.error ?? history.error} />;

  const position = detail.data;
  const lifecycleAction = position.record_status === 'active' ? 'deactivate' : 'activate';

  const createVersion = (event) => {
    event.preventDefault();
    mutation.mutate({
      action: 'version',
      body: {
        name: position.name,
        designationId: position.designation_id,
        branchId: position.branch_id,
        departmentId: position.department_id,
        criticality,
        description: description || position.description,
        effectiveStart,
        competencies: position.competencies.map((competency) => ({
          performanceCompetencyVersionId: competency.performance_competency_version_id,
          requiredProficiency: competency.required_proficiency,
        })),
        version: position.version,
        reason: versionReason,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">
        {position.code} &middot; {position.name}
      </h2>
      <p>{position.description}</p>
      <div className="flex gap-2">
        {permissions.includes(`critical_position.${lifecycleAction}`) && (
          <Button
            onClick={() =>
              mutation.mutate({
                action: lifecycleAction,
                body: {
                  version: position.version,
                  reason: 'Authorized lifecycle change',
                  idempotencyKey: crypto.randomUUID(),
                },
              })
            }
          >
            {lifecycleAction}
          </Button>
        )}
        {permissions.includes('critical_position.version_create') && (
          <form className="grid gap-2" onSubmit={createVersion}>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={position.description}
            />
            <select value={criticality} onChange={(event) => setCriticality(event.target.value)}>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <input
              type="date"
              value={effectiveStart}
              onChange={(event) => setEffectiveStart(event.target.value)}
              required
            />
            <input
              value={versionReason}
              onChange={(event) => setVersionReason(event.target.value)}
              placeholder="Mandatory version reason"
              maxLength={500}
              required
            />
            <Button type="submit">Create version</Button>
          </form>
        )}
      </div>
      {mutation.error && <ErrorState error={mutation.error} />}
      <h3 className="font-semibold">Version history</h3>
      {history.data.length === 0 ? (
        <p>No version history exists.</p>
      ) : (
        history.data.map((version) => (
          <p key={version.id}>
            Version {version.version_number} &middot; {version.criticality} &middot;{' '}
            {version.history_status}
          </p>
        ))
      )}
    </div>
  );
}
