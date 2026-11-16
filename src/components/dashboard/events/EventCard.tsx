import type { DashboardEvent } from "../../../utils/events";
import { formatDashboardEventDate } from "../../../utils/events";
import EventDetails from "../../EventDetails";

export default function EventCard({
  event,
  compact = false,
  disabled = false,
  onEdit,
  onView,
}: {
  event: DashboardEvent;
  compact?: boolean;
  disabled?: boolean;
  onEdit?: () => void;
  onView?: () => void;
}) {
  const { details, data } = event;
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
  const title = details?.title || text("title") || "Untitled Event";
  const onOpen = onEdit || onView;
  if (compact) {
    const Content = onOpen ? "button" : "div";
    return (
      <div className="event-card is-compact" data-event-id={event.id}>
        <Content
          className="event-card-compact"
          {...(onOpen ? { type: "button" as const, disabled, onClick: onOpen } : {})}
        >
          <span className="event-card-heading">
            <strong>{title}</strong>
            {details ? (
              <time dateTime={details.start.toISOString()}>
                {formatDashboardEventDate(details.start)}
              </time>
            ) : (
              <span className="event-card-date">Missing date</span>
            )}
          </span>
        </Content>
      </div>
    );
  }
  const display = details
    ? { ...details, title }
    : {
        id: event.id,
        title,
        start: null,
        end: null,
        venue: text("venue"),
        address: text("address"),
        description: text("description"),
        membersNote: text("members_note"),
        cancelled: data.cancelled === true,
        links: [],
      };
  return (
    <div className="event-card" data-event-id={event.id}>
      <EventDetails event={display} />
      {onOpen && (
        <div className="event-card-actions">
          <button
            type="button"
            className="dashboard-secondary-button"
            disabled={disabled}
            onClick={onOpen}
            aria-label={`${onEdit ? "Edit" : "View"} ${title}`}
          >
            {onEdit ? "Edit Event" : "View Event"}
          </button>
        </div>
      )}
    </div>
  );
}
