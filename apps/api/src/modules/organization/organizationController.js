import { sendSuccess } from '../../common/http/responses.js';

function execute(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response);
    } catch (error) {
      next(error);
    }
  };
}

export function createOrganizationController(service) {
  const list = (resource) =>
    execute(async (request, response) => {
      sendSuccess(
        response,
        await service.list(resource, request.accessContext, request.validated.query),
      );
    });
  const get = (resource) =>
    execute(async (request, response) => {
      sendSuccess(
        response,
        await service.get(resource, request.validated.params.id, request.accessContext),
      );
    });
  const create = (resource) =>
    execute(async (request, response) => {
      sendSuccess(
        response,
        await service.create(
          resource,
          request.actor,
          request.accessContext,
          request.validated.body,
          request.context,
        ),
        201,
      );
    });
  const update = (resource) =>
    execute(async (request, response) => {
      sendSuccess(
        response,
        await service.update(
          resource,
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      );
    });
  const lifecycle = (resource, status) =>
    execute(async (request, response) => {
      await service.setStatus(
        resource,
        request.actor,
        request.accessContext,
        request.validated.params.id,
        status,
        request.validated.body,
        request.context,
      );
      response.status(204).end();
    });

  return {
    listCompanies: execute(async (request, response) =>
      sendSuccess(response, { items: await service.listCompanies(request.accessContext) }),
    ),
    getCompany: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.getCompany(request.validated.params.id, request.accessContext),
      ),
    ),
    updateCompany: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.updateCompany(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    listBranches: list('branch'),
    getBranch: get('branch'),
    createBranch: create('branch'),
    updateBranch: update('branch'),
    activateBranch: lifecycle('branch', 'active'),
    deactivateBranch: lifecycle('branch', 'inactive'),
    listDepartments: list('department'),
    getDepartment: get('department'),
    createDepartment: create('department'),
    updateDepartment: update('department'),
    activateDepartment: lifecycle('department', 'active'),
    deactivateDepartment: lifecycle('department', 'inactive'),
    listDesignations: list('designation'),
    getDesignation: get('designation'),
    createDesignation: create('designation'),
    updateDesignation: update('designation'),
    activateDesignation: lifecycle('designation', 'active'),
    deactivateDesignation: lifecycle('designation', 'inactive'),
    listGrades: list('grade'),
    getGrade: get('grade'),
    createGrade: create('grade'),
    updateGrade: update('grade'),
    activateGrade: lifecycle('grade', 'active'),
    deactivateGrade: lifecycle('grade', 'inactive'),
    listCostCenters: list('cost_center'),
    getCostCenter: get('cost_center'),
    createCostCenter: create('cost_center'),
    updateCostCenter: update('cost_center'),
    activateCostCenter: lifecycle('cost_center', 'active'),
    deactivateCostCenter: lifecycle('cost_center', 'inactive'),
    listWorkCalendars: list('work_calendar'),
    getWorkCalendar: get('work_calendar'),
    createWorkCalendar: create('work_calendar'),
    updateWorkCalendar: update('work_calendar'),
    activateWorkCalendar: lifecycle('work_calendar', 'active'),
    deactivateWorkCalendar: lifecycle('work_calendar', 'inactive'),
    replaceCalendarDays: execute(async (request, response) =>
      sendSuccess(
        response,
        await service.replaceCalendarDays(
          request.actor,
          request.accessContext,
          request.validated.params.id,
          request.validated.body,
          request.context,
        ),
      ),
    ),
    listHolidays: list('holiday'),
    getHoliday: get('holiday'),
    createHoliday: create('holiday'),
    updateHoliday: update('holiday'),
    cancelHoliday: execute(async (request, response) => {
      await service.cancelHoliday(
        request.actor,
        request.accessContext,
        request.validated.params.id,
        request.validated.body,
        request.context,
      );
      response.status(204).end();
    }),
  };
}
