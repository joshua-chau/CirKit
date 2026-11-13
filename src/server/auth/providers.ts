import "server-only";

import type { SocialProvider } from "@/lib/social-providers";

type ProviderCredentials = { clientId: string; clientSecret: string };

function credentials(idVar: string, secretVar: string): ProviderCredentials | null {
  const clientId = process.env[idVar];
  const clientSecret = process.env[secretVar];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Social providers whose client ID + secret are set in the environment.
 * A provider with missing keys is simply left out, so the app still runs
 * (email + password only) before anyone has created the OAuth apps.
 */
export const socialProviderConfig: Partial<Record<SocialProvider, ProviderCredentials>> =
  Object.fromEntries(
    Object.entries({
      github: credentials("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"),
      google: credentials("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    }).filter(([, value]) => value !== null),
  );

export function getEnabledSocialProviders(): SocialProvider[] {
  return Object.keys(socialProviderConfig) as SocialProvider[];
}
