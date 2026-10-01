import {
  ApplicationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import { notifyEmploymentUser } from '../notifications/workflowNotificationRepository.js';
const missing = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested document was not found.',
    statusCode: 404,
  });
export function createDocumentService({ database: db, repository, authorizationService }) {
  const own = (context, companyId) => {
    if (!repository.companyAllowed(context, companyId)) throw missing();
  };
  const audit = (trx, actor, companyId, actionCode, id, permission, ctx) =>
    insertAuditEvent(trx, {
      actorUserId: actor.userId,
      companyId,
      actionCode,
      outcome: 'success',
      recordType: 'document',
      recordId: id,
      permissionCode: permission,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
    });
  const project = async (actor, context, row) => {
    if (!row.is_sensitive) return row;
    try {
      const sensitive = await authorizationService.requirePermission(
        actor,
        'document_sensitive.view',
      );
      if (await repository.get(sensitive, row.id, 'document_sensitive.view')) return row;
    } catch {
      /* omit below */
    }
    const copy = { ...row };
    for (const field of ['reference_value', 'file_name', 'mime_type', 'checksum_sha256'])
      delete copy[field];
    return copy;
  };
  return {
    async list(actor, context, input, permission) {
      own(context, input.companyId);
      return Promise.all(
        (await repository.list(context, input, permission)).map((row) =>
          project(actor, context, row),
        ),
      );
    },
    async get(actor, context, id, permission) {
      const row = await repository.get(context, id, permission);
      if (!row) throw missing();
      return project(actor, context, row);
    },
    async history(actor, context, id, permission) {
      const row = await repository.get(context, id, permission);
      if (!row) throw missing();
      const visible = await project(actor, context, row);
      const history = await repository.history(id);
      if ('reference_value' in visible) return history;
      return {
        versions: history.versions.map((version) => {
          const projected = { ...version };
          for (const field of ['reference_value', 'file_name', 'mime_type', 'checksum_sha256'])
            delete projected[field];
          return projected;
        }),
        states: history.states,
      };
    },
    async createType(actor, context, input, ctx) {
      own(context, input.companyId);
      return withTransaction(db, async (trx) => {
        const [id] = await trx('document_types').insert({
          company_id: input.companyId,
          code: input.code,
          name: input.name,
          is_sensitive: input.isSensitive,
          acknowledgment_required: input.acknowledgmentRequired,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          input.companyId,
          'document_type.create',
          id,
          'document_type.create',
          ctx,
        );
        return { id };
      });
    },
    async create(actor, context, input, ctx) {
      own(context, input.companyId);
      return withTransaction(db, async (trx) => {
        const type = await trx('document_types')
          .where({ id: input.documentTypeId, company_id: input.companyId, record_status: 'active' })
          .first();
        if (!type) throw new ValidationError('The document type is invalid.');
        const [id] = await trx('documents').insert({
          company_id: input.companyId,
          document_type_id: input.documentTypeId,
          document_code: input.documentCode,
          title: input.title,
          audience: input.audience,
          branch_id: input.branchId ?? null,
          department_id: input.departmentId ?? null,
          employment_id: input.employmentId ?? null,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('document_versions').insert({
          company_id: input.companyId,
          document_id: id,
          version_number: 1,
          reference_type: input.referenceType,
          reference_value: input.referenceValue,
          file_name: input.fileName ?? null,
          mime_type: input.mimeType ?? null,
          checksum_sha256: input.checksumSha256 ?? null,
          effective_on: input.effectiveOn,
          expires_on: input.expiresOn ?? null,
          reason: input.reason,
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(trx, actor, input.companyId, 'document.create', id, 'document.create', ctx);
        return { id, version: 1, workflowVersion: 1 };
      });
    },
    async version(actor, context, id, input, ctx) {
      return withTransaction(db, async (trx) => {
        const document = await repository.lock(id, trx);
        if (!document || !(await repository.get(context, id, 'document.version_create', trx)))
          throw missing();
        const replay = await trx('document_versions')
          .where({ company_id: document.company_id, idempotency_key: input.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, version: replay.version_number, replayed: true };
        if (document.version !== input.version || document.status !== 'draft')
          throw new ConflictError('STALE_VERSION', 'The document changed or is not editable.');
        const current = await trx('document_versions')
          .where({ document_id: id, version_number: document.current_version_number })
          .first();
        await trx('document_versions')
          .where({ id: current.id })
          .update({ history_status: 'superseded' });
        const next = document.current_version_number + 1;
        const [versionId] = await trx('document_versions').insert({
          company_id: document.company_id,
          document_id: id,
          version_number: next,
          reference_type: input.referenceType,
          reference_value: input.referenceValue,
          file_name: input.fileName ?? null,
          mime_type: input.mimeType ?? null,
          checksum_sha256: input.checksumSha256 ?? null,
          effective_on: input.effectiveOn,
          expires_on: input.expiresOn ?? null,
          history_status: 'current',
          supersedes_version_id: current.id,
          reason: input.reason,
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('documents')
          .where({ id })
          .update({
            current_version_number: next,
            version: document.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          actor,
          document.company_id,
          'document.version_create',
          id,
          'document.version_create',
          ctx,
        );
        return { id: versionId, version: next, replayed: false };
      });
    },
    async transition(actor, context, id, target, input, permission, ctx) {
      return withTransaction(db, async (trx) => {
        const document = await repository.lock(id, trx);
        if (!document || !(await repository.get(context, id, permission, trx))) throw missing();
        const prior = await trx('document_state_events')
          .where({ company_id: document.company_id, idempotency_key: input.idempotencyKey })
          .first();
        if (prior)
          return {
            status: prior.to_state,
            workflowVersion: prior.workflow_version,
            replayed: true,
          };
        if (document.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The document changed.');
        const allowed =
          (target === 'published' && document.status === 'draft') ||
          (target === 'revoked' && document.status === 'published');
        if (!allowed)
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The document cannot perform this transition.',
          );
        const next = document.workflow_version + 1;
        await trx('documents')
          .where({ id })
          .update({
            status: target,
            workflow_version: next,
            version: document.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await trx('document_state_events').insert({
          company_id: document.company_id,
          document_id: id,
          from_state: document.status,
          to_state: target,
          workflow_version: next,
          reason: input.reason,
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          document.company_id,
          `document.${target === 'published' ? 'publish' : 'revoke'}`,
          id,
          permission,
          ctx,
        );
        if (target === 'published' && document.employment_id) {
          const documentType = await trx('document_types')
            .where({ id: document.document_type_id, company_id: document.company_id })
            .first('acknowledgment_required');
          await notifyEmploymentUser(
            trx,
            {
              companyId: document.company_id,
              type: documentType?.acknowledgment_required
                ? 'document.acknowledgment_required'
                : 'document.published',
              title: documentType?.acknowledgment_required
                ? 'Document requires acknowledgment'
                : 'Document published',
              message: documentType?.acknowledgment_required
                ? 'A document has been published and requires your acknowledgment.'
                : 'A document has been published for you.',
              referenceType: 'document',
              referenceId: id,
              idempotencyKey: `document:${id}:published:${next}`,
              actorUserId: actor.userId,
            },
            document.employment_id,
          );
        }
        return { status: target, workflowVersion: next, replayed: false };
      });
    },
    async acknowledge(actor, context, id, input, ctx) {
      return withTransaction(db, async (trx) => {
        const document = await repository.get(context, id, 'document.acknowledge', trx);
        if (
          !document ||
          document.status !== 'published' ||
          !document.acknowledgment_required ||
          !document.employment_id
        )
          throw missing();
        const replay = await trx('document_acknowledgments')
          .where({ company_id: document.company_id, idempotency_key: input.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        const [ackId] = await trx('document_acknowledgments').insert({
          company_id: document.company_id,
          document_id: id,
          document_version_id: document.current_version_id,
          employment_id: document.employment_id,
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          document.company_id,
          'document.acknowledge',
          id,
          'document.acknowledge',
          ctx,
        );
        return { id: ackId, replayed: false };
      });
    },
  };
}
