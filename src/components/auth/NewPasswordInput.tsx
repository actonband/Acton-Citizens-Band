import { useEffect, useId, useState } from "react";
import type { Ref } from "react";
import { validatePassword } from "firebase/auth";
import type { Auth, PasswordValidationStatus } from "firebase/auth";
import { passwordCriteria } from "../../utils/passwordPolicy";

export default function NewPasswordInput({
  auth,
  label,
  value,
  onChange,
  disabled,
  inputRef,
}: {
  auth: Auth;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const [result, setResult] = useState<{
    auth: Auth;
    password: string;
    status: PasswordValidationStatus;
  } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [show, setShow] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    void validatePassword(auth, value)
      .then((status) => {
        if (active) setResult({ auth, password: value, status });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [auth, value, attempt]);
  const status = result?.auth === auth && result.password === value ? result.status : null;
  const criteria = status ? passwordCriteria(status) : [];
  const met = criteria.filter((criterion) => criterion.met).length;
  const hasUnsupportedSymbol =
    status?.containsNonAlphanumericCharacter !== undefined &&
    [...value].some(
      (character) =>
        !/[\p{L}\p{N}\p{M}]/u.test(character) &&
        !status.passwordPolicy.allowedNonAlphanumericCharacters.includes(character),
    );
  return (
    <div className="new-password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-row">
        <input
          ref={inputRef}
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          disabled={disabled}
          value={value}
          aria-describedby={`${id}-requirements`}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="dashboard-secondary-button"
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          onClick={() => setShow((current) => !current)}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <div id={`${id}-requirements`} className="password-requirements">
        <p role="status" aria-live="polite">
          {error
            ? "Unable to load password requirements."
            : !status
              ? "Checking password requirements…"
              : !value
                ? "Your password must meet these requirements:"
                : status.isValid
                  ? "Your password meets all requirements."
                  : `${met} of ${criteria.length} requirements met.`}
        </p>
        {error && (
          <button
            type="button"
            className="dashboard-secondary-button"
            disabled={disabled}
            onClick={() => setAttempt((current) => current + 1)}
          >
            Retry Password Check
          </button>
        )}
        {status && (
          <ul>
            {criteria.map((criterion) => (
              <li
                key={criterion.key}
                data-state={!value ? "pending" : criterion.met ? "met" : "missing"}
              >
                <svg
                  className="password-requirement-icon"
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                >
                  {value && criterion.met ? (
                    <path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <circle cx="10" cy="10" r="6.5" />
                  )}
                </svg>
                <span className="visually-hidden">
                  {value && criterion.met ? "Met: " : "Required: "}
                </span>
                <span>{criterion.label}</span>
              </li>
            ))}
          </ul>
        )}
        {hasUnsupportedSymbol && (
          <p role="status">
            Your password includes an unsupported symbol. It does not count toward the symbol
            requirement.
          </p>
        )}
      </div>
    </div>
  );
}
