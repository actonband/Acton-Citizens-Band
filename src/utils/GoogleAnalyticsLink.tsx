import React from "react";

interface GoogleAnalyticsLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  eventName: string;
  eventCategory: string;
  eventLabel?: string;
}

const GoogleAnalyticsLink: React.FC<GoogleAnalyticsLinkProps> = ({
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

export default GoogleAnalyticsLink;
