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
    message: 'The requested asset was not found.',
    statusCode: 404,
  });
export function createAssetService({ database: db, repository }) {
  const own = (context, companyId) => {
    if (!repository.companyAllowed(context, companyId)) throw missing();
  };
  const audit = (trx, actor, companyId, actionCode, id, permission, ctx) =>
    insertAuditEvent(trx, {
      actorUserId: actor.userId,
      companyId,
      actionCode,
      outcome: 'success',
      recordType: 'asset',
      recordId: id,
      permissionCode: permission,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
    });
  return {
    async list(context, input, permission) {
      own(context, input.companyId);
      const rows = await repository.list(context, input, permission);
      return permission === 'asset.view_own'
        ? rows.map((row) => {
            const projected = { ...row };
            delete projected.acquisition_cost;
            return projected;
          })
        : rows;
    },
    async get(context, id, permission) {
      const row = await repository.get(context, id, permission);
      if (!row) throw missing();
      const projected = { ...row, history: await repository.history(id) };
      if (permission === 'asset.view_own') delete projected.acquisition_cost;
      return projected;
    },
    async createCategory(actor, context, input, ctx) {
      own(context, input.companyId);
      return withTransaction(db, async (trx) => {
        const [id] = await trx('asset_categories').insert({
          company_id: input.companyId,
          code: input.code,
          name: input.name,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(
          trx,
          actor,
          input.companyId,
          'asset_category.create',
          id,
          'asset_category.create',
          ctx,
        );
        return { id };
      });
    },
    async create(actor, context, input, ctx) {
      own(context, input.companyId);
      return withTransaction(db, async (trx) => {
        const category = await trx('asset_categories')
          .where({
            id: input.assetCategoryId,
            company_id: input.companyId,
            record_status: 'active',
          })
          .first();
        if (!category) throw new ValidationError('The asset category is invalid.');
        const [id] = await trx('assets').insert({
          company_id: input.companyId,
          asset_category_id: input.assetCategoryId,
          asset_code: input.assetCode,
          name: input.name,
          serial_number: input.serialNumber ?? null,
          acquired_on: input.acquiredOn ?? null,
          acquisition_cost: input.acquisitionCost ?? null,
          currency_code: input.currencyCode,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(trx, actor, input.companyId, 'asset.create', id, 'asset.create', ctx);
        return { id, workflowVersion: 1 };
      });
    },
    async assign(actor, context, id, input, ctx) {
      return withTransaction(db, async (trx) => {
        const asset = await repository.lock(id, trx);
        if (!asset || !(await repository.get(context, id, 'asset.assign', trx))) throw missing();
        const replay = await trx('asset_assignments')
          .where({ company_id: asset.company_id, idempotency_key: input.idempotencyKey })
          .first();
        if (replay) return { id: replay.id, replayed: true };
        if (asset.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The asset changed.');
        if (asset.status !== 'available')
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'The asset is not available.');
        const employment = await trx('employments')
          .where({ id: input.employmentId, company_id: asset.company_id, record_status: 'active' })
          .first();
        if (!employment) throw new ValidationError('The employment is invalid.');
        const [assignmentId] = await trx('asset_assignments').insert({
          company_id: asset.company_id,
          asset_id: id,
          employment_id: input.employmentId,
          assigned_on: input.assignedOn,
          condition_at_assignment: input.condition,
          reason: input.reason,
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('assets')
          .where({ id })
          .update({
            status: 'assigned',
            workflow_version: asset.workflow_version + 1,
            version: asset.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await trx('asset_events').insert({
          company_id: asset.company_id,
          asset_id: id,
          asset_assignment_id: assignmentId,
          event_type: 'assigned',
          from_status: 'available',
          to_status: 'assigned',
          reason: input.reason,
          idempotency_key: `${input.idempotencyKey}:event`,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(trx, actor, asset.company_id, 'asset.assign', id, 'asset.assign', ctx);
        await notifyEmploymentUser(
          trx,
          {
            companyId: asset.company_id,
            type: 'asset.assigned',
            title: 'Asset assigned to you',
            message: 'A company asset has been assigned to you. Review it in My Assets.',
            referenceType: 'asset',
            referenceId: id,
            idempotencyKey: `asset:${id}:assigned:${assignmentId}`,
            actorUserId: actor.userId,
          },
          input.employmentId,
        );
        return { id: assignmentId, workflowVersion: asset.workflow_version + 1, replayed: false };
      });
    },
    async returnAsset(actor, context, id, input, ctx) {
      return withTransaction(db, async (trx) => {
        const asset = await repository.lock(id, trx);
        if (!asset || !(await repository.get(context, id, 'asset.return', trx))) throw missing();
        const prior = await trx('asset_events')
          .where({ company_id: asset.company_id, idempotency_key: input.idempotencyKey })
          .first();
        if (prior) return { id: prior.id, replayed: true };
        if (asset.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The asset changed.');
        const assignment = await trx('asset_assignments')
          .where({ asset_id: id, status: 'active' })
          .forUpdate()
          .first();
        if (!assignment)
          throw new ConflictError('INVALID_WORKFLOW_STATE', 'The asset has no active assignment.');
        await trx('asset_assignments')
          .where({ id: assignment.id })
          .update({
            status: 'returned',
            active_slot: null,
            returned_on: input.returnedOn,
            condition_at_return: input.condition,
            workflow_version: assignment.workflow_version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await trx('assets')
          .where({ id })
          .update({
            status: 'available',
            workflow_version: asset.workflow_version + 1,
            version: asset.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        const [eventId] = await trx('asset_events').insert({
          company_id: asset.company_id,
          asset_id: id,
          asset_assignment_id: assignment.id,
          event_type: 'returned',
          from_status: 'assigned',
          to_status: 'available',
          reason: input.reason,
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await audit(trx, actor, asset.company_id, 'asset.return', id, 'asset.return', ctx);
        await notifyEmploymentUser(
          trx,
          {
            companyId: asset.company_id,
            type: 'asset.returned',
            title: 'Asset return recorded',
            message: 'The return of your assigned company asset has been recorded.',
            referenceType: 'asset',
            referenceId: id,
            idempotencyKey: `asset:${id}:returned:${eventId}`,
            actorUserId: actor.userId,
          },
          assignment.employment_id,
        );
        return { id: eventId, workflowVersion: asset.workflow_version + 1, replayed: false };
      });
    },
    async status(actor, context, id, input, ctx) {
      return withTransaction(db, async (trx) => {
        const asset = await repository.lock(id, trx);
        if (!asset || !(await repository.get(context, id, 'asset.update_status', trx)))
          throw missing();
        const prior = await trx('asset_events')
          .where({ company_id: asset.company_id, idempotency_key: input.idempotencyKey })
          .first();
        if (prior) return { id: prior.id, replayed: true };
        if (asset.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The asset changed.');
        if (asset.status === 'assigned')
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'Return the asset before changing its status.',
          );
        const [eventId] = await trx('asset_events').insert({
          company_id: asset.company_id,
          asset_id: id,
          event_type: 'status_changed',
          from_status: asset.status,
          to_status: input.status,
          reason: input.reason,
          idempotency_key: input.idempotencyKey,
          created_by: actor.userId,
          updated_by: actor.userId,
        });
        await trx('assets')
          .where({ id })
          .update({
            status: input.status,
            workflow_version: asset.workflow_version + 1,
            version: asset.version + 1,
            updated_by: actor.userId,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          actor,
          asset.company_id,
          'asset.update_status',
          id,
          'asset.update_status',
          ctx,
        );
        return { id: eventId, workflowVersion: asset.workflow_version + 1, replayed: false };
      });
    },
  };
}
