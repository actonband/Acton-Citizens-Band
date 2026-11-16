import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { reload, sendEmailVerification } from "firebase/auth";
import type { User } from "firebase/auth";

type Status = { state: "idle" | "sending" | "sent" | "verified" | "error"; message: string };
type Delivery = {
  status: Status;
  request: Promise<void> | null;
  listeners: Set<() => void>;
};

// Preserve delivery feedback across the sign-up -> setup/profile handoff without storage.
const deliveries = new WeakMap<User, Delivery>();
function deliveryFor(user: User): Delivery {
  let delivery = deliveries.get(user);
  if (!delivery) {
    delivery = { status: { state: "idle", message: "" }, request: null, listeners: new Set() };
    deliveries.set(user, delivery);
  }
  return delivery;
}
function update(delivery: Delivery, status: Status) {
  delivery.status = status;
  delivery.listeners.forEach((listener) => listener());
}

// Email delivery failure must not turn successful account creation into another sign-up attempt.
export function requestVerificationEmail(user: User, { refresh = false } = {}): Promise<void> {
  const delivery = deliveryFor(user);
  if (delivery.request) return delivery.request;
  if (!user.email || user.emailVerified) return Promise.resolve();
  delivery.request = Promise.resolve()
    .then(async () => {
      if (refresh) await reload(user);
      if (user.emailVerified) {
        update(delivery, { state: "verified", message: "" });
        return;
      }
      await sendEmailVerification(user);
      update(delivery, {
        state: "sent",
        message: "Verification email sent. Check your inbox and spam folder.",
      });
    })
    .catch((failure: unknown) => {
      const code = failure && typeof failure === "object" && "code" in failure ? failure.code : "";
      update(delivery, {
        state: "error",
        message:
          code === "auth/too-many-requests"
            ? "Too many verification requests. Please wait before trying again."
            : "Unable to send the verification email. Check your connection and try again.",
      });
    })
    .finally(() => {
      delivery.request = null;
    });
  update(delivery, { state: "sending", message: "Sending verification email…" });
  return delivery.request;
}

export default function EmailVerification({
  user,
  disabled = false,
  primaryAction,
  showUnverifiedMessage = true,
}: {
  user: User;
  disabled?: boolean;
  primaryAction?: ReactNode;
  showUnverifiedMessage?: boolean;
}) {
  const delivery = deliveryFor(user);
  const status = useSyncExternalStore(
    (listener) => {
      delivery.listeners.add(listener);
      return () => delivery.listeners.delete(listener);
    },
    () => delivery.status,
    () => delivery.status,
  );
  const needsVerification = !!user.email && !user.emailVerified && status.state !== "verified";
  if (!needsVerification && !primaryAction) return null;
  return (
    <div className="email-verification">
      {needsVerification && showUnverifiedMessage && (
        <p className="dashboard-auth-note">Your email address is not verified yet.</p>
      )}
      {needsVerification && status.message && (
        <p role={status.state === "error" ? "alert" : "status"}>{status.message}</p>
      )}
      <div className="dashboard-actions">
        {primaryAction}
        {needsVerification && (
          <button
            type="button"
            className="dashboard-secondary-button"
            disabled={disabled || status.state === "sending"}
            onClick={() => void requestVerificationEmail(user, { refresh: true })}
          >
            {status.state === "sending" ? "Sending…" : "Resend Verification Email"}
          </button>
        )}
      </div>
    </div>
  );
}
