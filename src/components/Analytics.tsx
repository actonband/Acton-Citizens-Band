import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { firebaseAuth, firestore } from "../utils/firebase";
import analytics, { analyticsEnabled, setAnalyticsUserId } from "../utils/analytics";
import { bindAnalyticsIdentity } from "../utils/analyticsIdentity";

export default function Analytics() {
  useEffect(() => {
    if (!analyticsEnabled()) return;
    const cleanup = analytics.initGoogleAnalytics();
    const stopIdentity = bindAnalyticsIdentity(
      (next) => onAuthStateChanged(firebaseAuth, (user) => next(user?.uid || null)),
      (uid, next, error) =>
        onSnapshot(
          doc(firestore, "access", uid),
          (snapshot) => next(snapshot.exists() ? snapshot.data() : null),
          error,
        ),
      setAnalyticsUserId,
    );
    return () => {
      stopIdentity();
      cleanup();
    };
  }, []);
  return null;
}
