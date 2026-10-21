/**
 * Free of anything Node-only, because the pages turn recording names into local time with it.
 */

const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/u;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/**
 * `YYYY-MM-DD_HH-MM-SS`, sortable and filename-safe, and always in UTC, so a name does not depend on the time zone of the machine that wrote it.
 */
export function formatTimestamp(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}_${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}-${pad(date.getUTCSeconds())}`;
}

export function startsWithTimestamp(name: string) {
  return TIMESTAMP_PATTERN.test(name);
}

/**
 * A name that starts with a UTC timestamp, shown with that timestamp in this phone's time zone instead. Anything after the timestamp, and any other name, is left as it is.
 */
export function toLocalTimestampName(name: string) {
  const match = TIMESTAMP_PATTERN.exec(name);
  let localName = name;
  if (match !== null) {
    const [timestamp = '', year, month, day, hours, minutes, seconds] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds)));
    localName = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}${name.slice(timestamp.length)}`;
  }

  return localName;
}
