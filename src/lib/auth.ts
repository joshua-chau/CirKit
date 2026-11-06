import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import prisma from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }), // store users via Prisma
  emailAndPassword: { enabled: true },                         // allow email + password sign-up
  plugins: [nextCookies()],                                    // keep this one last
});