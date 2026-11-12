import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import prisma from "@/lib/prisma";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/validation/auth.schema";
import { socialProviderConfig } from "@/server/auth/providers";

const DAY_IN_SECONDS = 60 * 60 * 24;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }), // store users via Prisma
  emailAndPassword: {
    enabled: true,          // allow email + password sign-up
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
  },
  // GitHub / Google login. Only providers with keys in .env are enabled.
  // Callback URLs: <BETTER_AUTH_URL>/api/auth/callback/{github,google}
  socialProviders: socialProviderConfig,
  account: {
    // Same email via a second provider links to the existing user, but only
    // when the existing user's email is verified (Better Auth's default).
    // Password sign-ups are unverified for now, so those users get an
    // "account already exists" message instead of a silent link — this
    // stops someone pre-registering a victim's email and taking over their
    // Google/GitHub login.
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github"],
    },
  },
  session: {
    expiresIn: 7 * DAY_IN_SECONDS, // log out after 7 days of no activity
    updateAge: DAY_IN_SECONDS,     // extend the session at most once a day
  },
  plugins: [nextCookies()], // keep this one last
});
