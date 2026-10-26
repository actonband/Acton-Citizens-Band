import { readStorage, writeStorage } from "./storage";
import ReactGA from "react-ga4";

export const gaClientStorageKey = "ga-gtag-client-id";

const googleAnalytics = {
  generateClientIdGa() {
    let clientId = readStorage(() => window.localStorage, gaClientStorageKey);

    if (!clientId) {
      clientId = crypto.randomUUID();
      writeStorage(() => window.localStorage, gaClientStorageKey, clientId);
    }

    return clientId;
  },

  initGoogleAnalytics() {
    const trackingId = process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID;
    if (!trackingId) return;

    ReactGA.initialize([
      {
        trackingId,
        gaOptions: {
          anonymizeIp: true,
          clientId: this.generateClientIdGa(),
        },
      },
    ]);
  },
};

export default googleAnalytics;
