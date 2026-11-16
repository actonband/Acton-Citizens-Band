import ReactGA from "react-ga4";

let initialized = false;

export function trackEvent(
  name: string,
  parameters: Record<string, string | number | boolean> = {},
) {
  if (!initialized) return;
  try {
    ReactGA.event(name, parameters);
  } catch {
    // Analytics must never interrupt a visitor interaction.
  }
}

function trackInteraction(event: MouseEvent) {
  if (event.type === "auxclick" && event.button !== 1) return;
  if (!(event.target instanceof Element)) return;
  const element = event.target.closest<HTMLElement>("a[href], button[data-analytics-event]");
  if (!element) return;
  const section = element.closest("section, nav, footer, header");
  const parameters: Record<string, string | boolean> = {
    link_location:
      element.closest(".section-content[id]")?.id ||
      section?.id ||
      section?.tagName.toLowerCase() ||
      "page",
    event_label:
      element.dataset.analyticsLabel ||
      element.getAttribute("aria-label") ||
      element.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) ||
      element.querySelector("img")?.alt ||
      "image",
  };
  if (element.dataset.analyticsGroup) parameters.button_group = element.dataset.analyticsGroup;
  if (element.dataset.analyticsButton) parameters.button_name = element.dataset.analyticsButton;
  if (element instanceof HTMLAnchorElement) {
    const url = new URL(element.href, window.location.href);
    // Avoid sending email contents or URL query parameters.
    parameters.link_url = ["mailto:", "tel:"].includes(url.protocol)
      ? url.protocol
      : url.origin + url.pathname + url.hash;
    parameters.link_text = parameters.event_label;
    parameters.link_id = element.id;
    parameters.link_domain = url.hostname;
    parameters.outbound = Boolean(url.hostname && url.hostname !== window.location.hostname);
    parameters.link_type =
      url.protocol === "mailto:"
        ? "email"
        : url.protocol === "tel:"
          ? "phone"
          : element.getAttribute("href")?.startsWith("#")
            ? "navigation"
            : "link";
    parameters.event_category = element.dataset.analyticsCategory || "Link";
  }
  const eventId = element.closest<HTMLElement>("[data-event-id]")?.dataset.eventId;
  if (eventId) parameters.event_id = eventId;
  trackEvent(element.dataset.analyticsEvent || "link_click", parameters);
}

const googleAnalytics = {
  initGoogleAnalytics() {
    const trackingId = process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID;
    if (!trackingId || typeof window === "undefined") return () => {};
    const location = new URL(window.location.href);
    const productionHosts = [
      "actoncitizensband.ca",
      "www.actoncitizensband.ca",
      "acton-citizens-band.web.app",
      "acton-citizens-band.firebaseapp.com",
    ];
    if (process.env.NODE_ENV === "development" || !productionHosts.includes(location.hostname)) {
      return () => {};
    }
    // Keep campaign attribution while excluding arbitrary query data and auth URL fragments.
    const pageLocation = new URL(location.origin + location.pathname);
    for (const key of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_id",
      "utm_term",
      "utm_content",
      "utm_source_platform",
      "utm_creative_format",
      "utm_marketing_tactic",
    ]) {
      const value = location.searchParams.get(key);
      if (value) pageLocation.searchParams.set(key, value);
    }
    if (!initialized) {
      try {
        ReactGA.initialize(trackingId, {
          gtagOptions: {
            page_location: pageLocation.href,
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
          },
        });
        initialized = true;
      } catch {
        return () => {};
      }
    }
    document.addEventListener("click", trackInteraction, true);
    document.addEventListener("auxclick", trackInteraction, true);
    return () => {
      document.removeEventListener("click", trackInteraction, true);
      document.removeEventListener("auxclick", trackInteraction, true);
    };
  },
};

export default googleAnalytics;
