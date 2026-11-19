import { redirect } from "next/navigation";

import { DEFAULT_LOGIN_REDIRECT } from "@/lib/routes";

// This route redirects rather than rendering an instant page shell.
export const instant = false;

export default function Home() {
  redirect(DEFAULT_LOGIN_REDIRECT);
}
