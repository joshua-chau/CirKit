// Client-safe list of the third-party login providers we support. Which ones
// are actually turned on depends on env vars; see src/server/auth/providers.ts.

export const SOCIAL_PROVIDERS = ["github", "google"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  github: "GitHub",
  google: "Google",
};

/**
 * Better Auth sends failed OAuth logins back with `?error=<code>`. Map the
 * codes users can realistically hit to readable messages.
 */
export function oauthErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "access_denied":
      return "Sign-in was cancelled.";
    case "account_not_linked":
    case "unable_to_link_account":
    case "account_ownership_conflict":
    case "email_not_verified":
      return "An account with this email already exists. Sign in with your email and password instead.";
    case "email_not_found":
      return "We couldn't get an email address from that account. Make sure it has a verified email.";
    case "account_already_linked_to_different_user":
      return "That account is already connected to a different CirKit user.";
    case "state_mismatch":
    case "state_not_found":
    case "state_security_mismatch":
      return "Your sign-in session expired. Please try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
