// Added: Share Toronto's calendar-day rules between the browser and Services.
const torontoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Added: Return YYYY-MM-DD without depending on the machine's time zone. */
export function getTorontoCalendarDate(now = new Date()): string {
  const parts = torontoDateFormatter.formatToParts(now);
  let year = "";
  let month = "";
  let day = "";

  for (const part of parts) {
    if (part.type === "year") {
      year = part.value;
    } else if (part.type === "month") {
      month = part.value;
    } else if (part.type === "day") {
      day = part.value;
    }
  }

  const calendarDate = year + "-" + month + "-" + day;

  return calendarDate;
}

/** Added: PostgreSQL DATE values use UTC midnight to represent a calendar day. */
export function isRequestStartDateInPast(
  requestStartDate: Date,
  now = new Date(),
): boolean {
  const requestDate = requestStartDate.toISOString().slice(0, 10);
  const today = getTorontoCalendarDate(now);
  const isPast = requestDate < today;

  return isPast;
}
