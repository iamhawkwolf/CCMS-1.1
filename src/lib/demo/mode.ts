// Switches that decide whether this deployment is a demo and whether strangers can create accounts.
// Local development keeps everything on; a production build needs each one turned on explicitly.
const flag = (name: string, devDefault: boolean): boolean => {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return process.env.NODE_ENV !== "production" && devDefault;
};

/** One-click "explore as ..." buttons on the sign-in page. Set DEMO_MODE=1 on a hosted demo. */
export const demoModeOn = (): boolean => flag("DEMO_MODE", true);

/** Open self-service signup. Off in production unless ALLOW_SIGNUP=1 (accounts are invite-only). */
export const signupOpen = (): boolean => flag("ALLOW_SIGNUP", true);

export const DEMO_CONSULTANCY = "Demo HR Advisors";

export const DEMO_LOGINS = {
  admin: { email: "admin@demo.test", label: "Admin", blurb: "Every client, settings, switches" },
  consultant: { email: "consultant@demo.test", label: "Consultant", blurb: "Only assigned clients" },
  client: { email: "client@demo.test", label: "Client", blurb: "The client's own portal" },
} as const;
export type DemoRole = keyof typeof DEMO_LOGINS;
