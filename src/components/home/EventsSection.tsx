import { useEffect, useState } from "react";
import Section from "../Section";
import type { SectionProps } from "../Section";
import GoogleAnalyticsLink from "../../utils/GoogleAnalyticsLink";
import CalendarSubscription from "./CalendarSubscription";
import { firestore } from "../../utils/Firebase";
import { collection, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { formatEventDate, formatEventTime, parseEvent } from "../../utils/events";
import type { BandEvent } from "../../utils/events";

type EventsState =
  { status: "loading" } | { status: "error" } | { status: "loaded"; events: BandEvent[] };

async function fetchEvents(): Promise<BandEvent[]> {
  const request = query(
    collection(firestore, "events"),
    orderBy("start", "asc"),
    where("start", ">=", Timestamp.now()),
  );
  const snapshot = await getDocs(request);
  return snapshot.docs.flatMap((document) => {
    const event = parseEvent(document.id, document.data());
    return event ? [event] : [];
  });
}

const EventsSection = (props: SectionProps) => {
  const [state, setState] = useState<EventsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    fetchEvents().then(
      (events) => {
        if (active) setState({ status: "loaded", events });
      },
      (error) => {
        console.error("Unable to load events:", error);
        if (active) setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <Section
      {...props}
      content={
        <>
          <div className="event-list" aria-busy={state.status === "loading"}>
            {state.status === "loading" && <p role="status">Loading upcoming events...</p>}
            {state.status === "error" && (
              <div role="alert">
                <p>We couldn't load the upcoming events. Please try again.</p>
                <button
                  type="button"
                  className="button"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Try again
                </button>
              </div>
            )}
            {state.status === "loaded" && state.events.length === 0 && (
              <p className="events-empty-message">
                Our upcoming events will be added soon, stay tuned!
              </p>
            )}
            {state.status === "loaded" &&
              state.events.map((event) => (
                <div className="event" key={event.id}>
                  {event.title && (
                    <div className="event-title">
                      {event.cancelled ? "CANCELLED: " : ""}
                      {event.title}
                    </div>
                  )}
                  <div className="event-details">
                    <div className="event-date">{formatEventDate(event.start)}</div>
                    <div className="event-time">
                      {formatEventTime(event.start)}
                      {event.end ? " - " + formatEventTime(event.end) : ""}
                    </div>
                    {event.venue && <div className="event-venue">{event.venue}</div>}
                    {event.address && (
                      <div className="event-address">
                        <GoogleAnalyticsLink
                          eventName="Event_Address_Maps_Link_Click"
                          eventCategory="Link"
                          eventLabel="Event_Address_Maps_Link"
                          href={"https://maps.google.com/?q=" + encodeURIComponent(event.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {event.address}
                        </GoogleAnalyticsLink>
                      </div>
                    )}
                  </div>
                  {event.description && (
                    <div className="event-description">{event.description}</div>
                  )}
                  {event.membersNote && (
                    <div className="event-members-note">Members: {event.membersNote}</div>
                  )}
                  {event.links.length > 0 && (
                    <div className="event-links">
                      {event.links.map((link, index) => (
                        <GoogleAnalyticsLink
                          key={event.id + "-" + index}
                          eventName="Event_Link_Click"
                          eventCategory="Link"
                          eventLabel="Event_Link"
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.text}
                        </GoogleAnalyticsLink>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
          <div className="event-calendar-actions">
            <CalendarSubscription />
            <GoogleAnalyticsLink
              eventName="Events_Section_Google_Calendar_Link_Click"
              eventCategory="Link"
              eventLabel="Events_Section_Google_Calendar_Link"
              className="button button-google"
              target="_blank"
              rel="noopener noreferrer"
              href="https://actoncitizensband.ca/calendar"
            >
              <span className="button-icon" aria-hidden="true" />
              <span className="button-text">View Google Calendar</span>
            </GoogleAnalyticsLink>
            <GoogleAnalyticsLink
              eventName="Events_Section_Facebook_Events_Link_Click"
              eventCategory="Link"
              eventLabel="Events_Section_Facebook_Events_Link"
              className="button button-facebook"
              target="_blank"
              rel="noopener noreferrer"
              href="https://www.facebook.com/ActonBand/events"
            >
              <span className="button-icon" aria-hidden="true" />
              <span className="button-text">View Facebook Events</span>
            </GoogleAnalyticsLink>
          </div>
        </>
      }
    />
  );
};

export default EventsSection;
