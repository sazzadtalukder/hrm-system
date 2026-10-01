import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { hasPermissionScope } from '../../app/accessPolicy.js';
import { useOrganizationCompany } from '../organization/useOrganizationCompany.js';
import { getLeaveBalances } from './api.js';
import { useOwnLeaveEmployment } from './useOwnLeaveEmployment.js';

export function LeaveBalancesPage() {
  const auth = useAuth();
  const company = useOrganizationCompany();
  const ownOnly =
    hasPermissionScope(auth.permissionScopes, 'leave_balance.view', ['own']) &&
    !hasPermissionScope(auth.permissionScopes, 'leave_balance.view', [
      'all',
      'company',
      'branch',
      'department',
      'direct_reports',
    ]);
  const ownEmployment = useOwnLeaveEmployment(company.company?.id, ownOnly);
  const [selectedEmploymentId, setSelectedEmploymentId] = useState('');
  const employmentId = ownOnly ? ownEmployment.data?.id : selectedEmploymentId;
  const balances = useQuery({
    queryKey: ['leave', 'balances', employmentId],
    queryFn: () => getLeaveBalances(employmentId),
    enabled: Boolean(employmentId),
  });
  return (
    <div className="space-y-4">
      {ownOnly ? (
        ownEmployment.isPending ? (
          <LoadingState />
        ) : ownEmployment.error ? (
          <ErrorState error={ownEmployment.error} />
        ) : (
          <div className="rounded-lg border border-subtle bg-surface p-4 text-sm">
            <span className="text-secondary">Balance owner</span>
            <p className="mt-1 font-medium">
              {ownEmployment.data.displayName} ({ownEmployment.data.employeeCode}) · Employment #
              {ownEmployment.data.id}
            </p>
          </div>
        )
      ) : (
        <label className="block max-w-sm text-sm">
          Employment ID
          <input
            className="mt-1 w-full rounded-md border border-subtle p-2"
            min="1"
            type="number"
            value={selectedEmploymentId}
            onChange={(event) => setSelectedEmploymentId(event.target.value)}
          />
        </label>
      )}
      {balances.isPending && balances.fetchStatus !== 'idle' ? (
        <LoadingState />
      ) : balances.error ? (
        <ErrorState error={balances.error} />
      ) : balances.data?.length ? (
        <div className="overflow-x-auto rounded-lg border border-subtle bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3">Leave type</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {balances.data.map((item) => (
                <tr className="border-t border-subtle" key={item.id}>
                  <td className="px-4 py-3">{item.leave_type_name}</td>
                  <td className="px-4 py-3">
                    {String(item.period_start).slice(0, 10)} –{' '}
                    {String(item.period_end).slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">{item.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : employmentId ? (
        <EmptyState message="No leave balance account exists yet. Ask HR to assign an effective leave policy. The entitlement account is initialized when the first eligible request is submitted." />
      ) : null}
    </div>
  );
}
