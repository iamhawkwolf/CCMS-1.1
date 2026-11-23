export interface Email { to: string; subject: string; text: string }

/**
 * Sends one email. No real provider is wired up yet (EMAIL_PROVIDER is "console").
 * In development the message is printed so you can click the link. In production it is NOT printed,
 * because a password-reset link in the logs is a password; set up a provider before relying on it.
 * Returns whether the message really left the system.
 */
export async function sendEmail(mail: Email): Promise<boolean> {
  const provider = process.env.EMAIL_PROVIDER ?? "console";
  if (provider === "console") {
    if (process.env.NODE_ENV === "production") console.warn(`[email] not sent to ${mail.to}: no email provider is configured (EMAIL_PROVIDER=console)`);
    else console.log(`[email] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return false;
  }
  console.warn(`[email] provider "${provider}" is not implemented; nothing sent to ${mail.to}`);
  return false;
}
