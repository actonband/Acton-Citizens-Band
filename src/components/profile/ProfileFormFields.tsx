import type { ProfileDraft, Instrument } from "./registration";

export default function ProfileFormFields({
  value,
  onChange,
  membership = false,
}: {
  value: ProfileDraft;
  onChange: (value: ProfileDraft) => void;
  membership?: boolean;
}) {
  function instrument(index: number, change: Partial<Instrument>) {
    onChange({
      ...value,
      instrumentDetails: value.instrumentDetails.map((item, position) =>
        position === index ? { ...item, ...change } : item,
      ),
    });
  }
  return (
    <>
      <label>
        Name
        <input
          required
          maxLength={100}
          autoComplete="name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      <div className="profile-instruments">
        <h3>Instruments</h3>
        <p className="dashboard-auth-note">
          Add the instruments you play. You can leave this empty if you are not a player.
        </p>
        {value.instrumentDetails.map((item, index) => (
          <fieldset className="profile-instrument" key={index}>
            <legend>Instrument {index + 1}</legend>
            <label>
              Instrument
              <input
                required
                maxLength={80}
                value={item.name}
                onChange={(e) => instrument(index, { name: e.target.value })}
              />
            </label>
            <label>
              Ownership
              <span className="dashboard-select">
                <select
                  required
                  value={item.ownership}
                  onChange={(e) =>
                    instrument(index, { ownership: e.target.value as Instrument["ownership"] })
                  }
                >
                  <option value="" disabled>
                    Choose ownership
                  </option>
                  <option value="personal">Personal</option>
                  <option value="band">Band-loaned</option>
                </select>
              </span>
            </label>
            {item.ownership === "band" && (
              <label>
                Have you signed the instrument loan form?
                <span className="dashboard-select">
                  <select
                    value={item.loanForm}
                    onChange={(e) =>
                      instrument(index, { loanForm: e.target.value as Instrument["loanForm"] })
                    }
                  >
                    <option value="unsure">Not sure</option>
                    <option value="signed">Yes</option>
                    <option value="not_signed">No</option>
                  </select>
                </span>
              </label>
            )}
            <label>
              Make, model or band asset number (optional)
              <input
                maxLength={200}
                value={item.details}
                onChange={(e) => instrument(index, { details: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="dashboard-secondary-button"
              onClick={() =>
                onChange({
                  ...value,
                  instrumentDetails: value.instrumentDetails.filter(
                    (_, position) => position !== index,
                  ),
                })
              }
            >
              Remove Instrument {index + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="dashboard-secondary-button"
          disabled={value.instrumentDetails.length >= 12}
          onClick={() =>
            onChange({
              ...value,
              instrumentDetails: [
                ...value.instrumentDetails,
                { name: "", ownership: "", loanForm: "unsure", details: "" },
              ],
            })
          }
        >
          Add Instrument
        </button>
        {value.instrumentDetails.some((item) => item.ownership === "band") && (
          <p className="dashboard-auth-note">
            Loan-form answers are self-reported and may be checked by an administrator.
          </p>
        )}
      </div>
      <label>
        Other details (optional)
        <textarea
          maxLength={1000}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder="For example, an instrument you would like to learn or help you need getting started."
        />
      </label>
      {membership && (
        <label className="dashboard-checkbox">
          <input
            type="checkbox"
            checked={value.membershipRequested}
            onChange={(e) => onChange({ ...value, membershipRequested: e.target.checked })}
          />
          Request band membership
        </label>
      )}
    </>
  );
}
