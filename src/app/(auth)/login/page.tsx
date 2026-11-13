import { Suspense } from "react";
import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnabledSocialProviders } from "@/server/auth/providers";
import { readAuthParams, redirectIfSignedIn } from "../_lib/redirect-if-signed-in";

export const metadata: Metadata = { title: "Sign in · CirKit" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function LoginPage({ searchParams }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in to CirKit</CardTitle>
        <CardDescription>Enter your email and password to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Reads cookies + searchParams, so it must sit inside Suspense (cacheComponents). */}
        <Suspense fallback={<FormSkeleton />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function LoginContent({ searchParams }: Props) {
  const { redirectTo, oauthError } = await readAuthParams(searchParams);
  await redirectIfSignedIn(redirectTo);
  return (
    <LoginForm
      redirectTo={redirectTo}
      oauthError={oauthError}
      socialProviders={getEnabledSocialProviders()}
    />
  );
}

function FormSkeleton() {
  return <div className="h-56 animate-pulse rounded-lg bg-muted" />;
}
