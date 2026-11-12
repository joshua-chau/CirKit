"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FormField } from "@/components/auth/form-field";
import { SocialButtons } from "@/components/auth/social-buttons";
import { Button } from "@/components/ui/button";
import { signUp } from "@/lib/auth-client";
import { LOGIN_PATH, REDIRECT_PARAM, SIGNUP_PATH, safeRedirectPath } from "@/lib/routes";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  authErrorMessage,
  signupSchema,
  toFieldErrors,
  type FieldErrors,
} from "@/lib/validation/auth.schema";
import { oauthErrorMessage, type SocialProvider } from "@/lib/social-providers";

type Props = {
  redirectTo?: string;
  /** `?error=` code from a failed GitHub/Google login. */
  oauthError?: string;
  socialProviders: SocialProvider[];
};

export function SignupForm({ redirectTo, oauthError, socialProviders }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(() => oauthErrorMessage(oauthError));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const loginHref = redirectTo
    ? `${LOGIN_PATH}?${new URLSearchParams({ [REDIRECT_PARAM]: redirectTo })}`
    : LOGIN_PATH;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setFormError(null);
    const parsed = signupSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});

    setPending(true);
    // Better Auth signs the user in right after sign-up (autoSignIn defaults to true).
    const { error } = await signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      setFormError(authErrorMessage(error));
      setPending(false);
      return;
    }

    router.replace(safeRedirectPath(redirectTo));
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <SocialButtons
        providers={socialProviders}
        redirectTo={redirectTo}
        errorPath={SIGNUP_PATH}
        disabled={pending}
      />
      <form onSubmit={handleSubmit} noValidate className="grid gap-4">
        <FormField name="name" label="Name" autoComplete="name" required error={fieldErrors.name} />
        <FormField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          error={fieldErrors.email}
        />
        <FormField
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
          error={fieldErrors.password}
        />
        <FormField
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          error={fieldErrors.confirmPassword}
        />

        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={loginHref} className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
