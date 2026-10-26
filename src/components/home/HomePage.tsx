import React from "react";
import { Feature } from "../../App";
import AboutSection from "./AboutSection";
import LearnSection from "./LearnSection";
import JoinSection from "./JoinSection";
import EventsSection from "./EventsSection";
import HistorySection from "./HistorySection";
import AccountSection from "./AccountSection";
import { isAccountEnabled } from "../../utils/features";

type MainProps = {
  headerHeight: number,
  features: Feature[]
};

const HomePage: React.FC<MainProps> = ({ headerHeight, features }) => {
  return (
    <>
      <AboutSection
        key="about"
        id="about"
        navItem="About"
        title="About Us"
        image={{
          path: "/img/photos/Acton-Citizens-Band-CNE-1st-Prize-1947.JPG",
          caption: "1st Prize at the CNE in 1947",
          credits: "Vintage Acton / Dills Collection",
        }}
        instrumentModel={{
          modelPath: "/model/Trumpet.glb",
          tall: false,
        }}
        headerHeight={headerHeight}
      />
      <LearnSection
        key="learn"
        id="learn"
        navItem="Learn"
        title="Learn With Us"
        image={{
          path: "/img/photos/Acton-Citizens-Band-1958.JPG",
          caption: "Acton Citizens' Band in 1958",
          credits: "The New Tanner Photo Archive Collection",
        }}
        instrumentModel={{
          modelPath: "/model/Clarinet.glb",
          tall: true,
        }}
        headerHeight={headerHeight}
      />
      <JoinSection
        key="join"
        id="join"
        navItem="Join"
        title="Join Us"
        image={{
          path: "/img/photos/Acton-Citizens-Band-New-Arena-Opening-1998-01.JPG",
          caption: "Grand opening of the new arena, January 1998",
          credits: "Vintage Acton / Dills Collection",
        }}
        instrumentModel={{
          modelPath: "/model/Saxophone.glb",
          tall: true,
        }}
        headerHeight={headerHeight}
      />
      <EventsSection
        key="events"
        id="events"
        navItem="Events"
        title="Upcoming Events"
        image={{
          path: "/img/photos/Acton-Citizens-Band-1935.JPG",
          caption: "Acton Citizens' Band in 1935",
          credits: "Vintage Acton / Dills Collection",
        }}
        instrumentModel={{
          modelPath:
            "/model/Snare-Drum.glb",
          tall: false,
        }}
        headerHeight={headerHeight}
      />
      { features.some(f => f.name === 'history' 
          && f.enabled === true) && 
          <HistorySection
            key="history"
            id="history"
            navItem="History"
            title="Our History"
            headerHeight={headerHeight}
          />
      }
      {isAccountEnabled(features) && (
          <AccountSection
            key="account"
            id="account"
            navItem="Account"
            title="Account"
            headerHeight={headerHeight}
          />
      )}
    </>
  );
};

export default HomePage;
