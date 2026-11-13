"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";
import { REDIRECT_PARAM, safeRedirectPath } from "@/lib/routes";
import { SOCIAL_PROVIDER_LABELS, type SocialProvider } from "@/lib/social-providers";

type Props = {
  providers: SocialProvider[];
  redirectTo?: string;
  /** Page to come back to (with `?error=`) if the provider login fails. */
  errorPath: string;
  disabled?: boolean;
};

/**
 * "Continue with GitHub / Google". Works for both login and sign-up: Better
 * Auth creates the user on first OAuth login.
 */
export function SocialButtons({ providers, redirectTo, errorPath, disabled }: Props) {
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (providers.length === 0) return null;

  const errorCallbackURL = redirectTo
    ? `${errorPath}?${new URLSearchParams({ [REDIRECT_PARAM]: redirectTo })}`
    : errorPath;

  async function handleClick(provider: SocialProvider) {
    setError(null);
    setPending(provider);
    // On success the browser leaves the page for the provider, so we only
    // reset `pending` if starting the flow fails.
    const { error } = await signIn.social({
      provider,
      callbackURL: safeRedirectPath(redirectTo),
      errorCallbackURL,
    });
    if (error) {
      setError(error.message || "Could not start sign-in. Please try again.");
      setPending(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {providers.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            size="lg"
            disabled={disabled || pending !== null}
            onClick={() => handleClick(provider)}
          >
            {pending === provider ? "Redirecting…" : `Continue with ${SOCIAL_PROVIDER_LABELS[provider]}`}
          </Button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
