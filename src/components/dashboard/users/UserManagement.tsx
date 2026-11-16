import { useEffect, useRef, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { useAuth } from "../../auth/AuthContext";
import { firestore } from "../../../utils/firebase";
import AdminUserProfile from "./AdminUserProfile";
import { accountType } from "../../profile/ProfileFields";

export default function UserManagement({ onOwnProfile }: { onOwnProfile: () => void }) {
  const { user: currentUser } = useAuth();
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [users, setUsers] = useState<
    {
      id: string;
      name: string;
      requested: boolean;
      member: boolean;
      admin: boolean;
      past_member: boolean;
      instruments: string;
      details: Record<string, unknown>;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function load() {
    const [profiles, permissions] = await Promise.all([
      getDocs(collection(firestore, "users")),
      getDocs(collection(firestore, "access")),
    ]);
    const access = new Map(permissions.docs.map((snapshot) => [snapshot.id, snapshot.data()]));
    setUsers(
      profiles.docs
        .filter((snapshot) => !snapshot.data().merged_into)
        .map((snapshot) => ({
          id: snapshot.id,
          name: String(
            snapshot.data().display_name ||
              [snapshot.data().first_name, snapshot.data().last_name].filter(Boolean).join(" ") ||
              snapshot.id,
          ),
          requested: snapshot.data().membership_requested === true,
          member: access.get(snapshot.id)?.member === true,
          admin: access.get(snapshot.id)?.admin === true,
          past_member: access.get(snapshot.id)?.past_member === true,
          instruments:
            typeof snapshot.data().instruments === "string" ? snapshot.data().instruments : "",
          details: snapshot.data(),
        })),
    );
  }
  useEffect(() => {
    load().catch(() => setError("Unable to load membership requests. Use Refresh to retry."));
  }, []);
  async function change(uid?: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (uid) await updateDoc(doc(firestore, "access", uid), { member: true });
      await load();
    } catch {
      setError("Unable to update or load users. Check permissions and retry.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (selectedUid)
    return (
      <AdminUserProfile
        key={selectedUid}
        uid={selectedUid}
        preview={(() => {
          const selected = users.find((item) => item.id === selectedUid);
          return selected
            ? {
                name: selected.name,
                instruments: selected.instruments,
                requested: selected.requested,
                access: {
                  member: selected.member,
                  admin: selected.admin,
                  past_member: selected.past_member,
                },
                details: selected.details,
              }
            : undefined;
        })()}
        onBack={() => setSelectedUid(null)}
        onChanged={() => void change()}
        onDeleted={() => {
          setSelectedUid(null);
          setNotice("User account deleted.");
          void change();
        }}
      />
    );
  return (
    <section>
      <div className="profile-title-row">
        <h2>Manage Users</h2>
        <button disabled={busy} onClick={() => change()}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <div className="member-list">
        {users.map((user) => (
          <div className="member-card" key={user.id}>
            <button
              className="member-card-profile"
              disabled={busy}
              onClick={() => {
                setNotice("");
                if (user.id === currentUser?.uid) onOwnProfile();
                else setSelectedUid(user.id);
              }}
            >
              <strong className="member-card-name">{user.name}</strong>
              <span className="member-card-type">{accountType(user, user.requested)}</span>
            </button>
            {user.requested && !user.member && (
              <div className="member-card-actions">
                <button disabled={busy} onClick={() => change(user.id)}>
                  Approve Membership
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
