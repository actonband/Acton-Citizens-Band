import React from 'react';

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
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    // Track the conversion event when the link is clicked
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, {
        'event_category': eventCategory,
        'event_label': eventLabel || props.href
      });
    }

    // Call the original onClick handler if provided
    if (props.onClick) {
      props.onClick(event);
    }
  };

  return (
    <a {...props} onClick={handleClick}>
      {children}
    </a>
  );
};

export default GoogleAnalyticsLink;
