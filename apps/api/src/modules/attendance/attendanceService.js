import { createHash } from 'node:crypto';
import {
  ApplicationError,
  ConflictError,
  ValidationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import {
  createWorkflowNotification,
  notifyEmploymentUser,
  notifyPermissionHolders,
} from '../notifications/workflowNotificationRepository.js';
import { ATTENDANCE_LIMITS } from './attendanceConstants.js';
import {
  addDays,
  calculateSnapshot,
  daysInclusive,
  scheduleFor,
  weekday,
} from './attendanceCalculation.js';

function notFound() {
  return new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested attendance record was not found.',
    statusCode: 404,
  });
}
function auditContext(context) {
  return { requestId: context?.requestId, correlationId: context?.correlationId };
}
function dateOnly(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
function allowsCompany(context, companyId) {
  return context.grants.some(
    (grant) => grant.scope_type === 'all' || Number(grant.company_id) === Number(companyId),
  );
}
function allowsCompanyWide(context, companyId) {
  return context.grants.some(
    (grant) =>
      grant.scope_type === 'all' ||
      (grant.scope_type === 'company' && Number(grant.company_id) === Number(companyId)),
  );
}
function allowsOrganization(context, companyId, branchId, departmentId) {
  return context.grants.some(
    (grant) =>
      grant.scope_type === 'all' ||
      (Number(grant.company_id) === Number(companyId) &&
        (grant.scope_type === 'company' ||
          (grant.scope_type === 'branch' && Number(grant.branch_id) === Number(branchId)) ||
          (grant.scope_type === 'department' &&
            Number(grant.department_id) === Number(departmentId)))),
  );
}
function businessDateAt(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function fingerprint(companyId, employmentId, type, occurredAt, source) {
  return createHash('sha256')
    .update(`${companyId}|${employmentId}|${type}|${new Date(occurredAt).toISOString()}|${source}`)
    .digest('hex');
}
function mapDatabaseError(error) {
  if (error.code === 'ER_DUP_ENTRY')
    return new ConflictError(
      'DUPLICATE_RECORD',
      'An attendance record with the same unique identity already exists.',
    );
  if (error.code?.startsWith('ER_NO_REFERENCED'))
    return new ValidationError(
      'A referenced attendance record is invalid or belongs to another company.',
    );
  return error;
}

export function parseAttendanceCsv(csv) {
  if (csv.includes('\uFFFD')) throw new ValidationError('The CSV contains invalid text encoding.');
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(value);
      value = '';
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
    } else value += char;
  }
  if (quoted) throw new ValidationError('The CSV contains an unterminated quoted value.');
  row.push(value);
  if (row.some((cell) => cell.length)) rows.push(row);
  if (!rows.length) throw new ValidationError('The CSV is empty.');
  const expected = ['employee_code', 'event_type', 'occurred_at', 'source_event_key'];
  const header = rows.shift().map((cell) => cell.trim());
  if (
    header.some((name) => !expected.includes(name)) ||
    !['employee_code', 'event_type', 'occurred_at'].every((name) => header.includes(name))
  )
    throw new ValidationError('The CSV header is invalid or contains unknown columns.');
  if (rows.length > ATTENDANCE_LIMITS.maxImportRows)
    throw new ValidationError(`Imports cannot exceed ${ATTENDANCE_LIMITS.maxImportRows} rows.`);
  return rows.map((cells) => {
    if (cells.length !== header.length)
      throw new ValidationError('Every CSV row must match the declared columns.');
    return Object.fromEntries(header.map((name, index) => [name, cells[index]?.trim() || null]));
  });
}

export function createAttendanceService({ database, repository, leaveReader = null }) {
  async function writeAudit(
    trx,
    actor,
    companyId,
    action,
    type,
    id,
    permission,
    context,
    extra = {},
  ) {
    await insertAuditEvent(trx, {
      actorUserId: actor.userId,
      companyId,
      actionCode: action,
      outcome: 'success',
      recordType: type,
      recordId: id,
      permissionCode: permission,
      ...extra,
      ...auditContext(context),
    });
  }
  async function classifyAndCreateEvent(
    {
      actor,
      accessContext,
      companyId,
      employeeCode,
      eventType,
      occurredAt,
      sourceType,
      sourceEventKey,
      reason,
      importBatchId,
      rowNumber,
    },
    trx,
  ) {
    const company = await repository.getCompany(companyId, trx);
    if (!company) throw new ValidationError('The company does not exist.');
    const occurredDate = businessDateAt(occurredAt, company.timezone);
    const employment = await repository.findEmploymentByCode(
      companyId,
      employeeCode,
      occurredDate,
      trx,
    );
    if (!employment)
      throw new ValidationError('No effective employment matches the employee code.');
    const effectiveAssignment = await repository.getEffectiveAssignment(
      employment.id,
      occurredDate,
      trx,
    );
    if (
      !effectiveAssignment ||
      (accessContext &&
        !allowsOrganization(
          accessContext,
          companyId,
          effectiveAssignment.branch_id,
          effectiveAssignment.department_id,
        ))
    )
      throw notFound();
    const exactFingerprint = fingerprint(
      companyId,
      employment.id,
      eventType,
      occurredAt,
      sourceType,
    );
    const keyedDuplicate = await repository.findSourceEvent(
      companyId,
      sourceType,
      sourceEventKey,
      trx,
    );
    const fingerprintDuplicate = await repository.findFingerprint(companyId, exactFingerprint, trx);
    const near =
      !sourceEventKey && !fingerprintDuplicate
        ? await repository.findNearEvent(
            companyId,
            employment.id,
            eventType,
            new Date(occurredAt),
            ATTENDANCE_LIMITS.nearDuplicateWindowSeconds,
            trx,
          )
        : null;
    const id = await repository.createEvent(
      {
        company_id: companyId,
        employment_id: employment.id,
        import_batch_id: importBatchId ?? null,
        event_type: eventType,
        occurred_at_utc: new Date(occurredAt),
        business_date: occurredDate,
        source_type: sourceType,
        source_event_key: sourceEventKey ?? null,
        duplicate_fingerprint: exactFingerprint,
        manual_reason: reason ?? null,
        source_metadata: JSON.stringify({ rowNumber: rowNumber ?? null }),
        created_by: actor?.userId ?? null,
      },
      trx,
    );
    const related = keyedDuplicate ?? fingerprintDuplicate ?? near;
    const disposition =
      keyedDuplicate || fingerprintDuplicate ? 'duplicate' : near ? 'review_required' : 'accepted';
    await repository.createDisposition(
      {
        company_id: companyId,
        attendance_event_id: id,
        disposition,
        reason:
          disposition === 'accepted'
            ? 'Automatically accepted.'
            : disposition === 'duplicate'
              ? 'Exact duplicate identity detected.'
              : 'Near-duplicate requires review.',
        related_event_id: related?.id ?? null,
        created_by: actor?.userId ?? null,
      },
      trx,
    );
    return { id, employmentId: employment.id, disposition, relatedEventId: related?.id ?? null };
  }
  async function calculateOne(
    actor,
    companyId,
    employmentId,
    attendanceDate,
    correctionRequestId,
    correction,
    context,
    trx,
  ) {
    const employment = await repository.findEmployment(employmentId, companyId, trx);
    if (
      !employment ||
      dateOnly(employment.joining_date) > attendanceDate ||
      (employment.employment_end_date && dateOnly(employment.employment_end_date) < attendanceDate)
    )
      throw new ValidationError('Employment is not effective on the attendance date.');
    const assignment = await repository.getEffectiveAssignment(employmentId, attendanceDate, trx);
    if (await repository.findApplicableLock(companyId, assignment?.branch_id, attendanceDate, trx))
      throw new ConflictError('ATTENDANCE_LOCKED', 'The attendance period is locked.');
    const shiftAssignment = await repository.getEffectiveShiftAssignment(
      employmentId,
      attendanceDate,
      trx,
    );
    const shiftVersion = shiftAssignment
      ? await repository.getEffectiveShiftVersion(
          shiftAssignment.attendance_shift_id,
          attendanceDate,
          trx,
        )
      : null;
    let calendarDay = null;
    let holiday = null;
    if (assignment?.work_calendar_id) {
      calendarDay = await repository.getCalendarDay(
        assignment.work_calendar_id,
        weekday(attendanceDate),
        trx,
      );
      holiday = await repository.getHoliday(
        companyId,
        assignment.branch_id,
        assignment.work_calendar_id,
        attendanceDate,
        trx,
      );
    }
    let events = [];
    if (shiftVersion) {
      const schedule = scheduleFor(attendanceDate, shiftVersion);
      const from = new Date(
        schedule.start.getTime() - shiftVersion.check_in_window_before_minutes * 60_000,
      );
      const to = new Date(
        schedule.end.getTime() + shiftVersion.check_out_window_after_minutes * 60_000,
      );
      events = await repository.listAcceptedEvents(companyId, employmentId, from, to, trx);
    }
    const approvedLeaveDay = leaveReader
      ? await leaveReader.getApprovedLeaveDay(companyId, employmentId, attendanceDate, trx)
      : null;
    const missingConfig = !assignment?.work_calendar_id || !calendarDay || !shiftVersion;
    let snapshot = missingConfig
      ? {
          status: 'configuration_exception',
          exceptionCode: !shiftVersion ? 'MISSING_SHIFT' : 'MISSING_WORK_CALENDAR',
          schedule: null,
          checkIn: null,
          checkOut: null,
          workedMinutes: 0,
          lateMinutes: 0,
          earlyDepartureMinutes: 0,
          sourceEventIds: [],
        }
      : calculateSnapshot({
          attendanceDate,
          shiftVersion,
          events,
          isWorkingDay: Boolean(calendarDay.is_working_day),
          isHoliday: Boolean(holiday),
          correction,
        });
    if (!missingConfig && approvedLeaveDay) {
      if (Number(approvedLeaveDay.units) === 1) {
        snapshot = {
          ...snapshot,
          status: 'on_leave',
          exceptionCode: events.length ? 'LEAVE_DAY_EVENTS_REVIEW' : null,
        };
      } else if (Number(approvedLeaveDay.units) === 0.5 && snapshot.status !== 'present') {
        snapshot = { ...snapshot, exceptionCode: 'PARTIAL_LEAVE_REVIEW' };
      }
    }
    let record = await trx('attendance_records')
      .where({
        company_id: companyId,
        employment_id: employmentId,
        attendance_date: attendanceDate,
      })
      .forUpdate()
      .first();
    if (record?.locked_at)
      throw new ConflictError('ATTENDANCE_LOCKED', 'The attendance record is locked.');
    if (!record) {
      const id = await repository.createRecord(
        {
          company_id: companyId,
          employment_id: employmentId,
          attendance_date: attendanceDate,
          current_version_number: 0,
          status: snapshot.status,
          exception_status: snapshot.exceptionCode ? 'review_required' : 'none',
          created_by: actor.userId,
          updated_by: actor.userId,
        },
        trx,
      );
      record = await repository.lockRecord(id, trx);
    }
    const versionNumber = record.current_version_number + 1;
    await repository.createRecordVersion(
      {
        company_id: companyId,
        attendance_record_id: record.id,
        version_number: versionNumber,
        attendance_shift_version_id: shiftVersion?.id ?? null,
        correction_request_id: correctionRequestId ?? null,
        leave_request_day_id: approvedLeaveDay?.id ?? null,
        calculation_source: correctionRequestId ? 'correction' : 'system',
        first_check_in_utc: snapshot.checkIn,
        last_check_out_utc: snapshot.checkOut,
        scheduled_start_utc: snapshot.schedule?.start ?? null,
        scheduled_end_utc: snapshot.schedule?.end ?? null,
        schedule_timezone: shiftVersion?.timezone ?? null,
        unpaid_break_minutes: shiftVersion?.unpaid_break_minutes ?? 0,
        worked_minutes: snapshot.workedMinutes,
        late_minutes: snapshot.lateMinutes,
        early_departure_minutes: snapshot.earlyDepartureMinutes,
        status: snapshot.status,
        exception_code: snapshot.exceptionCode,
        resolved_business_date: attendanceDate,
        source_event_ids: JSON.stringify(snapshot.sourceEventIds),
        calculation_inputs: JSON.stringify({
          shiftVersionId: shiftVersion?.id ?? null,
          workCalendarId: assignment?.work_calendar_id ?? null,
          graceInMinutes: shiftVersion?.grace_in_minutes ?? null,
          graceOutMinutes: shiftVersion?.grace_out_minutes ?? null,
          checkInWindowBeforeMinutes: shiftVersion?.check_in_window_before_minutes ?? null,
          checkOutWindowAfterMinutes: shiftVersion?.check_out_window_after_minutes ?? null,
          isWorkingDay: Boolean(calendarDay?.is_working_day),
          holidayId: holiday?.id ?? null,
          leaveRequestDayId: approvedLeaveDay?.id ?? null,
        }),
        calculated_by: actor.userId,
      },
      trx,
    );
    const updated = await repository.updateRecord(
      record.id,
      record.version,
      {
        current_version_number: versionNumber,
        status: snapshot.status,
        exception_status: snapshot.exceptionCode ? 'review_required' : 'none',
        updated_by: actor.userId,
      },
      trx,
    );
    if (!updated)
      throw new ConflictError(
        'CONCURRENT_MODIFICATION',
        'The attendance record changed concurrently.',
      );
    await writeAudit(
      trx,
      actor,
      companyId,
      correctionRequestId ? 'attendance.correction_apply' : 'attendance.calculate',
      'attendance_record',
      record.id,
      correctionRequestId ? 'attendance.adjust' : 'attendance.calculate',
      context,
      { metadata: { employmentId, attendanceDate, versionNumber, status: snapshot.status } },
    );
    return record.id;
  }

  return {
    limits: ATTENDANCE_LIMITS,
    async listEmploymentOptions(context, input) {
      const company = await repository.getCompany(input.companyId);
      if (!company || !allowsCompany(context, input.companyId)) throw notFound();
      const asOfDate = businessDateAt(new Date(), company.timezone);
      return repository.listEmploymentOptions(context, input, asOfDate);
    },
    async listRecords(context, input) {
      const effectiveContext = input.scopeView
        ? {
            ...context,
            grants: context.grants.filter((grant) => grant.scope_type === input.scopeView),
          }
        : context;
      const [items, total] = await Promise.all([
        repository.listRecords(effectiveContext, input),
        repository.countRecords(effectiveContext, input),
      ]);
      return {
        items,
        pagination: {
          page: input.page,
          pageSize: input.pageSize,
          total: Number(total.count),
          totalPages: Math.ceil(Number(total.count) / input.pageSize),
        },
      };
    },
    async getRecord(id, context) {
      const row = await repository.getRecord(id, context);
      if (!row) throw notFound();
      return { ...row, versions: await repository.listRecordVersions(id) };
    },
    async listShifts(context, companyId) {
      if (!allowsCompany(context, companyId)) throw notFound();
      return repository.listShifts(companyId);
    },
    async createShift(actor, context, input, requestContext) {
      if (!allowsCompanyWide(context, input.companyId)) throw notFound();
      try {
        return await withTransaction(database, async (trx) => {
          const company = await repository.lockCompany(input.companyId, trx);
          if (!company || company.status !== 'active')
            throw new ValidationError('The company is not active.');
          if (
            input.crossesMidnight
              ? input.startTime < input.endTime
              : input.startTime >= input.endTime
          )
            throw new ValidationError('Shift times do not match the overnight setting.');
          const id = await repository.createShift(
            {
              company_id: input.companyId,
              code: input.code,
              name: input.name,
              description: input.description ?? null,
              created_by: actor.userId,
              updated_by: actor.userId,
            },
            trx,
          );
          const versionId = await repository.createShiftVersion(
            {
              company_id: input.companyId,
              attendance_shift_id: id,
              effective_start: input.effectiveStart,
              effective_end: input.effectiveEnd ?? null,
              timezone: input.timezone,
              start_time: input.startTime,
              end_time: input.endTime,
              crosses_midnight: input.crossesMidnight,
              unpaid_break_minutes: input.unpaidBreakMinutes,
              grace_in_minutes: input.graceInMinutes,
              grace_out_minutes: input.graceOutMinutes,
              check_in_window_before_minutes: ATTENDANCE_LIMITS.checkInWindowBeforeMinutes,
              check_out_window_after_minutes: ATTENDANCE_LIMITS.checkOutWindowAfterMinutes,
              reason: input.reason,
              created_by: actor.userId,
            },
            trx,
          );
          await writeAudit(
            trx,
            actor,
            input.companyId,
            'attendance_shift.create',
            'attendance_shift',
            id,
            'attendance_shift.create',
            requestContext,
            { metadata: { versionId, effectiveStart: input.effectiveStart } },
          );
          return { id, version: 1, shiftVersionId: versionId };
        });
      } catch (error) {
        throw mapDatabaseError(error);
      }
    },
    async updateShift(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const shift = await repository.lockShift(id, trx);
        if (!shift || !allowsCompanyWide(context, shift.company_id)) throw notFound();
        if (shift.status !== 'active')
          throw new ConflictError('SHIFT_INACTIVE', 'An inactive shift cannot be changed.');
        if (shift.version !== input.version)
          throw new ConflictError('STALE_VERSION', 'The shift changed concurrently.');
        if (
          input.crossesMidnight ? input.startTime < input.endTime : input.startTime >= input.endTime
        )
          throw new ValidationError('Shift times do not match the overnight setting.');
        const current = await repository.getCurrentShiftVersion(id, trx);
        if (!current)
          throw new ConflictError(
            'SHIFT_CONFIGURATION_MISSING',
            'The current shift version is missing.',
          );
        const currentStart = dateOnly(current.effective_start);
        if (input.effectiveStart < currentStart)
          throw new ConflictError(
            'INVALID_EFFECTIVE_DATE',
            'A new shift version cannot precede the latest effective version.',
          );
        const isCorrection = input.effectiveStart === currentStart;
        if (isCorrection) {
          if (!(await repository.supersedeShiftVersion(current.id, actor.userId, trx)))
            throw new ConflictError(
              'CONCURRENT_MODIFICATION',
              'The shift version changed concurrently.',
            );
        } else if (
          !(await repository.closeShiftVersion(current.id, addDays(input.effectiveStart, -1), trx))
        ) {
          throw new ConflictError(
            'CONCURRENT_MODIFICATION',
            'The shift version changed concurrently.',
          );
        }
        const shiftVersionId = await repository.createShiftVersion(
          {
            company_id: shift.company_id,
            attendance_shift_id: id,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            timezone: input.timezone,
            start_time: input.startTime,
            end_time: input.endTime,
            crosses_midnight: input.crossesMidnight,
            unpaid_break_minutes: input.unpaidBreakMinutes,
            grace_in_minutes: input.graceInMinutes,
            grace_out_minutes: input.graceOutMinutes,
            check_in_window_before_minutes: ATTENDANCE_LIMITS.checkInWindowBeforeMinutes,
            check_out_window_after_minutes: ATTENDANCE_LIMITS.checkOutWindowAfterMinutes,
            supersedes_shift_version_id: isCorrection ? current.id : null,
            reason: input.reason,
            created_by: actor.userId,
          },
          trx,
        );
        if (
          !(await repository.updateShift(
            id,
            input.version,
            { name: input.name, description: input.description ?? null, updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The shift changed concurrently.');
        await writeAudit(
          trx,
          actor,
          shift.company_id,
          'attendance_shift.update',
          'attendance_shift',
          id,
          'attendance_shift.update',
          requestContext,
          {
            reason: input.reason,
            metadata: {
              shiftVersionId,
              supersedesShiftVersionId: isCorrection ? current.id : null,
              previousShiftVersionId: current.id,
            },
          },
        );
        return { id, version: input.version + 1, shiftVersionId };
      });
    },
    async deactivateShift(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const shift = await repository.lockShift(id, trx);
        if (!shift || !allowsCompanyWide(context, shift.company_id)) throw notFound();
        if (shift.status !== 'active')
          throw new ConflictError('SHIFT_INACTIVE', 'The shift is already inactive.');
        if (
          !(await repository.updateShift(
            id,
            input.version,
            {
              status: 'inactive',
              deactivated_at: trx.fn.now(),
              deactivated_by: actor.userId,
              deactivation_reason: input.reason,
              updated_by: actor.userId,
            },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The shift changed concurrently.');
        await writeAudit(
          trx,
          actor,
          shift.company_id,
          'attendance_shift.deactivate',
          'attendance_shift',
          id,
          'attendance_shift.deactivate',
          requestContext,
          { reason: input.reason },
        );
      });
    },
    async assignShift(actor, context, employmentId, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const employment = await repository.lockEmployment(employmentId, trx);
        if (!employment) throw notFound();
        const assignment = await repository.getEffectiveAssignment(
          employmentId,
          input.effectiveStart,
          trx,
        );
        if (
          !assignment ||
          !allowsOrganization(
            context,
            employment.company_id,
            assignment.branch_id,
            assignment.department_id,
          )
        )
          throw notFound();
        const shift = await repository.getShift(
          input.attendanceShiftId,
          employment.company_id,
          trx,
        );
        if (!shift || shift.status !== 'active')
          throw new ValidationError('The shift is invalid or inactive.');
        const superseded = input.supersedesShiftAssignmentId
          ? await repository.getShiftAssignment(input.supersedesShiftAssignmentId, trx)
          : null;
        if (superseded && Number(superseded.employment_id) !== Number(employmentId))
          throw new ConflictError(
            'INVALID_HISTORY_CORRECTION',
            'The shift assignment does not belong to this employment.',
          );
        if (
          await repository.findShiftAssignmentOverlap(
            employmentId,
            input.effectiveStart,
            input.effectiveEnd,
            superseded?.id,
            trx,
          )
        )
          throw new ConflictError(
            'SHIFT_ASSIGNMENT_OVERLAP',
            'Shift assignment periods cannot overlap.',
          );
        if (
          superseded &&
          !(await repository.supersedeShiftAssignment(superseded.id, actor.userId, trx))
        )
          throw new ConflictError(
            'CONCURRENT_MODIFICATION',
            'Shift assignment changed concurrently.',
          );
        const id = await repository.createShiftAssignment(
          {
            company_id: employment.company_id,
            employment_id: employmentId,
            attendance_shift_id: input.attendanceShiftId,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            reason: input.reason,
            supersedes_shift_assignment_id: superseded?.id ?? null,
            created_by: actor.userId,
          },
          trx,
        );
        await writeAudit(
          trx,
          actor,
          employment.company_id,
          'attendance_shift.assign',
          'employee_shift_assignment',
          id,
          'attendance_shift.assign',
          requestContext,
          { reason: input.reason, metadata: { employmentId } },
        );
        return { id };
      });
    },
    async listShiftAssignments(context, employmentId) {
      const candidateCompanyIds = [
        ...new Set(context.grants.map((grant) => grant.company_id).filter(Boolean)),
      ];
      let employment;
      for (const companyId of candidateCompanyIds) {
        employment = await repository.findEmployment(employmentId, companyId);
        if (employment) break;
      }
      if (!employment) throw notFound();
      const company = await repository.getCompany(employment.company_id);
      const today = businessDateAt(new Date(), company.timezone);
      const assignment = await repository.getEffectiveAssignment(employmentId, today, database);
      if (
        !assignment ||
        !allowsOrganization(
          context,
          employment.company_id,
          assignment.branch_id,
          assignment.department_id,
        )
      )
        throw notFound();
      return repository.listShiftAssignments(employmentId);
    },
    async createManualEvent(actor, context, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const company = await repository.getCompany(input.companyId, trx);
        if (!company || !allowsCompany(context, input.companyId)) throw notFound();
        const occurredDate = businessDateAt(input.occurredAt, company.timezone);
        const employment = await repository.findEmploymentByCode(
          input.companyId,
          input.employeeCode,
          occurredDate,
          trx,
        );
        if (!employment)
          throw new ValidationError('No effective employment matches the employee code.');
        const assignment = await repository.getEffectiveAssignment(
          employment.id,
          occurredDate,
          trx,
        );
        if (
          !assignment ||
          !allowsOrganization(
            context,
            input.companyId,
            assignment.branch_id,
            assignment.department_id,
          )
        )
          throw notFound();
        const result = await classifyAndCreateEvent(
          {
            actor,
            accessContext: context,
            companyId: input.companyId,
            employeeCode: input.employeeCode,
            eventType: input.eventType,
            occurredAt: input.occurredAt,
            sourceType: 'manual',
            sourceEventKey: input.sourceEventKey,
            reason: input.reason,
          },
          trx,
        );
        await writeAudit(
          trx,
          actor,
          input.companyId,
          'attendance_event.create',
          'attendance_event',
          result.id,
          'attendance_event.create',
          requestContext,
          { reason: input.reason, metadata: { disposition: result.disposition } },
        );
        return result;
      });
    },
    async setDisposition(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const event = await repository.lockEvent(id, trx);
        if (!event || !allowsCompany(context, event.company_id)) throw notFound();
        const company = await repository.getCompany(event.company_id, trx);
        const eventDate = businessDateAt(event.occurred_at_utc, company.timezone);
        const assignment = await repository.getEffectiveAssignment(
          event.employment_id,
          eventDate,
          trx,
        );
        if (
          !assignment ||
          !allowsOrganization(
            context,
            event.company_id,
            assignment.branch_id,
            assignment.department_id,
          )
        )
          throw notFound();
        if (input.relatedEventId) {
          const related = await repository.getEvent(input.relatedEventId, trx);
          if (
            !related ||
            Number(related.company_id) !== Number(event.company_id) ||
            Number(related.employment_id) !== Number(event.employment_id)
          )
            throw new ValidationError('The related event is invalid.');
        }
        const dispositionId = await repository.createDisposition(
          {
            company_id: event.company_id,
            attendance_event_id: id,
            disposition: input.disposition,
            reason: input.reason,
            related_event_id: input.relatedEventId ?? null,
            created_by: actor.userId,
          },
          trx,
        );
        await writeAudit(
          trx,
          actor,
          event.company_id,
          'attendance_event.disposition',
          'attendance_event',
          id,
          'attendance_event.disposition',
          requestContext,
          { reason: input.reason, metadata: { disposition: input.disposition, dispositionId } },
        );
        return { id: dispositionId };
      });
    },
    async listEvents(actor, context, input, requestContext) {
      const items = await repository.listEvents(context, input);
      await insertAuditEvent(database, {
        actorUserId: actor.userId,
        companyId: input.companyId,
        actionCode: 'attendance_event.view',
        outcome: 'success',
        recordType: 'attendance_event_collection',
        permissionCode: 'attendance_event.view',
        metadata: {
          resultCount: items.length,
          dateFrom: input.dateFrom ?? null,
          dateTo: input.dateTo ?? null,
        },
        ...auditContext(requestContext),
      });
      return { items, pagination: { page: input.page, pageSize: input.pageSize } };
    },
    async importEvents(
      actor,
      context,
      { companyId, idempotencyKey, sourceReference, format, rows },
      requestContext,
    ) {
      if (!allowsCompany(context, companyId)) throw notFound();
      if (rows.length > ATTENDANCE_LIMITS.maxImportRows)
        throw new ValidationError(`Imports cannot exceed ${ATTENDANCE_LIMITS.maxImportRows} rows.`);
      const company = await repository.getCompany(companyId);
      if (!company || company.status !== 'active')
        throw new ValidationError('The import company is not active.');
      const contentHash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
      const existing = await repository.getImportByKey(companyId, idempotencyKey);
      if (existing) {
        if (existing.content_hash !== contentHash)
          throw new ConflictError(
            'IDEMPOTENCY_CONFLICT',
            'The idempotency key was used for different content.',
          );
        return { id: existing.id, status: existing.status, replayed: true };
      }
      let batchId;
      try {
        batchId = await withTransaction(database, async (trx) =>
          repository.createImport(
            {
              company_id: companyId,
              format,
              source_type: 'import',
              source_reference: sourceReference ?? null,
              idempotency_key: idempotencyKey,
              content_hash: contentHash,
              status: 'processing',
              total_rows: rows.length,
              started_at: trx.fn.now(),
              created_by: actor.userId,
            },
            trx,
          ),
        );
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') throw error;
        const concurrent = await repository.getImportByKey(companyId, idempotencyKey);
        if (!concurrent || concurrent.content_hash !== contentHash)
          throw new ConflictError(
            'IDEMPOTENCY_CONFLICT',
            'The idempotency key was used for different content.',
          );
        return { id: concurrent.id, status: concurrent.status, replayed: true };
      }
      let successful = 0;
      let failed = 0;
      for (let offset = 0; offset < rows.length; offset += ATTENDANCE_LIMITS.importChunkSize) {
        const chunk = rows.slice(offset, offset + ATTENDANCE_LIMITS.importChunkSize);
        await withTransaction(database, async (trx) => {
          for (let index = 0; index < chunk.length; index += 1) {
            const row = chunk[index];
            const rowNumber = offset + index + 1;
            try {
              const result = await trx.transaction(async (rowTrx) => {
                if (
                  !row.employee_code ||
                  !['check_in', 'check_out'].includes(row.event_type) ||
                  !row.occurred_at ||
                  Number.isNaN(new Date(row.occurred_at).getTime()) ||
                  !/(Z|[+-]\d\d:\d\d)$/.test(row.occurred_at)
                )
                  throw new ValidationError('The import row is invalid.');
                return classifyAndCreateEvent(
                  {
                    actor,
                    accessContext: context,
                    companyId,
                    employeeCode: row.employee_code,
                    eventType: row.event_type,
                    occurredAt: row.occurred_at,
                    sourceType: 'import',
                    sourceEventKey: row.source_event_key,
                    rowNumber,
                    importBatchId: batchId,
                  },
                  rowTrx,
                );
              });
              await repository.createImportRow(
                {
                  import_batch_id: batchId,
                  row_number: rowNumber,
                  employee_code: row.employee_code,
                  status: result.disposition === 'accepted' ? 'created' : result.disposition,
                  error_code: null,
                  attendance_event_id: result.id,
                  related_event_id: result.relatedEventId,
                },
                trx,
              );
              successful += 1;
            } catch (error) {
              failed += 1;
              await repository.createImportRow(
                {
                  import_batch_id: batchId,
                  row_number: rowNumber,
                  employee_code: row.employee_code ?? null,
                  status: 'invalid',
                  error_code: error.code ?? 'ROW_VALIDATION_FAILED',
                },
                trx,
              );
            }
          }
        });
      }
      await withTransaction(database, async (trx) => {
        await repository.updateImport(
          batchId,
          {
            status: failed ? 'partially_failed' : 'completed',
            successful_rows: successful,
            failed_rows: failed,
            completed_at: trx.fn.now(),
          },
          trx,
        );
        await writeAudit(
          trx,
          actor,
          companyId,
          'attendance_import.complete',
          'attendance_import_batch',
          batchId,
          'attendance_import.create',
          requestContext,
          { metadata: { totalRows: rows.length, successfulRows: successful, failedRows: failed } },
        );
      });
      return {
        id: batchId,
        status: failed ? 'partially_failed' : 'completed',
        successfulRows: successful,
        failedRows: failed,
      };
    },
    async getImport(context, id, companyId) {
      if (!allowsCompany(context, companyId)) throw notFound();
      const batch = await repository.getImport(id, companyId);
      if (
        !batch ||
        (!allowsCompanyWide(context, companyId) &&
          Number(batch.created_by) !== Number(context.actor.userId))
      )
        throw notFound();
      return { ...batch, rows: await repository.listImportRows(id) };
    },
    async calculate(actor, context, input, requestContext) {
      const range = daysInclusive(input.dateFrom, input.dateTo);
      if (range < 1 || range > ATTENDANCE_LIMITS.maxCalculationRangeDays)
        throw new ValidationError(
          `Calculation ranges cannot exceed ${ATTENDANCE_LIMITS.maxCalculationRangeDays} days.`,
        );
      const scopeAllowed = context.grants.some(
        (grant) =>
          grant.scope_type === 'all' ||
          (Number(grant.company_id) === Number(input.companyId) &&
            (grant.scope_type === 'company' ||
              (grant.scope_type === 'branch' &&
                Number(grant.branch_id) === Number(input.branchId)) ||
              (grant.scope_type === 'department' &&
                Number(grant.department_id) === Number(input.departmentId)))),
      );
      if (!scopeAllowed) throw notFound();
      return withTransaction(database, async (trx) => {
        const employments = await repository.listEmploymentIds(input, trx);
        if (input.employmentIds && employments.length !== new Set(input.employmentIds).size)
          throw new ValidationError(
            'One or more employments are invalid, out of scope, or not effective for the requested period.',
          );
        if (employments.length > ATTENDANCE_LIMITS.maxCalculationEmploymentIds)
          throw new ValidationError(
            `Calculation requests cannot exceed ${ATTENDANCE_LIMITS.maxCalculationEmploymentIds} employments.`,
          );
        const ids = [];
        for (const employment of employments) {
          const employmentId = employment.id;
          const effectiveFrom =
            dateOnly(employment.joining_date) > input.dateFrom
              ? dateOnly(employment.joining_date)
              : input.dateFrom;
          const effectiveTo =
            employment.employment_end_date &&
            dateOnly(employment.employment_end_date) < input.dateTo
              ? dateOnly(employment.employment_end_date)
              : input.dateTo;
          for (let date = effectiveFrom; date <= effectiveTo; date = addDays(date, 1))
            ids.push(
              await calculateOne(
                actor,
                input.companyId,
                employmentId,
                date,
                null,
                null,
                requestContext,
                trx,
              ),
            );
        }
        return { calculatedRecords: ids.length, recordIds: ids };
      });
    },
    async createCorrection(actor, context, recordId, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const record = await repository.getRecord(
          recordId,
          context,
          'attendance_correction.create',
          trx,
        );
        if (!record) throw notFound();
        if (record.locked_at)
          throw new ConflictError(
            'ATTENDANCE_LOCKED',
            'Unlock attendance before requesting a correction.',
          );
        const id = await repository.createCorrection(
          {
            company_id: record.company_id,
            attendance_record_id: recordId,
            requester_user_id: actor.userId,
            requested_check_in_utc: input.requestedCheckInUtc
              ? new Date(input.requestedCheckInUtc)
              : null,
            requested_check_out_utc: input.requestedCheckOutUtc
              ? new Date(input.requestedCheckOutUtc)
              : null,
            reason: input.reason,
            created_by: actor.userId,
            updated_by: actor.userId,
          },
          trx,
        );
        await repository.createWorkflowEvent(
          {
            company_id: record.company_id,
            correction_request_id: id,
            from_state: null,
            to_state: 'draft',
            workflow_version: 1,
            actor_user_id: actor.userId,
            reason: input.reason,
          },
          trx,
        );
        await writeAudit(
          trx,
          actor,
          record.company_id,
          'attendance_correction.create',
          'attendance_correction',
          id,
          'attendance_correction.create',
          requestContext,
          { reason: input.reason, metadata: { recordId } },
        );
        return { id, workflowVersion: 1 };
      });
    },
    async transitionCorrection(actor, context, id, action, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const correction = await repository.lockCorrection(id, trx);
        if (!correction) throw notFound();
        const record = await repository.getRecord(
          correction.attendance_record_id,
          context,
          `attendance_correction.${action}`,
          trx,
        );
        if (!record) throw notFound();
        const transitions = { submit: ['draft', 'submitted'], cancel: ['draft', 'cancelled'] };
        const rule = transitions[action];
        if (!rule || correction.status !== rule[0])
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The correction cannot perform this transition.',
          );
        if (Number(correction.requester_user_id) !== Number(actor.userId)) throw notFound();
        const values = { status: rule[1] };
        if (action === 'submit')
          values.record_version_at_submission = record.current_version_number;
        if (!(await repository.updateCorrection(id, input.workflowVersion, values, trx)))
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The correction changed concurrently.');
        await repository.createWorkflowEvent(
          {
            company_id: correction.company_id,
            correction_request_id: id,
            from_state: rule[0],
            to_state: rule[1],
            workflow_version: input.workflowVersion + 1,
            actor_user_id: actor.userId,
            reason: input.reason ?? null,
          },
          trx,
        );
        await writeAudit(
          trx,
          actor,
          correction.company_id,
          `attendance_correction.${action}`,
          'attendance_correction',
          id,
          `attendance_correction.${action}`,
          requestContext,
          { reason: input.reason },
        );
        if (action === 'submit') {
          const notification = {
            companyId: correction.company_id,
            type: 'attendance_correction.approval_required',
            title: 'Attendance correction awaiting review',
            message: 'An attendance correction request requires a decision.',
            referenceType: 'attendance_correction',
            referenceId: id,
            idempotencyKey: `attendance-correction:${id}:submitted:${input.workflowVersion + 1}`,
            actorUserId: actor.userId,
          };
          const manager = record.manager_employment_id
            ? await notifyEmploymentUser(trx, notification, record.manager_employment_id)
            : null;
          if (!manager)
            await notifyPermissionHolders(trx, notification, 'attendance_correction.approve', {
              branchId: record.branch_id,
              departmentId: record.department_id,
            });
        }
        return { id, workflowVersion: input.workflowVersion + 1 };
      });
    },
    async decideCorrection(actor, context, id, decision, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const correction = await repository.lockCorrection(id, trx);
        if (!correction) throw notFound();
        if (Number(correction.requester_user_id) === Number(actor.userId))
          throw new ConflictError(
            'SELF_APPROVAL_FORBIDDEN',
            'A requester cannot decide their own correction.',
          );
        const priorDecision = await repository.getDecisionByKey(id, input.idempotencyKey, trx);
        if (priorDecision) {
          const expectedDecision = decision === 'approve' ? 'approved' : 'rejected';
          if (priorDecision.decision !== expectedDecision)
            throw new ConflictError(
              'IDEMPOTENCY_CONFLICT',
              'The idempotency key was used for a different decision.',
            );
          return {
            id,
            status: correction.status,
            workflowVersion: correction.workflow_version,
            replayed: true,
          };
        }
        if (
          correction.status !== 'submitted' ||
          correction.workflow_version !== input.workflowVersion
        )
          throw new ConflictError(
            'STALE_WORKFLOW_VERSION',
            'The correction is no longer awaiting this decision.',
          );
        const record = await repository.getRecord(
          correction.attendance_record_id,
          context,
          `attendance_correction.${decision}`,
          trx,
        );
        if (!record) throw notFound();
        if (record.locked_at)
          throw new ConflictError(
            'ATTENDANCE_LOCKED',
            'Unlock attendance before deciding the correction.',
          );
        if (record.current_version_number !== correction.record_version_at_submission)
          throw new ConflictError(
            'ATTENDANCE_VERSION_CHANGED',
            'Attendance changed after correction submission.',
          );
        try {
          await repository.createDecision(
            {
              company_id: correction.company_id,
              correction_request_id: id,
              attempt_number: 1,
              approver_user_id: actor.userId,
              decision: decision === 'approve' ? 'approved' : 'rejected',
              reason: input.reason,
              expected_workflow_version: input.workflowVersion,
              idempotency_key: input.idempotencyKey,
            },
            trx,
          );
        } catch (error) {
          throw mapDatabaseError(error);
        }
        const target = decision === 'approve' ? 'approved' : 'rejected';
        if (decision === 'approve') {
          const current = await repository.getCurrentVersion(record.id, trx);
          await calculateOne(
            actor,
            record.company_id,
            record.employment_id,
            dateOnly(record.attendance_date),
            id,
            {
              checkIn: correction.requested_check_in_utc ?? current.first_check_in_utc,
              checkOut: correction.requested_check_out_utc ?? current.last_check_out_utc,
            },
            requestContext,
            trx,
          );
        }
        if (
          !(await repository.updateCorrection(id, input.workflowVersion, { status: target }, trx))
        )
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The correction changed concurrently.');
        await repository.createWorkflowEvent(
          {
            company_id: correction.company_id,
            correction_request_id: id,
            from_state: 'submitted',
            to_state: target,
            workflow_version: input.workflowVersion + 1,
            actor_user_id: actor.userId,
            reason: input.reason,
          },
          trx,
        );
        await writeAudit(
          trx,
          actor,
          correction.company_id,
          `attendance_correction.${decision}`,
          'attendance_correction',
          id,
          `attendance_correction.${decision}`,
          requestContext,
          { reason: input.reason },
        );
        await createWorkflowNotification(trx, {
          companyId: correction.company_id,
          userId: correction.requester_user_id,
          type: 'attendance_correction.decided',
          title: 'Attendance correction updated',
          message: `Your attendance correction was ${decision === 'approve' ? 'approved' : 'rejected'}.`,
          referenceType: 'attendance_correction',
          referenceId: id,
          idempotencyKey: `attendance-correction:${id}:${target}:${input.workflowVersion + 1}`,
          actorUserId: actor.userId,
        });
        return { id, status: target, workflowVersion: input.workflowVersion + 1 };
      });
    },
    async listCorrections(context, companyId) {
      if (!allowsCompany(context, companyId)) throw notFound();
      return repository.listCorrections(context, companyId);
    },
    async correctionHistory(context, id) {
      const correction = await repository.getCorrection(id);
      if (!correction) throw notFound();
      const record = await repository.getRecord(
        correction.attendance_record_id,
        context,
        'attendance_correction.view',
      );
      if (!record) throw notFound();
      const [states, decisions] = await repository.correctionHistory(id);
      return { correction, states, decisions };
    },
    async createLock(actor, context, input, requestContext) {
      if (
        !allowsOrganization(context, input.companyId, input.branchId, null) &&
        !context.grants.some(
          (grant) =>
            grant.scope_type === 'all' ||
            (grant.scope_type === 'company' &&
              Number(grant.company_id) === Number(input.companyId)),
        )
      )
        throw notFound();
      return withTransaction(database, async (trx) => {
        await repository.lockCompany(input.companyId, trx);
        if (
          input.branchId &&
          !(await trx('branches')
            .where({ id: input.branchId, company_id: input.companyId })
            .first())
        )
          throw new ValidationError('The branch is invalid.');
        if (
          await repository.findLockOverlap(
            input.companyId,
            input.branchId,
            input.periodStart,
            input.periodEnd,
            null,
            trx,
          )
        )
          throw new ConflictError(
            'ATTENDANCE_LOCK_OVERLAP',
            'Attendance lock periods cannot overlap.',
          );
        const id = await repository.createLock(
          {
            company_id: input.companyId,
            branch_id: input.branchId ?? null,
            period_start: input.periodStart,
            period_end: input.periodEnd,
            reason: input.reason,
            locked_by: actor.userId,
          },
          trx,
        );
        let records = trx('attendance_records as record')
          .where('record.company_id', input.companyId)
          .whereBetween('record.attendance_date', [input.periodStart, input.periodEnd]);
        if (input.branchId)
          records = records.whereExists(
            trx('employee_assignments as assignment')
              .select(1)
              .whereRaw('assignment.employment_id = record.employment_id')
              .where({ history_status: 'current', branch_id: input.branchId })
              .whereRaw('assignment.effective_start <= record.attendance_date')
              .where((period) =>
                period
                  .whereNull('assignment.effective_end')
                  .orWhereRaw('assignment.effective_end >= record.attendance_date'),
              ),
          );
        await records.update({
          locked_at: trx.fn.now(),
          locked_by: actor.userId,
          lock_reason: input.reason,
          updated_at: trx.fn.now(),
          version: trx.raw('version + 1'),
        });
        await writeAudit(
          trx,
          actor,
          input.companyId,
          'attendance.lock',
          'attendance_lock_period',
          id,
          'attendance.lock',
          requestContext,
          {
            reason: input.reason,
            metadata: {
              branchId: input.branchId ?? null,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
            },
          },
        );
        return { id, version: 1 };
      });
    },
    async reverseLock(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const lock = await repository.lockLockPeriod(id, trx);
        if (
          !lock ||
          (!allowsOrganization(context, lock.company_id, lock.branch_id, null) &&
            !context.grants.some(
              (grant) =>
                grant.scope_type === 'all' ||
                (grant.scope_type === 'company' &&
                  Number(grant.company_id) === Number(lock.company_id)),
            ))
        )
          throw notFound();
        if (lock.status !== 'locked')
          throw new ConflictError(
            'LOCK_ALREADY_REVERSED',
            'The attendance lock is already reversed.',
          );
        if (
          !(await repository.updateLock(
            id,
            input.version,
            {
              status: 'reversed',
              reversal_reason: input.reason,
              reversed_by: actor.userId,
              reversed_at: trx.fn.now(),
            },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The lock changed concurrently.');
        let records = trx('attendance_records as record')
          .where('record.company_id', lock.company_id)
          .whereBetween('record.attendance_date', [lock.period_start, lock.period_end]);
        if (lock.branch_id)
          records = records.whereExists(
            trx('employee_assignments as assignment')
              .select(1)
              .whereRaw('assignment.employment_id = record.employment_id')
              .where({ history_status: 'current', branch_id: lock.branch_id })
              .whereRaw('assignment.effective_start <= record.attendance_date')
              .where((period) =>
                period
                  .whereNull('assignment.effective_end')
                  .orWhereRaw('assignment.effective_end >= record.attendance_date'),
              ),
          );
        await records.update({
          locked_at: null,
          locked_by: null,
          lock_reason: null,
          updated_at: trx.fn.now(),
          version: trx.raw('version + 1'),
        });
        await writeAudit(
          trx,
          actor,
          lock.company_id,
          'attendance.unlock',
          'attendance_lock_period',
          id,
          'attendance.unlock',
          requestContext,
          { reason: input.reason },
        );
        return { id, version: input.version + 1 };
      });
    },
    async listLocks(context, companyId) {
      if (!allowsCompany(context, companyId)) throw notFound();
      return repository.listLocks(context, companyId);
    },
  };
}
