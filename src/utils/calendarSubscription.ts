export type CalendarProvider = "Apple" | "Google" | "Outlook" | "Microsoft365";

type CalendarDevice = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string };
};

export function getDefaultCalendarProvider(device: CalendarDevice): CalendarProvider {
  const platform = device.userAgentData?.platform || device.platform || "";
  const ua = device.userAgent || "";
  if (/android|cros/i.test(`${platform} ${ua}`)) return "Google";
  // iPads using desktop browsing identify themselves as touch-capable Macs.
  const isIPad = /mac/i.test(platform) && (device.maxTouchPoints || 0) > 1;
  if (isIPad || /iphone|ipad|ipod|mac/i.test(`${platform} ${ua}`)) return "Apple";
  if (/win/i.test(platform) || /windows/i.test(ua)) return "Outlook";
  return "Google";
}

const calendarId = "94fded993db91a2a6d122b8aa105c80c99219e918f1c23d48bb2a74a11ebe34d@group.calendar.google.com";
export const calendarFeedUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
const outlookQuery = new URLSearchParams({ url: calendarFeedUrl, name: "Acton Citizens' Band" });

export const calendarProviders: Record<CalendarProvider, { label: string; href: string; className: string }> = {
  Apple: { label: "iCal / Webcal", href: calendarFeedUrl.replace(/^https:/, "webcal:"), className: "calendar-button" },
  Google: { label: "Google Calendar", href: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calendarId)}`, className: "button-google" },
  Outlook: { label: "Outlook.com", href: `https://outlook.live.com/calendar/0/addfromweb?${outlookQuery}`, className: "button-microsoft" },
  Microsoft365: { label: "Microsoft 365", href: `https://outlook.office.com/calendar/0/addfromweb?${outlookQuery}`, className: "button-microsoft" },
};
