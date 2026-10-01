import {
  ApplicationError,
  ConflictError,
  ValidationError,
  AuthorizationError,
} from '../../common/errors/ApplicationError.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import { insertAuditEvent } from '../audit/auditRepository.js';
import {
  notifyEmploymentUser,
  notifyPermissionHolders,
} from '../notifications/workflowNotificationRepository.js';
import { PAYROLL_LIMITS } from './payrollConstants.js';
import { fromMinorUnits, toMinorUnits } from './payrollMoney.js';

const notFound = () =>
  new ApplicationError({
    code: 'NOT_FOUND',
    message: 'The requested payroll record was not found.',
    statusCode: 404,
  });
const contextMeta = (ctx) => ({ requestId: ctx?.requestId, correlationId: ctx?.correlationId });

export function createPayrollService({ database, repository }) {
  async function audit(
    trx,
    actor,
    companyId,
    action,
    type,
    id,
    permission,
    requestContext,
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
      ...contextMeta(requestContext),
    });
  }
  function requireCompany(context, companyId) {
    if (!repository.companyAllowed(context, companyId)) throw notFound();
  }
  function requireCompanyWide(context, companyId) {
    if (!repository.companyWideAllowed(context, companyId)) throw notFound();
  }
  async function requireEmploymentScope(context, employment, date, trx) {
    const assignment = await repository.getEmploymentAssignment(employment.id, date, trx);
    if (
      !repository.recordAllowed(context, {
        company_id: employment.company_id,
        branch_id: assignment?.branch_id,
        department_id: assignment?.department_id,
      })
    )
      throw notFound();
  }
  async function transition(actor, context, id, input, target, permission, requestContext) {
    return withTransaction(database, async (trx) => {
      const run = await repository.lockRun(id, trx);
      if (!run || !(await repository.getRun(id, context, permission, trx))) throw notFound();
      if (run.workflow_version !== input.workflowVersion)
        throw new ConflictError('STALE_WORKFLOW_VERSION', 'The payroll run changed.');
      const allowed =
        target === 'submitted'
          ? run.status === 'processed'
          : target === 'locked'
            ? run.status === 'approved'
            : false;
      if (!allowed)
        throw new ConflictError(
          'INVALID_WORKFLOW_STATE',
          'The payroll run cannot perform this transition.',
        );
      if (target === 'submitted') {
        if (run.calculation_status !== 'completed')
          throw new ConflictError(
            'PAYROLL_INCOMPLETE',
            'Every frozen employee must have a successful result before submission.',
          );
        const failed = await trx('payroll_run_employees')
          .where({ payroll_run_id: id })
          .whereNot('calculation_status', 'success')
          .first();
        if (failed)
          throw new ConflictError(
            'PAYROLL_INCOMPLETE',
            'Every frozen employee must have a successful result before submission.',
          );
        const attemptNumber = await repository.nextApprovalAttempt(id, trx);
        await repository.createApprovalAttempt(
          {
            company_id: run.company_id,
            payroll_run_id: id,
            attempt_number: attemptNumber,
            submitted_workflow_version: run.workflow_version + 1,
          },
          trx,
        );
      }
      if (
        target === 'locked' &&
        [run.processed_by, run.submitted_by, run.approved_by].some(
          (x) => Number(x) === Number(actor.userId),
        )
      )
        throw new AuthorizationError('Separation of duties prevents this payroll action.');
      const changes =
        target === 'submitted'
          ? { status: target, submitted_by: actor.userId, submitted_at: trx.fn.now() }
          : { status: target, locked_by: actor.userId, locked_at: trx.fn.now() };
      if (!(await repository.updateRun(id, run.workflow_version, changes, trx)))
        throw new ConflictError('STALE_WORKFLOW_VERSION', 'The payroll run changed.');
      await repository.createState(
        {
          company_id: run.company_id,
          payroll_run_id: id,
          from_state: run.status,
          to_state: target,
          workflow_version: run.workflow_version + 1,
          reason: input.reason,
          acting_user_id: actor.userId,
        },
        trx,
      );
      if (target === 'locked')
        await trx('payroll_locks').insert({
          company_id: run.company_id,
          payroll_run_id: id,
          reason: input.reason,
          locked_by: actor.userId,
        });
      await audit(
        trx,
        actor,
        run.company_id,
        `payroll.${target === 'submitted' ? 'submit' : 'lock'}`,
        'payroll_run',
        id,
        permission,
        requestContext,
      );
      if (target === 'submitted')
        await notifyPermissionHolders(
          trx,
          {
            companyId: run.company_id,
            type: 'payroll.approval_required',
            title: 'Payroll run awaiting approval',
            message: 'A processed payroll run requires a finance decision.',
            referenceType: 'payroll_run',
            referenceId: id,
            idempotencyKey: `payroll:${id}:submitted:${run.workflow_version + 1}`,
            actorUserId: actor.userId,
          },
          'payroll.approve',
        );
      if (target === 'locked')
        await notifyPermissionHolders(
          trx,
          {
            companyId: run.company_id,
            type: 'payroll.payslip_publication_required',
            title: 'Payroll ready for payslip publication',
            message: 'A locked payroll run is ready for payslip publication.',
            referenceType: 'payroll_run',
            referenceId: id,
            idempotencyKey: `payroll:${id}:locked:${run.workflow_version + 1}`,
            actorUserId: actor.userId,
          },
          'payslip.publish',
        );
      return { id, status: target, workflowVersion: run.workflow_version + 1 };
    });
  }

  return {
    limits: PAYROLL_LIMITS,
    listPeriods: (context, input) => repository.listPeriods(context, input),
    listComponents: (context, input) => repository.listComponents(context, input),
    listRuns: (context, input) => repository.listRuns(context, input),
    getRun: async (context, id) => {
      const run = await repository.getRun(id, context);
      if (!run) throw notFound();
      return {
        ...run,
        employees: await repository.listRunEmployees(id),
        results: await repository.getResults(id),
      };
    },
    async createPeriod(actor, context, input, requestContext) {
      requireCompanyWide(context, input.companyId);
      return withTransaction(database, async (trx) => {
        const company = await repository.lockCompany(input.companyId, trx);
        if (!company || company.status !== 'active')
          throw new ValidationError('The company is not active.');
        if (
          await repository.findPeriodOverlap(
            input.companyId,
            input.periodStart,
            input.periodEnd,
            trx,
          )
        )
          throw new ConflictError(
            'PAYROLL_PERIOD_OVERLAP',
            'The payroll period overlaps an existing period.',
          );
        const id = await repository.createPeriod(
          {
            company_id: input.companyId,
            code: input.code,
            name: input.name,
            period_start: input.periodStart,
            period_end: input.periodEnd,
            payment_date: input.paymentDate,
            created_by: actor.userId,
            updated_by: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          input.companyId,
          'payroll_period.create',
          'payroll_period',
          id,
          'payroll_period.create',
          requestContext,
        );
        return { id };
      });
    },
    async createComponent(actor, context, input, requestContext) {
      requireCompanyWide(context, input.companyId);
      return withTransaction(database, async (trx) => {
        if (!(await repository.getCompany(input.companyId, trx)))
          throw new ValidationError('The company does not exist.');
        const id = await repository.createComponent(
          {
            company_id: input.companyId,
            code: input.code,
            name: input.name,
            component_type: input.componentType,
            created_by: actor.userId,
            updated_by: actor.userId,
          },
          trx,
        );
        await repository.createComponentVersion(
          {
            company_id: input.companyId,
            payroll_component_id: id,
            effective_start: input.effectiveStart,
            show_on_payslip: input.showOnPayslip,
            display_order: input.displayOrder,
            created_by: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          input.companyId,
          'payroll_component.create',
          'payroll_component',
          id,
          'payroll_component.create',
          requestContext,
        );
        return { id };
      });
    },
    async updatePeriod(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const period = await repository.lockPeriod(id, trx);
        if (!period || !repository.companyWideAllowed(context, period.company_id)) throw notFound();
        if (
          await trx('payroll_runs')
            .where({ payroll_period_id: id })
            .whereNot('status', 'draft')
            .first()
        )
          throw new ConflictError(
            'PAYROLL_PERIOD_IN_USE',
            'A payroll period in processing history cannot be changed.',
          );
        if (
          !(await repository.updatePeriod(
            id,
            input.version,
            { name: input.name, payment_date: input.paymentDate, updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The payroll period changed.');
        await audit(
          trx,
          actor,
          period.company_id,
          'payroll_period.update',
          'payroll_period',
          id,
          'payroll_period.update',
          requestContext,
        );
        return { id, version: input.version + 1 };
      });
    },
    async updateComponent(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const component = await repository.lockComponent(id, trx);
        if (!component || !repository.companyWideAllowed(context, component.company_id))
          throw notFound();
        if (
          !(await repository.updateComponent(
            id,
            input.version,
            { name: input.name, updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The payroll component changed.');
        await audit(
          trx,
          actor,
          component.company_id,
          'payroll_component.update',
          'payroll_component',
          id,
          'payroll_component.update',
          requestContext,
        );
        return { id, version: input.version + 1 };
      });
    },
    async deactivateComponent(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const component = await repository.lockComponent(id, trx);
        if (!component || !repository.companyWideAllowed(context, component.company_id))
          throw notFound();
        if (
          !(await repository.updateComponent(
            id,
            input.version,
            { status: 'inactive', updated_by: actor.userId },
            trx,
          ))
        )
          throw new ConflictError('STALE_VERSION', 'The payroll component changed.');
        await audit(
          trx,
          actor,
          component.company_id,
          'payroll_component.deactivate',
          'payroll_component',
          id,
          'payroll_component.deactivate',
          requestContext,
          { reason: input.reason },
        );
        return { id, status: 'inactive', version: input.version + 1 };
      });
    },
    async addCompensation(actor, context, employmentId, input, requestContext) {
      requireCompany(context, input.companyId);
      return withTransaction(database, async (trx) => {
        const employment = await repository.lockEmployment(employmentId, trx);
        const company = await repository.getCompany(input.companyId, trx);
        if (!employment || Number(employment.company_id) !== input.companyId) throw notFound();
        await requireEmploymentScope(context, employment, input.effectiveStart, trx);
        if (!company || company.currency_code !== input.currencyCode)
          throw new ValidationError('Compensation currency must match the company currency.');
        if (
          await repository.findCompOverlap(
            employmentId,
            input.effectiveStart,
            input.effectiveEnd,
            trx,
          )
        )
          throw new ConflictError(
            'COMPENSATION_OVERLAP',
            'The compensation period overlaps an existing period.',
          );
        const id = await repository.createCompensation(
          {
            company_id: input.companyId,
            employment_id: employmentId,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            monthly_base_amount: input.monthlyBaseAmount,
            currency_code: input.currencyCode,
            reason: input.reason,
            created_by: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          input.companyId,
          'employee_compensation.create',
          'employment_compensation_period',
          id,
          'employee_compensation.update',
          requestContext,
        );
        return { id };
      });
    },
    async listCompensation(actor, context, employmentId, requestContext) {
      const employment = await repository.getEmploymentById(employmentId);
      if (!employment) throw notFound();
      await requireEmploymentScope(
        context,
        employment,
        new Date().toISOString().slice(0, 10),
        database,
      );
      const rows = await repository.listCompensation(employmentId);
      await insertAuditEvent(database, {
        actorUserId: actor.userId,
        companyId: employment.company_id,
        actionCode: 'employee_compensation.view',
        outcome: 'success',
        recordType: 'employment',
        recordId: employmentId,
        permissionCode: 'employee_compensation.view',
        ...contextMeta(requestContext),
      });
      return rows;
    },
    async addRecurring(actor, context, employmentId, input, requestContext) {
      requireCompany(context, input.companyId);
      return withTransaction(database, async (trx) => {
        const employment = await repository.lockEmployment(employmentId, trx);
        if (!employment || Number(employment.company_id) !== input.companyId) throw notFound();
        await requireEmploymentScope(context, employment, input.effectiveStart, trx);
        if (
          await repository.findRecurringOverlap(
            employmentId,
            input.payrollComponentId,
            input.effectiveStart,
            input.effectiveEnd,
            trx,
          )
        )
          throw new ConflictError(
            'RECURRING_COMPONENT_OVERLAP',
            'The recurring component overlaps an existing period.',
          );
        const id = await repository.createRecurring(
          {
            company_id: input.companyId,
            employment_id: employmentId,
            payroll_component_id: input.payrollComponentId,
            effective_start: input.effectiveStart,
            effective_end: input.effectiveEnd ?? null,
            amount: input.amount,
            reason: input.reason,
            created_by: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          input.companyId,
          'payroll_input.recurring_create',
          'employment_recurring_payroll_component',
          id,
          'payroll_input.create',
          requestContext,
        );
        return { id };
      });
    },
    async createInput(actor, context, input, requestContext) {
      requireCompany(context, input.companyId);
      return withTransaction(database, async (trx) => {
        const period = await repository.getPeriod(input.payrollPeriodId, input.companyId, trx);
        const employment = await repository.getEmployment(input.employmentId, input.companyId, trx);
        if (!period || !employment)
          throw new ValidationError('The payroll input references invalid company data.');
        await requireEmploymentScope(context, employment, period.period_end, trx);
        try {
          const id = await repository.createInput(
            {
              company_id: input.companyId,
              payroll_period_id: input.payrollPeriodId,
              employment_id: input.employmentId,
              payroll_component_id: input.payrollComponentId,
              amount: input.amount,
              reason: input.reason,
              idempotency_key: input.idempotencyKey,
              created_by: actor.userId,
            },
            trx,
          );
          await audit(
            trx,
            actor,
            input.companyId,
            'payroll_input.create',
            'payroll_one_time_input',
            id,
            'payroll_input.create',
            requestContext,
          );
          return { id };
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'IDEMPOTENCY_CONFLICT',
              'The idempotency key has already been used.',
            );
          throw error;
        }
      });
    },
    async createRun(actor, context, input, requestContext) {
      requireCompany(context, input.companyId);
      return withTransaction(database, async (trx) => {
        await repository.lockCompany(input.companyId, trx);
        const period = await repository.getPeriod(input.payrollPeriodId, input.companyId, trx);
        if (!period || period.status !== 'active')
          throw new ValidationError('The payroll period is not active.');
        const population = await repository.resolvePopulation(input, period, context, trx);
        if (!population.length)
          throw new ValidationError('No eligible employments matched the authorized population.');
        if (population.length > PAYROLL_LIMITS.maximumRunEmployments)
          throw new ValidationError(
            `A payroll run cannot exceed ${PAYROLL_LIMITS.maximumRunEmployments} employments.`,
          );
        if (input.employmentIds && population.length !== new Set(input.employmentIds).size)
          throw new ValidationError(
            'One or more requested employments are ineligible or outside the authorized scope.',
          );
        let id;
        try {
          id = await repository.createRun(
            {
              company_id: input.companyId,
              payroll_period_id: input.payrollPeriodId,
              code: input.code,
              created_by: actor.userId,
            },
            trx,
          );
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'PAYROLL_RUN_CONFLICT',
              'A regular payroll run already exists for the period or code.',
            );
          throw error;
        }
        await repository.addRunEmployees(
          population.map((row) => ({
            company_id: input.companyId,
            payroll_run_id: id,
            employment_id: row.employment_id,
            employee_code_snapshot: row.employee_code,
            employee_name_snapshot: row.display_name,
            branch_id_snapshot: row.branch_id,
            department_id_snapshot: row.department_id,
          })),
          trx,
        );
        await repository.createState(
          {
            company_id: input.companyId,
            payroll_run_id: id,
            from_state: null,
            to_state: 'draft',
            workflow_version: 1,
            reason: 'Payroll run created',
            acting_user_id: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          input.companyId,
          'payroll.create',
          'payroll_run',
          id,
          'payroll.create',
          requestContext,
          { metadata: { employeeCount: population.length } },
        );
        return { id, employeeCount: population.length, workflowVersion: 1 };
      });
    },
    async process(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const run = await repository.lockRun(id, trx);
        const visible = run && (await repository.getRun(id, context, 'payroll.process', trx));
        if (!visible) throw notFound();
        if (
          !['draft', 'processed'].includes(run.status) ||
          run.workflow_version !== input.workflowVersion
        )
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The payroll run cannot be processed in its current state.',
          );
        const existing = await trx('payroll_calculation_attempts')
          .where({ company_id: run.company_id, idempotency_key: input.idempotencyKey })
          .first();
        if (existing)
          return { id, attemptId: existing.id, status: existing.status, replayed: true };
        const members = await repository.listRunEmployees(id, trx);
        const attemptNumber = await repository.nextAttemptNumber(id, trx);
        const attemptId = await repository.createAttempt(
          {
            company_id: run.company_id,
            payroll_run_id: id,
            attempt_number: attemptNumber,
            status: 'processing',
            idempotency_key: input.idempotencyKey,
            employee_count: members.length,
            requested_by: actor.userId,
          },
          trx,
        );
        let success = 0;
        let failure = 0;
        let grossTotal = 0n;
        let deductionsTotal = 0n;
        for (const member of members) {
          try {
            const employment = await repository.getEmployment(
              member.employment_id,
              run.company_id,
              trx,
            );
            const employmentEnd = employment?.employment_end_date
              ? employment.employment_end_date instanceof Date
                ? employment.employment_end_date.toISOString().slice(0, 10)
                : String(employment.employment_end_date).slice(0, 10)
              : null;
            const periodEnd =
              visible.period_end instanceof Date
                ? visible.period_end.toISOString().slice(0, 10)
                : String(visible.period_end).slice(0, 10);
            const compensationDate =
              employmentEnd && employmentEnd < periodEnd ? employmentEnd : periodEnd;
            const compensation = await repository.effectiveCompensation(
              member.employment_id,
              compensationDate,
              trx,
            );
            if (!compensation) throw new ValidationError('Missing effective compensation.');
            const company = await repository.getCompany(run.company_id, trx);
            if (compensation.currency_code !== company.currency_code)
              throw new ValidationError('Compensation currency mismatch.');
            const recurring = await repository.recurringAt(
              member.employment_id,
              compensationDate,
              trx,
            );
            const oneTime = await repository.inputsFor(
              run.payroll_period_id,
              member.employment_id,
              trx,
            );
            const base = toMinorUnits(compensation.monthly_base_amount);
            let earnings = base;
            let deductions = 0n;
            const sources = [...recurring, ...oneTime];
            for (const source of sources) {
              const amount = toMinorUnits(source.amount);
              if (source.component_type === 'earning') earnings += amount;
              else deductions += amount;
            }
            if (deductions > earnings)
              throw new ValidationError('Payroll deductions would create negative net pay.');
            const prior = await repository.activeResult(member.id, trx);
            if (prior)
              await repository.createResultState(
                {
                  company_id: run.company_id,
                  payroll_result_version_id: prior.id,
                  state: 'superseded',
                  reason: input.reason,
                  acting_user_id: actor.userId,
                },
                trx,
              );
            const version = await repository.nextResultVersion(member.id, trx);
            const attendance = await repository.attendanceSummary(
              run.company_id,
              member.employment_id,
              visible.period_start,
              visible.period_end,
              trx,
            );
            const leave = await repository.leaveSummary(
              run.company_id,
              member.employment_id,
              visible.period_start,
              visible.period_end,
              trx,
            );
            const resultId = await repository.createResult(
              {
                company_id: run.company_id,
                payroll_run_employee_id: member.id,
                calculation_attempt_id: attemptId,
                version_number: version,
                currency_code: compensation.currency_code,
                monthly_base_amount: fromMinorUnits(base),
                gross_earnings: fromMinorUnits(earnings),
                total_deductions: fromMinorUnits(deductions),
                net_pay: fromMinorUnits(earnings - deductions),
                supersedes_result_id: prior?.id ?? null,
              },
              trx,
            );
            const attendanceCounts = Object.fromEntries(
              attendance.map((row) => [row.status, Number(row.count)]),
            );
            await repository.createAttendanceSnapshot(
              {
                company_id: run.company_id,
                payroll_result_version_id: resultId,
                present_days: attendanceCounts.present ?? 0,
                absent_days: attendanceCounts.absent ?? 0,
                incomplete_days: attendanceCounts.incomplete ?? 0,
                on_leave_days: attendanceCounts.on_leave ?? 0,
                rest_days: attendanceCounts.rest_day ?? 0,
                holiday_days: attendanceCounts.holiday ?? 0,
                configuration_exception_days: attendanceCounts.configuration_exception ?? 0,
                source_record_count: attendance.reduce((sum, row) => sum + Number(row.count), 0),
              },
              trx,
            );
            await repository.createLeaveSnapshot(
              {
                company_id: run.company_id,
                payroll_result_version_id: resultId,
                approved_units: leave?.units ?? '0.00',
              },
              trx,
            );
            await repository.createResultState(
              {
                company_id: run.company_id,
                payroll_result_version_id: resultId,
                state: 'active',
                reason: input.reason,
                acting_user_id: actor.userId,
              },
              trx,
            );
            const items = [
              {
                company_id: run.company_id,
                payroll_result_version_id: resultId,
                payroll_component_id: null,
                component_code_snapshot: 'BASE_SALARY',
                component_name_snapshot: 'Base salary',
                component_type: 'earning',
                source_type: 'base_salary',
                amount: fromMinorUnits(base),
                show_on_payslip: true,
              },
              ...sources.map((source) => ({
                company_id: run.company_id,
                payroll_result_version_id: resultId,
                payroll_component_id: source.payroll_component_id,
                component_code_snapshot: source.code,
                component_name_snapshot: source.name,
                component_type: source.component_type,
                source_type: source.payroll_period_id ? 'one_time' : 'recurring',
                amount: fromMinorUnits(toMinorUnits(source.amount)),
                show_on_payslip: source.show_on_payslip ?? true,
              })),
            ];
            await repository.createItems(items, trx);
            await repository.updateRunEmployee(
              member.id,
              { calculation_status: 'success', failure_code: null, failure_message: null },
              trx,
            );
            success += 1;
            grossTotal += earnings;
            deductionsTotal += deductions;
          } catch (error) {
            await repository.updateRunEmployee(
              member.id,
              {
                calculation_status: 'failed',
                failure_code: error instanceof ApplicationError ? error.code : 'CALCULATION_FAILED',
                failure_message:
                  error instanceof ApplicationError
                    ? error.message.slice(0, 500)
                    : 'Payroll calculation failed.',
              },
              trx,
            );
            failure += 1;
          }
        }
        const status = failure === 0 ? 'completed' : success === 0 ? 'failed' : 'partially_failed';
        await repository.finishAttempt(
          attemptId,
          { status, success_count: success, failure_count: failure, completed_at: trx.fn.now() },
          trx,
        );
        await repository.createTotals(
          {
            company_id: run.company_id,
            calculation_attempt_id: attemptId,
            employee_count: success,
            failure_count: failure,
            gross_earnings: fromMinorUnits(grossTotal),
            total_deductions: fromMinorUnits(deductionsTotal),
            net_pay: fromMinorUnits(grossTotal - deductionsTotal),
          },
          trx,
        );
        await repository.updateRun(
          id,
          run.workflow_version,
          {
            status: 'processed',
            calculation_status: status,
            current_attempt_id: attemptId,
            processed_by: actor.userId,
          },
          trx,
        );
        await repository.createState(
          {
            company_id: run.company_id,
            payroll_run_id: id,
            from_state: run.status,
            to_state: 'processed',
            workflow_version: run.workflow_version + 1,
            reason: input.reason,
            acting_user_id: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          run.company_id,
          'payroll.process',
          'payroll_run',
          id,
          'payroll.process',
          requestContext,
          { metadata: { attemptId, successCount: success, failureCount: failure } },
        );
        return {
          id,
          attemptId,
          status,
          successCount: success,
          failureCount: failure,
          workflowVersion: run.workflow_version + 1,
        };
      });
    },
    submit: (actor, context, id, input, requestContext) =>
      transition(actor, context, id, input, 'submitted', 'payroll.submit', requestContext),
    async decide(actor, context, id, decision, input, requestContext) {
      const permission = decision === 'approved' ? 'payroll.approve' : 'payroll.reject';
      return withTransaction(database, async (trx) => {
        const run = await repository.lockRun(id, trx);
        if (!run || !(await repository.getRun(id, context, permission, trx))) throw notFound();
        const replay = await repository.decisionByKey(run.company_id, input.idempotencyKey, trx);
        if (replay) {
          if (replay.decision !== decision || Number(replay.payroll_run_id) !== id)
            throw new ConflictError(
              'IDEMPOTENCY_CONFLICT',
              'The idempotency key was used for another decision.',
            );
          return {
            id,
            status: decision === 'approved' ? 'approved' : 'processed',
            workflowVersion: replay.record_workflow_version + 1,
            replayed: true,
          };
        }
        if (run.status !== 'submitted' || run.workflow_version !== input.workflowVersion)
          throw new ConflictError(
            'STALE_WORKFLOW_VERSION',
            'The payroll run is no longer awaiting this decision.',
          );
        if ([run.processed_by, run.submitted_by].some((x) => Number(x) === Number(actor.userId)))
          throw new AuthorizationError('Separation of duties prevents this payroll decision.');
        const attempt = await repository.pendingApprovalAttempt(id, trx);
        if (!attempt)
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'No payroll approval attempt is pending.',
          );
        const target = decision === 'approved' ? 'approved' : 'processed';
        await repository.createDecision(
          {
            company_id: run.company_id,
            payroll_run_id: id,
            payroll_approval_attempt_id: attempt.id,
            decision,
            record_workflow_version: run.workflow_version,
            reason: input.reason,
            idempotency_key: input.idempotencyKey,
            decided_by: actor.userId,
          },
          trx,
        );
        await repository.finishApprovalAttempt(attempt.id, decision, trx);
        await repository.updateRun(
          id,
          run.workflow_version,
          target === 'approved'
            ? { status: target, approved_by: actor.userId, approved_at: trx.fn.now() }
            : { status: target, approved_by: null, approved_at: null },
          trx,
        );
        await repository.createState(
          {
            company_id: run.company_id,
            payroll_run_id: id,
            from_state: 'submitted',
            to_state: target,
            workflow_version: run.workflow_version + 1,
            reason: input.reason,
            acting_user_id: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          run.company_id,
          `payroll.${decision === 'approved' ? 'approve' : 'reject'}`,
          'payroll_run',
          id,
          permission,
          requestContext,
        );
        await notifyPermissionHolders(
          trx,
          {
            companyId: run.company_id,
            type: `payroll.${decision}`,
            title: 'Payroll decision recorded',
            message: `A payroll run was ${decision}.`,
            referenceType: 'payroll_run',
            referenceId: id,
            idempotencyKey: `payroll:${id}:${decision}:${run.workflow_version + 1}`,
            actorUserId: actor.userId,
          },
          decision === 'approved' ? 'payroll.lock' : 'payroll.process',
        );
        return { id, status: target, workflowVersion: run.workflow_version + 1, replayed: false };
      });
    },
    lock: (actor, context, id, input, requestContext) =>
      transition(actor, context, id, input, 'locked', 'payroll.lock', requestContext),
    async publish(actor, context, id, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const run = await repository.lockRun(id, trx);
        if (!run || !(await repository.getRun(id, context, 'payslip.publish', trx)))
          throw notFound();
        if (run.status !== 'locked')
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'Payslips may be published only after payroll is locked.',
          );
        const results = await repository.getResults(id, trx);
        for (const result of results) {
          const latest = await repository.latestPublication(result.id, trx);
          if (latest?.status === 'published') continue;
          await repository.createPublication(
            {
              company_id: run.company_id,
              payroll_result_version_id: result.id,
              status: 'published',
              publication_version: Number(latest?.publication_version ?? 0) + 1,
              reason: input.reason,
              acting_user_id: actor.userId,
            },
            trx,
          );
        }
        await audit(
          trx,
          actor,
          run.company_id,
          'payslip.publish',
          'payroll_run',
          id,
          'payslip.publish',
          requestContext,
          { metadata: { resultCount: results.length } },
        );
        const members = await trx('payroll_run_employees').where({ payroll_run_id: id });
        for (const member of members)
          await notifyEmploymentUser(
            trx,
            {
              companyId: run.company_id,
              type: 'payslip.published',
              title: 'Payslip available',
              message: 'Your payslip has been published and is available to view.',
              referenceType: 'payroll_run',
              referenceId: id,
              idempotencyKey: `payroll:${id}:payslip:${member.id}`,
              actorUserId: actor.userId,
            },
            member.employment_id,
          );
        return { id, publishedCount: results.length };
      });
    },
    async createAdjustment(actor, context, resultId, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const result = await repository.getResult(resultId, trx);
        if (!result || result.run_status !== 'locked' || !repository.recordAllowed(context, result))
          throw notFound();
        try {
          const [id] = await trx('payroll_adjustments').insert({
            company_id: result.company_id,
            original_result_id: resultId,
            payroll_component_id: input.payrollComponentId,
            component_type: input.componentType,
            amount: input.amount,
            reason: input.reason,
            idempotency_key: input.idempotencyKey,
            requested_by: actor.userId,
          });
          await audit(
            trx,
            actor,
            result.company_id,
            'payroll_adjustment.create',
            'payroll_adjustment',
            id,
            'payroll.adjust',
            requestContext,
          );
          return { id, status: 'draft', workflowVersion: 1 };
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'IDEMPOTENCY_CONFLICT',
              'The idempotency key has already been used.',
            );
          throw error;
        }
      });
    },
    async adjustmentTransition(actor, context, id, action, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const adjustment = await trx('payroll_adjustments').where({ id }).forUpdate().first();
        if (!adjustment || !repository.companyAllowed(context, adjustment.company_id))
          throw notFound();
        if (adjustment.workflow_version !== input.workflowVersion)
          throw new ConflictError('STALE_WORKFLOW_VERSION', 'The adjustment changed.');
        const transitions = {
          submit: ['draft', 'submitted'],
          approve: ['submitted', 'approved'],
          reject: ['submitted', 'rejected'],
          apply: ['approved', 'applied'],
        };
        const [from, to] = transitions[action];
        if (adjustment.status !== from)
          throw new ConflictError(
            'INVALID_WORKFLOW_STATE',
            'The adjustment cannot perform this transition.',
          );
        if (
          ['approve', 'reject'].includes(action) &&
          Number(adjustment.requested_by) === Number(actor.userId)
        )
          throw new AuthorizationError(
            'The adjustment requester cannot decide their own adjustment.',
          );
        let correctedResultId = null;
        if (action === 'apply') {
          const original = await repository.getResult(adjustment.original_result_id, trx);
          const amount = toMinorUnits(adjustment.amount);
          const gross =
            toMinorUnits(original.gross_earnings) +
            (adjustment.component_type === 'earning' ? amount : 0n);
          const deductions =
            toMinorUnits(original.total_deductions) +
            (adjustment.component_type === 'deduction' ? amount : 0n);
          if (deductions > gross)
            throw new ValidationError('The adjustment would create negative net pay.');
          const version = await repository.nextResultVersion(original.payroll_run_employee_id, trx);
          correctedResultId = await repository.createResult(
            {
              company_id: original.company_id,
              payroll_run_employee_id: original.payroll_run_employee_id,
              calculation_attempt_id: null,
              version_number: version,
              currency_code: original.currency_code,
              monthly_base_amount: original.monthly_base_amount,
              gross_earnings: fromMinorUnits(gross),
              total_deductions: fromMinorUnits(deductions),
              net_pay: fromMinorUnits(gross - deductions),
              supersedes_result_id: original.id,
            },
            trx,
          );
          await repository.cloneResultSnapshots(
            original.id,
            correctedResultId,
            original.company_id,
            trx,
          );
          await repository.createResultState(
            {
              company_id: original.company_id,
              payroll_result_version_id: original.id,
              state: 'superseded',
              reason: input.reason,
              acting_user_id: actor.userId,
            },
            trx,
          );
          await repository.createResultState(
            {
              company_id: original.company_id,
              payroll_result_version_id: correctedResultId,
              state: 'active',
              reason: input.reason,
              acting_user_id: actor.userId,
            },
            trx,
          );
          const items = await repository.getItems(original.id, trx);
          await repository.createItems(
            [
              ...items.map((item) => ({
                company_id: original.company_id,
                payroll_result_version_id: correctedResultId,
                payroll_component_id: item.payroll_component_id,
                component_code_snapshot: item.component_code_snapshot,
                component_name_snapshot: item.component_name_snapshot,
                component_type: item.component_type,
                source_type: item.source_type,
                amount: item.amount,
                show_on_payslip: item.show_on_payslip,
              })),
              {
                company_id: original.company_id,
                payroll_result_version_id: correctedResultId,
                payroll_component_id: adjustment.payroll_component_id,
                component_code_snapshot: 'ADJUSTMENT',
                component_name_snapshot: 'Payroll adjustment',
                component_type: adjustment.component_type,
                source_type: 'adjustment',
                amount: adjustment.amount,
                show_on_payslip: true,
              },
            ],
            trx,
          );
          const publication = await repository.latestPublication(original.id, trx);
          if (publication?.status === 'published') {
            await repository.createPublication(
              {
                company_id: original.company_id,
                payroll_result_version_id: original.id,
                status: 'revoked',
                publication_version: Number(publication.publication_version) + 1,
                reason: input.reason,
                acting_user_id: actor.userId,
              },
              trx,
            );
            await repository.createPublication(
              {
                company_id: original.company_id,
                payroll_result_version_id: correctedResultId,
                status: 'published',
                publication_version: 1,
                reason: input.reason,
                acting_user_id: actor.userId,
              },
              trx,
            );
          }
        }
        await trx('payroll_adjustments')
          .where({ id, workflow_version: adjustment.workflow_version })
          .update({
            status: to,
            workflow_version: adjustment.workflow_version + 1,
            decided_by: ['approve', 'reject'].includes(action)
              ? actor.userId
              : adjustment.decided_by,
            corrected_result_id: correctedResultId ?? adjustment.corrected_result_id,
            updated_at: trx.fn.now(),
          });
        await audit(
          trx,
          actor,
          adjustment.company_id,
          `payroll_adjustment.${action}`,
          'payroll_adjustment',
          id,
          action === 'submit' ? 'payroll.adjust' : 'payroll_adjustment.approve',
          requestContext,
        );
        return {
          id,
          status: to,
          workflowVersion: adjustment.workflow_version + 1,
          correctedResultId,
        };
      });
    },
    async reverseResult(actor, context, resultId, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const result = await repository.getResult(resultId, trx);
        if (!result || !repository.recordAllowed(context, result)) throw notFound();
        try {
          const [id] = await trx('payroll_reversals').insert({
            company_id: result.company_id,
            original_result_id: resultId,
            reason: input.reason,
            idempotency_key: input.idempotencyKey,
            reversed_by: actor.userId,
          });
          await repository.createResultState(
            {
              company_id: result.company_id,
              payroll_result_version_id: resultId,
              state: 'reversed',
              reason: input.reason,
              acting_user_id: actor.userId,
            },
            trx,
          );
          const publication = await repository.latestPublication(resultId, trx);
          if (publication?.status === 'published')
            await repository.createPublication(
              {
                company_id: result.company_id,
                payroll_result_version_id: resultId,
                status: 'revoked',
                publication_version: Number(publication.publication_version) + 1,
                reason: input.reason,
                acting_user_id: actor.userId,
              },
              trx,
            );
          await audit(
            trx,
            actor,
            result.company_id,
            'payroll.reverse',
            'payroll_result',
            resultId,
            'payroll.reverse',
            requestContext,
          );
          return { id, resultId, reversed: true };
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY')
            throw new ConflictError(
              'REVERSAL_CONFLICT',
              'The result or idempotency key has already been reversed/used.',
            );
          throw error;
        }
      });
    },
    async revokePublication(actor, context, resultId, input, requestContext) {
      return withTransaction(database, async (trx) => {
        const result = await repository.getResult(resultId, trx);
        if (!result || !repository.recordAllowed(context, result)) throw notFound();
        const latest = await repository.latestPublication(resultId, trx);
        if (!latest || latest.status !== 'published')
          throw new ConflictError('PUBLICATION_CONFLICT', 'No active payslip publication exists.');
        await repository.createPublication(
          {
            company_id: result.company_id,
            payroll_result_version_id: resultId,
            status: 'revoked',
            publication_version: Number(latest.publication_version) + 1,
            reason: input.reason,
            acting_user_id: actor.userId,
          },
          trx,
        );
        await audit(
          trx,
          actor,
          result.company_id,
          'payslip.revoke_publication',
          'payroll_result',
          resultId,
          'payslip.revoke_publication',
          requestContext,
        );
        return { resultId, status: 'revoked' };
      });
    },
    listOwnPayslips: (actor) => repository.listOwnPayslips(actor.userId),
    async getResult(context, id) {
      const result = await repository.getResult(id);
      if (!result || !repository.recordAllowed(context, result)) throw notFound();
      return {
        ...result,
        items: await repository.getItems(id),
        publication: await repository.latestPublication(id),
      };
    },
    async exportRun(actor, context, id, requestContext) {
      const run = await repository.getRun(id, context, 'payroll.export');
      if (!run) throw notFound();
      const results = await repository.getResults(id);
      const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const lines = [
        ['employee_code', 'employee_name', 'period', 'gross', 'deductions', 'net', 'currency'],
        ...results.map((result) => [
          result.employee_code_snapshot,
          result.employee_name_snapshot,
          run.period_code,
          result.gross_earnings,
          result.total_deductions,
          result.net_pay,
          result.currency_code,
        ]),
      ];
      await insertAuditEvent(database, {
        actorUserId: actor.userId,
        companyId: run.company_id,
        actionCode: 'payroll.export',
        outcome: 'success',
        recordType: 'payroll_run',
        recordId: id,
        permissionCode: 'payroll.export',
        metadata: { resultCount: results.length },
        ...contextMeta(requestContext),
      });
      return lines.map((row) => row.map(escape).join(',')).join('\r\n');
    },
  };
}
