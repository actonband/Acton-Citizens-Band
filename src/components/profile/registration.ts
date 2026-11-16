import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "../../utils/firebase";
import { measureDashboardAction } from "../../utils/analytics";

export type Instrument = {
  name: string;
  ownership: "personal" | "band" | "";
  loanForm: "signed" | "not_signed" | "unsure";
  details: string;
};
export type ProfileDraft = {
  name: string;
  instrumentDetails: Instrument[];
  notes: string;
  membershipRequested: boolean;
};
export type SetupResult = {
  state:
    | "complete"
    | "details"
    | "verifyEmail"
    | "verifyContact"
    | "linked"
    | "linkPending"
    | "retrySignIn";
  revision?: string;
  contactType?: "email" | "phone";
  canonicalUid?: string;
};
type Action =
  | { action: "prepare"; resolve?: boolean }
  | { action: "link"; otherToken: string }
  | { action: "complete" | "saveProfile"; profile: ProfileDraft; revision: string };

export async function registration(data: Action) {
  const call = async () =>
    (
      await httpsCallable<Action, SetupResult>(
        getFunctions(firebaseApp, "northamerica-northeast1"),
        "dashboardRegistration",
      )(data)
    ).data;
  return data.action === "prepare"
    ? call()
    : measureDashboardAction(
        data.action === "saveProfile"
          ? "profile_save"
          : data.action === "complete"
            ? "account_setup"
            : "account_link",
        call,
      );
}

export function profileRevision(data: Record<string, unknown>) {
  const time = data.updated_at as { seconds?: number; nanoseconds?: number } | undefined;
  return typeof time?.seconds === "number" && typeof time.nanoseconds === "number"
    ? `${time.seconds}:${time.nanoseconds}`
    : "";
}

export function profileDraft(data: Record<string, unknown>): ProfileDraft {
  const details = Array.isArray(data.instrument_details)
    ? data.instrument_details.filter(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      )
    : [];
  return {
    name:
      typeof data.display_name === "string"
        ? data.display_name
        : [data.first_name, data.last_name].filter((value) => typeof value === "string").join(" "),
    instrumentDetails: details.length
      ? details.map((item) => ({
          name: String(item.name || ""),
          ownership:
            item.ownership === "band" ? "band" : item.ownership === "personal" ? "personal" : "",
          loanForm: ["signed", "not_signed"].includes(item.loan_form_status)
            ? item.loan_form_status
            : "unsure",
          details: String(item.details || ""),
        }))
      : typeof data.instruments === "string" && data.instruments.trim()
        ? data.instruments.split(",").map((name) => ({
            name: name.trim(),
            ownership: "",
            loanForm: "unsure",
            details: "",
          }))
        : [],
    notes: typeof data.notes === "string" ? data.notes : "",
    membershipRequested: data.membership_requested === true,
  };
}

export function registrationError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  const message = error instanceof Error ? error.message : "";
  // Only display our callable's deliberate validation messages, never raw Auth payloads.
  if (
    [
      "functions/already-exists",
      "functions/failed-precondition",
      "functions/aborted",
      "functions/invalid-argument",
      "functions/permission-denied",
    ].includes(String(code)) &&
    message
  )
    return message;
  if (code === "functions/unauthenticated")
    return "Sign out and sign in again using your connected email or phone.";
  if (code === "functions/not-found")
    return "Account setup is not available yet. Its Firebase service needs to be deployed.";
  return "Unable to complete account setup. Check your connection and try again.";
}
