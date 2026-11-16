import type { ReactNode } from "react";

export function ProfileLoading() {
  return (
    <div className="profile-loading" role="status" aria-label="Loading profile details">
      <p>Loading profile details…</p>
      <div aria-hidden="true" className="profile-loading-rows">
        {[0, 1, 2].map((row) => (
          <div key={row}>
            <span />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}

export function accountType(access: Record<string, unknown>, requested: boolean) {
  return access.admin === true
    ? "Administrator"
    : access.member === true
      ? "Band Member"
      : requested
        ? "Membership approval pending"
        : access.past_member === true
          ? "Past Member"
          : "Non-Member";
}

export function ProfileSummary({
  name,
  instruments,
  access,
  requested,
  details = {},
}: {
  name: string;
  instruments: string;
  access: Record<string, unknown>;
  requested: boolean;
  details?: Record<string, unknown>;
}) {
  return (
    <dl className="profile-summary">
      <div>
        <dt>Name</dt>
        <dd>{name || "Not provided"}</dd>
      </div>
      <div>
        <dt>Instruments</dt>
        <dd>
          {Array.isArray(details.instrument_details) && details.instrument_details.length ? (
            <div className="profile-instrument-summary">
              {details.instrument_details.map((item, index) => (
                <div key={index}>
                  <strong>{String(item.name || "")}</strong>
                  <span>{item.ownership === "band" ? "Band-loaned" : "Personal"}</span>
                  {item.ownership === "band" && (
                    <span>
                      Loan form:{" "}
                      {item.loan_form_status === "signed"
                        ? "Signed"
                        : item.loan_form_status === "not_signed"
                          ? "Not signed"
                          : "Not sure"}{" "}
                      (self-reported)
                    </span>
                  )}
                  {item.details && <span>{String(item.details)}</span>}
                </div>
              ))}
            </div>
          ) : (
            instruments || "Not provided"
          )}
        </dd>
      </div>
      {typeof details.notes === "string" && details.notes && (
        <div>
          <dt>Other details</dt>
          <dd>{details.notes}</dd>
        </div>
      )}
      <div className="profile-account-type-row">
        <dt>Account type</dt>
        <dd>
          <span>{accountType(access, requested)}</span>
        </dd>
      </div>
    </dl>
  );
}

export function ProfileContactRow({
  label,
  value,
  action,
}: {
  label: string;
  value: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="profile-contact-row">
      <h3>{label}</h3>
      <div className="profile-contact-value">
        {(value || !action) && <p>{value || "Not added"}</p>}
        {action}
      </div>
    </div>
  );
}
