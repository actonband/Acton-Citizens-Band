import React from "react";
import Section, { SectionProps } from "../Section";
import GoogleAnalyticsLink from "../../utils/GoogleAnalyticsLink";

const LearnSection: React.FC<SectionProps> = ({ ...props }) => {
  const content = (
    <>
      <p>
        Music has the power to connect people, enrich lives, and unite communities. The Acton
        Citizens&#39; Band celebrates this universal language which nourishes personal growth,
        inspires creative expression, and fosters lasting bonds between members. By starting a new
        journey with us, not only will you reap the therapeutic and cognitive benefits of learning
        music, but you will also be contributing to a historic community tradition.
      </p>
      <p>
        Our Junior Band initiative provides free music lessons, books, and instrument loans, giving
        you everything you need to start or enhance your musical journey. We will guide you until
        you are ready to join the rhythm of the Citizen&#39;s Band.
      </p>
      <p>
        Whether you are exploring the world of music for the first time or you are an experienced
        musician keen to learn a new instrument, you are welcome in the Junior Band.
      </p>

      <GoogleAnalyticsLink
        eventName="Learn_Section_Email_Link_Click"
        eventCategory="Link"
        eventLabel="Learn_Section_Email_Link"
        className="button contact-button"
        href="mailto:actonband@gmail.com?subject=I want to learn!&body=Hello ACB, I am interested in learning music with the Acton Citizens' Band."
      >
        <span className="button-icon"></span>
        <span className="button-text">Learn With Us</span>
      </GoogleAnalyticsLink>
    </>
  );

  return (
    <Section
      id={props.id}
      title={props.title}
      content={content}
      image={props.image}
      instrumentModel={props.instrumentModel}
      headerHeight={props.headerHeight}
    />
  );
};

export default LearnSection;
