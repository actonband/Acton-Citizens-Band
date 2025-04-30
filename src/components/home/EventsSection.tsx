import React, { useState, useEffect } from "react";
import Section, { SectionProps } from "../Section";
import GoogleAnalyticsLink from "../../utils/GoogleAnalyticsLink";
import { firestore } from "../../utils/Firebase";
import {
  collection,
  addDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore"; 

const fetchEvents = async (): Promise<Event[]> => {
  try {
    const events: Event[] = [];
  
    const now = Timestamp.fromDate(new Date());
  
    const q = query(
      collection(firestore, "events"),
      orderBy("start", "asc"),
      where("start", ">=", now)
    );
    const snapshot = await getDocs(q);
  
    let index = 0;
  
    snapshot.forEach((event) => {
      events.push({ id: event.id, key: index++, ...event.data() } as Event);
    });
  
    return events;
  } catch (error) {
    console.error("Error fetching events:", error);
    return [];
  }
};

type EventLink = {
  text: string | null;
  url: string | null;
};

export type Event = {
  id: string;
  key: number;
  user_id: string | null;
  title: string | null;
  venue: string | null;
  address: string | null;
  description: string | null;
  members_note: string | null;
  links: EventLink[] | null;
  start: Timestamp | null;
  end: Timestamp | null;
  cancelled: boolean | null;
  updated: Timestamp | null;
};

const EventsSection: React.FC<SectionProps> = ({ ...props }) => {
  const [eventElements, setEventElements] = useState<JSX.Element>(
    <div className="event-list"></div>
  );

  useEffect(() => {
    const loadEvents = async () => {
      const events = await fetchEvents();

      if (events.length === 0) {
        setEventElements(
          <div className="event-list"><div className="events-empty-message">Our upcoming events will be added soon, stay tuned!</div></div>
        );
      } else {
        const eventElements = (await fetchEvents()).map((event) => (
          <div className="event" key={event.key}>
            {!event.title ? null : (
              <div className="event-title">
                {(event.cancelled ? "CANCELLED: " : "") + event.title}
              </div>
            )}
            {!event.start ? null : (
              <>
                <div className="event-date">
                  {event.start.toDate().toLocaleDateString("default", {
                    weekday: "long",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="event-time">
                  {event.start
                    .toDate()
                    .toLocaleTimeString("default", { timeStyle: "short" }) +
                    (event.end
                      ? " - " +
                        event.end
                          .toDate()
                          .toLocaleTimeString("default", { timeStyle: "short" })
                      : "")}
                </div>
              </>
            )}
            {!event.venue ? null : (
              <div className="event-venue">{event.venue}</div>
            )}
            {!event.address ? null : (
              <div className="event-address">
                <GoogleAnalyticsLink 
                  eventName="Event_Address_Maps_Link_Click"
                  eventCategory="Link"
                  eventLabel="Event_Address_Maps_Link"
                  href={"http://maps.google.com/?q=" + event.address}
                  target="_BLANK"
                >
                  {event.address}
                </GoogleAnalyticsLink>
              </div>
            )}
            {!event.description ? null : (
              <div className="event-description">{event.description}</div>
            )}
            {!event.members_note ? null : (
              <div className="event-members-note">
                Members: {event.members_note}
              </div>
            )}
            {!event.links ? null : (
              <div className="event-links">
                {event.links.map((link) =>
                  !link.text || !link.url ? null : (
                    <GoogleAnalyticsLink 
                      eventName="Event_Link_Click"
                      eventCategory="Link"
                      eventLabel="Event_Link"
                      href={link.url} target="_BLANK"
                    >
                      {link.text}
                    </GoogleAnalyticsLink>
                  )
                )}
              </div>
            )}
          </div>
        ));
        
        setEventElements(<div className="event-list">{eventElements}</div>);
      }
    };

    loadEvents();
  }, []);

  return (
    <Section
      id={props.id}
      navItem={props.navItem}
      title={props.title}
      content={
        <>
          {eventElements}
          <div className="event-links">
            <div className="button-container">
              <GoogleAnalyticsLink 
                eventName="Events_Section_iCal_Link_Click"
                eventCategory="Link"
                eventLabel="Events_Section_iCal_Link"
                className="button calendar-button"
                href="webcal://actoncitizensband.ca/iCal" // redirected by CloudFlare Page Rule
              >
                <span className="button-icon"></span>
                <span className="button-text">Add to your Calendar</span> 
              </GoogleAnalyticsLink>
              <GoogleAnalyticsLink 
                eventName="Events_Section_Google_Calendar_Link_Click"
                eventCategory="Link"
                eventLabel="Events_Section_Google_Calendar_Link"
                className="button button-google"
                target="_BLANK"
                href="https://actoncitizensband.ca/calendar" // redirected by CloudFlare Page Rule
              >
                <span className="button-icon"></span>
                <span className="button-text">View Google Calendar</span> 
              </GoogleAnalyticsLink>
              <GoogleAnalyticsLink 
                eventName="Events_Section_Facebook_Events_Link_Click"
                eventCategory="Link"
                eventLabel="Events_Section_Facebook_Events_Link"
                className="button button-facebook"
                target="_BLANK"
                href="https://www.facebook.com/ActonBand/events"
              >
                <span className="button-icon"></span>
                <span className="button-text">View Facebook Events</span> 
              </GoogleAnalyticsLink>
            </div>
          </div>
        </>
      }
      image={props.image}
      instrumentModel={props.instrumentModel}
      headerHeight={props.headerHeight}
    />
  );
};

export default EventsSection;
