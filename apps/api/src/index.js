import { createApp } from './app/createApp.js';
import { loadEnv } from './config/env.js';
import { createDatabase } from './infrastructure/database/knex.js';
import { createLogger } from './infrastructure/logging/logger.js';
import { createAccessRepository } from './modules/authorization/accessRepository.js';
import { createAccessService } from './modules/authorization/accessService.js';
import { createAuthenticationMiddleware } from './modules/identity/authenticationMiddleware.js';
import { createAuthorizationRepository } from './modules/authorization/authorizationRepository.js';
import { createAuthorizationService } from './modules/authorization/authorizationService.js';
import { createAuthController } from './modules/identity/authController.js';
import { createAuthService } from './modules/identity/authService.js';
import { createIdentityRepository } from './modules/identity/identityRepository.js';
import { createTokenService } from './modules/identity/token.js';
import { createUserRepository } from './modules/identity/userRepository.js';
import { createUserService } from './modules/identity/userService.js';
import { createPasswordSetupRepository } from './modules/identity/passwordSetupRepository.js';
import { createPasswordSetupService } from './modules/identity/passwordSetupService.js';
import { createOrganizationController } from './modules/organization/organizationController.js';
import { createOrganizationRepository } from './modules/organization/organizationRepository.js';
import { createOrganizationService } from './modules/organization/organizationService.js';
import { createEmployeeController } from './modules/employee/employeeController.js';
import { createEmployeeRepository } from './modules/employee/employeeRepository.js';
import { createEmployeeService } from './modules/employee/employeeService.js';
import { createAttendanceController } from './modules/attendance/attendanceController.js';
import { createAttendanceRepository } from './modules/attendance/attendanceRepository.js';
import { createAttendanceService } from './modules/attendance/attendanceService.js';
import { createLeaveController } from './modules/leave/leaveController.js';
import { createLeaveRepository } from './modules/leave/leaveRepository.js';
import { createLeaveService } from './modules/leave/leaveService.js';
import { createPayrollController } from './modules/payroll/payrollController.js';
import { createPayrollRepository } from './modules/payroll/payrollRepository.js';
import { createPayrollService } from './modules/payroll/payrollService.js';
import { createBenefitController } from './modules/benefits/benefitController.js';
import { createBenefitRepository } from './modules/benefits/benefitRepository.js';
import { createBenefitService } from './modules/benefits/benefitService.js';
import { createClaimController } from './modules/claims/claimController.js';
import { createClaimRepository } from './modules/claims/claimRepository.js';
import { createClaimService } from './modules/claims/claimService.js';
import { createLoanController } from './modules/loans/loanController.js';
import { createLoanRepository } from './modules/loans/loanRepository.js';
import { createLoanService } from './modules/loans/loanService.js';
import { createPerformanceController } from './modules/performance/performanceController.js';
import { createPerformanceRepository } from './modules/performance/performanceRepository.js';
import { createPerformanceService } from './modules/performance/performanceService.js';
import { createTrainingController } from './modules/training/trainingController.js';
import { createTrainingRepository } from './modules/training/trainingRepository.js';
import { createTrainingService } from './modules/training/trainingService.js';
import { createCareerController } from './modules/career/careerController.js';
import { createCareerRepository } from './modules/career/careerRepository.js';
import { createCareerService } from './modules/career/careerService.js';
import { createCareerSnapshotReader } from './modules/career/careerSnapshotReader.js';
import { createSuccessionController } from './modules/succession/successionController.js';
import { createSuccessionRepository } from './modules/succession/successionRepository.js';
import { createSuccessionService } from './modules/succession/successionService.js';
import { createManagerSelfServiceRepository } from './modules/managerSelfService/managerSelfServiceRepository.js';
import { createManagerSelfServiceService } from './modules/managerSelfService/managerSelfServiceService.js';
import { createManagerSelfServiceController } from './modules/managerSelfService/managerSelfServiceController.js';
import { createAssetRepository } from './modules/assets/assetRepository.js';
import { createAssetService } from './modules/assets/assetService.js';
import { createAssetController } from './modules/assets/assetController.js';
import { createDocumentRepository } from './modules/documents/documentRepository.js';
import { createDocumentService } from './modules/documents/documentService.js';
import { createDocumentController } from './modules/documents/documentController.js';
import { createRecruitmentRepository } from './modules/recruitment/recruitmentRepository.js';
import { createRecruitmentService } from './modules/recruitment/recruitmentService.js';
import { createRecruitmentController } from './modules/recruitment/recruitmentController.js';
import { createOnboardingRepository } from './modules/onboarding/onboardingRepository.js';
import { createOnboardingService } from './modules/onboarding/onboardingService.js';
import { createOnboardingController } from './modules/onboarding/onboardingController.js';
import { closeServer, startServer } from './server.js';

let server;
let database;
let logger = console;
let shutdownStarted = false;
let requestedExitCode = 0;

async function flushLogger() {
  if (typeof logger.flush !== 'function') return;
  await new Promise((resolve) => logger.flush(resolve));
}

async function shutdown(signal, timeoutMs, exitCode = 0) {
  requestedExitCode = Math.max(requestedExitCode, exitCode);
  if (shutdownStarted) return;
  shutdownStarted = true;
  logger.info({ signal }, 'Graceful shutdown started');

  const deadline = setTimeout(() => {
    logger.error('Graceful shutdown deadline exceeded');
    process.exit(1);
  }, timeoutMs);
  deadline.unref();

  try {
    if (server) await closeServer(server);
    if (database) await database.destroy();
    clearTimeout(deadline);
    logger.info('Graceful shutdown completed');
    await flushLogger();
    process.exitCode = requestedExitCode;
  } catch (error) {
    clearTimeout(deadline);
    logger.error({ err: error }, 'Graceful shutdown failed');
    process.exit(1);
  }
}

try {
  const env = loadEnv();
  logger = createLogger(env);
  const handleFatalError = (event, error) => {
    logger.fatal({ err: error, event }, 'Fatal process error');
    void shutdown(event, env.SHUTDOWN_TIMEOUT_MS, 1);
  };
  process.once('uncaughtException', (error) => handleFatalError('uncaughtException', error));
  process.once('unhandledRejection', (reason) =>
    handleFatalError(
      'unhandledRejection',
      reason instanceof Error ? reason : new Error('Unhandled promise rejection'),
    ),
  );
  database = createDatabase(env);
  const identityRepository = createIdentityRepository(database);
  const authorizationRepository = createAuthorizationRepository(database);
  const authorizationService = createAuthorizationService({ authorizationRepository });
  const tokenService = createTokenService(env);
  const authService = createAuthService({ database, env, identityRepository, tokenService });
  const passwordSetupRepository = createPasswordSetupRepository(database);
  const passwordSetupService = createPasswordSetupService({
    database,
    env,
    repository: passwordSetupRepository,
    identityRepository,
  });
  const authenticate = createAuthenticationMiddleware({ tokenService, identityRepository });
  const authController = createAuthController({
    authService,
    authorizationService,
    passwordSetupService,
    env,
  });
  const accessRepository = createAccessRepository();
  const accessService = createAccessService({ database, accessRepository });
  const userRepository = createUserRepository();
  const userService = createUserService({ database, identityRepository, userRepository });
  const organizationRepository = createOrganizationRepository(database);
  const organizationService = createOrganizationService({
    database,
    repository: organizationRepository,
  });
  const organizationController = createOrganizationController(organizationService);
  const employeeRepository = createEmployeeRepository(database);
  const employeeService = createEmployeeService({
    database,
    repository: employeeRepository,
    authorizationService,
  });
  const employeeController = createEmployeeController(employeeService);
  const leaveRepository = createLeaveRepository(database);
  const leaveService = createLeaveService({
    database,
    repository: leaveRepository,
    authorizationService,
  });
  const leaveController = createLeaveController(leaveService);
  const attendanceRepository = createAttendanceRepository(database);
  const attendanceService = createAttendanceService({
    database,
    repository: attendanceRepository,
    leaveReader: leaveService,
  });
  const attendanceController = createAttendanceController(attendanceService);
  const payrollRepository = createPayrollRepository(database);
  const payrollService = createPayrollService({ database, repository: payrollRepository });
  const payrollController = createPayrollController(payrollService);
  const benefitRepository = createBenefitRepository(database);
  const benefitService = createBenefitService({
    database,
    repository: benefitRepository,
    authorizationService,
  });
  const benefitController = createBenefitController(benefitService);
  const claimRepository = createClaimRepository(database);
  const claimService = createClaimService({
    database,
    repository: claimRepository,
    authorizationService,
  });
  const claimController = createClaimController(claimService);
  const loanRepository = createLoanRepository(database);
  const loanService = createLoanService({
    database,
    repository: loanRepository,
    authorizationService,
  });
  const loanController = createLoanController(loanService);
  const performanceRepository = createPerformanceRepository(database);
  const performanceService = createPerformanceService({
    database,
    repository: performanceRepository,
    authorizationService,
  });
  const performanceController = createPerformanceController(performanceService);
  const trainingRepository = createTrainingRepository(database);
  const trainingService = createTrainingService({
    database,
    repository: trainingRepository,
    authorizationService,
  });
  const trainingController = createTrainingController(trainingService);
  const careerSnapshotReader = createCareerSnapshotReader(database);
  const careerRepository = createCareerRepository(database);
  const careerService = createCareerService({
    database,
    repository: careerRepository,
    snapshotReader: careerSnapshotReader,
    authorizationService,
  });
  const careerController = createCareerController(careerService);
  const successionRepository = createSuccessionRepository(database);
  const successionService = createSuccessionService({
    database,
    repository: successionRepository,
    snapshotReader: careerSnapshotReader,
    authorizationService,
  });
  const successionController = createSuccessionController(successionService);
  const managerSelfServiceRepository = createManagerSelfServiceRepository(database);
  const managerSelfServiceService = createManagerSelfServiceService(managerSelfServiceRepository);
  const managerSelfServiceController =
    createManagerSelfServiceController(managerSelfServiceService);
  const assetRepository = createAssetRepository(database);
  const assetService = createAssetService({ database, repository: assetRepository });
  const assetController = createAssetController(assetService);
  const documentRepository = createDocumentRepository(database);
  const documentService = createDocumentService({
    database,
    repository: documentRepository,
    authorizationService,
  });
  const documentController = createDocumentController(documentService);
  const recruitmentRepository = createRecruitmentRepository(database);
  const recruitmentService = createRecruitmentService({
    database,
    repository: recruitmentRepository,
    employeeService,
    authorizationService,
  });
  const recruitmentController = createRecruitmentController(recruitmentService);
  const onboardingRepository = createOnboardingRepository(database);
  const onboardingService = createOnboardingService({ database, repository: onboardingRepository });
  const onboardingController = createOnboardingController(onboardingService);
  const app = createApp({
    env,
    logger,
    database,
    authenticate,
    authController,
    authService,
    authorizationService,
    accessService,
    userService,
    passwordSetupService,
    organizationController,
    employeeController,
    attendanceController,
    leaveController,
    payrollController,
    benefitController,
    claimController,
    loanController,
    performanceController,
    trainingController,
    careerController,
    successionController,
    managerSelfServiceController,
    assetController,
    documentController,
    recruitmentController,
    onboardingController,
  });
  server = await startServer(app, { host: env.API_HOST, port: env.API_PORT });
  logger.info({ host: env.API_HOST, port: env.API_PORT }, 'HRM API started');

  process.once('SIGINT', () => shutdown('SIGINT', env.SHUTDOWN_TIMEOUT_MS));
  process.once('SIGTERM', () => shutdown('SIGTERM', env.SHUTDOWN_TIMEOUT_MS));
} catch (error) {
  logger.error?.({ err: error }, 'API startup failed');
  if (database) await database.destroy().catch(() => undefined);
  await flushLogger().catch(() => undefined);
  process.exitCode = 1;
}
