import React from "react";
import type { Feature } from "../../utils/features";
import AboutSection from "./AboutSection";
import LearnSection from "./LearnSection";
import JoinSection from "./JoinSection";
import EventsSection from "./EventsSection";
import HistorySection from "./HistorySection";

type HomePageProps = {
  features: Feature[];
};

const HomePage: React.FC<HomePageProps> = ({ features }) => {
  return (
    <main id="main" className="main">
      <h1 className="visually-hidden">Acton Citizens' Band</h1>
      <AboutSection
        key="about"
        id="about"
        title="About Us"
        image={{
          path: "/img/photos/Acton-Citizens-Band-CNE-1st-Prize-1947.JPG",
          width: 1538,
          height: 697,
          caption: "1st Prize at the CNE in 1947",
          credits: "Vintage Acton / Dills Collection",
        }}
        instrumentModel={{
          modelPath: "/model/Trumpet.glb",
          tall: false,
        }}
      />
      <LearnSection
        key="learn"
        id="learn"
        title="Learn With Us"
        image={{
          path: "/img/photos/Acton-Citizens-Band-1958.JPG",
          width: 1441,
          height: 686,
          caption: "Acton Citizens' Band in 1958",
          credits: "The New Tanner Photo Archive Collection",
        }}
        instrumentModel={{
          modelPath: "/model/Clarinet.glb",
          tall: true,
        }}
      />
      <JoinSection
        key="join"
        id="join"
        title="Join Us"
        image={{
          path: "/img/photos/Acton-Citizens-Band-New-Arena-Opening-1998-01.JPG",
          width: 1494,
          height: 766,
          caption: "Grand opening of the new arena, January 1998",
          credits: "Vintage Acton / Dills Collection",
        }}
        instrumentModel={{
          modelPath: "/model/Saxophone.glb",
          tall: true,
        }}
      />
      <EventsSection
        key="events"
        id="events"
        title="Upcoming Events"
        image={{
          path: "/img/photos/Acton-Citizens-Band-1935.JPG",
          width: 1938,
          height: 1465,
          caption: "Acton Citizens' Band in 1935",
          credits: "Vintage Acton / Dills Collection",
        }}
        instrumentModel={{
          modelPath: "/model/Snare-Drum.glb",
          tall: false,
        }}
      />
      {features.some((f) => f.name === "history" && f.enabled === true) && (
        <HistorySection key="history" id="history" title="Our History" />
      )}
    </main>
  );
};

export default HomePage;
