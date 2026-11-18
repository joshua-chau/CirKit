import { z } from "zod";

export const GROUP_NAME_MAX = 80;
export const GROUP_DESCRIPTION_MAX = 500;

export const groupInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a group name.")
    .max(GROUP_NAME_MAX, `Name must be at most ${GROUP_NAME_MAX} characters.`),
  description: z
    .string()
    .trim()
    .max(GROUP_DESCRIPTION_MAX, `Description must be at most ${GROUP_DESCRIPTION_MAX} characters.`)
    // Store an empty textarea as NULL rather than "".
    .transform((value) => (value === "" ? null : value)),
});

export type GroupInput = z.infer<typeof groupInputSchema>;

export const inviteInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
});

export type InviteInput = z.infer<typeof inviteInputSchema>;
