import { useEffect, useState } from "react";
import Section from "./Section";
import type { SectionProps } from "./Section";
import { trackEvent } from "../../utils/analytics";
import AnalyticsLink from "../AnalyticsLink";
import CalendarSubscription from "./CalendarSubscription";
import { firestore } from "../../utils/firebase";
import { collection, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { parseEvent } from "../../utils/events";
import type { BandEvent } from "../../utils/events";
import EventDetails from "../EventDetails";

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
        if (active) {
          setState({ status: "loaded", events });
          trackEvent("events_load", {
            result: events.length ? "success" : "empty",
            event_count: events.length,
          });
        }
      },
      (error) => {
        console.error("Unable to load events:", error);
        if (active) {
          setState({ status: "error" });
          trackEvent("events_load", { result: "error" });
        }
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
                  data-analytics-event="events_retry"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Try Again
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
                <div className="event" key={event.id} data-event-id={event.id}>
                  <EventDetails event={event} analytics />
                </div>
              ))}
          </div>
          <div className="event-calendar-actions">
            <CalendarSubscription />
            <AnalyticsLink
              data-analytics-group="calendar"
              data-analytics-button="View Google Calendar"
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
            </AnalyticsLink>
            <AnalyticsLink
              data-analytics-group="calendar"
              data-analytics-button="View Facebook Events"
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
            </AnalyticsLink>
          </div>
        </>
      }
    />
  );
};

export default EventsSection;
