import React, { useRef, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { signOut } from "firebase/auth";
import { firebaseApp, firebaseAuth } from "../../utils/firebase";
import IdentityVerification from "../auth/IdentityVerification";
import type { IdentityVerificationHandle } from "../auth/IdentityVerification";
import { adminUserError } from "../dashboard/users/adminUsers";
import { measureDashboardAction, setAnalyticsUserId } from "../../utils/analytics";

export default function DeleteAccount({
  onDeleted,
  target,
}: {
  onDeleted: () => void;
  target?: { uid: string; name: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reauthenticate, setReauthenticate] = useState(false);
  const pending = useRef(false);
  const identityVerification = useRef<IdentityVerificationHandle>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || confirmation !== "DELETE") return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (reauthenticate) {
        if (!(await identityVerification.current?.verify())) return;
        setReauthenticate(false);
      }
      await firebaseAuth.currentUser?.getIdToken(true);
      const remove = httpsCallable<
        { confirmation: string; action?: "delete"; uid?: string },
        { deleted: boolean; cleanupPending: boolean }
      >(
        getFunctions(firebaseApp, "northamerica-northeast1"),
        target ? "manageDashboardUser" : "deleteDashboardAccount",
      );
      await measureDashboardAction(target ? "admin_account_delete" : "account_delete", async () => {
        const result = await remove(
          target ? { confirmation, action: "delete", uid: target.uid } : { confirmation },
        );
        if (!result.data.deleted) throw new Error("Deletion was not confirmed");
      });
      if (!target) setAnalyticsUserId(null);
      onDeleted();
      if (!target) await signOut(firebaseAuth);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "";
      if (code === "functions/failed-precondition") {
        setReauthenticate(true);
        setError("Verify your identity above, then confirm deletion again.");
      } else {
        setError(target ? adminUserError(error) : "Unable to confirm deletion. You can retry.");
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="profile-delete-account">
      <h2>Account Deletion</h2>
      {!expanded ? (
        <button className="dashboard-danger-button" onClick={() => setExpanded(true)}>
          {target ? "Delete User Account" : "Delete My Account"}
        </button>
      ) : (
        <>
          <p>
            {target
              ? `This permanently deletes ${target.name}’s sign-in account, profile, membership and administrator access.`
              : "This permanently deletes your sign-in account, profile, membership and administrator access."}
          </p>
          <form onSubmit={submit} data-dirty={confirmation.length > 0}>
            <fieldset disabled={busy}>
              <label>
                Type DELETE to confirm
                <input
                  autoComplete="off"
                  value={confirmation}
                  disabled={busy}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  pattern="DELETE"
                />
              </label>
              {reauthenticate && (
                <IdentityVerification ref={identityVerification} onError={setError} />
              )}
              <div className="dashboard-actions">
                <button
                  className="dashboard-danger-button is-confirmation"
                  disabled={busy || confirmation !== "DELETE"}
                >
                  {busy
                    ? "Deleting…"
                    : target
                      ? "Permanently Delete User"
                      : "Permanently Delete My Account"}
                </button>
                <button
                  type="button"
                  className="dashboard-secondary-button"
                  disabled={busy}
                  onClick={() => {
                    setExpanded(false);
                    setConfirmation("");
                    setError("");
                    setReauthenticate(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
