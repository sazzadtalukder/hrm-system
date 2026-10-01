import { createHealthRouter } from '../routes/health.js';
import { createAccessRouter } from '../modules/authorization/accessRoutes.js';
import { createAuthRouter } from '../modules/identity/authRoutes.js';
import { createUserRouter } from '../modules/identity/userRoutes.js';
import { createOrganizationRouter } from '../modules/organization/organizationRoutes.js';
import { createEmployeeRouter } from '../modules/employee/employeeRoutes.js';
import { createAttendanceRouter } from '../modules/attendance/attendanceRoutes.js';
import { createLeaveRouter } from '../modules/leave/leaveRoutes.js';
import { createPayrollRouter } from '../modules/payroll/payrollRoutes.js';
import { createBenefitRouter } from '../modules/benefits/benefitRoutes.js';
import { createClaimRouter } from '../modules/claims/claimRoutes.js';
import { createLoanRouter } from '../modules/loans/loanRoutes.js';
import { createPerformanceRouter } from '../modules/performance/performanceRoutes.js';
import { createTrainingRouter } from '../modules/training/trainingRoutes.js';
import { createCareerRouter } from '../modules/career/careerRoutes.js';
import { createSuccessionRouter } from '../modules/succession/successionRoutes.js';
import { createManagerSelfServiceRouter } from '../modules/managerSelfService/managerSelfServiceRoutes.js';
import { createAssetRouter } from '../modules/assets/assetRoutes.js';
import { createDocumentRouter } from '../modules/documents/documentRoutes.js';
import { createExitRouter } from '../modules/exits/exitRoutes.js';
import { createSettlementRouter } from '../modules/settlements/settlementRoutes.js';
import { createReportRouter } from '../modules/reports/reportRoutes.js';
import { createNotificationRouter } from '../modules/notifications/notificationRoutes.js';
import { createSecurityAuditRouter } from '../modules/securityAudit/securityAuditRoutes.js';
import { createRecruitmentRouter } from '../modules/recruitment/recruitmentRoutes.js';
import { createOnboardingRouter } from '../modules/onboarding/onboardingRoutes.js';

export function registerRoutes(app, dependencies) {
  app.use('/health', createHealthRouter(dependencies));
  app.use('/auth', createAuthRouter(dependencies));
  app.use('/access', createAccessRouter(dependencies));
  app.use('/users', createUserRouter(dependencies));
  app.use('/organization', createOrganizationRouter(dependencies));
  if (dependencies.employeeController) app.use('/employees', createEmployeeRouter(dependencies));
  if (dependencies.attendanceController) {
    app.use('/attendance', createAttendanceRouter(dependencies));
  }
  if (dependencies.leaveController) app.use('/leave', createLeaveRouter(dependencies));
  if (dependencies.payrollController) app.use('/payroll', createPayrollRouter(dependencies));
  if (dependencies.benefitController) app.use('/benefits', createBenefitRouter(dependencies));
  if (dependencies.claimController) app.use('/claims', createClaimRouter(dependencies));
  if (dependencies.loanController) app.use('/loans', createLoanRouter(dependencies));
  if (dependencies.performanceController)
    app.use('/performance', createPerformanceRouter(dependencies));
  if (dependencies.trainingController) app.use('/training', createTrainingRouter(dependencies));
  if (dependencies.careerController) app.use('/career', createCareerRouter(dependencies));
  if (dependencies.successionController)
    app.use('/succession', createSuccessionRouter(dependencies));
  if (dependencies.managerSelfServiceController)
    app.use('/manager-self-service', createManagerSelfServiceRouter(dependencies));
  if (dependencies.assetController) app.use('/assets', createAssetRouter(dependencies));
  if (dependencies.documentController) app.use('/documents', createDocumentRouter(dependencies));
  if (dependencies.recruitmentController)
    app.use('/recruitment', createRecruitmentRouter(dependencies));
  if (dependencies.onboardingController)
    app.use('/onboarding', createOnboardingRouter(dependencies));
  app.use('/exits', createExitRouter(dependencies));
  app.use('/final-settlements', createSettlementRouter(dependencies));
  app.use('/reports', createReportRouter(dependencies));
  app.use('/notifications', createNotificationRouter(dependencies));
  app.use('/security-audit', createSecurityAuditRouter(dependencies));
}
