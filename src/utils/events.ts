export type EventLink = { text: string; url: string };
export type BandEvent = {
  id: string;
  title: string;
  venue: string;
  address: string;
  description: string;
  membersNote: string;
  links: EventLink[];
  start: Date;
  end: Date | null;
  cancelled: boolean;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function date(value: unknown): Date | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("toDate" in value) ||
    typeof value.toDate !== "function"
  )
    return null;
  try {
    const result: unknown = value.toDate();
    return result instanceof Date && Number.isFinite(result.getTime()) ? result : null;
  } catch {
    return null;
  }
}

function eventLink(value: unknown): EventLink | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const label = text(record.text);
  try {
    const url = new URL(text(record.url));
    return label && ["https:", "http:"].includes(url.protocol)
      ? { text: label, url: url.href }
      : null;
  } catch {
    return null;
  }
}

export function parseEvent(id: string, data: Record<string, unknown>): BandEvent | null {
  const start = date(data.start);
  if (!start) return null;
  const end = date(data.end);
  return {
    id,
    start,
    title: text(data.title),
    venue: text(data.venue),
    address: text(data.address),
    description: text(data.description),
    membersNote: text(data.members_note),
    end: end && end.getTime() >= start.getTime() ? end : null,
    cancelled: data.cancelled === true,
    links: Array.isArray(data.links)
      ? data.links.map(eventLink).filter((link): link is EventLink => link !== null)
      : [],
  };
}

export function formatEventDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function formatEventTime(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
