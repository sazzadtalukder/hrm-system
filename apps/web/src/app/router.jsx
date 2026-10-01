import { createBrowserRouter } from 'react-router';
import { AuthenticatedLayout } from '../layouts/AuthenticatedLayout.jsx';
import { FoundationPage } from '../pages/FoundationPage.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';
import { UnexpectedErrorPage } from '../pages/UnexpectedErrorPage.jsx';
import { LoginPage } from '../pages/LoginPage.jsx';
import { PasswordSetupPage } from '../features/accessManagement/PasswordSetupPage.jsx';
import { CompanyPage } from '../features/organization/CompanyPage.jsx';
import { MasterDataPage } from '../features/organization/MasterDataPage.jsx';
import { OrganizationLayout } from '../features/organization/OrganizationLayout.jsx';
import { MasterDetailPage } from '../features/organization/MasterDetailPage.jsx';
import { EmployeeLayout } from '../features/employees/EmployeeLayout.jsx';
import { EmployeeListPage } from '../features/employees/EmployeeListPage.jsx';
import { EmployeeCreatePage } from '../features/employees/EmployeeCreatePage.jsx';
import { EmployeeDetailPage, EmployeeOverview } from '../features/employees/EmployeeDetailPage.jsx';
import { EmployeeHistoryPage } from '../features/employees/EmployeeHistoryPage.jsx';
import { EmployeeSensitivePage } from '../features/employees/EmployeeSensitivePage.jsx';
import { AttendanceLayout } from '../features/attendance/AttendanceLayout.jsx';
import { AttendanceRecordsPage } from '../features/attendance/AttendanceRecordsPage.jsx';
import { AttendanceRecordPage } from '../features/attendance/AttendanceRecordPage.jsx';
import { AttendanceAdminPage } from '../features/attendance/AttendanceAdminPage.jsx';
import { AttendanceEventsPage } from '../features/attendance/AttendanceEventsPage.jsx';
import { AttendanceImportPage } from '../features/attendance/AttendanceImportPage.jsx';
import { AttendanceCalculatePage } from '../features/attendance/AttendanceCalculatePage.jsx';
import { LeaveLayout } from '../features/leave/LeaveLayout.jsx';
import { LeaveRequestsPage } from '../features/leave/LeaveRequestsPage.jsx';
import { LeaveRequestForm } from '../features/leave/LeaveRequestForm.jsx';
import { LeaveRequestDetail } from '../features/leave/LeaveRequestDetail.jsx';
import { LeaveBalancesPage } from '../features/leave/LeaveBalancesPage.jsx';
import { LeaveSetupPage } from '../features/leave/LeaveSetupPage.jsx';
import { PayrollLayout } from '../features/payroll/PayrollLayout.jsx';
import { PayrollRunsPage } from '../features/payroll/PayrollRunsPage.jsx';
import { PayrollSetupPage } from '../features/payroll/PayrollSetupPage.jsx';
import { PayrollRunCreatePage } from '../features/payroll/PayrollRunCreatePage.jsx';
import { PayrollRunDetailPage } from '../features/payroll/PayrollRunDetailPage.jsx';
import { PayrollResultPage } from '../features/payroll/PayrollResultPage.jsx';
import { PayslipsPage } from '../features/payroll/PayslipsPage.jsx';
import { PayrollInputsPage } from '../features/payroll/PayrollInputsPage.jsx';
import { BenefitLayout } from '../features/benefits/BenefitLayout.jsx';
import { BenefitPlansPage } from '../features/benefits/BenefitPlansPage.jsx';
import { BenefitPlanDetailPage } from '../features/benefits/BenefitPlanDetailPage.jsx';
import { BenefitEnrollmentsPage } from '../features/benefits/BenefitEnrollmentsPage.jsx';
import { BenefitEnrollmentCreatePage } from '../features/benefits/BenefitEnrollmentCreatePage.jsx';
import { BenefitEnrollmentDetailPage } from '../features/benefits/BenefitEnrollmentDetailPage.jsx';
import { BenefitHistoryPage } from '../features/benefits/BenefitHistoryPage.jsx';
import { ClaimLayout } from '../features/claims/ClaimLayout.jsx';
import { ClaimListPage } from '../features/claims/ClaimListPage.jsx';
import { ClaimCreatePage } from '../features/claims/ClaimCreatePage.jsx';
import { ClaimDetailPage } from '../features/claims/ClaimDetailPage.jsx';
import { ClaimHistoryPage } from '../features/claims/ClaimHistoryPage.jsx';
import { ClaimCategoriesPage } from '../features/claims/ClaimCategoriesPage.jsx';
import { ClaimCategoryDetailPage } from '../features/claims/ClaimCategoryDetailPage.jsx';
import { LoanLayout } from '../features/loans/LoanLayout.jsx';
import { LoanListPage } from '../features/loans/LoanListPage.jsx';
import { LoanCreatePage } from '../features/loans/LoanCreatePage.jsx';
import { LoanDetailPage } from '../features/loans/LoanDetailPage.jsx';
import { LoanAccountPage } from '../features/loans/LoanAccountPage.jsx';
import { LoanHistoryPage } from '../features/loans/LoanHistoryPage.jsx';
import { LoanTypesPage } from '../features/loans/LoanTypesPage.jsx';
import { LoanTypeDetailPage } from '../features/loans/LoanTypeDetailPage.jsx';
import { PerformanceLayout } from '../features/performance/PerformanceLayout.jsx';
import { PerformanceReviewsPage } from '../features/performance/PerformanceReviewsPage.jsx';
import { PerformanceReviewDetailPage } from '../features/performance/PerformanceReviewDetailPage.jsx';
import { PerformanceHistoryPage } from '../features/performance/PerformanceHistoryPage.jsx';
import { PerformanceCyclesPage } from '../features/performance/PerformanceCyclesPage.jsx';
import { PerformanceSetupPage } from '../features/performance/PerformanceSetupPage.jsx';
import { TrainingLayout } from '../features/training/TrainingLayout.jsx';
import { TrainingCatalogPage } from '../features/training/TrainingCatalogPage.jsx';
import { TrainingEnrollmentsPage } from '../features/training/TrainingEnrollmentsPage.jsx';
import { TrainingEnrollmentFormPage } from '../features/training/TrainingEnrollmentFormPage.jsx';
import { TrainingEnrollmentDetailPage } from '../features/training/TrainingEnrollmentDetailPage.jsx';
import { TrainingHistoryPage } from '../features/training/TrainingHistoryPage.jsx';
import { TrainingSetupPage } from '../features/training/TrainingSetupPage.jsx';
import { TrainingSessionAdminPage } from '../features/training/TrainingSessionAdminPage.jsx';
import { CareerLayout } from '../features/career/CareerLayout.jsx';
import { CareerPlansPage } from '../features/career/CareerPlansPage.jsx';
import { CareerPlanCreatePage } from '../features/career/CareerPlanCreatePage.jsx';
import { CareerPlanDetailPage } from '../features/career/CareerPlanDetailPage.jsx';
import { CareerPlanHistoryPage } from '../features/career/CareerPlanHistoryPage.jsx';
import { CareerPathsPage } from '../features/career/CareerPathsPage.jsx';
import { CareerPathDetailPage } from '../features/career/CareerPathDetailPage.jsx';
import { SuccessionLayout } from '../features/succession/SuccessionLayout.jsx';
import { SuccessionPlansPage } from '../features/succession/SuccessionPlansPage.jsx';
import { CriticalPositionsPage } from '../features/succession/CriticalPositionsPage.jsx';
import { SuccessorNominationsPage } from '../features/succession/SuccessorNominationsPage.jsx';
import { SuccessorNominationDetailPage } from '../features/succession/SuccessorNominationDetailPage.jsx';
import { SuccessionPlanCreatePage } from '../features/succession/SuccessionPlanCreatePage.jsx';
import { SuccessionPlanDetailPage } from '../features/succession/SuccessionPlanDetailPage.jsx';
import { CriticalPositionDetailPage } from '../features/succession/CriticalPositionDetailPage.jsx';
import { SuccessorNominationHistoryPage } from '../features/succession/SuccessorNominationHistoryPage.jsx';
import { ManagerDashboardPage } from '../features/managerSelfService/ManagerDashboardPage.jsx';
import { AssetLayout } from '../features/assets/AssetLayout.jsx';
import { AssetListPage } from '../features/assets/AssetListPage.jsx';
import { AssetDetailPage } from '../features/assets/AssetDetailPage.jsx';
import { AssetCreatePage } from '../features/assets/AssetCreatePage.jsx';
import { AssetSetupPage } from '../features/assets/AssetSetupPage.jsx';
import { DocumentLayout } from '../features/documents/DocumentLayout.jsx';
import { DocumentListPage } from '../features/documents/DocumentListPage.jsx';
import { DocumentDetailPage } from '../features/documents/DocumentDetailPage.jsx';
import { DocumentCreatePage } from '../features/documents/DocumentCreatePage.jsx';
import { DocumentSetupPage } from '../features/documents/DocumentSetupPage.jsx';
import { OperationsPage } from '../features/operations/OperationsPage.jsx';
import { AccessManagementPage } from '../features/accessManagement/AccessManagementPage.jsx';
import { RecruitmentListPage } from '../features/recruitment/RecruitmentListPage.jsx';
import { RecruitmentDetailPage } from '../features/recruitment/RecruitmentDetailPage.jsx';
import { RecruitmentCreatePage } from '../features/recruitment/RecruitmentCreatePage.jsx';
import { HiringDashboardPage } from '../features/recruitment/HiringDashboardPage.jsx';
import { OnboardingListPage } from '../features/onboarding/OnboardingListPage.jsx';
import { OnboardingCasePage } from '../features/onboarding/OnboardingCasePage.jsx';
import { OnboardingCreatePage } from '../features/onboarding/OnboardingCreatePage.jsx';
import { OnboardingTemplatePage } from '../features/onboarding/OnboardingTemplatePage.jsx';

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
    ErrorBoundary: UnexpectedErrorPage,
  },
  {
    path: '/set-password',
    Component: PasswordSetupPage,
    ErrorBoundary: UnexpectedErrorPage,
  },
  {
    path: '/',
    Component: AuthenticatedLayout,
    ErrorBoundary: UnexpectedErrorPage,
    children: [
      { index: true, Component: FoundationPage },
      {
        path: 'organization',
        Component: OrganizationLayout,
        children: [
          { index: true, Component: CompanyPage },
          { path: 'company', Component: CompanyPage },
          {
            path: 'branches',
            element: (
              <MasterDataPage title="Branches" path="branches" permissionResource="branch" />
            ),
          },
          {
            path: 'departments',
            element: (
              <MasterDataPage
                title="Departments"
                path="departments"
                permissionResource="department"
              />
            ),
          },
          {
            path: 'designations',
            element: (
              <MasterDataPage
                title="Designations"
                path="designations"
                permissionResource="designation"
              />
            ),
          },
          {
            path: 'grades',
            element: (
              <MasterDataPage
                title="Grades"
                path="grades"
                permissionResource="grade"
                kind="grade"
              />
            ),
          },
          {
            path: 'cost-centers',
            element: (
              <MasterDataPage
                title="Cost centers"
                path="cost-centers"
                permissionResource="cost_center"
              />
            ),
          },
          {
            path: 'work-calendars',
            element: (
              <MasterDataPage
                title="Work calendars"
                path="work-calendars"
                permissionResource="work_calendar"
                kind="calendar"
              />
            ),
          },
          {
            path: 'holidays',
            element: (
              <MasterDataPage
                title="Holidays"
                path="holidays"
                permissionResource="holiday"
                kind="holiday"
              />
            ),
          },
          {
            path: 'branches/:id',
            element: (
              <MasterDetailPage title="Branches" path="branches" permissionResource="branch" />
            ),
          },
          {
            path: 'departments/:id',
            element: (
              <MasterDetailPage
                title="Departments"
                path="departments"
                permissionResource="department"
              />
            ),
          },
          {
            path: 'designations/:id',
            element: (
              <MasterDetailPage
                title="Designations"
                path="designations"
                permissionResource="designation"
              />
            ),
          },
          {
            path: 'grades/:id',
            element: (
              <MasterDetailPage
                title="Grades"
                path="grades"
                permissionResource="grade"
                kind="grade"
              />
            ),
          },
          {
            path: 'cost-centers/:id',
            element: (
              <MasterDetailPage
                title="Cost centers"
                path="cost-centers"
                permissionResource="cost_center"
              />
            ),
          },
          {
            path: 'work-calendars/:id',
            element: (
              <MasterDetailPage
                title="Work calendars"
                path="work-calendars"
                permissionResource="work_calendar"
                kind="calendar"
              />
            ),
          },
          {
            path: 'holidays/:id',
            element: (
              <MasterDetailPage
                title="Holidays"
                path="holidays"
                permissionResource="holiday"
                kind="holiday"
              />
            ),
          },
        ],
      },
      {
        path: 'employees',
        Component: EmployeeLayout,
        children: [
          { index: true, Component: EmployeeListPage },
          { path: 'new', Component: EmployeeCreatePage },
          {
            path: ':id',
            Component: EmployeeDetailPage,
            children: [
              { index: true, Component: EmployeeOverview },
              { path: 'history', Component: EmployeeHistoryPage },
              { path: 'personal', element: <EmployeeSensitivePage kind="personal" /> },
              { path: 'contact', element: <EmployeeSensitivePage kind="contact" /> },
            ],
          },
        ],
      },
      {
        path: 'attendance',
        Component: AttendanceLayout,
        children: [
          { index: true, element: <AttendanceRecordsPage /> },
          { path: 'records', element: <AttendanceRecordsPage /> },
          { path: 'records/:id', Component: AttendanceRecordPage },
          { path: 'my', element: <AttendanceRecordsPage mode="own" /> },
          { path: 'team', element: <AttendanceRecordsPage mode="direct_reports" /> },
          { path: 'events', Component: AttendanceEventsPage },
          { path: 'imports', Component: AttendanceImportPage },
          { path: 'calculate', Component: AttendanceCalculatePage },
          { path: 'corrections', element: <AttendanceAdminPage kind="corrections" /> },
          { path: 'shifts', element: <AttendanceAdminPage kind="shifts" /> },
          { path: 'locks', element: <AttendanceAdminPage kind="locks" /> },
        ],
      },
      {
        path: 'leave',
        Component: LeaveLayout,
        children: [
          { index: true, element: <LeaveRequestsPage /> },
          { path: 'requests', element: <LeaveRequestsPage /> },
          { path: 'requests/:id', Component: LeaveRequestDetail },
          { path: 'my', element: <LeaveRequestsPage scopeView="own" /> },
          { path: 'my/:id', Component: LeaveRequestDetail },
          { path: 'team', element: <LeaveRequestsPage scopeView="direct_reports" /> },
          { path: 'team/:id', Component: LeaveRequestDetail },
          { path: 'new', Component: LeaveRequestForm },
          { path: 'balances', Component: LeaveBalancesPage },
          { path: 'setup', Component: LeaveSetupPage },
        ],
      },
      {
        path: 'payroll',
        Component: PayrollLayout,
        children: [
          { index: true, Component: PayrollRunsPage },
          { path: 'runs', Component: PayrollRunsPage },
          { path: 'runs/new', Component: PayrollRunCreatePage },
          { path: 'new', Component: PayrollRunCreatePage },
          { path: 'runs/:id', Component: PayrollRunDetailPage },
          { path: 'results/:id', Component: PayrollResultPage },
          { path: 'setup', Component: PayrollSetupPage },
          { path: 'inputs', Component: PayrollInputsPage },
          { path: 'my-payslips', Component: PayslipsPage },
        ],
      },
      {
        path: 'benefits',
        Component: BenefitLayout,
        children: [
          { index: true, Component: BenefitEnrollmentsPage },
          { path: 'enrollments', Component: BenefitEnrollmentsPage },
          { path: 'enrollments/:id', Component: BenefitEnrollmentDetailPage },
          { path: 'enrollments/:id/history', Component: BenefitHistoryPage },
          { path: 'new', Component: BenefitEnrollmentCreatePage },
          { path: 'plans', Component: BenefitPlansPage },
          { path: 'plans/:id', Component: BenefitPlanDetailPage },
          { path: 'my', element: <BenefitEnrollmentsPage own /> },
          { path: 'my/:id', element: <BenefitEnrollmentDetailPage own /> },
        ],
      },
      {
        path: 'claims',
        Component: ClaimLayout,
        children: [
          { index: true, element: <ClaimListPage view="own" /> },
          { path: 'my', element: <ClaimListPage view="own" /> },
          { path: 'my/:id', element: <ClaimDetailPage own /> },
          { path: 'team', element: <ClaimListPage view="team" /> },
          { path: 'team/:id', element: <ClaimDetailPage team /> },
          { path: 'all', Component: ClaimListPage },
          { path: 'new', Component: ClaimCreatePage },
          { path: 'categories', Component: ClaimCategoriesPage },
          { path: 'categories/:id', Component: ClaimCategoryDetailPage },
          { path: ':id', Component: ClaimDetailPage },
          { path: ':id/history', Component: ClaimHistoryPage },
        ],
      },
      {
        path: 'loans',
        Component: LoanLayout,
        children: [
          { index: true, element: <LoanListPage view="own" /> },
          { path: 'my', element: <LoanListPage view="own" /> },
          { path: 'my/:id', element: <LoanDetailPage own /> },
          { path: 'team', element: <LoanListPage view="team" /> },
          { path: 'team/:id', element: <LoanDetailPage team /> },
          { path: 'all', Component: LoanListPage },
          { path: 'new', Component: LoanCreatePage },
          { path: 'types', Component: LoanTypesPage },
          { path: 'types/:id', Component: LoanTypeDetailPage },
          { path: 'accounts/:id', Component: LoanAccountPage },
          { path: ':id', Component: LoanDetailPage },
          { path: ':id/history', Component: LoanHistoryPage },
        ],
      },
      {
        path: 'performance',
        Component: PerformanceLayout,
        children: [
          { index: true, element: <PerformanceReviewsPage view="own" /> },
          { path: 'my', element: <PerformanceReviewsPage view="own" /> },
          { path: 'my/:id', element: <PerformanceReviewDetailPage view="own" /> },
          { path: 'my/:id/history', element: <PerformanceHistoryPage view="own" /> },
          { path: 'team', element: <PerformanceReviewsPage view="team" /> },
          { path: 'team/:id', element: <PerformanceReviewDetailPage view="team" /> },
          { path: 'team/:id/history', element: <PerformanceHistoryPage view="team" /> },
          { path: 'all', Component: PerformanceReviewsPage },
          { path: 'cycles', Component: PerformanceCyclesPage },
          { path: 'setup', Component: PerformanceSetupPage },
          { path: ':id', Component: PerformanceReviewDetailPage },
          { path: ':id/history', Component: PerformanceHistoryPage },
        ],
      },
      {
        path: 'training',
        Component: TrainingLayout,
        children: [
          { index: true, Component: TrainingCatalogPage },
          { path: 'catalog', Component: TrainingCatalogPage },
          { path: 'sessions', element: <TrainingCatalogPage sessionsOnly /> },
          { path: 'my', element: <TrainingEnrollmentsPage view="own" /> },
          { path: 'my/new', Component: TrainingEnrollmentFormPage },
          { path: 'my/:id', element: <TrainingEnrollmentDetailPage view="own" /> },
          { path: 'my/:id/history', element: <TrainingHistoryPage view="own" /> },
          { path: 'team', element: <TrainingEnrollmentsPage view="team" /> },
          { path: 'team/:id', element: <TrainingEnrollmentDetailPage view="team" /> },
          { path: 'team/:id/history', element: <TrainingHistoryPage view="team" /> },
          { path: 'enrollments', Component: TrainingEnrollmentsPage },
          { path: 'enrollments/:id', Component: TrainingEnrollmentDetailPage },
          { path: 'enrollments/:id/history', Component: TrainingHistoryPage },
          { path: 'nominate', element: <TrainingEnrollmentFormPage source="nomination" /> },
          { path: 'assign', element: <TrainingEnrollmentFormPage source="assignment" /> },
          { path: 'setup', Component: TrainingSetupPage },
          { path: 'admin/sessions/new', Component: TrainingSessionAdminPage },
        ],
      },
      {
        path: 'career',
        Component: CareerLayout,
        children: [
          { index: true, element: <CareerPlansPage view="own" /> },
          { path: 'my', element: <CareerPlansPage view="own" /> },
          { path: 'my/new', Component: CareerPlanCreatePage },
          { path: 'my/:id', element: <CareerPlanDetailPage view="own" /> },
          { path: 'my/:id/history', element: <CareerPlanHistoryPage view="own" /> },
          { path: 'team', element: <CareerPlansPage view="team" /> },
          { path: 'team/:id', element: <CareerPlanDetailPage view="team" /> },
          { path: 'team/:id/history', element: <CareerPlanHistoryPage view="team" /> },
          { path: 'plans', Component: CareerPlansPage },
          { path: 'plans/:id', Component: CareerPlanDetailPage },
          { path: 'plans/:id/history', Component: CareerPlanHistoryPage },
          { path: 'paths', Component: CareerPathsPage },
          { path: 'paths/:id', Component: CareerPathDetailPage },
        ],
      },
      {
        path: 'succession',
        Component: SuccessionLayout,
        children: [
          { index: true, Component: SuccessionPlansPage },
          { path: 'plans', Component: SuccessionPlansPage },
          { path: 'plans/new', Component: SuccessionPlanCreatePage },
          { path: 'plans/:id', Component: SuccessionPlanDetailPage },
          { path: 'critical-positions', Component: CriticalPositionsPage },
          { path: 'critical-positions/:id', Component: CriticalPositionDetailPage },
          { path: 'nominations', Component: SuccessorNominationsPage },
          { path: 'nominations/:id', Component: SuccessorNominationDetailPage },
          { path: 'nominations/:id/history', Component: SuccessorNominationHistoryPage },
          { path: 'team', element: <SuccessorNominationsPage team /> },
          { path: 'team/:id', element: <SuccessorNominationDetailPage team /> },
          { path: 'team/:id/history', element: <SuccessorNominationHistoryPage team /> },
        ],
      },
      { path: 'manager', Component: ManagerDashboardPage },
      {
        path: 'recruitment',
        children: [
          { index: true, Component: HiringDashboardPage },
          ...[
            'manpower-plans',
            'requisitions',
            'postings',
            'candidates',
            'applications',
            'interviews',
            'assessments',
            'offers',
          ].map((resource) => ({
            path: resource,
            element: <RecruitmentListPage resource={resource} />,
          })),
          ...[
            'manpower-plans',
            'requisitions',
            'postings',
            'candidates',
            'applications',
            'interviews',
            'assessments',
            'offers',
          ].map((resource) => ({
            path: `${resource}/new`,
            element: <RecruitmentCreatePage resource={resource} />,
          })),
          ...[
            'manpower-plans',
            'requisitions',
            'postings',
            'candidates',
            'applications',
            'interviews',
            'assessments',
            'offers',
          ].map((resource) => ({
            path: `${resource}/:id`,
            element: <RecruitmentDetailPage resource={resource} />,
          })),
        ],
      },
      {
        path: 'onboarding',
        children: [
          { index: true, element: <OnboardingListPage /> },
          { path: 'cases', element: <OnboardingListPage /> },
          { path: 'cases/new', Component: OnboardingCreatePage },
          { path: 'cases/:id', Component: OnboardingCasePage },
          { path: 'my', element: <OnboardingListPage own /> },
          { path: 'my/:id', Component: OnboardingCasePage },
          { path: 'templates', element: <OnboardingListPage templates /> },
          { path: 'templates/new', element: <OnboardingCreatePage template /> },
          { path: 'templates/:id', Component: OnboardingTemplatePage },
        ],
      },
      {
        path: 'assets',
        Component: AssetLayout,
        children: [
          { index: true, element: <AssetListPage own /> },
          { path: 'my', element: <AssetListPage own /> },
          { path: 'my/:id', element: <AssetDetailPage own /> },
          { path: 'all', Component: AssetListPage },
          { path: 'all/:id', Component: AssetDetailPage },
          { path: 'new', Component: AssetCreatePage },
          { path: 'setup', Component: AssetSetupPage },
        ],
      },
      {
        path: 'documents',
        Component: DocumentLayout,
        children: [
          { index: true, element: <DocumentListPage own /> },
          { path: 'my', element: <DocumentListPage own /> },
          { path: 'my/:id', element: <DocumentDetailPage own /> },
          { path: 'all', Component: DocumentListPage },
          { path: 'all/:id', Component: DocumentDetailPage },
          { path: 'new', Component: DocumentCreatePage },
          { path: 'setup', Component: DocumentSetupPage },
        ],
      },
      { path: 'exits', element: <OperationsPage mode="exits" /> },
      { path: 'final-settlements', element: <OperationsPage mode="settlements" /> },
      { path: 'reports', element: <OperationsPage mode="reports" /> },
      { path: 'notifications', element: <OperationsPage mode="notifications" /> },
      { path: 'security-audit', element: <OperationsPage mode="security" /> },
      { path: 'administration/access', Component: AccessManagementPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
