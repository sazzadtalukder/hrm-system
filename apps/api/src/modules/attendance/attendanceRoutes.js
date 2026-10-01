import express, { Router } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../common/errors/ApplicationError.js';
import { validate } from '../../common/validation/validate.js';
import { requirePermission } from '../authorization/authorizationMiddleware.js';
import {
  calculationSchema,
  correctionCreateSchema,
  decisionSchema,
  dispositionSchema,
  employmentOptionQuery,
  eventListQuery,
  idParams,
  importJsonSchema,
  listQuery,
  lockCreateSchema,
  lockReverseSchema,
  manualEventSchema,
  shiftAssignmentSchema,
  shiftCreateSchema,
  shiftDeactivateSchema,
  shiftUpdateSchema,
  workflowActionSchema,
} from './attendanceSchemas.js';

const companyQuery = z.object({ companyId: z.coerce.number().int().positive() });

export function createAttendanceRouter({
  authenticate,
  authorizationService,
  attendanceController,
  env,
}) {
  const router = Router();
  const permission = (code) => requirePermission(authorizationService, code);
  router.use(authenticate);
  router.get('/limits', permission('attendance.view'), attendanceController.limits);
  router.get(
    '/employment-options',
    permission('attendance.view'),
    validate(employmentOptionQuery, 'query'),
    attendanceController.employmentOptions,
  );
  router.get(
    '/records',
    permission('attendance.view'),
    validate(listQuery, 'query'),
    attendanceController.listRecords,
  );
  router.get(
    '/records/:id',
    permission('attendance.view'),
    validate(idParams, 'params'),
    attendanceController.getRecord,
  );
  router.post(
    '/records/:id/corrections',
    permission('attendance_correction.create'),
    validate(idParams, 'params'),
    validate(correctionCreateSchema),
    attendanceController.createCorrection,
  );
  router.post(
    '/calculate',
    permission('attendance.calculate'),
    validate(calculationSchema),
    attendanceController.calculate,
  );
  router.get(
    '/shifts',
    permission('attendance_shift.view'),
    validate(companyQuery, 'query'),
    attendanceController.listShifts,
  );
  router.post(
    '/shifts',
    permission('attendance_shift.create'),
    validate(shiftCreateSchema),
    attendanceController.createShift,
  );
  router.patch(
    '/shifts/:id',
    permission('attendance_shift.update'),
    validate(idParams, 'params'),
    validate(shiftUpdateSchema),
    attendanceController.updateShift,
  );
  router.post(
    '/shifts/:id/deactivate',
    permission('attendance_shift.deactivate'),
    validate(idParams, 'params'),
    validate(shiftDeactivateSchema),
    attendanceController.deactivateShift,
  );
  router.get(
    '/employments/:id/shift-assignments',
    permission('attendance_shift.view'),
    validate(idParams, 'params'),
    attendanceController.listShiftAssignments,
  );
  router.post(
    '/employments/:id/shift-assignments',
    permission('attendance_shift.assign'),
    validate(idParams, 'params'),
    validate(shiftAssignmentSchema),
    attendanceController.assignShift,
  );
  router.post(
    '/events/manual',
    permission('attendance_event.create'),
    validate(manualEventSchema),
    attendanceController.createManualEvent,
  );
  router.get(
    '/events',
    permission('attendance_event.view'),
    validate(eventListQuery, 'query'),
    attendanceController.listEvents,
  );
  router.post(
    '/events/:id/dispositions',
    permission('attendance_event.disposition'),
    validate(idParams, 'params'),
    validate(dispositionSchema),
    attendanceController.setDisposition,
  );
  router.post(
    '/imports/json',
    permission('attendance_import.create'),
    validate(importJsonSchema),
    attendanceController.importJson,
  );
  router.post(
    '/imports/csv',
    permission('attendance_import.create'),
    express.text({ type: ['text/csv', 'application/csv'], limit: env.API_BODY_LIMIT }),
    (request, _response, next) => {
      const companyId = Number(request.get('X-Company-ID'));
      const idempotencyKey = request.get('Idempotency-Key');
      if (
        !Number.isInteger(companyId) ||
        companyId <= 0 ||
        !idempotencyKey ||
        idempotencyKey.length > 100
      )
        return next(
          new ValidationError('Valid X-Company-ID and Idempotency-Key headers are required.'),
        );
      request.csvImport = {
        companyId,
        idempotencyKey,
        sourceReference: request.get('X-Source-Reference') ?? null,
      };
      return next();
    },
    attendanceController.importCsv,
  );
  router.get(
    '/imports/:id',
    permission('attendance_import.view'),
    validate(idParams, 'params'),
    validate(companyQuery, 'query'),
    attendanceController.getImport,
  );
  router.get(
    '/corrections',
    permission('attendance_correction.view'),
    validate(companyQuery, 'query'),
    attendanceController.listCorrections,
  );
  router.get(
    '/corrections/:id',
    permission('attendance_correction.view'),
    validate(idParams, 'params'),
    attendanceController.correctionHistory,
  );
  router.post(
    '/corrections/:id/submit',
    permission('attendance_correction.submit'),
    validate(idParams, 'params'),
    validate(workflowActionSchema),
    attendanceController.submitCorrection,
  );
  router.post(
    '/corrections/:id/cancel',
    permission('attendance_correction.cancel'),
    validate(idParams, 'params'),
    validate(workflowActionSchema),
    attendanceController.cancelCorrection,
  );
  router.post(
    '/corrections/:id/approve',
    permission('attendance_correction.approve'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    attendanceController.approveCorrection,
  );
  router.post(
    '/corrections/:id/reject',
    permission('attendance_correction.reject'),
    validate(idParams, 'params'),
    validate(decisionSchema),
    attendanceController.rejectCorrection,
  );
  router.get(
    '/locks',
    permission('attendance.lock'),
    validate(companyQuery, 'query'),
    attendanceController.listLocks,
  );
  router.post(
    '/locks',
    permission('attendance.lock'),
    validate(lockCreateSchema),
    attendanceController.createLock,
  );
  router.post(
    '/locks/:id/reverse',
    permission('attendance.unlock'),
    validate(idParams, 'params'),
    validate(lockReverseSchema),
    attendanceController.reverseLock,
  );
  return router;
}
