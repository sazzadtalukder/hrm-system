import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button.jsx';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import {
  decideLeaveRequest,
  getLeaveRequest,
  requestLeaveCancellation,
  submitLeaveRequest,
} from './api.js';

export function LeaveRequestDetail() {
  const { id } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const request = useQuery({
    queryKey: ['leave', 'request', id],
    queryFn: () => getLeaveRequest(id),
  });
  const action = useMutation({
    mutationFn: async (kind) => {
      const body = { workflowVersion: request.data.workflow_version, reason };
      if (kind === 'submit') return submitLeaveRequest(id, body);
      if (kind === 'cancel') return requestLeaveCancellation(id, body);
      return decideLeaveRequest(id, kind, {
        ...body,
        requestVersion: request.data.current_request_version,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leave'] }),
  });
  if (request.isPending) return <LoadingState />;
  if (request.error) return <ErrorState error={request.error} />;
  const item = request.data;
  return (
    <section className="space-y-5 rounded-lg border border-subtle bg-surface p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Leave request #{item.id}</h2>
        <StatusBadge status={item.status} />
      </div>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-secondary">Dates</dt>
          <dd>
            {String(item.date_from).slice(0, 10)} – {String(item.date_to).slice(0, 10)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-secondary">Type</dt>
          <dd>{item.leave_type_name}</dd>
        </div>
        <div>
          <dt className="text-sm text-secondary">Units</dt>
          <dd>{item.requested_units}</dd>
        </div>
      </dl>
      {item.reasonRestricted ? (
        <p className="text-sm text-secondary">Sensitive reason restricted.</p>
      ) : (
        item.reason && <p>{item.reason}</p>
      )}
      <label className="block text-sm">
        Decision/comment reason
        <textarea
          className="mt-1 w-full rounded-md border border-subtle p-2"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {item.status === 'draft' && auth.permissions.includes('leave.submit') && (
          <Button onClick={() => action.mutate('submit')}>Submit</Button>
        )}
        {item.status === 'submitted' && auth.permissions.includes('leave.approve') && (
          <Button disabled={!reason} onClick={() => action.mutate('approve')}>
            Approve
          </Button>
        )}
        {item.status === 'submitted' && auth.permissions.includes('leave.reject') && (
          <Button disabled={!reason} onClick={() => action.mutate('reject')}>
            Reject
          </Button>
        )}
        {item.status === 'approved' && auth.permissions.includes('leave.request_cancellation') && (
          <Button disabled={!reason} onClick={() => action.mutate('cancel')}>
            Request cancellation
          </Button>
        )}
        {item.status === 'cancellation_requested' &&
          auth.permissions.includes('leave.approve_cancellation') && (
            <Button disabled={!reason} onClick={() => action.mutate('cancellation-approve')}>
              Approve cancellation
            </Button>
          )}
        {item.status === 'cancellation_requested' &&
          auth.permissions.includes('leave.reject_cancellation') && (
            <Button disabled={!reason} onClick={() => action.mutate('cancellation-reject')}>
              Reject cancellation
            </Button>
          )}
      </div>
      {action.error && <ErrorState error={action.error} />}
    </section>
  );
}
