import { Suspense } from "react";
import type { Metadata } from "next";

import { PictureEditor } from "@/components/picture-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import {
  changePasswordAction,
  updateNameAction,
} from "@/server/users/profile.actions";
import { getSignInMethods } from "@/server/users/profile.queries";
import { NameForm } from "./_components/name-form";
import { PasswordForm } from "./_components/password-form";

export const metadata: Metadata = { title: "Profile · CirKit" };

type Props = { searchParams: Promise<{ password?: string }> };

export default function ProfilePage({ searchParams }: Props) {
  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}
      >
        <ProfileContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const providerNames: Record<string, string> = {
  google: "Google",
  github: "GitHub",
};

async function ProfileContent({ searchParams }: Props) {
  const { password } = await searchParams;
  const user = await requireUser();
  const methods = await getSignInMethods(user.id);
  const canChangePassword = methods.includes("credential");
  const socialNames = methods
    .filter((m) => m !== "credential")
    .map((m) => providerNames[m] ?? m);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Profile picture</CardTitle>
          <CardDescription>Shown to people in your groups.</CardDescription>
        </CardHeader>
        <CardContent>
          <PictureEditor
            endpoint="/api/users/me/image"
            name={user.name}
            image={user.image ?? null}
            removeConfirm="Remove your profile picture?"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Name</CardTitle>
          <CardDescription>
            How you appear to other members. Your sign-in email is {user.email}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NameForm action={updateNameAction} name={user.name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          {socialNames.length > 0 ? (
            <CardDescription>
              You can also sign in with {socialNames.join(" and ")}.
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {canChangePassword ? (
            <PasswordForm
              action={changePasswordAction}
              changed={password === "changed"}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Your account signs in with{" "}
              {socialNames.join(" or ") || "a linked account"}, so it has no
              password to change.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
