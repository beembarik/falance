const DEFAULT_BUSINESS_TIME_ZONE = "UTC";

export function getBusinessTimeZone(): string {
  const configured = process.env.FALANCE_TIME_ZONE?.trim();
  const timeZone = configured || DEFAULT_BUSINESS_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new Error(`Invalid FALANCE_TIME_ZONE: ${timeZone}`);
  }

  return timeZone;
}

export function getBusinessDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getBusinessTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${values.year}-${values.month}-${values.day}`;
}
