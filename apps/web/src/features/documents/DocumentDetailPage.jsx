import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../components/ui/PageState.jsx';
import { useAuth } from '../../lib/auth/AuthContext.jsx';
import { documentAction, getDocument, getDocumentHistory } from './api.js';
export function DocumentDetailPage({ own = false }) {
  const { id } = useParams();
  const auth = useAuth();
  const [referenceValue, setReferenceValue] = useState('');
  const client = useQueryClient();
  const detail = useQuery({ queryKey: ['document', id, own], queryFn: () => getDocument(id, own) });
  const history = useQuery({
    queryKey: ['document-history', id, own],
    queryFn: () => getDocumentHistory(id, own),
  });
  const action = useMutation({
    mutationFn: ({ name, body }) => documentAction(id, name, body, own),
    onSuccess: () => client.invalidateQueries({ queryKey: ['document', id] }),
  });
  if (detail.isPending || history.isPending) return <LoadingState />;
  if (detail.error || history.error) return <ErrorState error={detail.error ?? history.error} />;
  const document = detail.data;
  const transition = (name) =>
    action.mutate({
      name,
      body:
        name === 'acknowledge'
          ? { idempotencyKey: crypto.randomUUID() }
          : {
              workflowVersion: document.workflow_version,
              reason: `${name} document`,
              idempotencyKey: crypto.randomUUID(),
            },
    });
  return (
    <div>
      <h2 className="text-xl font-semibold">{document.title}</h2>
      <p>
        {document.document_code} · {document.status}
      </p>
      {document.reference_value && (
        <p className="mt-3 break-all">Reference: {document.reference_value}</p>
      )}
      <div className="my-4 flex gap-2">
        {document.status === 'draft' && auth.permissions.includes('document.publish') && (
          <button onClick={() => transition('publish')}>Publish</button>
        )}
        {document.status === 'published' && auth.permissions.includes('document.revoke') && (
          <button onClick={() => transition('revoke')}>Revoke</button>
        )}
        {own &&
          document.status === 'published' &&
          document.acknowledgment_required &&
          auth.permissions.includes('document.acknowledge') && (
            <button onClick={() => transition('acknowledge')}>Acknowledge</button>
          )}
      </div>
      {!own &&
        document.status === 'draft' &&
        auth.permissions.includes('document.version_create') && (
          <form
            className="my-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              action.mutate({
                name: 'versions',
                body: {
                  referenceType: 'external_reference',
                  referenceValue,
                  fileName: null,
                  mimeType: null,
                  checksumSha256: null,
                  effectiveOn: new Date().toISOString().slice(0, 10),
                  expiresOn: null,
                  reason: 'Create document version',
                  idempotencyKey: crypto.randomUUID(),
                  version: document.version,
                },
              });
            }}
          >
            <input
              aria-label="New document reference"
              required
              value={referenceValue}
              onChange={(event) => setReferenceValue(event.target.value)}
            />
            <button>Create version</button>
          </form>
        )}
      {action.error && <ErrorState error={action.error} />}
      <h3 className="font-semibold">Version history</h3>
      {history.data.versions.map((version) => (
        <p className="border-b py-2" key={version.id}>
          Version {version.version_number} · {version.effective_on}
        </p>
      ))}
    </div>
  );
}
