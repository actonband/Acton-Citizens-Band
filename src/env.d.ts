// Webpack replaces these references at build time; no Node runtime is required.
declare const process: {
  readonly env: {
    readonly NODE_ENV?: "development" | "production" | "test";
    readonly FIREBASE_API_KEY?: string;
    readonly FIREBASE_AUTH_DOMAIN?: string;
    readonly FIREBASE_DATABASE_URL?: string;
    readonly FIREBASE_PROJECT_ID?: string;
    readonly FIREBASE_STORAGE_BUCKET?: string;
    readonly FIREBASE_MESSAGING_SENDER_ID?: string;
    readonly FIREBASE_APP_ID?: string;
    readonly FIREBASE_MEASUREMENT_ID?: string;
    readonly REACT_APP_GOOGLE_ANALYTICS_TRACKING_ID?: string;
    readonly REACT_APP_DRACO_DECODER_URI?: string;
    readonly REACT_APP_ACCOUNT_OVERRIDE?: string;
  };
};
