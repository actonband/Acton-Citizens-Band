import { validatePassword } from "firebase/auth";
import type { Auth, PasswordValidationStatus } from "firebase/auth";

export function passwordCriteria(status: PasswordValidationStatus) {
  const options = status.passwordPolicy.customStrengthOptions;
  const criteria: { key: string; label: string; met: boolean }[] = [];
  if (status.meetsMinPasswordLength !== undefined)
    criteria.push({
      key: "minimum",
      label: `At least ${options.minPasswordLength} characters`,
      met: status.meetsMinPasswordLength,
    });
  if (status.meetsMaxPasswordLength !== undefined)
    criteria.push({
      key: "maximum",
      label: `No more than ${options.maxPasswordLength} characters`,
      met: status.meetsMaxPasswordLength,
    });
  for (const [key, label] of [
    ["containsLowercaseLetter", "A lowercase letter (a–z)"],
    ["containsUppercaseLetter", "An uppercase letter (A–Z)"],
    ["containsNumericCharacter", "A number (0–9)"],
    ["containsNonAlphanumericCharacter", "A symbol"],
  ] as const) {
    const met = status[key];
    if (met !== undefined) criteria.push({ key, label, met });
  }
  return criteria;
}

export async function validateNewPassword(auth: Auth, password: string) {
  let status: PasswordValidationStatus;
  try {
    status = await validatePassword(auth, password);
  } catch {
    throw Object.assign(new Error("Unable to load password requirements."), {
      code: "auth/password-policy-unavailable",
    });
  }
  if (!status.isValid)
    throw Object.assign(new Error("Choose a password that meets all requirements."), {
      code: "auth/password-does-not-meet-requirements",
    });
  return status;
}
