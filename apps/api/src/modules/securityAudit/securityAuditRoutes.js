import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import { ApplicationError } from '../../common/errors/ApplicationError.js';
export function createSecurityAuditRouter({ authenticate, authorizationService, database: db }) {
  const r = Router(),
    p = (x) => requirePermission(authorizationService, x),
    id = z.coerce.number().int().positive(),
    notFound = () =>
      new ApplicationError({
        code: 'NOT_FOUND',
        message: 'Security record not found.',
        statusCode: 404,
      }),
    owns = (context, companyId) =>
      context.grants.some(
        (grant) =>
          grant.scope_type === 'all' ||
          (grant.scope_type === 'company' && Number(grant.company_id) === Number(companyId)),
      );
  r.use(authenticate);
  r.get(
    '/events',
    p('audit.view'),
    validate(
      z.object({
        companyId: id,
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        search: z.string().trim().min(1).max(100).optional(),
        dateFrom: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        dateTo: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        actorId: id.optional(),
        action: z.string().trim().min(1).max(120).optional(),
        module: z.string().trim().min(1).max(80).optional(),
        outcome: z.string().trim().min(1).max(40).optional(),
        resourceType: z.string().trim().min(1).max(80).optional(),
      }),
      'query',
    ),
    async (req, res, next) => {
      try {
        const allowed = req.accessContext.grants.some(
          (g) =>
            g.scope_type === 'all' ||
            (g.scope_type === 'company' && Number(g.company_id) === req.validated.query.companyId),
        );
        if (!allowed)
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Audit records not found.', details: [] },
          });
        const input = req.validated.query;
        if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo)
          throw new ApplicationError({
            code: 'VALIDATION_FAILED',
            message: 'The start date must not be after the end date.',
            statusCode: 422,
          });
        const events = db('audit_events as audit')
          .leftJoin('users as actor', 'actor.id', 'audit.actor_user_id')
          .leftJoin('users as subject', 'subject.id', 'audit.subject_user_id')
          .where('audit.company_id', input.companyId);
        if (input.search)
          events.where((search) =>
            search
              .where('audit.action_code', 'like', `%${input.search}%`)
              .orWhere('audit.record_type', 'like', `%${input.search}%`)
              .orWhere('audit.record_id', 'like', `%${input.search}%`)
              .orWhere('actor.email', 'like', `%${input.search}%`),
          );
        if (input.dateFrom) events.where('audit.occurred_at', '>=', `${input.dateFrom} 00:00:00`);
        if (input.dateTo)
          events.whereRaw('audit.occurred_at < DATE_ADD(?, INTERVAL 1 DAY)', [input.dateTo]);
        if (input.actorId) events.where('audit.actor_user_id', input.actorId);
        if (input.action) events.where('audit.action_code', input.action);
        if (input.module) events.where('audit.action_code', 'like', `${input.module}.%`);
        if (input.outcome) events.where('audit.outcome', input.outcome);
        if (input.resourceType) events.where('audit.record_type', input.resourceType);
        const [{ total }] = await events.clone().countDistinct({ total: 'audit.id' });
        const items = await events
          .select(
            'audit.id',
            'audit.company_id',
            'audit.actor_user_id',
            'actor.email as actor_email',
            'audit.subject_user_id',
            'subject.email as subject_email',
            'audit.action_code',
            'audit.outcome',
            'audit.record_type',
            'audit.record_id',
            'audit.permission_code',
            'audit.reason',
            'audit.scope_type',
            'audit.request_id',
            'audit.correlation_id',
            'audit.occurred_at as created_at',
          )
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize)
          .orderBy('audit.id', 'desc');
        res.json({
          success: true,
          data: {
            items,
            pagination: {
              page: input.page,
              pageSize: input.pageSize,
              total: Number(total),
              totalPages: Math.ceil(Number(total) / input.pageSize),
            },
          },
        });
      } catch (e) {
        next(e);
      }
    },
  );
  r.get(
    '/sessions',
    p('security_session.view'),
    validate(z.object({ companyId: id, userId: id }), 'query'),
    async (req, res, next) => {
      try {
        const { companyId, userId } = req.validated.query;
        if (!owns(req.accessContext, companyId)) throw notFound();
        const belongs = await db('role_assignments')
          .where({ user_id: userId, company_id: companyId, status: 'active' })
          .first('id');
        if (!belongs) throw notFound();
        const items = await db('auth_sessions')
          .where({ user_id: userId })
          .select(
            'id',
            'user_id',
            'family_id',
            'revoked_at',
            'revoke_reason',
            'created_at',
            'expires_at',
          )
          .orderBy('id', 'desc');
        res.json({ success: true, data: { items } });
      } catch (e) {
        next(e);
      }
    },
  );
  r.post(
    '/events/:id/reviews',
    p('audit.review'),
    validate(z.object({ id }), 'params'),
    validate(
      z.object({
        companyId: id,
        status: z.enum(['reviewed', 'flagged', 'resolved']),
        reason: z.string().trim().min(1).max(500),
        idempotencyKey: z.string().trim().min(8).max(100),
      }),
    ),
    async (req, res, next) => {
      try {
        const result = await db.transaction(async (trx) => {
          const input = req.validated.body;
          if (!owns(req.accessContext, input.companyId)) throw notFound();
          const event = await trx('audit_events')
            .where({ id: req.validated.params.id, company_id: input.companyId })
            .first('id');
          if (!event) throw notFound();
          const replay = await trx('audit_review_events')
            .where({ company_id: input.companyId, idempotency_key: input.idempotencyKey })
            .first();
          if (replay) return { id: replay.id, status: replay.review_status, replayed: true };
          const [reviewId] = await trx('audit_review_events').insert({
            company_id: input.companyId,
            audit_event_id: event.id,
            review_status: input.status,
            reason: input.reason,
            acting_user_id: req.actor.userId,
            idempotency_key: input.idempotencyKey,
          });
          await insertAuditEvent(trx, {
            actorUserId: req.actor.userId,
            companyId: input.companyId,
            actionCode: 'audit.review',
            outcome: 'success',
            recordType: 'audit_event',
            recordId: event.id,
            permissionCode: 'audit.review',
            requestId: req.context.requestId,
            correlationId: req.context.correlationId,
          });
          return { id: reviewId, status: input.status, replayed: false };
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },
  );
  return r;
}
