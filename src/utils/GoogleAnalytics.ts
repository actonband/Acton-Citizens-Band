import ReactGA from 'react-ga4';
import { v4 as uuidv4 } from 'uuid';

export const gaClientStorageKey = 'ga-gtag-client-id';

const googleAnalytics = {
  generateClientIdGa() {
    let clientId = localStorage.getItem(gaClientStorageKey);

    if (!clientId) {
        clientId = uuidv4();
        localStorage.setItem(gaClientStorageKey, clientId);
    }

    return clientId;
  },

    initGoogleAnalytics() {
        const trackingId = process.env.REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID as string;
        if (!trackingId) console.warn("No tracking id is found for Google Analytics")

        ReactGA.initialize([
            {
                trackingId,
                gaOptions: {
                    anonymizeIp: true,
                    clientId: this.generateClientIdGa()
                }
            }
        ]);
    }
};

export default googleAnalytics;