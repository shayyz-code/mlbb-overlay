const matchTimePattern = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;

export function matchTimeInputValue(value: string | null): string {
  return value?.match(matchTimePattern)?.[0] ?? "";
}

export function matchTimeFromInput(value: string): string | null {
  if (!value) return null;
  const match = value.match(matchTimePattern);
  if (!match || match[0] !== value)
    throw new Error("Match time must use the local date and time format.");
  return `${value}:00.000Z`;
}

export function formatMatchTime(
  value: string | null,
  fallback: string,
): string {
  const match = value?.match(matchTimePattern);
  if (!match) return fallback;
  const hour = Number(match[2]);
  const minute = match[3];
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, "0")}:${minute} ${period}`;
}
