// A bare "YYYY-MM-DD" query param (what every <input type="date"> on this
// platform's analytics pages sends) parses to midnight UTC on that day --
// so a merchant picking "today" as the end of a range would silently
// exclude anything that happened today after 00:00 UTC. Every analytics
// "to" query param goes through this before reaching a service, so a range
// end is always inclusive of its whole day. "from" needs no such
// adjustment: midnight at the start of the day is already the inclusive
// lower bound a merchant expects.
export function parseRangeEnd(value?: string): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  return new Date(value);
}
