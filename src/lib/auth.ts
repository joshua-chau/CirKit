import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import prisma from "@/lib/prisma";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/validation/auth.schema";

const DAY_IN_SECONDS = 60 * 60 * 24;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }), // store users via Prisma
  emailAndPassword: {
    enabled: true,          // allow email + password sign-up
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
  },
  session: {
    expiresIn: 7 * DAY_IN_SECONDS, // log out after 7 days of no activity
    updateAge: DAY_IN_SECONDS,     // extend the session at most once a day
  },
  plugins: [nextCookies()], // keep this one last
});
