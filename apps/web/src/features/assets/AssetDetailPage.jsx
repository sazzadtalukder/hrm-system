import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { assetAction, getAsset } from './api.js';
export function AssetDetailPage({ own = false }) {
  const { id } = useParams();
  const { permissions } = useAuth();
  const client = useQueryClient();
  const [employmentId, setEmploymentId] = useState('');
  const result = useQuery({ queryKey: ['asset', id, own], queryFn: () => getAsset(id, own) });
  const action = useMutation({
    mutationFn: ({ name, body }) => assetAction(id, name, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['asset', id] }),
  });
  if (result.isPending) return <LoadingState />;
  if (result.error) return <ErrorState error={result.error} />;
  const asset = result.data;
  const common = (reason) => ({
    workflowVersion: asset.workflow_version,
    reason,
    idempotencyKey: crypto.randomUUID(),
  });
  return (
    <div>
      <h2 className="text-xl font-semibold">{asset.name}</h2>
      <p>
        {asset.asset_code} · {asset.status}
      </p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div>
          <dt>Serial number</dt>
          <dd>{asset.serial_number ?? '—'}</dd>
        </div>
        <div>
          <dt>Custodian</dt>
          <dd>{asset.employee_name ?? 'Unassigned'}</dd>
        </div>
      </dl>
      {!own && (
        <div className="my-5 flex flex-wrap gap-2">
          {asset.status === 'available' && permissions.includes('asset.assign') && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                action.mutate({
                  name: 'assign',
                  body: {
                    ...common('Assign asset'),
                    employmentId: Number(employmentId),
                    assignedOn: new Date().toISOString().slice(0, 10),
                    condition: 'Good',
                  },
                });
              }}
            >
              <input
                aria-label="Employment ID"
                required
                type="number"
                value={employmentId}
                onChange={(event) => setEmploymentId(event.target.value)}
              />
              <button>Assign</button>
            </form>
          )}
          {asset.status === 'assigned' && permissions.includes('asset.return') && (
            <button
              onClick={() =>
                action.mutate({
                  name: 'return',
                  body: {
                    ...common('Return asset'),
                    returnedOn: new Date().toISOString().slice(0, 10),
                    condition: 'Good',
                  },
                })
              }
            >
              Return
            </button>
          )}
          {asset.status !== 'assigned' &&
            permissions.includes('asset.update_status') &&
            ['available', 'maintenance', 'lost', 'retired'].map(
              (status) =>
                status !== asset.status && (
                  <button
                    key={status}
                    onClick={() =>
                      action.mutate({
                        name: 'status',
                        body: { ...common(`Mark ${status}`), status },
                      })
                    }
                  >
                    {status}
                  </button>
                ),
            )}
        </div>
      )}
      {action.error && <ErrorState error={action.error} />}
      <h3 className="mt-6 font-semibold">History</h3>
      {asset.history.map((event) => (
        <p className="border-b py-2" key={event.id}>
          {event.event_type} · {event.to_status}
        </p>
      ))}
    </div>
  );
}
