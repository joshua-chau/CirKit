"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FormField } from "@/components/auth/form-field";
import { SocialButtons } from "@/components/auth/social-buttons";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";
import { LOGIN_PATH, REDIRECT_PARAM, SIGNUP_PATH, safeRedirectPath } from "@/lib/routes";
import {
  authErrorMessage,
  loginSchema,
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

export function LoginForm({ redirectTo, oauthError, socialProviders }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(() => oauthErrorMessage(oauthError));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Pass the redirect target through to /signup so it survives the switch.
  const signupHref = redirectTo
    ? `${SIGNUP_PATH}?${new URLSearchParams({ [REDIRECT_PARAM]: redirectTo })}`
    : SIGNUP_PATH;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setFormError(null);
    const parsed = loginSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error));
      return;
    }
    setFieldErrors({});

    setPending(true);
    const { error } = await signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      setFormError(authErrorMessage(error));
      setPending(false);
      return;
    }

    // Keep the button disabled while we navigate away.
    router.replace(safeRedirectPath(redirectTo));
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <SocialButtons
        providers={socialProviders}
        redirectTo={redirectTo}
        errorPath={LOGIN_PATH}
        disabled={pending}
      />
      <form onSubmit={handleSubmit} noValidate className="grid gap-4">
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
          autoComplete="current-password"
          required
          error={fieldErrors.password}
        />

        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href={signupHref} className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
