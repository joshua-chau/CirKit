import { Suspense } from "react";
import type { Metadata } from "next";

import { SignupForm } from "@/components/auth/signup-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnabledSocialProviders } from "@/server/auth/providers";
import { readAuthParams, redirectIfSignedIn } from "../_lib/redirect-if-signed-in";

export const metadata: Metadata = { title: "Sign up · CirKit" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function SignupPage({ searchParams }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your CirKit account</CardTitle>
        <CardDescription>Share and borrow items with your groups.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<div className="h-80 animate-pulse rounded-lg bg-muted" />}>
          <SignupContent searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function SignupContent({ searchParams }: Props) {
  const { redirectTo, oauthError } = await readAuthParams(searchParams);
  await redirectIfSignedIn(redirectTo);
  return (
    <SignupForm
      redirectTo={redirectTo}
      oauthError={oauthError}
      socialProviders={getEnabledSocialProviders()}
    />
  );
}
