function partsInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function zonedDateTimeToUtc(date, time, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsInTimezone(new Date(candidate), timeZone);
    const represented = Date.UTC(
      Number(actual.year),
      Number(actual.month) - 1,
      Number(actual.day),
      Number(actual.hour),
      Number(actual.minute),
      Number(actual.second),
    );
    candidate -= represented - desired;
  }
  return new Date(candidate);
}
export function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function daysInclusive(from, to) {
  return Math.floor((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}
export function weekday(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}
export function scheduleFor(date, shiftVersion) {
  const start = zonedDateTimeToUtc(
    date,
    String(shiftVersion.start_time).slice(0, 5),
    shiftVersion.timezone,
  );
  const endDate = shiftVersion.crosses_midnight ? addDays(date, 1) : date;
  const end = zonedDateTimeToUtc(
    endDate,
    String(shiftVersion.end_time).slice(0, 5),
    shiftVersion.timezone,
  );
  return { start, end };
}
export function calculateSnapshot({
  attendanceDate,
  shiftVersion,
  events,
  isWorkingDay,
  isHoliday,
  correction,
}) {
  const schedule = shiftVersion ? scheduleFor(attendanceDate, shiftVersion) : null;
  if (!shiftVersion)
    return {
      status: 'configuration_exception',
      exceptionCode: 'MISSING_SHIFT',
      schedule: null,
      checkIn: null,
      checkOut: null,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      sourceEventIds: [],
    };
  const accepted = [...events].sort(
    (a, b) => new Date(a.occurred_at_utc) - new Date(b.occurred_at_utc),
  );
  let checkIn = correction?.checkIn
    ? new Date(correction.checkIn)
    : accepted.find((event) => event.event_type === 'check_in')?.occurred_at_utc;
  let checkOut = correction?.checkOut
    ? new Date(correction.checkOut)
    : [...accepted].reverse().find((event) => event.event_type === 'check_out')?.occurred_at_utc;
  checkIn = checkIn ? new Date(checkIn) : null;
  checkOut = checkOut ? new Date(checkOut) : null;
  const sourceEventIds = accepted.map(({ id }) => id);
  if (isHoliday || !isWorkingDay)
    return {
      status: isHoliday ? 'holiday' : 'rest_day',
      exceptionCode: accepted.length ? 'NON_WORKING_DAY_EVENTS' : null,
      schedule,
      checkIn,
      checkOut,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      sourceEventIds,
    };
  if (!checkIn && !checkOut)
    return {
      status: 'absent',
      exceptionCode: null,
      schedule,
      checkIn,
      checkOut,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      sourceEventIds,
    };
  if (!checkIn || !checkOut || checkOut <= checkIn)
    return {
      status: 'incomplete',
      exceptionCode: 'MISSING_OR_INVALID_PUNCH',
      schedule,
      checkIn,
      checkOut,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      sourceEventIds,
    };
  const total = Math.floor((checkOut - checkIn) / 60_000);
  const workedMinutes = Math.max(0, total - shiftVersion.unpaid_break_minutes);
  const lateThreshold = new Date(schedule.start.getTime() + shiftVersion.grace_in_minutes * 60_000);
  const earlyThreshold = new Date(schedule.end.getTime() - shiftVersion.grace_out_minutes * 60_000);
  return {
    status: 'present',
    exceptionCode: null,
    schedule,
    checkIn,
    checkOut,
    workedMinutes,
    lateMinutes: checkIn > lateThreshold ? Math.floor((checkIn - schedule.start) / 60_000) : 0,
    earlyDepartureMinutes:
      checkOut < earlyThreshold ? Math.floor((schedule.end - checkOut) / 60_000) : 0,
    sourceEventIds,
  };
}
