import type { AnchorHTMLAttributes } from "react";
import type { BandEvent } from "../utils/events";
import { formatDashboardEventDate, formatEventDate, formatEventTime } from "../utils/events";
import AnalyticsLink from "./AnalyticsLink";

type DisplayEvent = Omit<BandEvent, "start"> & { start: Date | null };

function EventLink({
  analytics,
  eventName,
  eventLabel,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  analytics: boolean;
  eventName: string;
  eventLabel: string;
}) {
  return analytics ? (
    <AnalyticsLink {...props} eventName={eventName} eventCategory="Link" eventLabel={eventLabel} />
  ) : (
    <a {...props} />
  );
}

export default function EventDetails({
  event,
  analytics = false,
}: {
  event: DisplayEvent;
  analytics?: boolean;
}) {
  return (
    <>
      {event.title && (
        <div className="event-title">
          <span className="event-title-text">
            {event.cancelled ? "CANCELLED: " : ""}
            {event.title}
          </span>
        </div>
      )}
      <div className="event-details">
        <div className="event-date">
          {event.start ? formatEventDate(event.start) : "Date to be confirmed"}
        </div>
        {event.start && (
          <div className="event-time">
            {formatEventTime(event.start)}
            {event.end && (
              <>
                {" "}
                -{" "}
                {formatDashboardEventDate(event.end) !== formatDashboardEventDate(event.start)
                  ? `${formatDashboardEventDate(event.end)} at `
                  : ""}
                {formatEventTime(event.end)}
              </>
            )}
          </div>
        )}
        {event.venue && <div className="event-venue">{event.venue}</div>}
        {event.address && (
          <div className="event-address">
            <EventLink
              analytics={analytics}
              eventName="Event_Address_Maps_Link_Click"
              eventLabel="Event_Address_Maps_Link"
              href={"https://maps.google.com/?q=" + encodeURIComponent(event.address)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {event.address}
            </EventLink>
          </div>
        )}
      </div>
      {event.description && <div className="event-description">{event.description}</div>}
      {event.membersNote && <div className="event-members-note">Members: {event.membersNote}</div>}
      {event.links.length > 0 && (
        <div className="event-links">
          {event.links.map((link, index) => (
            <EventLink
              key={event.id + "-" + index}
              analytics={analytics}
              eventName="Event_Link_Click"
              eventLabel="Event_Link"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.text}
            </EventLink>
          ))}
        </div>
      )}
    </>
  );
}
