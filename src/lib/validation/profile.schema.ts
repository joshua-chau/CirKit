import { z } from "zod";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./auth.schema";

export const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Name is too long."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      )
      .max(
        MAX_PASSWORD_LENGTH,
        `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Choose a password different from your current one.",
    path: ["newPassword"],
  });
