import { useEffect, useRef, useState } from "react";
import { ProfileContactRow, ProfileSummary, ProfileLoading } from "../../profile/ProfileFields";
import { adminUserError, manageUser } from "./adminUsers";
import type { AdminUser, UserType } from "./adminUsers";
import { formatPhoneNumber, normalizePhoneNumber, phoneNumberError } from "../../../utils/phone";
import DeleteAccount from "../../profile/DeleteAccount";
import IdentityVerification from "../../auth/IdentityVerification";
import type { IdentityVerificationHandle } from "../../auth/IdentityVerification";
import ProfileFormFields from "../../profile/ProfileFormFields";
import { profileDraft } from "../../profile/registration";

export default function AdminUserProfile({
  uid,
  onBack,
  onChanged,
  onDeleted,
  preview,
}: {
  uid: string;
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  preview?: {
    name: string;
    instruments: string;
    requested: boolean;
    access: Record<string, unknown>;
    details: Record<string, unknown>;
  };
}) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [editing, setEditing] = useState<"profile" | "email" | "phone" | null>(null);
  const [userType, setUserType] = useState<UserType>("non-member");
  const [draft, setDraft] = useState(() => profileDraft({}));
  const [contact, setContact] = useState("");
  const [reauthenticate, setReauthenticate] = useState(false);
  const section = useRef<HTMLElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const identityVerification = useRef<IdentityVerificationHandle>(null);
  const savedUserType: UserType = user?.access.admin
    ? "admin"
    : user?.access.member
      ? "member"
      : user?.access.past_member
        ? "past-member"
        : "non-member";
  const dirty =
    !!user &&
    (editing === "profile"
      ? userType !== savedUserType ||
        JSON.stringify(draft) !==
          JSON.stringify(
            profileDraft({
              ...user.profileData,
              display_name: user.name,
              instruments: user.instruments,
              membership_requested: user.requested,
            }),
          )
      : !!editing &&
        (editing === "phone" ? normalizePhoneNumber(contact) || contact : contact) !==
          user[editing]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    manageUser({ action: "get", uid })
      .then((details) => {
        if (active) {
          setUser(details);
          setLoading(false);
        }
      })
      .catch((failure: unknown) => {
        if (active) {
          setError(adminUserError(failure));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [uid, attempt]);
  useEffect(() => {
    if (editing) section.current?.querySelector<HTMLElement>("form input, form select")?.focus();
    else section.current?.focus();
  }, [editing, loading]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function cancel() {
    setEditing(null);
    setReauthenticate(false);
    setError("");
    requestAnimationFrame(() => editButton.current?.focus());
  }
  async function save() {
    if (!user || !editing || pending.current) return;
    let value = contact.trim();
    if (editing === "phone") {
      const normalized = normalizePhoneNumber(value);
      if (!normalized) {
        setError(phoneNumberError(value));
        return;
      }
      value = normalized;
      setContact(formatPhoneNumber(normalized));
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (reauthenticate) {
        if (!(await identityVerification.current?.verify())) return;
        setReauthenticate(false);
      }
      const details = await manageUser(
        editing === "profile"
          ? {
              // Older backends must reject a combined save before changing either record.
              action: userType !== savedUserType ? "updateProfileAndAccess" : "updateProfile",
              uid,
              name: draft.name,
              instruments: draft.instrumentDetails.map((item) => item.name).join(", "),
              profile: draft,
              revision: user.revision,
              expected: { name: user.name, instruments: user.instruments },
              ...(userType !== savedUserType
                ? {
                    userType,
                    expectedAccess: { ...user.access, requested: user.requested },
                  }
                : {}),
            }
          : { action: "updateContact", uid, type: editing, value, expected: user[editing] },
      );
      setUser(details);
      setEditing(null);
      setReauthenticate(false);
      setStatus(editing === "profile" ? "Profile saved." : "User details saved.");
      onChanged();
      requestAnimationFrame(() => editButton.current?.focus());
    } catch (failure) {
      setError(adminUserError(failure));
      if (
        failure &&
        typeof failure === "object" &&
        "code" in failure &&
        failure.code === "functions/failed-precondition"
      )
        setReauthenticate(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const reauthentication = reauthenticate && (
    <IdentityVerification ref={identityVerification} onError={setError} />
  );

  return (
    <section ref={section} tabIndex={-1} className="admin-user-profile profile-page">
      <div className="profile-title-row">
        <h1>User Profile</h1>
        <div className="dashboard-actions dashboard-toolbar">
          <button
            className="dashboard-secondary-button"
            disabled={busy}
            onClick={() => {
              if (
                section.current?.querySelector('form[data-dirty="true"]') &&
                !confirm("Discard unsaved changes?")
              )
                return;
              onBack();
            }}
          >
            Back To Users
          </button>
          {!editing && (
            <button
              className="dashboard-secondary-button"
              disabled={busy || loading}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Reload
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <>
          {preview && <ProfileSummary {...preview} />}
          <ProfileLoading />
        </>
      ) : (
        user && (
          <>
            {editing === "profile" ? (
              <>
                <form
                  data-dirty={dirty}
                  aria-describedby={error ? "admin-profile-save-error" : undefined}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                  }}
                >
                  <fieldset disabled={busy}>
                    <ProfileFormFields value={draft} onChange={setDraft} />
                    <label>
                      Account type
                      <span className="dashboard-select">
                        <select
                          value={userType}
                          onChange={(event) => setUserType(event.target.value as UserType)}
                        >
                          <option value="non-member">Non-Member</option>
                          <option value="past-member">Past Member</option>
                          <option value="member">Band Member</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </span>
                    </label>
                    {reauthentication}
                    <div className="dashboard-actions">
                      <button className="dashboard-primary-button">
                        {busy ? "Saving…" : "Save Profile"}
                      </button>
                      <button type="button" className="dashboard-secondary-button" onClick={cancel}>
                        Cancel
                      </button>
                    </div>
                  </fieldset>
                  {error && (
                    <p id="admin-profile-save-error" role="alert">
                      {error}
                    </p>
                  )}
                </form>
              </>
            ) : (
              <ProfileSummary
                name={user.name}
                instruments={user.instruments}
                access={user.access}
                requested={user.requested}
                details={user.profileData}
              />
            )}
            <div className="dashboard-actions">
              {user && !loading && !editing && (
                <button
                  ref={editButton}
                  className="dashboard-primary-button"
                  onClick={() => {
                    setUserType(savedUserType);
                    setDraft(
                      profileDraft({
                        ...user.profileData,
                        display_name: user.name,
                        instruments: user.instruments,
                        membership_requested: user.requested,
                      }),
                    );
                    setEditing("profile");
                    setError("");
                    setStatus("");
                  }}
                >
                  Edit Profile
                </button>
              )}
            </div>
            <div
              className="profile-contact-details"
              role="region"
              aria-labelledby="admin-contact-heading"
            >
              <h2 id="admin-contact-heading">Contact Details</h2>
              {!user.hasAuth && <p>This profile has no linked sign-in account.</p>}
              <div className="profile-contact-list">
                {(["email", "phone"] as const).map((type) => {
                  const label = type === "email" ? "Email" : "Phone";
                  return (
                    <div className="profile-contact-item" key={type}>
                      {editing === type ? (
                        <>
                          <form
                            data-dirty={dirty}
                            onSubmit={(event) => {
                              event.preventDefault();
                              void save();
                            }}
                          >
                            <fieldset disabled={busy}>
                              <label>
                                {label}
                                <input
                                  type={type === "email" ? "email" : "tel"}
                                  autoComplete="off"
                                  required
                                  maxLength={type === "email" ? 254 : 30}
                                  value={contact}
                                  onChange={(event) => {
                                    setContact(event.target.value);
                                    setError("");
                                  }}
                                  onBlur={(event) => {
                                    if (type === "phone")
                                      setContact(formatPhoneNumber(event.target.value));
                                  }}
                                />
                              </label>
                              <p className="dashboard-auth-note">
                                This changes the user’s sign-in{" "}
                                {type === "email"
                                  ? "email. The new email will be unverified."
                                  : "phone number."}
                              </p>
                              {reauthentication}
                              <div className="dashboard-actions">
                                <button className="dashboard-primary-button">
                                  {busy ? "Saving…" : `Save ${label}`}
                                </button>
                                <button
                                  type="button"
                                  className="dashboard-secondary-button"
                                  onClick={cancel}
                                >
                                  Cancel
                                </button>
                              </div>
                            </fieldset>
                            {error && <p role="alert">{error}</p>}
                          </form>
                        </>
                      ) : (
                        <ProfileContactRow
                          label={label}
                          value={user[type]}
                          action={
                            user.hasAuth && (
                              <button
                                disabled={busy || editing !== null}
                                className="dashboard-secondary-button"
                                onClick={() => {
                                  setContact(user[type]);
                                  setEditing(type);
                                  setError("");
                                  setStatus("");
                                }}
                              >
                                {user[type] ? "Edit" : "Add"} {label}
                              </button>
                            )
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {!editing && (
              <DeleteAccount
                target={{ uid, name: user.name || "this user" }}
                onDeleted={onDeleted}
              />
            )}
          </>
        )
      )}
      {status && <p role="status">{status}</p>}
      {error && !editing && <p role="alert">{error}</p>}
    </section>
  );
}
