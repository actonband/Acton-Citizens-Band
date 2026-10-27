import React from "react";
import Section, { SectionProps } from "../Section";
import GoogleAnalyticsLink from "../../utils/GoogleAnalyticsLink";
import ResponsiveImage from "../ResponsiveImage";

const AboutSection: React.FC<SectionProps> = ({ ...props }) => {
  const content = (
    <>
      <p>
        The Acton Citizens' Band, formed in 1872, is comprised of local musicians of all ages who
        volunteer their time to bring the joy of music to the Acton community and surrounding area.
      </p>
      <p>
        As both a concert band and a marching band, we make many appearances each year including
        several feature concerts, Canada Day celebrations, the Acton Fall Fair, and the Santa Claus
        Parade.
      </p>
      <p>
        Practices are held every Wednesday from 7:30 pm to 9:30 pm at the{" "}
        <GoogleAnalyticsLink
          eventName="Band_Hall_Maps_Link_Click"
          eventCategory="Link"
          eventLabel="Band_Hall_Maps_Link"
          href="https://goo.gl/maps/8u34V3qeWizaoyg99?coh=178573&entry=tt"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ted Tyler Music Centre
        </GoogleAnalyticsLink>{" "}
        on Wallace Street.
      </p>
      <p>
        For inquiries about joining the Acton Citizens&#39; Band, or to request a performance at
        your event, please reach out to us at{" "}
        <GoogleAnalyticsLink
          eventName="About_Section_Email_Link_Click"
          eventCategory="Link"
          eventLabel="About_Section_Email_Link"
          href="mailto:actonband@gmail.com"
        >
          actonband@gmail.com
        </GoogleAnalyticsLink>
        . We would love to hear from you!
      </p>

      <GoogleAnalyticsLink
        eventName="About_Section_Email_Link_Click"
        eventCategory="Link"
        eventLabel="About_Section_Email_Link"
        className="button contact-button"
        href="mailto:actonband@gmail.com"
      >
        <span className="button-icon"></span>
        <span className="button-text">Contact Us</span>
      </GoogleAnalyticsLink>

      <h3 className="section-sub-title">Our Bandmaster</h3>

      <div className="bandmaster-profile-content">
        <div className="bandmaster-profile-image-container">
          <ResponsiveImage
            className="bandmaster-profile-image"
            alt="Carin Pelka, bandmaster of the Acton Citizens' Band"
            src="/img/photos/Carin-Profile.png"
            width={744}
            height={744}
            sizes="(max-width: 720px) 70vw, 240px"
            loading="lazy"
          />
        </div>
        <div className="bandmaster-profile-text">
          <p>
            Carin Pelka, a cherished member of the Acton Citizens&#39; Band for many years, stepped
            into the role of conductor and bandmaster in 2022, bringing a wealth of musical
            expertise and dedication to the position. Under Carin&#39;s leadership, we continue to
            grow and thrive as a band, delivering elevated performances for our community. We are
            grateful to have Carin as our Bandmaster, guiding us with her boundless enthusiasm,
            talent, and commitment to creating beautiful music together.
          </p>
        </div>
      </div>
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

export default AboutSection;
