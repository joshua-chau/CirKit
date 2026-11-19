"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { LOGIN_PATH } from "@/lib/routes";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);

    try {
      const result = await signOut();
      if (result.error) throw result.error;

      window.location.replace(LOGIN_PATH);
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={handleClick} disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>
  );
}
