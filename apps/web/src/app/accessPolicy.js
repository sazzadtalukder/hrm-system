const any = (...permissions) => permissions;

export const navigationItems = [
  {
    label: 'Organization',
    group: 'Workforce',
    children: [
      { label: 'Company', to: '/organization/company', permissions: any('company.view') },
      { label: 'Branches', to: '/organization/branches', permissions: any('branch.view') },
      {
        label: 'Departments',
        to: '/organization/departments',
        permissions: any('department.view'),
      },
      {
        label: 'Designations',
        to: '/organization/designations',
        permissions: any('designation.view'),
      },
      { label: 'Grades', to: '/organization/grades', permissions: any('grade.view') },
      {
        label: 'Cost Centers',
        to: '/organization/cost-centers',
        permissions: any('cost_center.view'),
      },
      {
        label: 'Work Calendars',
        to: '/organization/work-calendars',
        permissions: any('work_calendar.view'),
      },
      { label: 'Holidays', to: '/organization/holidays', permissions: any('holiday.view') },
    ],
  },
  {
    label: 'Employees',
    group: 'Workforce',
    children: [
      { label: 'Directory', to: '/employees', permissions: any('employee.view') },
      { label: 'Add Employee', to: '/employees/new', permissions: any('employee.create') },
    ],
  },
  {
    label: 'Recruitment',
    group: 'Workforce',
    children: [
      {
        label: 'Hiring Dashboard',
        to: '/recruitment',
        permissions: any(
          'job_requisition.view',
          'job_posting.view',
          'candidate.view',
          'recruitment_application.view',
          'recruitment_interview.view',
          'recruitment_offer.view',
        ),
      },
      {
        label: 'Manpower Plans',
        to: '/recruitment/manpower-plans',
        permissions: any('manpower_plan.view'),
      },
      {
        label: 'Requisitions',
        to: '/recruitment/requisitions',
        permissions: any('job_requisition.view'),
      },
      { label: 'Job Postings', to: '/recruitment/postings', permissions: any('job_posting.view') },
      { label: 'Candidates', to: '/recruitment/candidates', permissions: any('candidate.view') },
      {
        label: 'Applications',
        to: '/recruitment/applications',
        permissions: any('recruitment_application.view'),
      },
      {
        label: 'Interviews',
        to: '/recruitment/interviews',
        permissions: any('recruitment_interview.view'),
      },
      {
        label: 'Assessments',
        to: '/recruitment/assessments',
        permissions: any('recruitment_assessment.view'),
      },
      { label: 'Offers', to: '/recruitment/offers', permissions: any('recruitment_offer.view') },
    ],
  },
  {
    label: 'Onboarding',
    group: 'Workforce',
    children: [
      {
        label: 'Onboarding Dashboard',
        to: '/onboarding',
        permissions: any('onboarding_case.view'),
      },
      { label: 'Cases', to: '/onboarding/cases', permissions: any('onboarding_case.view') },
      {
        label: 'My Onboarding',
        to: '/onboarding/my',
        permissions: any('onboarding_case.view_own'),
      },
      {
        label: 'Templates',
        to: '/onboarding/templates',
        permissions: any('onboarding_template.view'),
      },
    ],
  },
  {
    label: 'Attendance',
    group: 'Time & Leave',
    children: [
      { label: 'Records', to: '/attendance/records', permissions: any('attendance.view') },
      { label: 'My Attendance', to: '/attendance/my', permissions: any('attendance.view') },
      { label: 'Team Attendance', to: '/attendance/team', permissions: any('attendance.view') },
      { label: 'Events', to: '/attendance/events', permissions: any('attendance_event.view') },
      {
        label: 'Imports',
        to: '/attendance/imports',
        permissions: any('attendance_import.view', 'attendance_import.create'),
      },
      { label: 'Calculate', to: '/attendance/calculate', permissions: any('attendance.calculate') },
      {
        label: 'Corrections',
        to: '/attendance/corrections',
        permissions: any('attendance_correction.view'),
      },
      { label: 'Shifts', to: '/attendance/shifts', permissions: any('attendance_shift.view') },
      {
        label: 'Locks',
        to: '/attendance/locks',
        permissions: any('attendance.lock', 'attendance.unlock'),
      },
    ],
  },
  {
    label: 'Leave',
    group: 'Time & Leave',
    children: [
      { label: 'Requests', to: '/leave/requests', permissions: any('leave.view') },
      { label: 'My Leave', to: '/leave/my', permissions: any('leave.view') },
      { label: 'Team Leave', to: '/leave/team', permissions: any('leave.view') },
      { label: 'Apply', to: '/leave/new', permissions: any('leave.apply') },
      { label: 'Balances', to: '/leave/balances', permissions: any('leave_balance.view') },
      {
        label: 'Setup',
        to: '/leave/setup',
        permissions: any(
          'leave_type.create',
          'leave_policy.view',
          'leave_policy.create',
          'leave_policy.assign',
        ),
      },
    ],
  },
  {
    label: 'Payroll',
    group: 'Payroll & Finance',
    children: [
      { label: 'Payroll Runs', to: '/payroll/runs', permissions: any('payroll.view') },
      { label: 'New Payroll Run', to: '/payroll/runs/new', permissions: any('payroll.create') },
      {
        label: 'Payroll Setup',
        to: '/payroll/setup',
        permissions: any('payroll_period.view', 'payroll_component.view'),
      },
      {
        label: 'Inputs',
        to: '/payroll/inputs',
        permissions: any('payroll_input.view', 'payroll_input.create'),
      },
      { label: 'My Payslips', to: '/payroll/my-payslips', permissions: any('payslip.view_own') },
    ],
  },
  {
    label: 'Benefits',
    group: 'Payroll & Finance',
    children: [
      {
        label: 'Enrollments',
        to: '/benefits/enrollments',
        permissions: any('benefit_enrollment.view'),
      },
      { label: 'My Benefits', to: '/benefits/my', permissions: any('benefit_enrollment.view_own') },
      { label: 'Plans', to: '/benefits/plans', permissions: any('benefit_plan.view') },
      {
        label: 'New Enrollment',
        to: '/benefits/new',
        permissions: any('benefit_enrollment.create'),
      },
    ],
  },
  {
    label: 'Claims',
    group: 'Payroll & Finance',
    children: [
      { label: 'My Claims', to: '/claims/my', permissions: any('claim.view_own') },
      { label: 'Team Claims', to: '/claims/team', permissions: any('claim.view_team') },
      { label: 'All Claims', to: '/claims/all', permissions: any('claim.view') },
      { label: 'New Claim', to: '/claims/new', permissions: any('claim.create') },
      { label: 'Categories', to: '/claims/categories', permissions: any('claim_category.view') },
    ],
  },
  {
    label: 'Loans',
    group: 'Payroll & Finance',
    children: [
      { label: 'My Facilities', to: '/loans/my', permissions: any('loan.view_own') },
      { label: 'Team Facilities', to: '/loans/team', permissions: any('loan.view_team') },
      { label: 'All Facilities', to: '/loans/all', permissions: any('loan.view') },
      { label: 'Apply', to: '/loans/new', permissions: any('loan.apply') },
      { label: 'Facility Types', to: '/loans/types', permissions: any('loan_type.view') },
    ],
  },
  {
    label: 'Performance',
    group: 'Talent & Development',
    children: [
      {
        label: 'Team Reviews',
        to: '/performance/team',
        permissions: any('performance_review.view_team'),
      },
      { label: 'All Reviews', to: '/performance/all', permissions: any('performance_review.view') },
      {
        label: 'Review Cycles',
        to: '/performance/cycles',
        permissions: any('performance_cycle.view'),
      },
      { label: 'Setup', to: '/performance/setup', permissions: any('performance_template.create') },
    ],
  },
  {
    label: 'Training',
    group: 'Talent & Development',
    children: [
      { label: 'Catalog', to: '/training/catalog', permissions: any('training_course.view') },
      { label: 'Sessions', to: '/training/sessions', permissions: any('training_session.view') },
      {
        label: 'My Learning',
        to: '/training/my',
        permissions: any('training_enrollment.view_own'),
      },
      {
        label: 'Team Learning',
        to: '/training/team',
        permissions: any('training_enrollment.view_team'),
      },
      {
        label: 'Enrollments',
        to: '/training/enrollments',
        permissions: any('training_enrollment.view'),
      },
      { label: 'Setup', to: '/training/setup', permissions: any('training_course.create') },
    ],
  },
  {
    label: 'Career',
    group: 'Talent & Development',
    children: [
      { label: 'My Career Plan', to: '/career/my', permissions: any('career_plan.view_own') },
      { label: 'Team Career Plans', to: '/career/team', permissions: any('career_plan.view_team') },
      { label: 'Career Plans', to: '/career/plans', permissions: any('career_plan.view') },
      { label: 'Career Paths', to: '/career/paths', permissions: any('career_path.view') },
    ],
  },
  {
    label: 'Succession',
    group: 'Talent & Development',
    children: [
      {
        label: 'Succession Plans',
        to: '/succession/plans',
        permissions: any('succession_plan.view'),
      },
      {
        label: 'Critical Positions',
        to: '/succession/critical-positions',
        permissions: any('critical_position.view'),
      },
      {
        label: 'Nominations',
        to: '/succession/nominations',
        permissions: any('succession_nomination.view'),
      },
      {
        label: 'Team Nominations',
        to: '/succession/team',
        permissions: any('succession_nomination.view_team'),
      },
    ],
  },
  {
    label: 'Manager workspace',
    to: '/manager',
    permissions: any('manager_self_service.view'),
    group: 'My Workspace',
  },
  {
    label: 'My Performance',
    to: '/performance/my',
    permissions: any('performance_review.view_own'),
    group: 'My Workspace',
  },
  {
    label: 'Assets',
    group: 'Operations',
    children: [
      { label: 'My Assets', to: '/assets/my', permissions: any('asset.view_own') },
      { label: 'Asset Register', to: '/assets/all', permissions: any('asset.view') },
      { label: 'New Asset', to: '/assets/new', permissions: any('asset.create') },
      { label: 'Asset Setup', to: '/assets/setup', permissions: any('asset_category.create') },
    ],
  },
  {
    label: 'Documents',
    group: 'Operations',
    children: [
      { label: 'My Documents', to: '/documents/my', permissions: any('document.view_own') },
      { label: 'Document Register', to: '/documents/all', permissions: any('document.view') },
      { label: 'Add Document', to: '/documents/new', permissions: any('document.create') },
      { label: 'Document Setup', to: '/documents/setup', permissions: any('document_type.create') },
    ],
  },
  { label: 'Exits', to: '/exits', permissions: any('exit.view'), group: 'Operations' },
  {
    label: 'Settlements',
    to: '/final-settlements',
    permissions: any('final_settlement.view'),
    group: 'Payroll & Finance',
  },
  { label: 'Reports', to: '/reports', permissions: any('report.workforce'), group: 'Reports' },
  {
    label: 'Notifications',
    to: '/notifications',
    permissions: any('notification.view_own'),
    placement: 'header',
  },
  {
    label: 'Audit & Security',
    to: '/security-audit',
    permissions: any('audit.view'),
    group: 'Administration & Security',
  },
  {
    label: 'Access management',
    to: '/administration/access',
    permissions: any('user.view', 'role.view'),
    group: 'Administration & Security',
  },
];

export const navigationGroups = [
  'My Workspace',
  'Workforce',
  'Time & Leave',
  'Payroll & Finance',
  'Talent & Development',
  'Operations',
  'Reports',
  'Administration & Security',
];

const broadScopes = ['all', 'company', 'branch', 'department'];

const policies = [
  [/^\/recruitment\/manpower-plans\/new\/?$/, any('manpower_plan.create')],
  [/^\/recruitment\/manpower-plans(?:\/.*)?$/, any('manpower_plan.view')],
  [/^\/recruitment\/requisitions\/new\/?$/, any('job_requisition.create')],
  [/^\/recruitment\/requisitions(?:\/.*)?$/, any('job_requisition.view')],
  [/^\/recruitment\/postings\/new\/?$/, any('job_posting.create')],
  [/^\/recruitment\/postings(?:\/.*)?$/, any('job_posting.view')],
  [/^\/recruitment\/candidates\/new\/?$/, any('candidate.create')],
  [/^\/recruitment\/candidates(?:\/.*)?$/, any('candidate.view')],
  [/^\/recruitment\/applications\/new\/?$/, any('recruitment_application.create')],
  [/^\/recruitment\/applications(?:\/.*)?$/, any('recruitment_application.view')],
  [/^\/recruitment\/interviews\/new\/?$/, any('recruitment_interview.create')],
  [/^\/recruitment\/interviews(?:\/.*)?$/, any('recruitment_interview.view')],
  [/^\/recruitment\/assessments\/new\/?$/, any('recruitment_assessment.create')],
  [/^\/recruitment\/assessments(?:\/.*)?$/, any('recruitment_assessment.view')],
  [/^\/recruitment\/offers\/new\/?$/, any('recruitment_offer.create')],
  [/^\/recruitment\/offers(?:\/.*)?$/, any('recruitment_offer.view')],
  [
    /^\/recruitment(?:\/.*)?$/,
    any(
      'job_requisition.view',
      'job_posting.view',
      'candidate.view',
      'recruitment_application.view',
      'recruitment_interview.view',
      'recruitment_offer.view',
    ),
  ],
  [/^\/onboarding\/my(?:\/.*)?$/, any('onboarding_case.view_own')],
  [/^\/onboarding(?:\/.*)?$/, any('onboarding_case.view', 'onboarding_template.view')],
  [/^\/employees\/new\/?$/, any('employee.create')],
  [/^\/employees\/[^/]+\/personal\/?$/, any('employee_personal.view')],
  [/^\/employees\/[^/]+\/contact\/?$/, any('employee_contact.view')],
  [/^\/employees\/[^/]+\/history\/?$/, any('employee.view_history')],
  [/^\/employees(?:\/.*)?$/, any('employee.view')],
  [/^\/organization\/branches(?:\/.*)?$/, any('branch.view')],
  [/^\/organization\/departments(?:\/.*)?$/, any('department.view')],
  [/^\/organization\/designations(?:\/.*)?$/, any('designation.view')],
  [/^\/organization\/grades(?:\/.*)?$/, any('grade.view')],
  [/^\/organization\/cost-centers(?:\/.*)?$/, any('cost_center.view')],
  [/^\/organization\/work-calendars(?:\/.*)?$/, any('work_calendar.view')],
  [/^\/organization\/holidays(?:\/.*)?$/, any('holiday.view')],
  [/^\/organization(?:\/.*)?$/, any('company.view')],
  [/^\/attendance\/events(?:\/.*)?$/, any('attendance_event.view')],
  [/^\/attendance\/imports(?:\/.*)?$/, any('attendance_import.view', 'attendance_import.create')],
  [/^\/attendance\/calculate\/?$/, any('attendance.calculate')],
  [/^\/attendance\/corrections(?:\/.*)?$/, any('attendance_correction.view')],
  [/^\/attendance\/shifts(?:\/.*)?$/, any('attendance_shift.view')],
  [/^\/attendance\/locks(?:\/.*)?$/, any('attendance.lock', 'attendance.unlock')],
  [/^\/attendance(?:\/.*)?$/, any('attendance.view')],
  [/^\/leave\/new\/?$/, any('leave.apply')],
  [/^\/leave\/balances(?:\/.*)?$/, any('leave_balance.view')],
  [
    /^\/leave\/setup(?:\/.*)?$/,
    any('leave_type.create', 'leave_policy.view', 'leave_policy.create', 'leave_policy.assign'),
  ],
  [/^\/leave(?:\/.*)?$/, any('leave.view')],
  [/^\/payroll\/(?:runs\/new|new)\/?$/, any('payroll.create')],
  [/^\/payroll\/setup(?:\/.*)?$/, any('payroll_period.view', 'payroll_component.view')],
  [/^\/payroll\/inputs(?:\/.*)?$/, any('payroll_input.view', 'payroll_input.create')],
  [/^\/payroll\/my-payslips(?:\/.*)?$/, any('payslip.view_own')],
  [/^\/payroll(?:\/.*)?$/, any('payroll.view')],
  [/^\/benefits\/new\/?$/, any('benefit_enrollment.create')],
  [/^\/benefits\/plans(?:\/.*)?$/, any('benefit_plan.view')],
  [/^\/benefits\/my(?:\/.*)?$/, any('benefit_enrollment.view_own')],
  [/^\/benefits(?:\/.*)?$/, any('benefit_enrollment.view')],
  [/^\/claims\/new\/?$/, any('claim.create')],
  [/^\/claims\/categories(?:\/.*)?$/, any('claim_category.view')],
  [/^\/claims\/team(?:\/.*)?$/, any('claim.view_team')],
  [/^\/claims\/my(?:\/.*)?$/, any('claim.view_own')],
  [/^\/claims\/?$/, any('claim.view_own')],
  [/^\/claims(?:\/.*)?$/, any('claim.view', 'claim.view_own', 'claim.view_team')],
  [/^\/loans\/new\/?$/, any('loan.apply')],
  [/^\/loans\/types(?:\/.*)?$/, any('loan_type.view')],
  [/^\/loans\/team(?:\/.*)?$/, any('loan.view_team')],
  [/^\/loans\/my(?:\/.*)?$/, any('loan.view_own')],
  [/^\/loans\/?$/, any('loan.view_own')],
  [/^\/loans(?:\/.*)?$/, any('loan.view', 'loan.view_own', 'loan.view_team')],
  [/^\/performance\/team(?:\/.*)?$/, any('performance_review.view_team')],
  [/^\/performance\/my(?:\/.*)?$/, any('performance_review.view_own')],
  [/^\/performance\/cycles(?:\/.*)?$/, any('performance_cycle.view')],
  [/^\/performance\/setup(?:\/.*)?$/, any('performance_template.view')],
  [/^\/performance\/?$/, any('performance_review.view_own')],
  [
    /^\/performance(?:\/.*)?$/,
    any('performance_review.view', 'performance_review.view_own', 'performance_review.view_team'),
  ],
  [/^\/training\/my(?:\/.*)?$/, any('training_enrollment.view_own')],
  [/^\/training\/team(?:\/.*)?$/, any('training_enrollment.view_team')],
  [/^\/training\/enrollments(?:\/.*)?$/, any('training_enrollment.view')],
  [/^\/training\/nominate\/?$/, any('training_enrollment.nominate')],
  [/^\/training\/assign\/?$/, any('training_enrollment.assign')],
  [/^\/training\/setup(?:\/.*)?$/, any('training_course.create')],
  [/^\/training\/admin(?:\/.*)?$/, any('training_session.create')],
  [/^\/training(?:\/.*)?$/, any('training_course.view', 'training_session.view')],
  [/^\/career\/my\/new\/?$/, any('career_plan.create')],
  [/^\/career\/my(?:\/.*)?$/, any('career_plan.view_own')],
  [/^\/career\/team(?:\/.*)?$/, any('career_plan.view_team')],
  [/^\/career\/paths(?:\/.*)?$/, any('career_path.view')],
  [/^\/career\/?$/, any('career_plan.view_own')],
  [/^\/career(?:\/.*)?$/, any('career_plan.view', 'career_plan.view_own', 'career_plan.view_team')],
  [/^\/succession\/team(?:\/.*)?$/, any('succession_nomination.view_team')],
  [/^\/succession\/nominations(?:\/.*)?$/, any('succession_nomination.view')],
  [/^\/succession\/critical-positions(?:\/.*)?$/, any('critical_position.view')],
  [/^\/succession\/plans\/new\/?$/, any('succession_plan.create')],
  [/^\/succession(?:\/.*)?$/, any('succession_plan.view')],
  [/^\/manager(?:\/.*)?$/, any('manager_self_service.view')],
  [/^\/assets\/new\/?$/, any('asset.create')],
  [/^\/assets\/setup(?:\/.*)?$/, any('asset_category.create')],
  [/^\/assets\/my(?:\/.*)?$/, any('asset.view_own')],
  [/^\/assets\/?$/, any('asset.view_own')],
  [/^\/assets(?:\/.*)?$/, any('asset.view', 'asset.view_own')],
  [/^\/documents\/new\/?$/, any('document.create')],
  [/^\/documents\/setup(?:\/.*)?$/, any('document_type.create')],
  [/^\/documents\/my(?:\/.*)?$/, any('document.view_own')],
  [/^\/documents\/?$/, any('document.view_own')],
  [/^\/documents(?:\/.*)?$/, any('document.view', 'document.view_own')],
  [/^\/exits(?:\/.*)?$/, any('exit.view')],
  [/^\/final-settlements(?:\/.*)?$/, any('final_settlement.view')],
  [/^\/reports(?:\/.*)?$/, any('report.workforce')],
  [/^\/notifications(?:\/.*)?$/, any('notification.view_own')],
  [/^\/security-audit(?:\/.*)?$/, any('audit.view')],
  [/^\/administration\/access(?:\/.*)?$/, any('user.view', 'role.view')],
];

export function permissionsForPath(pathname) {
  return policies.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

export function hasAnyPermission(granted, required) {
  return !required || required.some((permission) => granted.has(permission));
}

const scopedPolicies = [
  [/^\/attendance\/?$/, 'attendance.view', broadScopes],
  [/^\/attendance\/records(?:\/.*)?$/, 'attendance.view', broadScopes],
  [/^\/attendance\/my(?:\/.*)?$/, 'attendance.view', ['own']],
  [/^\/attendance\/team(?:\/.*)?$/, 'attendance.view', ['direct_reports']],
  [/^\/leave\/?$/, 'leave.view', broadScopes],
  [/^\/leave\/requests(?:\/.*)?$/, 'leave.view', broadScopes],
  [/^\/leave\/my(?:\/.*)?$/, 'leave.view', ['own']],
  [/^\/leave\/team(?:\/.*)?$/, 'leave.view', ['direct_reports']],
  [/^\/leave\/new\/?$/, 'leave.apply', ['own']],
];

export function scopeRequirementForPath(pathname) {
  const match = scopedPolicies.find(([pattern]) => pattern.test(pathname));
  return match ? { permission: match[1], scopes: match[2] } : null;
}

export function hasRequiredScope(permissionScopes, requirement) {
  if (!requirement) return true;
  const granted = permissionScopes?.[requirement.permission] ?? [];
  return requirement.scopes.some((scope) => granted.includes(scope));
}

export function hasPermissionScope(permissionScopes, permission, allowedScopes) {
  const granted = permissionScopes?.[permission] ?? [];
  return allowedScopes.some((scope) => granted.includes(scope));
}
