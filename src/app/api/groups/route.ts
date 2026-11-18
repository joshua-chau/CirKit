import { requireUser } from "@/lib/require-user";
import { jsonData, jsonError } from "@/server/api-response";
import { getUserGroups } from "@/server/groups/group.queries";

/**
 * GET /api/groups: the groups the signed-in user belongs to, newest
 * membership first, for the dashboard's group sidebar.
 *
 * 200 { data: [{ id, name, description, image, memberCount, role }] }
 *   image: public URL of the group picture, or null (show initials).
 *   role:  "OWNER" | "MEMBER" (the viewer's role in that group).
 * 401 { error: { code: "UNAUTHENTICATED", message } }
 *
 * Server Components can call getUserGroups(user.id) directly instead.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    return jsonData(await getUserGroups(user.id));
  } catch (error) {
    return jsonError(error);
  }
}
