import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
export function createReportRouter({ authenticate, authorizationService, database: db }) {
  const r = Router(),
    p = (x) => requirePermission(authorizationService, x);
  r.use(authenticate);
  r.get(
    '/workforce',
    p('report.workforce'),
    validate(z.object({ companyId: z.coerce.number().int().positive() }), 'query'),
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
            error: { code: 'NOT_FOUND', message: 'Report not found.', details: [] },
          });
        const [employees, exits, assets] = await Promise.all([
          db('employments')
            .where({ company_id: req.validated.query.companyId, record_status: 'active' })
            .count({ total: '*' })
            .first(),
          db('employee_exits')
            .where({ company_id: req.validated.query.companyId })
            .groupBy('status')
            .select('status')
            .count({ total: '*' }),
          db('assets')
            .where({ company_id: req.validated.query.companyId })
            .groupBy('status')
            .select('status')
            .count({ total: '*' }),
        ]);
        res.json({
          success: true,
          data: { activeEmployments: Number(employees.total), exits, assets },
        });
      } catch (e) {
        next(e);
      }
    },
  );
  return r;
}
