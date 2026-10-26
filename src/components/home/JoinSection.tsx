import React from "react";
import Section, { SectionProps } from "../Section";
import GoogleAnalyticsLink from "../../utils/GoogleAnalyticsLink";

const JoinSection: React.FC<SectionProps> = ({ ...props }) => {
  const now = new Date();
  const age = now.getFullYear() - 1872;

  const content = (
    <>
      <p>
        You are invited to join {age} years of tradition and community spirit with the Acton
        Citizens' Band! Our band has a rich history of bringing music to Acton and the surrounding
        area, and we would be honoured to have you as part of our legacy.
      </p>
      <p>
        We offer both a marching band experience and a concert band experience, providing our
        members with a diverse range of performance opportunities. From marches to musicals, we
        embrace a wide variety of genres, ensuring that there is something for everyone to enjoy.
        You will have the chance to showcase your talents in a variety of settings, creating
        memorable moments for both yourself and our community.
      </p>
      <p>
        In the spirit of inclusivity and the promotion of learning music, we loan instruments free
        of charge to all our members. Whether you are a brass player, woodwind enthusiast,
        percussionist, or have a passion for conducting, there is a place for you in the Acton
        Citizens' Band. Come and experience the joy of making music with us while proudly
        representing our beloved community of Acton.
      </p>
      <GoogleAnalyticsLink
        eventName="Join_Section_Email_Link_Click"
        eventCategory="Link"
        eventLabel="Join_Section_Email_Link"
        className="button contact-button"
        href="mailto:actonband@gmail.com?subject=Joining ACB!&body=Hello ACB, I am interested in joining the Acton Citizens' Band."
      >
        <span className="button-icon"></span>
        <span className="button-text">Join Us</span>
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

export default JoinSection;
