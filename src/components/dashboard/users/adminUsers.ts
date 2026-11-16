import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../../../utils/firebase";
import { measureDashboardAction } from "../../../utils/analytics";
import type { ProfileDraft } from "../../profile/registration";

export type UserType = "non-member" | "past-member" | "member" | "admin";

export type AdminUser = {
  uid: string;
  name: string;
  instruments: string;
  requested: boolean;
  access: { member: boolean; admin: boolean; past_member?: boolean };
  email: string;
  phone: string;
  hasAuth: boolean;
  profileData: Record<string, unknown>;
  revision: string;
};

type Action =
  | { action: "get"; uid: string }
  | {
      action: "updateAccess";
      uid: string;
      userType: UserType;
      expected: { member: boolean; admin: boolean; past_member?: boolean; requested: boolean };
    }
  | {
      action: "updateProfile" | "updateProfileAndAccess";
      uid: string;
      name: string;
      instruments: string;
      expected: { name: string; instruments: string };
      profile?: ProfileDraft;
      revision?: string;
      userType?: UserType;
      expectedAccess?: {
        member: boolean;
        admin: boolean;
        past_member?: boolean;
        requested: boolean;
      };
    }
  | {
      action: "updateContact";
      uid: string;
      type: "email" | "phone";
      value: string;
      expected: string;
    };

export async function manageUser(data: Action) {
  const call = httpsCallable<Action, AdminUser>(
    getFunctions(firebaseApp, "northamerica-northeast1"),
    "manageDashboardUser",
  );
  const operation = async () => (await call(data)).data;
  if (data.action === "updateProfileAndAccess")
    return measureDashboardAction("admin_profile_save", () =>
      measureDashboardAction("admin_access_save", operation),
    );
  return data.action === "get"
    ? operation()
    : measureDashboardAction(
        data.action === "updateAccess"
          ? "admin_access_save"
          : data.action === "updateContact"
            ? "admin_contact_save"
            : "admin_profile_save",
        operation,
      );
}

export function adminUserError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  switch (code) {
    case "functions/already-exists":
      return "That email or phone number belongs to another account.";
    case "functions/aborted":
      return "This user was changed elsewhere. Cancel and reload before saving.";
    case "functions/not-found":
      return "This user or their sign-in account no longer exists. Reload to check.";
    case "functions/permission-denied":
      return "You no longer have permission to manage this account.";
    case "functions/invalid-argument":
      if (message === "Choose a valid account action.")
        return "The server needs updating to save profile and account type together. Your changes were not saved.";
      // These are deliberate validation messages, never arbitrary errors or profile values.
      if (
        [
          "Choose a valid account type.",
          "Check the name and instruments.",
          "Check your name, notes and instruments.",
          "Check each instrument and loan-form answer.",
          "Please shorten the instrument names.",
          "Choose a valid contact field.",
          "Enter a valid email address.",
          "Include a valid country code.",
          "Check the contact details.",
        ].includes(message)
      )
        return message;
      return "Check the details and try again.";
    case "functions/failed-precondition":
      return "Verify your identity above, then save again.";
    default:
      return "Unable to complete this action. Check your connection and retry.";
  }
}
