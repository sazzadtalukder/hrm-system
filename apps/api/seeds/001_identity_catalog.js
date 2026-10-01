const roles = [
  ['system_administrator', 'System Administrator', true],
  ['hr_administrator', 'HR Administrator', true],
  ['hr_officer', 'HR Officer', false],
  ['payroll_administrator', 'Payroll Administrator', true],
  ['finance_approver', 'Finance Approver', true],
  ['finance_payment_officer', 'Finance Payment Officer', true],
  ['finance_repayment_officer', 'Finance Repayment Officer', true],
  ['attendance_officer', 'Attendance Officer', false],
  ['training_administrator', 'Training Administrator', true],
  ['talent_management_administrator', 'Talent Management Administrator', true],
  ['asset_administrator', 'Asset Administrator', true],
  ['document_administrator', 'Document Administrator', true],
  ['recruiter', 'Recruiter', true],
  ['onboarding_coordinator', 'Onboarding Coordinator', true],
  ['manager', 'Manager', false],
  ['employee', 'Employee', false],
  ['auditor', 'Auditor / Read Only', true],
];

const permissions = [
  ['user.view', 'user', 'view', false],
  ['user.create', 'user', 'create', true],
  ['user.update', 'user', 'update', true],
  ['user.activate', 'user', 'activate', true],
  ['user.deactivate', 'user', 'deactivate', true],
  ['user.reset_authentication', 'user', 'reset_authentication', true],
  ['user.revoke_session', 'user', 'revoke_session', true],
  ['user.assign_role', 'user', 'assign_role', true],
  ['role.view', 'role', 'view', false],
  ['role.assign', 'role', 'assign', true],
  ['role.revoke', 'role', 'revoke', true],
  ['role.view_assignment_history', 'role', 'view_assignment_history', true],
  ['company.view', 'company', 'view', false],
  ['company.update', 'company', 'update', true],
  ['branch.view', 'branch', 'view', false],
  ['branch.create', 'branch', 'create', true],
  ['branch.update', 'branch', 'update', true],
  ['branch.deactivate', 'branch', 'deactivate', true],
  ['department.view', 'department', 'view', false],
  ['department.create', 'department', 'create', true],
  ['department.update', 'department', 'update', true],
  ['department.deactivate', 'department', 'deactivate', true],
  ['designation.view', 'designation', 'view', false],
  ['designation.create', 'designation', 'create', true],
  ['designation.update', 'designation', 'update', true],
  ['designation.deactivate', 'designation', 'deactivate', true],
  ['grade.view', 'grade', 'view', false],
  ['grade.create', 'grade', 'create', true],
  ['grade.update', 'grade', 'update', true],
  ['grade.deactivate', 'grade', 'deactivate', true],
  ['cost_center.view', 'cost_center', 'view', false],
  ['cost_center.create', 'cost_center', 'create', true],
  ['cost_center.update', 'cost_center', 'update', true],
  ['cost_center.deactivate', 'cost_center', 'deactivate', true],
  ['work_calendar.view', 'work_calendar', 'view', false],
  ['work_calendar.create', 'work_calendar', 'create', true],
  ['work_calendar.update', 'work_calendar', 'update', true],
  ['work_calendar.deactivate', 'work_calendar', 'deactivate', true],
  ['holiday.view', 'holiday', 'view', false],
  ['holiday.create', 'holiday', 'create', true],
  ['holiday.update', 'holiday', 'update', true],
  ['holiday.cancel', 'holiday', 'cancel', true],
  ['employee.view', 'employee', 'view', false],
  ['employee.create', 'employee', 'create', true],
  ['employee.update', 'employee', 'update', true],
  ['employee.activate', 'employee', 'activate', true],
  ['employee.deactivate', 'employee', 'deactivate', true],
  ['employee.view_history', 'employee', 'view_history', true],
  ['employee.manage_assignment', 'employee', 'manage_assignment', true],
  ['employee.manage_status', 'employee', 'manage_status', true],
  ['employee.link_user', 'employee', 'link_user', true],
  ['employee_personal.view', 'employee_personal', 'view', true],
  ['employee_personal.update', 'employee_personal', 'update', true],
  ['employee_contact.view', 'employee_contact', 'view', true],
  ['employee_contact.update', 'employee_contact', 'update', true],
  ['employee_contact.verify_sensitive_change', 'employee_contact', 'verify_sensitive_change', true],
  ['attendance_shift.view', 'attendance_shift', 'view', false],
  ['attendance_shift.create', 'attendance_shift', 'create', true],
  ['attendance_shift.update', 'attendance_shift', 'update', true],
  ['attendance_shift.deactivate', 'attendance_shift', 'deactivate', true],
  ['attendance_shift.assign', 'attendance_shift', 'assign', true],
  ['attendance_event.view', 'attendance_event', 'view', true],
  ['attendance_event.create', 'attendance_event', 'create', true],
  ['attendance_event.disposition', 'attendance_event', 'disposition', true],
  ['attendance_import.create', 'attendance_import', 'create', true],
  ['attendance_import.view', 'attendance_import', 'view', true],
  ['attendance.view', 'attendance', 'view', false],
  ['attendance.calculate', 'attendance', 'calculate', true],
  ['attendance.recalculate', 'attendance', 'recalculate', true],
  ['attendance.adjust', 'attendance', 'adjust', true],
  ['attendance.lock', 'attendance', 'lock', true],
  ['attendance.unlock', 'attendance', 'unlock', true],
  ['attendance_correction.create', 'attendance_correction', 'create', true],
  ['attendance_correction.submit', 'attendance_correction', 'submit', true],
  ['attendance_correction.cancel', 'attendance_correction', 'cancel', true],
  ['attendance_correction.view', 'attendance_correction', 'view', true],
  ['attendance_correction.approve', 'attendance_correction', 'approve', true],
  ['attendance_correction.reject', 'attendance_correction', 'reject', true],
  ['leave_type.view', 'leave_type', 'view', false],
  ['leave_type.create', 'leave_type', 'create', true],
  ['leave_type.update', 'leave_type', 'update', true],
  ['leave_type.deactivate', 'leave_type', 'deactivate', true],
  ['leave_policy.view', 'leave_policy', 'view', false],
  ['leave_policy.create', 'leave_policy', 'create', true],
  ['leave_policy.update', 'leave_policy', 'update', true],
  ['leave_policy.deactivate', 'leave_policy', 'deactivate', true],
  ['leave_policy.assign', 'leave_policy', 'assign', true],
  ['leave_balance.view', 'leave_balance', 'view', true],
  ['leave_balance.adjust', 'leave_balance', 'adjust', true],
  ['leave_balance.export', 'leave_balance', 'export', true],
  ['leave.view', 'leave', 'view', true],
  ['leave.apply', 'leave', 'apply', true],
  ['leave.update_draft', 'leave', 'update_draft', true],
  ['leave.submit', 'leave', 'submit', true],
  ['leave.cancel', 'leave', 'cancel', true],
  ['leave.approve', 'leave', 'approve', true],
  ['leave.reject', 'leave', 'reject', true],
  ['leave.request_cancellation', 'leave', 'request_cancellation', true],
  ['leave.approve_cancellation', 'leave', 'approve_cancellation', true],
  ['leave.reject_cancellation', 'leave', 'reject_cancellation', true],
  ['leave.administer_historical', 'leave', 'administer_historical', true],
  ['leave_sensitive.view', 'leave_sensitive', 'view', true],
  ['payroll_period.view', 'payroll_period', 'view', false],
  ['payroll_period.create', 'payroll_period', 'create', true],
  ['payroll_period.update', 'payroll_period', 'update', true],
  ['payroll_component.view', 'payroll_component', 'view', false],
  ['payroll_component.create', 'payroll_component', 'create', true],
  ['payroll_component.update', 'payroll_component', 'update', true],
  ['payroll_component.deactivate', 'payroll_component', 'deactivate', true],
  ['employee_compensation.view', 'employee_compensation', 'view', true],
  ['employee_compensation.update', 'employee_compensation', 'update', true],
  ['employee_compensation.history', 'employee_compensation', 'history', true],
  ['payroll_input.view', 'payroll_input', 'view', true],
  ['payroll_input.create', 'payroll_input', 'create', true],
  ['payroll_input.reverse', 'payroll_input', 'reverse', true],
  ['payroll.view', 'payroll', 'view', true],
  ['payroll.create', 'payroll', 'create', true],
  ['payroll.process', 'payroll', 'process', true],
  ['payroll.submit', 'payroll', 'submit', true],
  ['payroll.approve', 'payroll', 'approve', true],
  ['payroll.reject', 'payroll', 'reject', true],
  ['payroll.lock', 'payroll', 'lock', true],
  ['payroll.adjust', 'payroll', 'adjust', true],
  ['payroll_adjustment.approve', 'payroll_adjustment', 'approve', true],
  ['payroll.reverse', 'payroll', 'reverse', true],
  ['payroll.export', 'payroll', 'export', true],
  ['payslip.view', 'payslip', 'view', true],
  ['payslip.view_own', 'payslip', 'view_own', true],
  ['payslip.publish', 'payslip', 'publish', true],
  ['payslip.revoke_publication', 'payslip', 'revoke_publication', true],
  ['benefit_plan.view', 'benefit_plan', 'view', false],
  ['benefit_plan.create', 'benefit_plan', 'create', true],
  ['benefit_plan.update', 'benefit_plan', 'update', true],
  ['benefit_plan.deactivate', 'benefit_plan', 'deactivate', true],
  ['benefit_plan.version_create', 'benefit_plan', 'version_create', true],
  ['benefit_plan.correct_history', 'benefit_plan', 'correct_history', true],
  ['benefit_enrollment.view', 'benefit_enrollment', 'view', true],
  ['benefit_enrollment.view_own', 'benefit_enrollment', 'view_own', true],
  ['benefit_enrollment.create', 'benefit_enrollment', 'create', true],
  ['benefit_enrollment.create_historical', 'benefit_enrollment', 'create_historical', true],
  ['benefit_enrollment.update_draft', 'benefit_enrollment', 'update_draft', true],
  ['benefit_enrollment.activate', 'benefit_enrollment', 'activate', true],
  ['benefit_enrollment.suspend', 'benefit_enrollment', 'suspend', true],
  ['benefit_enrollment.resume', 'benefit_enrollment', 'resume', true],
  ['benefit_enrollment.end', 'benefit_enrollment', 'end', true],
  ['benefit_enrollment.cancel', 'benefit_enrollment', 'cancel', true],
  ['benefit_enrollment.view_history', 'benefit_enrollment', 'view_history', true],
  ['benefit_enrollment.export', 'benefit_enrollment', 'export', true],
  ['benefit_sensitive.view', 'benefit_sensitive', 'view', true],
  ['claim_category.view', 'claim_category', 'view', false],
  ['claim_category.create', 'claim_category', 'create', true],
  ['claim_category.update', 'claim_category', 'update', true],
  ['claim_category.version_create', 'claim_category', 'version_create', true],
  ['claim_category.correct_history', 'claim_category', 'correct_history', true],
  ['claim_category.deactivate', 'claim_category', 'deactivate', true],
  ['claim.view', 'claim', 'view', true],
  ['claim.view_own', 'claim', 'view_own', true],
  ['claim.view_team', 'claim', 'view_team', true],
  ['claim.create', 'claim', 'create', true],
  ['claim.update_draft', 'claim', 'update_draft', true],
  ['claim.submit', 'claim', 'submit', true],
  ['claim.withdraw', 'claim', 'withdraw', true],
  ['claim.request_cancellation', 'claim', 'request_cancellation', true],
  ['claim.approve_cancellation', 'claim', 'approve_cancellation', true],
  ['claim.reject_cancellation', 'claim', 'reject_cancellation', true],
  ['claim.approve', 'claim', 'approve', true],
  ['claim.reject', 'claim', 'reject', true],
  ['claim.finance_approve', 'claim', 'finance_approve', true],
  ['claim.finance_reject', 'claim', 'finance_reject', true],
  ['claim.record_payment', 'claim', 'record_payment', true],
  ['claim.view_history', 'claim', 'view_history', true],
  ['claim.export', 'claim', 'export', true],
  ['claim_sensitive.view', 'claim_sensitive', 'view', true],
  ['loan_type.view', 'loan_type', 'view', false],
  ['loan_type.create', 'loan_type', 'create', true],
  ['loan_type.update', 'loan_type', 'update', true],
  ['loan_type.version_create', 'loan_type', 'version_create', true],
  ['loan_type.correct_history', 'loan_type', 'correct_history', true],
  ['loan_type.deactivate', 'loan_type', 'deactivate', true],
  ['loan.view', 'loan', 'view', true],
  ['loan.view_own', 'loan', 'view_own', true],
  ['loan.view_team', 'loan', 'view_team', true],
  ['loan.apply', 'loan', 'apply', true],
  ['loan.update_draft', 'loan', 'update_draft', true],
  ['loan.submit', 'loan', 'submit', true],
  ['loan.withdraw', 'loan', 'withdraw', true],
  ['loan.approve', 'loan', 'approve', true],
  ['loan.reject', 'loan', 'reject', true],
  ['loan.finance_approve', 'loan', 'finance_approve', true],
  ['loan.finance_reject', 'loan', 'finance_reject', true],
  ['loan.request_cancellation', 'loan', 'request_cancellation', true],
  ['loan.approve_cancellation', 'loan', 'approve_cancellation', true],
  ['loan.reject_cancellation', 'loan', 'reject_cancellation', true],
  ['loan.view_history', 'loan', 'view_history', true],
  ['loan.disburse', 'loan', 'disburse', true],
  ['loan_repayment.view', 'loan_repayment', 'view', true],
  ['loan_repayment.record', 'loan_repayment', 'record', true],
  ['loan_repayment.adjust', 'loan_repayment', 'adjust', true],
  ['loan_repayment.reverse', 'loan_repayment', 'reverse', true],
  ['loan.export', 'loan', 'export', true],
  ['loan_sensitive.view', 'loan_sensitive', 'view', true],
  ['performance_rating_scale.view', 'performance_rating_scale', 'view', false],
  ['performance_rating_scale.create', 'performance_rating_scale', 'create', true],
  ['performance_rating_scale.update', 'performance_rating_scale', 'update', true],
  ['performance_rating_scale.deactivate', 'performance_rating_scale', 'deactivate', true],
  ['performance_competency.view', 'performance_competency', 'view', false],
  ['performance_competency.create', 'performance_competency', 'create', true],
  ['performance_competency.version_create', 'performance_competency', 'version_create', true],
  ['performance_competency.correct_history', 'performance_competency', 'correct_history', true],
  ['performance_competency.deactivate', 'performance_competency', 'deactivate', true],
  ['performance_template.view', 'performance_template', 'view', false],
  ['performance_template.create', 'performance_template', 'create', true],
  ['performance_template.update', 'performance_template', 'update', true],
  ['performance_template.version_create', 'performance_template', 'version_create', true],
  ['performance_template.correct_history', 'performance_template', 'correct_history', true],
  ['performance_template.deactivate', 'performance_template', 'deactivate', true],
  ['performance_cycle.view', 'performance_cycle', 'view', true],
  ['performance_cycle.create', 'performance_cycle', 'create', true],
  ['performance_cycle.update', 'performance_cycle', 'update', true],
  ['performance_cycle.activate', 'performance_cycle', 'activate', true],
  ['performance_cycle.open_review', 'performance_cycle', 'open_review', true],
  ['performance_cycle.close', 'performance_cycle', 'close', true],
  ['performance_cycle.cancel', 'performance_cycle', 'cancel', true],
  ['performance_cycle.populate', 'performance_cycle', 'populate', true],
  ['performance_review.view', 'performance_review', 'view', true],
  ['performance_review.view_own', 'performance_review', 'view_own', true],
  ['performance_review.view_team', 'performance_review', 'view_team', true],
  ['performance_goal.create', 'performance_goal', 'create', true],
  ['performance_goal.update_draft', 'performance_goal', 'update_draft', true],
  ['performance_goal.submit', 'performance_goal', 'submit', true],
  ['performance_goal.approve', 'performance_goal', 'approve', true],
  ['performance_goal.return', 'performance_goal', 'return', true],
  ['performance_self_assessment.submit', 'performance_self_assessment', 'submit', true],
  ['performance_manager_assessment.submit', 'performance_manager_assessment', 'submit', true],
  ['performance_review.acknowledge', 'performance_review', 'acknowledge', true],
  ['performance_review.finalize', 'performance_review', 'finalize', true],
  [
    'performance_review.finalize_without_acknowledgment',
    'performance_review',
    'finalize_without_acknowledgment',
    true,
  ],
  ['performance_review.correct_history', 'performance_review', 'correct_history', true],
  ['performance_review.cancel', 'performance_review', 'cancel', true],
  ['performance_review.reassign_manager', 'performance_review', 'reassign_manager', true],
  ['performance_review.export', 'performance_review', 'export', true],
  ['performance_sensitive.view', 'performance_sensitive', 'view', true],
  ['training_course.view', 'training_course', 'view', false],
  ['training_course.create', 'training_course', 'create', true],
  ['training_course.update', 'training_course', 'update', true],
  ['training_course.version_create', 'training_course', 'version_create', true],
  ['training_course.correct_history', 'training_course', 'correct_history', true],
  ['training_course.activate', 'training_course', 'activate', true],
  ['training_course.deactivate', 'training_course', 'deactivate', true],
  ['training_provider.view', 'training_provider', 'view', false],
  ['training_provider.create', 'training_provider', 'create', true],
  ['training_provider.update', 'training_provider', 'update', true],
  ['training_provider.version_create', 'training_provider', 'version_create', true],
  ['training_provider.deactivate', 'training_provider', 'deactivate', true],
  ['training_session.view', 'training_session', 'view', false],
  ['training_session.create', 'training_session', 'create', true],
  ['training_session.update_draft', 'training_session', 'update_draft', true],
  ['training_session.publish', 'training_session', 'publish', true],
  ['training_session.close_enrollment', 'training_session', 'close_enrollment', true],
  ['training_session.start', 'training_session', 'start', true],
  ['training_session.complete', 'training_session', 'complete', true],
  ['training_session.cancel', 'training_session', 'cancel', true],
  ['training_session.correct_history', 'training_session', 'correct_history', true],
  ['training_session.manage_roster', 'training_session', 'manage_roster', true],
  ['training_enrollment.view', 'training_enrollment', 'view', true],
  ['training_enrollment.view_own', 'training_enrollment', 'view_own', true],
  ['training_enrollment.view_team', 'training_enrollment', 'view_team', true],
  ['training_enrollment.request', 'training_enrollment', 'request', true],
  ['training_enrollment.update_draft', 'training_enrollment', 'update_draft', true],
  ['training_enrollment.submit', 'training_enrollment', 'submit', true],
  ['training_enrollment.withdraw', 'training_enrollment', 'withdraw', true],
  ['training_enrollment.nominate', 'training_enrollment', 'nominate', true],
  ['training_enrollment.accept_nomination', 'training_enrollment', 'accept_nomination', true],
  ['training_enrollment.decline_nomination', 'training_enrollment', 'decline_nomination', true],
  ['training_enrollment.assign', 'training_enrollment', 'assign', true],
  ['training_enrollment.approve', 'training_enrollment', 'approve', true],
  ['training_enrollment.reject', 'training_enrollment', 'reject', true],
  ['training_enrollment.request_cancellation', 'training_enrollment', 'request_cancellation', true],
  ['training_enrollment.approve_cancellation', 'training_enrollment', 'approve_cancellation', true],
  ['training_enrollment.reject_cancellation', 'training_enrollment', 'reject_cancellation', true],
  ['training_enrollment.reassign_manager', 'training_enrollment', 'reassign_manager', true],
  ['training_enrollment.correct_history', 'training_enrollment', 'correct_history', true],
  ['training_participation.view', 'training_participation', 'view', true],
  ['training_participation.record', 'training_participation', 'record', true],
  ['training_participation.correct', 'training_participation', 'correct', true],
  ['training_completion.view', 'training_completion', 'view', true],
  ['training_completion.record', 'training_completion', 'record', true],
  ['training_completion.correct', 'training_completion', 'correct', true],
  ['training_evidence.create_reference', 'training_evidence', 'create_reference', true],
  ['training_evidence.revoke_reference', 'training_evidence', 'revoke_reference', true],
  ['training.export', 'training', 'export', true],
  ['training_sensitive.view', 'training_sensitive', 'view', true],
  ['training_sensitive.export', 'training_sensitive', 'export', true],
  ['career_path.view', 'career_path', 'view', false],
  ['career_path.create', 'career_path', 'create', true],
  ['career_path.version_create', 'career_path', 'version_create', true],
  ['career_path.activate', 'career_path', 'activate', true],
  ['career_path.deactivate', 'career_path', 'deactivate', true],
  ['career_path.correct_history', 'career_path', 'correct_history', true],
  ['career_plan.view', 'career_plan', 'view', true],
  ['career_plan.view_own', 'career_plan', 'view_own', true],
  ['career_plan.view_team', 'career_plan', 'view_team', true],
  ['career_plan.create', 'career_plan', 'create', true],
  ['career_plan.update_draft', 'career_plan', 'update_draft', true],
  ['career_plan.submit', 'career_plan', 'submit', true],
  ['career_plan.withdraw', 'career_plan', 'withdraw', true],
  ['career_plan.approve', 'career_plan', 'approve', true],
  ['career_plan.return', 'career_plan', 'return', true],
  ['career_plan.update_progress', 'career_plan', 'update_progress', true],
  ['career_plan.complete', 'career_plan', 'complete', true],
  ['career_plan.cancel', 'career_plan', 'cancel', true],
  ['career_plan.reassign_manager', 'career_plan', 'reassign_manager', true],
  ['career_plan.correct_history', 'career_plan', 'correct_history', true],
  ['career_plan.export', 'career_plan', 'export', true],
  ['critical_position.view', 'critical_position', 'view', false],
  ['critical_position.create', 'critical_position', 'create', true],
  ['critical_position.version_create', 'critical_position', 'version_create', true],
  ['critical_position.activate', 'critical_position', 'activate', true],
  ['critical_position.deactivate', 'critical_position', 'deactivate', true],
  ['critical_position.correct_history', 'critical_position', 'correct_history', true],
  ['succession_plan.view', 'succession_plan', 'view', true],
  ['succession_plan.create', 'succession_plan', 'create', true],
  ['succession_plan.activate', 'succession_plan', 'activate', true],
  ['succession_plan.close', 'succession_plan', 'close', true],
  ['succession_plan.cancel', 'succession_plan', 'cancel', true],
  ['succession_nomination.view', 'succession_nomination', 'view', true],
  ['succession_nomination.view_team', 'succession_nomination', 'view_team', true],
  ['succession_nomination.create', 'succession_nomination', 'create', true],
  ['succession_nomination.submit', 'succession_nomination', 'submit', true],
  ['succession_nomination.recommend', 'succession_nomination', 'recommend', true],
  ['succession_nomination.reject', 'succession_nomination', 'reject', true],
  ['succession_nomination.confirm', 'succession_nomination', 'confirm', true],
  ['succession_nomination.remove', 'succession_nomination', 'remove', true],
  ['succession_nomination.withdraw', 'succession_nomination', 'withdraw', true],
  ['succession_nomination.update_readiness', 'succession_nomination', 'update_readiness', true],
  ['succession_nomination.reassign_manager', 'succession_nomination', 'reassign_manager', true],
  ['succession_nomination.correct_history', 'succession_nomination', 'correct_history', true],
  ['succession.export', 'succession', 'export', true],
  ['career_sensitive.view', 'career_sensitive', 'view', true],
  ['career_sensitive.export', 'career_sensitive', 'export', true],
  ['succession_sensitive.view', 'succession_sensitive', 'view', true],
  ['succession_sensitive.export', 'succession_sensitive', 'export', true],
  ['manager_self_service.view', 'manager_self_service', 'view', false],
  ['asset_category.view', 'asset_category', 'view', false],
  ['asset_category.create', 'asset_category', 'create', true],
  ['asset.view', 'asset', 'view', true],
  ['asset.view_own', 'asset', 'view_own', true],
  ['asset.create', 'asset', 'create', true],
  ['asset.assign', 'asset', 'assign', true],
  ['asset.return', 'asset', 'return', true],
  ['asset.update_status', 'asset', 'update_status', true],
  ['asset.export', 'asset', 'export', true],
  ['document_type.view', 'document_type', 'view', false],
  ['document_type.create', 'document_type', 'create', true],
  ['document.view', 'document', 'view', true],
  ['document.view_own', 'document', 'view_own', true],
  ['document.create', 'document', 'create', true],
  ['document.version_create', 'document', 'version_create', true],
  ['document.publish', 'document', 'publish', true],
  ['document.revoke', 'document', 'revoke', true],
  ['document.acknowledge', 'document', 'acknowledge', true],
  ['document.export', 'document', 'export', true],
  ['document_sensitive.view', 'document_sensitive', 'view', true],
  ['exit.view', 'exit', 'view', true],
  ['exit.create', 'exit', 'create', true],
  ['exit.submit', 'exit', 'submit', true],
  ['exit.manager_approve', 'exit', 'manager_approve', true],
  ['exit.approve', 'exit', 'approve', true],
  ['exit.withdraw', 'exit', 'withdraw', true],
  ['exit.reject', 'exit', 'reject', true],
  ['exit.cancel', 'exit', 'cancel', true],
  ['exit.clearance', 'exit', 'clearance', true],
  ['exit.complete', 'exit', 'complete', true],
  ['final_settlement.view', 'final_settlement', 'view', true],
  ['final_settlement.create', 'final_settlement', 'create', true],
  ['final_settlement.calculate', 'final_settlement', 'calculate', true],
  ['final_settlement.submit', 'final_settlement', 'submit', true],
  ['final_settlement.approve', 'final_settlement', 'approve', true],
  ['final_settlement.reject', 'final_settlement', 'reject', true],
  ['final_settlement.cancel', 'final_settlement', 'cancel', true],
  ['final_settlement.record_payment', 'final_settlement', 'record_payment', true],
  ['report.workforce', 'report', 'workforce', true],
  ['notification.create', 'notification', 'create', true],
  ['notification.view_own', 'notification', 'view_own', false],
  ['notification.update_own', 'notification', 'update_own', false],
  ['audit.view', 'audit', 'view', true],
  ['audit.review', 'audit', 'review', true],
  ['security_session.view', 'security_session', 'view', true],
  ['manpower_plan.view', 'manpower_plan', 'view', false],
  ['manpower_plan.create', 'manpower_plan', 'create', true],
  ['manpower_plan.update', 'manpower_plan', 'update', true],
  ['manpower_plan.approve', 'manpower_plan', 'approve', true],
  ['job_requisition.view', 'job_requisition', 'view', false],
  ['job_requisition.create', 'job_requisition', 'create', true],
  ['job_requisition.update', 'job_requisition', 'update', true],
  ['job_requisition.approve', 'job_requisition', 'approve', true],
  ['job_posting.view', 'job_posting', 'view', false],
  ['job_posting.create', 'job_posting', 'create', true],
  ['job_posting.update', 'job_posting', 'update', true],
  ['candidate.view', 'candidate', 'view', true],
  ['candidate.create', 'candidate', 'create', true],
  ['candidate.update', 'candidate', 'update', true],
  ['recruitment_application.view', 'recruitment_application', 'view', true],
  ['recruitment_application.create', 'recruitment_application', 'create', true],
  ['recruitment_application.screen', 'recruitment_application', 'screen', true],
  ['recruitment_interview.view', 'recruitment_interview', 'view', true],
  ['recruitment_interview.create', 'recruitment_interview', 'create', true],
  ['recruitment_assessment.view', 'recruitment_assessment', 'view', true],
  ['recruitment_assessment.create', 'recruitment_assessment', 'create', true],
  ['recruitment_offer.view', 'recruitment_offer', 'view', true],
  ['recruitment_offer.create', 'recruitment_offer', 'create', true],
  ['recruitment_offer.update', 'recruitment_offer', 'update', true],
  ['recruitment_offer.approve', 'recruitment_offer', 'approve', true],
  ['recruitment_hire.convert', 'recruitment_hire', 'convert', true],
  ['recruitment_sensitive.view', 'recruitment_sensitive', 'view', true],
  ['onboarding_template.view', 'onboarding_template', 'view', false],
  ['onboarding_template.create', 'onboarding_template', 'create', true],
  ['onboarding_template.update', 'onboarding_template', 'update', true],
  ['onboarding_case.view', 'onboarding_case', 'view', true],
  ['onboarding_case.view_own', 'onboarding_case', 'view_own', true],
  ['onboarding_case.create', 'onboarding_case', 'create', true],
  ['onboarding_case.update', 'onboarding_case', 'update', true],
  ['onboarding_task.update', 'onboarding_task', 'update', true],
  ['onboarding_task.waive', 'onboarding_task', 'waive', true],
  ['onboarding_readiness.confirm', 'onboarding_readiness', 'confirm', true],
  ['onboarding_sensitive.view', 'onboarding_sensitive', 'view', true],
];

export async function seed(knex) {
  for (const [code, name, privileged] of roles) {
    await knex('roles')
      .insert({ code, name, is_system: true, is_privileged: privileged })
      .onConflict('code')
      .ignore();
  }
  for (const [code, resource, action, sensitive] of permissions) {
    await knex('permissions')
      .insert({ code, resource, action, is_sensitive: sensitive, requires_audit: sensitive })
      .onConflict('code')
      .ignore();
  }
  await knex('permissions')
    .whereIn('code', [
      'employee_compensation.view',
      'employee_compensation.update',
      'employee_compensation.history',
      'payroll.lock',
      'payroll.adjust',
      'payroll_adjustment.approve',
      'payroll.reverse',
      'payslip.revoke_publication',
      'benefit_plan.correct_history',
      'benefit_enrollment.create_historical',
      'benefit_sensitive.view',
      'claim_category.correct_history',
      'claim_sensitive.view',
      'loan_type.correct_history',
      'loan_sensitive.view',
      'performance_competency.correct_history',
      'performance_template.correct_history',
      'performance_review.correct_history',
      'performance_sensitive.view',
      'training_course.correct_history',
      'training_session.correct_history',
      'training_enrollment.correct_history',
      'training_participation.correct',
      'training_completion.correct',
      'training_sensitive.view',
      'training_sensitive.export',
      'career_path.correct_history',
      'career_plan.correct_history',
      'critical_position.correct_history',
      'succession_nomination.correct_history',
      'career_sensitive.view',
      'career_sensitive.export',
      'succession_sensitive.view',
      'succession_sensitive.export',
      'document_sensitive.view',
    ])
    .update({ allow_direct_grant: true, requires_audit: true });
  const admin = await knex('roles').where({ code: 'system_administrator' }).first('id');
  const employeeSensitiveCodes = permissions
    .map(([code]) => code)
    .filter(
      (code) => code.startsWith('employee_personal.') || code.startsWith('employee_contact.'),
    );
  const attendanceCodes = permissions
    .map(([code]) => code)
    .filter((code) => code.startsWith('attendance'));
  const leaveCodes = permissions.map(([code]) => code).filter((code) => code.startsWith('leave'));
  const payrollCodes = permissions
    .map(([code]) => code)
    .filter(
      (code) =>
        code.startsWith('payroll') ||
        code.startsWith('payslip') ||
        code.startsWith('employee_compensation'),
    );
  const benefitCodes = permissions
    .map(([code]) => code)
    .filter((code) => code.startsWith('benefit'));
  const claimCodes = permissions.map(([code]) => code).filter((code) => code.startsWith('claim'));
  const loanCodes = permissions.map(([code]) => code).filter((code) => code.startsWith('loan'));
  const performanceCodes = permissions
    .map(([code]) => code)
    .filter((code) => code.startsWith('performance'));
  const trainingCodes = permissions
    .map(([code]) => code)
    .filter((code) => code.startsWith('training'));
  const talentCodes = permissions
    .map(([code]) => code)
    .filter(
      (code) =>
        code.startsWith('career') ||
        code.startsWith('critical_position') ||
        code.startsWith('succession'),
    );
  const assetCodes = permissions.map(([code]) => code).filter((code) => code.startsWith('asset'));
  const documentCodes = permissions
    .map(([code]) => code)
    .filter((code) => code.startsWith('document'));
  const exitCodes = permissions.map(([code]) => code).filter((code) => code.startsWith('exit.'));
  const settlementCodes = permissions
    .map(([code]) => code)
    .filter((code) => code.startsWith('final_settlement.'));
  const catalog = await knex('permissions')
    .whereNotIn('code', [
      ...employeeSensitiveCodes,
      ...attendanceCodes,
      ...leaveCodes,
      ...payrollCodes,
      ...benefitCodes,
      ...claimCodes,
      ...loanCodes,
      ...performanceCodes,
      ...trainingCodes,
      ...talentCodes,
      ...assetCodes,
      ...documentCodes,
      ...exitCodes,
      ...settlementCodes,
    ])
    .select('id');
  if (admin) {
    await knex('role_permissions')
      .insert(catalog.map(({ id }) => ({ role_id: admin.id, permission_id: id })))
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }

  const rolePermissionMap = {
    hr_administrator: permissions
      .slice(12)
      .map(([code]) => code)
      .filter(
        (code) =>
          !['attendance.lock', 'attendance.unlock', 'leave_sensitive.view'].includes(code) &&
          !code.startsWith('payroll') &&
          !code.startsWith('payslip') &&
          !code.startsWith('employee_compensation') &&
          (!code.startsWith('claim') ||
            [
              'claim_category.view',
              'claim_category.create',
              'claim_category.update',
              'claim_category.version_create',
              'claim_category.deactivate',
              'claim.view',
              'claim.view_history',
              'claim.approve',
              'claim.reject',
              'claim.approve_cancellation',
              'claim.reject_cancellation',
              'claim.export',
            ].includes(code)) &&
          (!code.startsWith('loan') ||
            [
              'loan_type.view',
              'loan_type.create',
              'loan_type.update',
              'loan_type.version_create',
              'loan_type.deactivate',
              'loan.view',
              'loan.view_history',
              'loan.approve',
              'loan.reject',
              'loan.approve_cancellation',
              'loan.reject_cancellation',
              'loan.export',
            ].includes(code)) &&
          !code.startsWith('performance') &&
          !code.startsWith('training') &&
          !talentCodes.includes(code) &&
          !assetCodes.includes(code) &&
          !documentCodes.includes(code) &&
          !exitCodes.includes(code) &&
          !settlementCodes.includes(code) &&
          ![
            'benefit_sensitive.view',
            'benefit_plan.correct_history',
            'benefit_enrollment.create_historical',
          ].includes(code),
      ),
    hr_officer: permissions
      .slice(12)
      .map(([code]) => code)
      .filter((code) => {
        if (code.startsWith('attendance'))
          return [
            'attendance.view',
            'attendance_correction.view',
            'attendance_correction.approve',
            'attendance_correction.reject',
          ].includes(code);
        if (code.startsWith('leave')) return ['leave.view', 'leave_balance.view'].includes(code);
        if (
          code.startsWith('payroll') ||
          code.startsWith('payslip') ||
          code.startsWith('employee_compensation')
        )
          return false;
        if (code.startsWith('benefit'))
          return [
            'benefit_plan.view',
            'benefit_enrollment.view',
            'benefit_enrollment.view_history',
          ].includes(code);
        if (code.startsWith('claim')) return ['claim_category.view', 'claim.view'].includes(code);
        if (code.startsWith('loan')) return ['loan_type.view', 'loan.view'].includes(code);
        if (code.startsWith('performance'))
          return ['performance_cycle.view', 'performance_review.view'].includes(code);
        if (code.startsWith('training'))
          return [
            'training_course.view',
            'training_session.view',
            'training_enrollment.view',
          ].includes(code);
        if (talentCodes.includes(code))
          return ['career_plan.view', 'succession_plan.view'].includes(code);
        if (assetCodes.includes(code) || documentCodes.includes(code)) return false;
        return ![
          'company.update',
          'employee.activate',
          'employee.deactivate',
          'employee.link_user',
          'employee_personal.update',
          'employee_contact.update',
          'employee_contact.verify_sensitive_change',
        ].includes(code);
      }),
    payroll_administrator: [
      'company.view',
      'branch.view',
      'department.view',
      'designation.view',
      'grade.view',
      'cost_center.view',
      'work_calendar.view',
      'holiday.view',
      'payroll.view',
      'payroll.create',
      'payroll.process',
      'payroll.submit',
      'payroll_period.view',
      'payroll_period.create',
      'payroll_period.update',
      'payroll_component.view',
      'payroll_component.create',
      'payroll_component.update',
      'payroll_input.view',
      'payroll_input.create',
      'payroll_input.reverse',
      'payslip.publish',
    ],
    finance_approver: [
      'company.view',
      'branch.view',
      'department.view',
      'grade.view',
      'cost_center.view',
      'payroll.view',
      'payroll.approve',
      'payroll.reject',
      'claim.view',
      'claim.finance_approve',
      'claim.finance_reject',
      'claim.approve_cancellation',
      'claim.reject_cancellation',
      'loan.view',
      'loan.finance_approve',
      'loan.finance_reject',
      'loan.approve_cancellation',
      'loan.reject_cancellation',
    ],
    finance_payment_officer: [
      'company.view',
      'branch.view',
      'department.view',
      'claim.view',
      'claim.record_payment',
      'loan.view',
      'loan.disburse',
    ],
    finance_repayment_officer: [
      'company.view',
      'branch.view',
      'department.view',
      'loan.view',
      'loan_repayment.view',
      'loan_repayment.record',
      'loan_repayment.adjust',
      'loan_repayment.reverse',
    ],
    attendance_officer: [
      'company.view',
      'branch.view',
      'department.view',
      'work_calendar.view',
      'holiday.view',
      'attendance_shift.view',
      'attendance_shift.create',
      'attendance_shift.update',
      'attendance_shift.deactivate',
      'attendance_shift.assign',
      'attendance_event.view',
      'attendance_event.create',
      'attendance_event.disposition',
      'attendance_import.create',
      'attendance_import.view',
      'attendance.view',
      'attendance.calculate',
      'attendance.recalculate',
      'attendance.adjust',
      'attendance_correction.view',
      'attendance_correction.approve',
      'attendance_correction.reject',
    ],
    training_administrator: [
      'company.view',
      'branch.view',
      'department.view',
      'designation.view',
      'employee.view',
      'performance_competency.view',
      'training_course.view',
      'training_course.create',
      'training_course.update',
      'training_course.version_create',
      'training_course.activate',
      'training_course.deactivate',
      'training_provider.view',
      'training_provider.create',
      'training_provider.update',
      'training_provider.version_create',
      'training_provider.deactivate',
      'training_session.view',
      'training_session.create',
      'training_session.update_draft',
      'training_session.publish',
      'training_session.close_enrollment',
      'training_session.start',
      'training_session.complete',
      'training_session.cancel',
      'training_session.manage_roster',
      'training_enrollment.view',
      'training_enrollment.assign',
      'training_enrollment.reject',
      'training_enrollment.approve_cancellation',
      'training_enrollment.reject_cancellation',
      'training_participation.view',
      'training_participation.record',
      'training_completion.view',
      'training_completion.record',
      'training_evidence.create_reference',
      'training_evidence.revoke_reference',
      'training.export',
    ],
    talent_management_administrator: [
      'company.view',
      'branch.view',
      'department.view',
      'designation.view',
      'employee.view',
      'performance_competency.view',
      'training_course.view',
      'training_completion.view',
      'career_path.view',
      'career_path.create',
      'career_path.version_create',
      'career_path.activate',
      'career_path.deactivate',
      'career_plan.view',
      'career_plan.cancel',
      'career_plan.reassign_manager',
      'career_plan.export',
      'critical_position.view',
      'critical_position.create',
      'critical_position.version_create',
      'critical_position.activate',
      'critical_position.deactivate',
      'succession_plan.view',
      'succession_plan.create',
      'succession_plan.activate',
      'succession_plan.close',
      'succession_plan.cancel',
      'succession_nomination.view',
      'succession_nomination.create',
      'succession_nomination.confirm',
      'succession_nomination.reject',
      'succession_nomination.withdraw',
      'succession_nomination.remove',
      'succession_nomination.update_readiness',
      'succession_nomination.reassign_manager',
      'succession.export',
    ],
    asset_administrator: [
      'company.view',
      'branch.view',
      'department.view',
      'employee.view',
      'asset_category.view',
      'asset_category.create',
      'asset.view',
      'asset.create',
      'asset.assign',
      'asset.return',
      'asset.update_status',
      'asset.export',
    ],
    document_administrator: [
      'company.view',
      'branch.view',
      'department.view',
      'employee.view',
      'document_type.view',
      'document_type.create',
      'document.view',
      'document.create',
      'document.version_create',
      'document.publish',
      'document.revoke',
      'document.export',
    ],
    manager: [
      'company.view',
      'branch.view',
      'department.view',
      'designation.view',
      'employee.view',
      'attendance.view',
      'attendance_correction.view',
      'leave.view',
      'leave.apply',
      'leave.update_draft',
      'leave.submit',
      'leave.cancel',
      'leave.request_cancellation',
      'leave_balance.view',
      'leave.approve',
      'leave.reject',
      'leave.approve_cancellation',
      'leave.reject_cancellation',
      'attendance_correction.approve',
      'attendance_correction.reject',
      'claim.view_team',
      'claim.approve',
      'claim.reject',
      'claim.approve_cancellation',
      'claim.reject_cancellation',
      'loan.view_team',
      'loan.approve',
      'loan.reject',
      'loan.approve_cancellation',
      'loan.reject_cancellation',
      'performance_review.view_team',
      'performance_goal.approve',
      'performance_goal.return',
      'performance_manager_assessment.submit',
      'training_course.view',
      'training_session.view',
      'training_enrollment.view_team',
      'training_enrollment.nominate',
      'training_enrollment.approve',
      'training_enrollment.reject',
      'training_enrollment.approve_cancellation',
      'training_enrollment.reject_cancellation',
      'career_path.view',
      'career_plan.view_team',
      'career_plan.approve',
      'career_plan.return',
      'critical_position.view',
      'succession_plan.view',
      'succession_nomination.view_team',
      'succession_nomination.create',
      'succession_nomination.submit',
      'succession_nomination.recommend',
      'succession_nomination.reject',
      'succession_nomination.withdraw',
      'manager_self_service.view',
      'asset.view_own',
      'document.view_own',
      'document.acknowledge',
      'exit.view',
      'exit.manager_approve',
      'notification.view_own',
      'notification.update_own',
    ],
    employee: [
      'company.view',
      'branch.view',
      'department.view',
      'designation.view',
      'employee.view',
      'leave_type.view',
      'attendance.view',
      'attendance_correction.create',
      'attendance_correction.submit',
      'attendance_correction.cancel',
      'attendance_correction.view',
      'leave.view',
      'leave.apply',
      'leave.update_draft',
      'leave.submit',
      'leave.cancel',
      'leave.request_cancellation',
      'leave_balance.view',
      'payslip.view_own',
      'benefit_enrollment.view_own',
      'claim_category.view',
      'claim.view_own',
      'claim.create',
      'claim.update_draft',
      'claim.submit',
      'claim.withdraw',
      'claim.request_cancellation',
      'loan_type.view',
      'loan.view_own',
      'loan.apply',
      'loan.update_draft',
      'loan.submit',
      'loan.withdraw',
      'loan.request_cancellation',
      'loan_repayment.view',
      'performance_rating_scale.view',
      'performance_competency.view',
      'performance_template.view',
      'performance_review.view_own',
      'performance_goal.create',
      'performance_goal.update_draft',
      'performance_goal.submit',
      'performance_self_assessment.submit',
      'performance_review.acknowledge',
      'training_course.view',
      'training_session.view',
      'training_enrollment.view_own',
      'training_enrollment.request',
      'training_enrollment.update_draft',
      'training_enrollment.submit',
      'training_enrollment.withdraw',
      'training_enrollment.accept_nomination',
      'training_enrollment.decline_nomination',
      'training_enrollment.request_cancellation',
      'training_participation.view',
      'training_completion.view',
      'career_path.view',
      'career_plan.view_own',
      'career_plan.create',
      'career_plan.update_draft',
      'career_plan.submit',
      'career_plan.withdraw',
      'career_plan.update_progress',
      'career_plan.complete',
      'asset.view_own',
      'document.view_own',
      'document.acknowledge',
      'exit.view',
      'exit.create',
      'exit.submit',
      'exit.withdraw',
      'notification.view_own',
      'notification.update_own',
    ],
    auditor: permissions
      .slice(12)
      .map(([code]) => code)
      .filter(
        (code) =>
          code.endsWith('.view') &&
          !code.startsWith('employee_personal.') &&
          !code.startsWith('employee_contact.') &&
          code !== 'attendance_event.view' &&
          code !== 'attendance_import.view' &&
          !code.startsWith('leave_sensitive.') &&
          !code.startsWith('payroll') &&
          !code.startsWith('payslip') &&
          !code.startsWith('employee_compensation') &&
          code !== 'benefit_sensitive.view' &&
          code !== 'claim_sensitive.view' &&
          code !== 'loan_sensitive.view' &&
          code !== 'performance_sensitive.view' &&
          code !== 'training_sensitive.view' &&
          code !== 'training_sensitive.export' &&
          code !== 'document_sensitive.view',
      ),
  };
  const documentSensitivePermission = await knex('permissions')
    .where({ code: 'document_sensitive.view' })
    .first('id');
  if (documentSensitivePermission)
    await knex('role_permissions')
      .where({ permission_id: documentSensitivePermission.id })
      .delete();
  rolePermissionMap.hr_administrator.push(
    'performance_rating_scale.view',
    'performance_rating_scale.create',
    'performance_rating_scale.update',
    'performance_rating_scale.deactivate',
    'performance_competency.view',
    'performance_competency.create',
    'performance_competency.version_create',
    'performance_competency.deactivate',
    'performance_template.view',
    'performance_template.create',
    'performance_template.update',
    'performance_template.version_create',
    'performance_template.deactivate',
    'performance_cycle.view',
    'performance_cycle.create',
    'performance_cycle.update',
    'performance_cycle.activate',
    'performance_cycle.open_review',
    'performance_cycle.close',
    'performance_cycle.cancel',
    'performance_cycle.populate',
    'performance_review.view',
    'performance_review.finalize',
    'performance_review.finalize_without_acknowledgment',
    'performance_review.cancel',
    'performance_review.reassign_manager',
    'performance_review.export',
    'performance_goal.approve',
    'performance_goal.return',
    'performance_manager_assessment.submit',
  );
  rolePermissionMap.employee.push('onboarding_case.view_own', 'onboarding_task.update');
  rolePermissionMap.hr_administrator.push(
    'training_course.view',
    'training_course.create',
    'training_course.update',
    'training_course.version_create',
    'training_course.activate',
    'training_course.deactivate',
    'training_provider.view',
    'training_provider.create',
    'training_provider.update',
    'training_provider.version_create',
    'training_provider.deactivate',
    'training_session.view',
    'training_session.create',
    'training_session.update_draft',
    'training_session.publish',
    'training_session.close_enrollment',
    'training_session.start',
    'training_session.complete',
    'training_session.cancel',
    'training_session.manage_roster',
    'training_enrollment.view',
    'training_enrollment.assign',
    'training_enrollment.approve',
    'training_enrollment.reject',
    'training_enrollment.approve_cancellation',
    'training_enrollment.reject_cancellation',
    'training_enrollment.reassign_manager',
    'training_participation.view',
    'training_participation.record',
    'training_completion.view',
    'training_completion.record',
    'training_evidence.create_reference',
    'training_evidence.revoke_reference',
    'training.export',
  );
  rolePermissionMap.hr_administrator.push(
    'career_path.view',
    'career_path.create',
    'career_path.version_create',
    'career_path.activate',
    'career_path.deactivate',
    'career_plan.view',
    'career_plan.cancel',
    'career_plan.reassign_manager',
    'career_plan.export',
    'critical_position.view',
    'critical_position.create',
    'critical_position.version_create',
    'critical_position.activate',
    'critical_position.deactivate',
    'succession_plan.view',
    'succession_plan.create',
    'succession_plan.activate',
    'succession_plan.close',
    'succession_plan.cancel',
    'succession_nomination.view',
    'succession_nomination.create',
    'succession_nomination.confirm',
    'succession_nomination.reject',
    'succession_nomination.remove',
    'succession_nomination.withdraw',
    'succession_nomination.update_readiness',
    'succession_nomination.reassign_manager',
    'succession.export',
  );
  const managedEmployeePermissions = permissions
    .map(([code]) => code)
    .filter((code) => code.startsWith('employee'));
  const managedPermissionRows = await knex('permissions')
    .whereIn('code', managedEmployeePermissions)
    .select('id');
  const managedRoleRows = await knex('roles')
    .whereIn('code', Object.keys(rolePermissionMap))
    .select('id');
  if (managedPermissionRows.length && managedRoleRows.length)
    await knex('role_permissions')
      .whereIn(
        'role_id',
        managedRoleRows.map(({ id }) => id),
      )
      .whereIn(
        'permission_id',
        managedPermissionRows.map(({ id }) => id),
      )
      .del();
  const managedAttendanceRows = await knex('permissions')
    .whereIn('code', attendanceCodes)
    .select('id');
  if (managedAttendanceRows.length && managedRoleRows.length)
    await knex('role_permissions')
      .whereIn(
        'role_id',
        managedRoleRows.map(({ id }) => id),
      )
      .whereIn(
        'permission_id',
        managedAttendanceRows.map(({ id }) => id),
      )
      .del();
  const managedLeaveRows = await knex('permissions').whereIn('code', leaveCodes).select('id');
  if (managedLeaveRows.length && managedRoleRows.length)
    await knex('role_permissions')
      .whereIn(
        'role_id',
        managedRoleRows.map(({ id }) => id),
      )
      .whereIn(
        'permission_id',
        managedLeaveRows.map(({ id }) => id),
      )
      .del();
  const managedPayrollRows = await knex('permissions').whereIn('code', payrollCodes).select('id');
  if (managedPayrollRows.length && managedRoleRows.length)
    await knex('role_permissions')
      .whereIn(
        'role_id',
        managedRoleRows.map(({ id }) => id),
      )
      .whereIn(
        'permission_id',
        managedPayrollRows.map(({ id }) => id),
      )
      .del();
  const managedClaimRows = await knex('permissions').whereIn('code', claimCodes).select('id');
  if (managedClaimRows.length && managedRoleRows.length)
    await knex('role_permissions')
      .whereIn(
        'role_id',
        managedRoleRows.map(({ id }) => id),
      )
      .whereIn(
        'permission_id',
        managedClaimRows.map(({ id }) => id),
      )
      .del();
  const managedLoanRows = await knex('permissions').whereIn('code', loanCodes).select('id');
  if (managedLoanRows.length && managedRoleRows.length)
    await knex('role_permissions')
      .whereIn(
        'role_id',
        managedRoleRows.map(({ id }) => id),
      )
      .whereIn(
        'permission_id',
        managedLoanRows.map(({ id }) => id),
      )
      .del();
  const managedPerformanceRows = await knex('permissions')
    .whereIn('code', performanceCodes)
    .select('id');
  if (managedPerformanceRows.length && managedRoleRows.length)
    await knex('role_permissions')
      .whereIn(
        'role_id',
        managedRoleRows.map(({ id }) => id),
      )
      .whereIn(
        'permission_id',
        managedPerformanceRows.map(({ id }) => id),
      )
      .del();
  const managedTrainingRows = await knex('permissions').whereIn('code', trainingCodes).select('id');
  if (managedTrainingRows.length && managedRoleRows.length)
    await knex('role_permissions')
      .whereIn(
        'role_id',
        managedRoleRows.map(({ id }) => id),
      )
      .whereIn(
        'permission_id',
        managedTrainingRows.map(({ id }) => id),
      )
      .del();
  const managedTalentRows = await knex('permissions').whereIn('code', talentCodes).select('id');
  if (managedTalentRows.length && managedRoleRows.length)
    await knex('role_permissions')
      .whereIn(
        'role_id',
        managedRoleRows.map(({ id }) => id),
      )
      .whereIn(
        'permission_id',
        managedTalentRows.map(({ id }) => id),
      )
      .del();
  rolePermissionMap.hr_administrator.push(
    'exit.view',
    'exit.create',
    'exit.approve',
    'exit.reject',
    'exit.cancel',
    'exit.clearance',
    'exit.complete',
    'report.workforce',
    'final_settlement.view',
    'final_settlement.create',
    'final_settlement.calculate',
    'final_settlement.submit',
    'final_settlement.cancel',
  );
  rolePermissionMap.finance_approver.push(
    'final_settlement.view',
    'final_settlement.approve',
    'final_settlement.reject',
  );
  rolePermissionMap.finance_payment_officer.push('final_settlement.view');
  rolePermissionMap.finance_payment_officer.push('final_settlement.record_payment');
  rolePermissionMap.hr_administrator.push('notification.create');
  rolePermissionMap.auditor.push('audit.view', 'audit.review', 'report.workforce');
  rolePermissionMap.recruiter = [
    'company.view',
    'branch.view',
    'department.view',
    'designation.view',
    'manpower_plan.view',
    'manpower_plan.create',
    'manpower_plan.update',
    'job_requisition.view',
    'job_requisition.create',
    'job_requisition.update',
    'job_posting.view',
    'job_posting.create',
    'job_posting.update',
    'candidate.view',
    'candidate.create',
    'candidate.update',
    'recruitment_application.view',
    'recruitment_application.create',
    'recruitment_application.screen',
    'recruitment_interview.view',
    'recruitment_interview.create',
    'recruitment_assessment.view',
    'recruitment_assessment.create',
    'recruitment_offer.view',
    'recruitment_offer.create',
    'recruitment_offer.update',
  ];
  rolePermissionMap.onboarding_coordinator = [
    'company.view',
    'branch.view',
    'department.view',
    'employee.view',
    'onboarding_template.view',
    'onboarding_template.create',
    'onboarding_template.update',
    'onboarding_case.view',
    'onboarding_case.create',
    'onboarding_case.update',
    'onboarding_task.update',
    'onboarding_task.waive',
    'onboarding_readiness.confirm',
  ];
  rolePermissionMap.hr_administrator.push(
    'manpower_plan.view',
    'manpower_plan.create',
    'manpower_plan.update',
    'manpower_plan.approve',
    'job_requisition.view',
    'job_requisition.create',
    'job_requisition.update',
    'job_requisition.approve',
    'job_posting.view',
    'job_posting.create',
    'job_posting.update',
    'candidate.view',
    'candidate.create',
    'candidate.update',
    'recruitment_application.view',
    'recruitment_application.create',
    'recruitment_application.screen',
    'recruitment_interview.view',
    'recruitment_interview.create',
    'recruitment_assessment.view',
    'recruitment_assessment.create',
    'recruitment_offer.view',
    'recruitment_offer.create',
    'recruitment_offer.update',
    'recruitment_offer.approve',
    'recruitment_hire.convert',
    'onboarding_template.view',
    'onboarding_template.create',
    'onboarding_template.update',
    'onboarding_case.view',
    'onboarding_case.create',
    'onboarding_case.update',
    'onboarding_task.update',
    'onboarding_task.waive',
    'onboarding_readiness.confirm',
  );
  // Every managed operational role can receive and manage its own in-app workflow inbox.
  // This does not grant notification creation or visibility into another user's inbox.
  for (const permissionCodes of Object.values(rolePermissionMap))
    for (const code of ['notification.view_own', 'notification.update_own'])
      if (!permissionCodes.includes(code)) permissionCodes.push(code);
  for (const [roleCode, permissionCodes] of Object.entries(rolePermissionMap)) {
    const role = await knex('roles').where({ code: roleCode }).first('id');
    const allowed = await knex('permissions').whereIn('code', permissionCodes).select('id');
    if (role && allowed.length)
      await knex('role_permissions')
        .insert(allowed.map(({ id }) => ({ role_id: role.id, permission_id: id })))
        .onConflict(['role_id', 'permission_id'])
        .ignore();
  }
}
