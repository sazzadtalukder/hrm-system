export function projectEmployee(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    preferredName: row.preferred_name,
    displayName: row.display_name,
    recordStatus: row.record_status,
    version: row.version,
    employment: row.employment_id
      ? {
          id: row.employment_id,
          employeeCode: row.employee_code,
          employmentType: row.employment_type,
          joiningDate:
            row.joining_date instanceof Date
              ? row.joining_date.toISOString().slice(0, 10)
              : row.joining_date,
          employmentStatus: row.employment_status,
          assignmentId: row.assignment_id,
          branchId: row.branch_id,
          branchName: row.branch_name,
          departmentId: row.department_id,
          departmentName: row.department_name,
          designationId: row.designation_id,
          designationName: row.designation_name,
          gradeId: row.grade_id,
          gradeName: row.grade_name,
          costCenterId: row.cost_center_id,
          costCenterName: row.cost_center_name,
          workCalendarId: row.work_calendar_id,
          workCalendarName: row.work_calendar_name,
          workCalendarCode: row.work_calendar_code,
          managerEmploymentId: row.manager_employment_id,
          managerDisplayName: row.manager_display_name,
          managerEmployeeCode: row.manager_employee_code,
        }
      : null,
  };
}

export function projectPersonal(row) {
  return row
    ? {
        employeeId: row.employee_id,
        dateOfBirth:
          row.date_of_birth instanceof Date
            ? row.date_of_birth.toISOString().slice(0, 10)
            : row.date_of_birth,
        gender: row.gender,
        maritalStatus: row.marital_status,
        nationalityCountryCode: row.nationality_country_code,
        version: row.version,
      }
    : null;
}

export function projectContact(row, emergencyContacts = []) {
  if (!row) return null;
  const projected = { employeeId: row.employee_id, version: row.version };
  for (const column of [
    'personal_email',
    'personal_phone',
    'alternate_phone',
    'present_address_line_1',
    'present_address_line_2',
    'present_city',
    'present_postal_code',
    'present_country_code',
    'permanent_address_line_1',
    'permanent_address_line_2',
    'permanent_city',
    'permanent_postal_code',
    'permanent_country_code',
  ])
    projected[column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = row[column];
  projected.emergencyContacts = emergencyContacts;
  return projected;
}
