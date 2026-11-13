import { redirect } from "next/navigation";

import { DEFAULT_LOGIN_REDIRECT } from "@/lib/routes";

export default function Home() {
  redirect(DEFAULT_LOGIN_REDIRECT);
}
