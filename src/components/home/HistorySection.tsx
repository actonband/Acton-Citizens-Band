import React from "react";
import Section, { SectionProps } from "../Section";
import GoogleAnalyticsLink from "../../utils/GoogleAnalyticsLink";

const HistorySection: React.FC<SectionProps> = ({ ...props }) => {
  const content = 
    <>
    </>

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

export default HistorySection;
