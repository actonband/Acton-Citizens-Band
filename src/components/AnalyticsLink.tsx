import React from "react";

interface AnalyticsLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  eventName: string;
  eventCategory: string;
  eventLabel?: string;
}

const AnalyticsLink: React.FC<AnalyticsLinkProps> = ({
  eventName,
  eventCategory,
  eventLabel,
  children,
  ...props
}) => {
  return (
    <a
      {...props}
      data-analytics-event={eventName}
      data-analytics-category={eventCategory}
      data-analytics-label={eventLabel}
    >
      {children}
    </a>
  );
};

export default AnalyticsLink;
