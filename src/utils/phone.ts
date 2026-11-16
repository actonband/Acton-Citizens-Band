export function normalizePhoneNumber(value: string): string | null {
  const input = value.trim();
  const digits = input.replace(/\D/g, "");
  if (input.startsWith("+")) {
    if (digits.startsWith("1") && digits.length !== 11) return null;
    return /^[1-9]\d{7,14}$/.test(digits) ? "+" + digits : null;
  }
  if (digits.length === 10) return "+1" + digits;
  if (/^1\d{10}$/.test(digits)) return "+" + digits;
  return null;
}

export function formatPhoneNumber(value: string): string {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return value;
  const northAmerican = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(normalized);
  return northAmerican
    ? `+1 (${northAmerican[1]}) ${northAmerican[2]}-${northAmerican[3]}`
    : normalized;
}

export function phoneNumberError(value: string): string {
  if (!value.trim()) return "Enter your phone number.";
  if (normalizePhoneNumber(value)) return "";
  const digits = value.replace(/\D/g, "");
  return !value.trim().startsWith("+") && digits.length > 0 && digits.length !== 10
    ? "Include your country code, starting with +."
    : "Enter a valid phone number.";
}
