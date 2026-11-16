import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "../auth/AuthContext";
import { firestore } from "../../utils/firebase";
import Login from "../auth/Login";
import EventManager from "./events/EventManager";
import DeleteAccount from "../profile/DeleteAccount";
import UserManagement from "./users/UserManagement";
import { ProfileContactRow, ProfileSummary, ProfileLoading } from "../profile/ProfileFields";
import AccountSetup from "../profile/AccountSetup";
import ProfileEditor from "../profile/ProfileEditor";
import { registration, registrationError } from "../profile/registration";
import type { SetupResult } from "../profile/registration";
import ThemeToggle from "../ThemeToggle";
import { trackEvent, trackDashboardAction } from "../../utils/analytics";
import type { DashboardAction, DashboardScreen } from "../../utils/analytics";

export default function Dashboard() {
  const { user, loading, authSignOut } = useAuth();
  const [account, setAccount] = useState<{ uid: string; data: Record<string, unknown> } | null>(
    null,
  );
  const [profile, setProfile] = useState<{ uid: string; data: Record<string, unknown> } | null>(
    null,
  );
  const [editingProfile, setEditingProfile] = useState(false);
  const editProfileButton = useRef<HTMLButtonElement>(null);
  const [setup, setSetup] = useState<SetupResult | null>(null);
  const [page, setPage] = useState<"profile" | "events" | "members">("profile");
  const [addingContact, setAddingContact] = useState<"email" | "phone" | null>(null);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const mainContent = useRef<HTMLElement>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupFailed, setSetupFailed] = useState(false);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const pending = useRef(false);
  const lastScreen = useRef("");
  const screen: DashboardScreen = loading
    ? "loading"
    : !user
      ? "sign_in"
      : !setup
        ? "loading"
        : setup.state !== "complete"
          ? "account_setup"
          : page === "members" && account?.data.admin !== true
            ? "profile"
            : page;
  useEffect(() => {
    if (lastScreen.current === screen) return;
    lastScreen.current = screen;
    trackEvent("dashboard_view", { screen_name: screen });
  }, [screen]);

  useEffect(() => {
    if (!menuOpen) return;
    const mobile = window.matchMedia("(max-width: 760px)");
    if (!mobile.matches) {
      setMenuOpen(false);
      return;
    }
    const content = mainContent.current;
    const previousInert = content?.inert || false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (content) content.inert = true;
    const frame = requestAnimationFrame(() => {
      (
        sidebar.current?.querySelector<HTMLButtonElement>("button:not(:disabled)") ||
        sidebar.current
      )?.focus();
    });
    const close = () => {
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab") return;
      const controls = [
        menuButton.current,
        ...Array.from(
          sidebar.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") || [],
        ),
      ].filter((element): element is HTMLElement => element !== null);
      const first = controls[0];
      const last = controls[controls.length - 1];
      const outside = !controls.includes(document.activeElement as HTMLElement);
      if (
        outside ||
        (event.shiftKey ? document.activeElement === first : document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    const handleResize = () => {
      if (!mobile.matches) setMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeys);
    mobile.addEventListener("change", handleResize);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (content) content.inert = previousInert;
      document.removeEventListener("keydown", handleKeys);
      mobile.removeEventListener("change", handleResize);
    };
  }, [menuOpen]);

  useEffect(() => {
    setAccount(null);
    setProfile(null);
    setError("");
    setStatus("");
    setSetup(null);
    setEditingProfile(false);
    setPage("profile");
    setAddingContact(null);
    setMenuOpen(false);
    setSetupFailed(false);
    if (!user) return;
    setAccountDeleted(false);
    let active = true;
    const accountRef = doc(firestore, "access", user.uid);
    const profileRef = doc(firestore, "users", user.uid);
    const stopAccount = onSnapshot(
      accountRef,
      (snapshot) => {
        if (active) setAccount(snapshot.exists() ? { uid: user.uid, data: snapshot.data() } : null);
      },
      () => {
        if (active) {
          setAccount(null);
          setSetupFailed(true);
          setError("Unable to read account permissions. Check the dashboard rules and retry.");
        }
      },
    );
    const stopProfile = onSnapshot(
      profileRef,
      (snapshot) => {
        if (active) {
          setProfile(snapshot.exists() ? { uid: user.uid, data: snapshot.data() } : null);
          // Do not replace an in-progress edit when another field changes.
        }
      },
      () => {
        if (active) {
          setSetupFailed(true);
          setError(
            "Unable to read your profile. Check your connection and permissions, then retry.",
          );
        }
      },
    );
    registration({ action: "prepare" })
      .then((value) => {
        if (active) {
          setSetup(value);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSetupFailed(true);
          setError(registrationError(error));
        }
      });
    return () => {
      active = false;
      stopAccount();
      stopProfile();
    };
  }, [user?.uid, setupAttempt]);

  async function act(
    action: () => Promise<unknown>,
    message: string,
    analyticsAction: DashboardAction,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
      trackDashboardAction(analyticsAction, "success");
      setStatus(message);
    } catch {
      trackDashboardAction(analyticsAction, "error");
      setError("Unable to save this change. Check your connection and permissions, then retry.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const access = account && account.uid === user?.uid ? account.data : null;
  const ownProfile = profile && profile.uid === user?.uid ? profile.data : null;
  const savedName =
    typeof ownProfile?.display_name === "string"
      ? ownProfile.display_name
      : [ownProfile?.first_name, ownProfile?.last_name]
          .filter((value) => typeof value === "string")
          .join(" ") ||
        user?.displayName ||
        "";
  const savedInstruments =
    typeof ownProfile?.instruments === "string" ? ownProfile.instruments : "";
  useEffect(() => {
    if (editingProfile) mainContent.current?.querySelector<HTMLInputElement>("form input")?.focus();
  }, [editingProfile]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!mainContent.current?.querySelector('form[data-dirty="true"]')) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const activePage = page === "members" && access?.admin !== true ? "profile" : page;
  function navigate(next: typeof page) {
    if (
      next !== activePage &&
      mainContent.current?.querySelector('form[data-dirty="true"]') &&
      !confirm("Leave this page and discard unsaved changes?")
    )
      return;
    setPage(next);
    if (next !== activePage) setEditingProfile(false);
    setMenuOpen(false);
    setStatus("");
    requestAnimationFrame(() => mainContent.current?.focus());
  }
  const navigation = user && (
    <aside
      ref={sidebar}
      tabIndex={-1}
      className={`dashboard-sidebar ${menuOpen ? "is-open" : ""}`}
      id="dashboard-menu"
    >
      <div className="dashboard-user">
        <strong>
          {(typeof ownProfile?.display_name === "string" && ownProfile.display_name) ||
            user.displayName ||
            "Your account"}
        </strong>
        {user.email ? (
          <span>{user.email}</span>
        ) : (
          <button
            disabled={busy}
            onClick={() => {
              navigate("profile");
              setAddingContact("email");
            }}
          >
            Add Email
          </button>
        )}
        {user.phoneNumber ? (
          <span>{user.phoneNumber}</span>
        ) : (
          <button
            disabled={busy}
            onClick={() => {
              navigate("profile");
              setAddingContact("phone");
            }}
          >
            Add Phone
          </button>
        )}
      </div>
      {setup?.state === "complete" && (
        <nav aria-label="Dashboard navigation">
          <button
            disabled={busy}
            aria-current={activePage === "profile" ? "page" : undefined}
            onClick={() => navigate("profile")}
          >
            My Profile
          </button>
          <button
            disabled={busy}
            aria-current={activePage === "events" ? "page" : undefined}
            onClick={() => navigate("events")}
          >
            {access?.admin === true ? "Manage Events" : "Events"}
          </button>
          {access?.admin === true && (
            <button
              disabled={busy}
              aria-current={activePage === "members" ? "page" : undefined}
              onClick={() => navigate("members")}
            >
              Manage Users
            </button>
          )}
        </nav>
      )}
      <button
        className="dashboard-menu-signout"
        disabled={busy}
        onClick={() => act(authSignOut, "Signed out.", "sign_out")}
      >
        Sign Out
      </button>
    </aside>
  );
  return (
    <div className="dashboard">
      <header>
        <a className="dashboard-brand" href="/" aria-label="Acton Citizens' Band home">
          <span>ACTON CITIZENS' BAND</span>
          <img src="/img/branding/ACB-Logo-Red-Transparent.svg" width="64" height="64" alt="" />
        </a>
        <span className="dashboard-page-label">Dashboard</span>
        <div className="dashboard-header-actions">
          <ThemeToggle className="dashboard-theme-toggle" />
          {user && (
            <button
              ref={menuButton}
              className="dashboard-menu-toggle"
              aria-label={menuOpen ? "Close dashboard menu" : "Open dashboard menu"}
              aria-expanded={menuOpen}
              aria-controls="dashboard-menu"
              onClick={() => {
                trackEvent("dashboard_menu_toggle", { state: menuOpen ? "close" : "open" });
                setMenuOpen((value) => !value);
              }}
            >
              <img src="/img/icons/Menu.svg" alt="" width="28" height="28" />
            </button>
          )}
        </div>
      </header>
      <div className={user ? "dashboard-workspace" : undefined}>
        {user && menuOpen && (
          <button
            className="dashboard-menu-backdrop"
            type="button"
            tabIndex={-1}
            aria-label="Close dashboard menu"
            onClick={() => {
              setMenuOpen(false);
              menuButton.current?.focus();
            }}
          />
        )}
        {navigation}
        <main
          ref={mainContent}
          tabIndex={-1}
          className={!user ? "dashboard-login" : "dashboard-content"}
        >
          {loading ? (
            <p role="status">Checking sign-in…</p>
          ) : !user ? (
            <>
              {accountDeleted && <p role="status">Your account has been deleted.</p>}
              <Login />
            </>
          ) : !setup && !setupFailed ? (
            <section className="profile-page">
              <div className="profile-title-row">
                <h1>My Profile</h1>
              </div>
              <ProfileLoading />
            </section>
          ) : setup && setup.state !== "complete" ? (
            <AccountSetup
              key={`${user.uid}-${setupAttempt}`}
              user={user}
              initial={setup}
              onComplete={() => {
                setSetupAttempt((value) => value + 1);
              }}
            />
          ) : (
            <>
              {activePage === "profile" && (
                <section className="profile-page">
                  <div className="profile-title-row">
                    <h1>My Profile</h1>
                  </div>
                  {setupFailed ? (
                    <>
                      <p>Account setup is unavailable.</p>
                      <button onClick={() => setSetupAttempt((value) => value + 1)}>
                        Retry Account Setup
                      </button>
                    </>
                  ) : !access || !ownProfile ? (
                    <ProfileLoading />
                  ) : (
                    <>
                      {editingProfile ? (
                        <ProfileEditor
                          data={ownProfile}
                          onSaved={() => {
                            setEditingProfile(false);
                            setStatus("Profile saved.");
                            requestAnimationFrame(() => editProfileButton.current?.focus());
                          }}
                          onCancel={() => {
                            setEditingProfile(false);
                            setError("");
                            requestAnimationFrame(() => editProfileButton.current?.focus());
                          }}
                        />
                      ) : (
                        <ProfileSummary
                          name={savedName}
                          instruments={savedInstruments}
                          access={access}
                          requested={ownProfile.membership_requested === true}
                          details={ownProfile}
                        />
                      )}
                      <div className="dashboard-actions">
                        {!setupFailed && access && ownProfile && !editingProfile && (
                          <button
                            ref={editProfileButton}
                            className="dashboard-primary-button"
                            onClick={() => {
                              setStatus("");
                              setError("");
                              setEditingProfile(true);
                            }}
                          >
                            Edit Profile
                          </button>
                        )}
                      </div>
                      <div
                        className="profile-contact-details"
                        role="region"
                        aria-labelledby="profile-contact-heading"
                      >
                        <h2 id="profile-contact-heading">Contact Details</h2>
                        <div className="profile-contact-list">
                          {(["email", "phone"] as const).map((type) => {
                            const value = type === "email" ? user.email : user.phoneNumber;
                            const label = type === "email" ? "Email" : "Phone";
                            return (
                              <div className="profile-contact-item" key={type}>
                                {addingContact === type ? (
                                  <Login
                                    embedded
                                    linking
                                    contactType={type}
                                    onCancel={() => setAddingContact(null)}
                                    onLinked={() => {
                                      setAddingContact(null);
                                      setStatus(`${label} added to your account.`);
                                      void registration({ action: "prepare" }).catch((failure) =>
                                        setError(registrationError(failure)),
                                      );
                                    }}
                                  />
                                ) : (
                                  <ProfileContactRow
                                    label={label}
                                    value={value}
                                    action={
                                      !value && (
                                        <button
                                          className="dashboard-secondary-button"
                                          onClick={() => setAddingContact(type)}
                                        >
                                          Add {label}
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
                      {access.member !== true && ownProfile.membership_requested !== true && (
                        <p>
                          <button
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  updateDoc(doc(firestore, "users", user.uid), {
                                    membership_requested: true,
                                    updated_at: serverTimestamp(),
                                  }),
                                "Membership requested.",
                                "membership_request",
                              )
                            }
                          >
                            Request Band Membership
                          </button>
                        </p>
                      )}

                      <DeleteAccount onDeleted={() => setAccountDeleted(true)} />
                    </>
                  )}
                </section>
              )}
              {activePage === "events" && <EventManager canEdit={access?.admin === true} />}
              {activePage === "members" && access?.admin === true && (
                <UserManagement onOwnProfile={() => navigate("profile")} />
              )}
            </>
          )}
          {status && <p role="status">{status}</p>}
          {error && <p role="alert">{error}</p>}
        </main>
      </div>
    </div>
  );
}
