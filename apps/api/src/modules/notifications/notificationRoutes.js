import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
export function createNotificationRouter({ authenticate, authorizationService, database: db }) {
  const r = Router(),
    p = (x) => requirePermission(authorizationService, x),
    id = z.coerce.number().int().positive();
  r.use(authenticate);
  r.get(
    '/',
    p('notification.view_own'),
    validate(
      z.object({ companyId: id, pageSize: z.coerce.number().int().min(1).max(100).default(25) }),
      'query',
    ),
    async (req, res, next) => {
      try {
        const allowed = req.accessContext.grants.some(
          (grant) =>
            grant.scope_type === 'all' ||
            Number(grant.company_id) === Number(req.validated.query.companyId),
        );
        if (!allowed)
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Notifications not found.', details: [] },
          });
        const items = await db('notifications')
          .where({ company_id: req.validated.query.companyId, user_id: req.actor.userId })
          .limit(req.validated.query.pageSize)
          .orderBy('id', 'desc');
        res.json({ success: true, data: { items } });
      } catch (e) {
        next(e);
      }
    },
  );
  r.get(
    '/unread-count',
    p('notification.view_own'),
    validate(z.object({ companyId: id }), 'query'),
    async (req, res, next) => {
      try {
        const companyId = req.validated.query.companyId;
        const allowed = req.accessContext.grants.some(
          (grant) => grant.scope_type === 'all' || Number(grant.company_id) === Number(companyId),
        );
        if (!allowed)
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Notifications not found.', details: [] },
          });
        const result = await db('notifications')
          .where({ company_id: companyId, user_id: req.actor.userId, status: 'unread' })
          .count({ unread_count: 'id' })
          .first();
        res.json({
          success: true,
          data: { unreadCount: Number(result?.unread_count ?? 0) },
        });
      } catch (error) {
        next(error);
      }
    },
  );
  r.post(
    '/',
    p('notification.create'),
    validate(
      z.object({
        companyId: id,
        userId: id,
        type: z.string().trim().min(1).max(50),
        title: z.string().trim().min(1).max(200),
        message: z.string().trim().min(1).max(1000),
        referenceType: z.string().trim().max(50).optional(),
        referenceId: id.optional(),
        idempotencyKey: z.string().trim().min(8).max(100),
      }),
    ),
    async (req, res, next) => {
      try {
        const result = await db.transaction(async (trx) => {
          const i = req.validated.body;
          const allowed = req.accessContext.grants.some(
            (g) => g.scope_type === 'all' || Number(g.company_id) === Number(i.companyId),
          );
          if (!allowed) return null;
          const recipient = await trx('role_assignments')
            .where({ user_id: i.userId, company_id: i.companyId, status: 'active' })
            .first('id');
          if (!recipient) return null;
          const replay = await trx('notifications')
            .where({ company_id: i.companyId, idempotency_key: i.idempotencyKey })
            .first();
          if (replay) return { id: replay.id, replayed: true };
          const [notificationId] = await trx('notifications').insert({
            company_id: i.companyId,
            user_id: i.userId,
            notification_type: i.type,
            title: i.title,
            message: i.message,
            reference_type: i.referenceType ?? null,
            reference_id: i.referenceId ?? null,
            idempotency_key: i.idempotencyKey,
            created_by: req.actor.userId,
            updated_by: req.actor.userId,
          });
          await insertAuditEvent(trx, {
            actorUserId: req.actor.userId,
            companyId: i.companyId,
            actionCode: 'notification.create',
            outcome: 'success',
            recordType: 'notification',
            recordId: notificationId,
            permissionCode: 'notification.create',
            requestId: req.context.requestId,
            correlationId: req.context.correlationId,
          });
          return { id: notificationId, replayed: false };
        });
        if (!result)
          return res.status(404).json({
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Notification recipient not found.',
              details: [],
            },
          });
        res.status(result.replayed ? 200 : 201).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },
  );
  r.post(
    '/:id/read',
    p('notification.update_own'),
    validate(z.object({ id }), 'params'),
    async (req, res, next) => {
      try {
        const result = await db.transaction(async (trx) => {
          const row = await trx('notifications')
            .where({ id: req.validated.params.id, user_id: req.actor.userId })
            .forUpdate()
            .first();
          if (!row) return null;
          await trx('notifications').where({ id: row.id }).update({
            status: 'read',
            read_at: trx.fn.now(),
            updated_by: req.actor.userId,
            updated_at: trx.fn.now(),
          });
          await insertAuditEvent(trx, {
            actorUserId: req.actor.userId,
            companyId: row.company_id,
            actionCode: 'notification.read',
            outcome: 'success',
            recordType: 'notification',
            recordId: row.id,
            permissionCode: 'notification.update_own',
            requestId: req.context.requestId,
            correlationId: req.context.correlationId,
          });
          return { id: row.id };
        });
        if (!result)
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Notification not found.', details: [] },
          });
        res.json({ success: true, data: result });
      } catch (e) {
        next(e);
      }
    },
  );
  return r;
}
