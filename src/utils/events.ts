export type EventLink = { text: string; url: string };

export function validateEventLinks(drafts: readonly EventLink[]): EventLink[] {
  const links: EventLink[] = [];
  drafts.forEach((draft, index) => {
    const text = draft.text.trim();
    const url = draft.url.trim();
    if (!text && !url) return;
    if (!text || !url) throw new Error(`Link ${index + 1}: enter both a label and a URL.`);
    try {
      const parsed = new URL(url);
      if (!["https:", "http:"].includes(parsed.protocol) || !parsed.hostname) throw new Error();
    } catch {
      throw new Error(`Link ${index + 1}: enter a valid URL starting with https:// or http://.`);
    }
    links.push({ text, url });
  });
  if (links.length > 20) throw new Error("An event can have up to 20 links.");
  return links;
}
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

export type DashboardEventRecord = { id: string; data: Record<string, unknown> };
export type DashboardEvent = DashboardEventRecord & { details: BandEvent | null };

export function groupDashboardEvents(records: DashboardEventRecord[], now: Date) {
  const upcoming: DashboardEvent[] = [];
  const past: DashboardEvent[] = [];
  const undated: DashboardEvent[] = [];
  for (const record of records) {
    const details = parseEvent(record.id, record.data);
    const event = { ...record, details };
    if (!details) undated.push(event);
    else if ((details.end || details.start).getTime() > now.getTime()) upcoming.push(event);
    else past.push(event);
  }
  upcoming.sort(
    (a, b) => a.details!.start.getTime() - b.details!.start.getTime() || a.id.localeCompare(b.id),
  );
  past.sort(
    (a, b) => b.details!.start.getTime() - a.details!.start.getTime() || a.id.localeCompare(b.id),
  );
  return { upcoming, past, undated };
}

export function formatDashboardEventDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function formatEventUpdated(value: unknown): string {
  const updated = date(value);
  return updated
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(updated)
    : "Not recorded";
}
