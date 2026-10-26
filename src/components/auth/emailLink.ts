export async function sendEmailLink(
  email: string,
  send: (email: string) => Promise<void>,
  remember: (email: string) => void,
): Promise<void> {
  const normalizedEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw Object.assign(new Error("Invalid email address"), { code: "auth/invalid-email" });
  }
  await send(normalizedEmail);
  remember(normalizedEmail);
}
