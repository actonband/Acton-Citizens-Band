import ReactGA from "react-ga4";

let initialized = false;
let consumers = 0;
let userId: string | null = null;

const productionHosts = [
  "actoncitizensband.ca",
  "www.actoncitizensband.ca",
  "acton-citizens-band.web.app",
  "acton-citizens-band.firebaseapp.com",
];

export function analyticsEnabled() {
  const mode =
    typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("mode") : null;
  return (
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "production" &&
    Boolean(process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID?.match(/^G-[A-Z0-9]+$/)) &&
    window.location.protocol === "https:" &&
    productionHosts.includes(window.location.hostname) &&
    ["/", "/dashboard", "/dashboard/"].includes(window.location.pathname) &&
    (!mode || mode === "signIn")
  );
}

export function setAnalyticsUserId(value: unknown) {
  const next =
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ? value
      : null;
  if (!initialized || next === userId) return;
  try {
    // Updating identity must not emit another page view.
    ReactGA.gtag("config", process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID, {
      user_id: next,
      send_page_view: false,
    });
    userId = next;
  } catch {
    /* Tracking must never block sign-in or sign-out. */
  }
}

export type DashboardScreen =
  "loading" | "sign_in" | "account_setup" | "profile" | "events" | "members";
export type DashboardAction =
  | "profile_save"
  | "event_create"
  | "event_save"
  | "membership_request"
  | "sign_out"
  | "account_setup"
  | "account_link"
  | "admin_profile_save"
  | "admin_contact_save"
  | "admin_access_save"
  | "account_delete"
  | "admin_account_delete";
export function trackDashboardAction(action: DashboardAction, result: "success" | "error") {
  trackEvent("dashboard_action", { action_name: action, result });
}

export async function measureDashboardAction<T>(
  action: DashboardAction,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    const value = await operation();
    trackDashboardAction(action, "success");
    return value;
  } catch (error) {
    trackDashboardAction(action, "error");
    throw error;
  }
}

export async function measureDashboardAuth<T>(
  action: "sign_in" | "sign_up" | "sign_in_or_sign_up" | "link" | "reauthenticate",
  method: "email" | "phone",
  operation: () => Promise<T>,
): Promise<T> {
  try {
    const value = await operation();
    trackEvent("dashboard_auth", { action_name: action, method, result: "success" });
    return value;
  } catch (error) {
    trackEvent("dashboard_auth", { action_name: action, method, result: "error" });
    throw error;
  }
}

export function trackEvent(
  name: string,
  parameters: Record<string, string | number | boolean> = {},
) {
  if (!initialized || !consumers || !analyticsEnabled()) return;
  try {
    ReactGA.event(name, parameters);
  } catch {
    // Analytics must never interrupt a visitor interaction.
  }
}

function trackInteraction(event: MouseEvent) {
  // Private screens never use delegated text, hrefs, IDs or profile values.
  if (window.location.pathname !== "/") return;
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
    let url: URL;
    try {
      url = new URL(element.href, window.location.href);
    } catch {
      return;
    }
    if (!["https:", "http:", "webcal:", "mailto:", "tel:"].includes(url.protocol)) return;
    // Avoid sending email contents or URL query parameters.
    parameters.link_url = ["mailto:", "tel:"].includes(url.protocol)
      ? url.protocol
      : url.origin +
        url.pathname +
        (url.origin === window.location.origin &&
        ["#app", "#main", "#about", "#learn", "#join", "#events", "#history", "#account"].includes(
          url.hash,
        )
          ? url.hash
          : "");
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
    if (!trackingId || !analyticsEnabled()) return () => {};
    const location = new URL(window.location.href);
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
            page_referrer: sanitizedReferrer(document.referrer),
            page_title:
              location.pathname === "/" ? document.title : "Dashboard | Acton Citizens' Band",
            user_id: null,
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
          },
        });
        initialized = true;
      } catch {
        return () => {};
      }
    }
    consumers++;
    document.addEventListener("click", trackInteraction, true);
    document.addEventListener("auxclick", trackInteraction, true);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      consumers--;
      if (consumers) return;
      setAnalyticsUserId(null);
      document.removeEventListener("click", trackInteraction, true);
      document.removeEventListener("auxclick", trackInteraction, true);
    };
  },
};

function sanitizedReferrer(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.origin + url.pathname : "";
  } catch {
    return "";
  }
}

export default googleAnalytics;
