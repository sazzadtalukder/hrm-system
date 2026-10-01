export async function insertAuditEvent(database, event) {
  const [id] = await database('audit_events').insert({
    actor_user_id: event.actorUserId ?? null,
    subject_user_id: event.subjectUserId ?? null,
    company_id: event.companyId ?? null,
    action_code: event.actionCode,
    outcome: event.outcome,
    record_type: event.recordType ?? null,
    record_id: event.recordId?.toString() ?? null,
    permission_code: event.permissionCode ?? null,
    scope_type: event.scopeType ?? null,
    request_id: event.requestId ?? null,
    correlation_id: event.correlationId ?? null,
    reason: event.reason ?? null,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null,
    occurred_at: database.fn.now(),
  });
  return id;
}
