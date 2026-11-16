import { useState } from "react";
import ProfileFormFields from "./ProfileFormFields";
import { profileDraft, profileRevision, registration, registrationError } from "./registration";

export default function ProfileEditor({
  data,
  onSaved,
  onCancel,
}: {
  data: Record<string, unknown>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [initial] = useState(() => profileDraft(data));
  const [revision] = useState(() => profileRevision(data));
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      data-dirty={JSON.stringify(initial) !== JSON.stringify(draft)}
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await registration({ action: "saveProfile", profile: draft, revision });
          onSaved();
        } catch (failure) {
          setError(registrationError(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <ProfileFormFields value={draft} onChange={setDraft} />
        <div className="dashboard-actions">
          <button className="dashboard-primary-button">{busy ? "Saving…" : "Save Profile"}</button>
          <button type="button" className="dashboard-secondary-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
