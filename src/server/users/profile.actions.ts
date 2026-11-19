"use server";

import "server-only";

import { APIError } from "better-auth/api";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { toFieldErrors } from "@/lib/validation/auth.schema";
import {
  changePasswordSchema,
  nameSchema,
} from "@/lib/validation/profile.schema";
import { requireUser } from "@/server/auth/session";
import type { ActionResult } from "@/server/groups/group.actions";
import { hasPassword } from "./profile.queries";

// Profile changes go through Better Auth's own endpoints, so its rules
// (password hashing, length limits, session handling) apply unchanged.

export async function updateNameAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const parsed = nameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  await auth.api.updateUser({
    body: { name: parsed.data.name },
    headers: await headers(),
  });
  refresh();
  return { ok: true };
}

export async function changePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  if (!(await hasPassword(user.id))) {
    return {
      ok: false,
      error:
        "Your account signs in with Google or GitHub, so it has no password to change.",
    };
  }
  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        // Sign out every other device, so an old password stops working everywhere.
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      if (error.body?.code === "INVALID_PASSWORD") {
        return {
          ok: false,
          error: "Please fix the errors below.",
          fieldErrors: { currentPassword: "Current password is incorrect." },
        };
      }
      return {
        ok: false,
        error: error.body?.message ?? "Couldn't change your password.",
      };
    }
    throw error;
  }
  // Better Auth replaced this session too (new cookie). Re-rendering this
  // request would still see the old, now-deleted session and bounce to
  // /login, so navigate instead: the next request carries the new cookie.
  redirect("/profile?password=changed");
}
