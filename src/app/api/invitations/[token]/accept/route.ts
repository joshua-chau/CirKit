import { requireUser } from "@/lib/require-user";
import { jsonData, jsonError } from "@/server/api-response";
import { acceptInvitation } from "@/server/groups/invitation.service";

type Context = { params: Promise<{ token: string }> };

/**
 * POST /api/invitations/{token}/accept: join the group.
 * 200 { data: { groupId } }. Accepting twice is fine (same result).
 * 403 if the invitation was sent to another email; 404 unknown token;
 * 409 if it was declined, revoked or has expired.
 */
export async function POST(_request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireUser();
    const { token } = await context.params;
    const groupId = await acceptInvitation(token, user);
    return jsonData({ groupId });
  } catch (error) {
    return jsonError(error);
  }
}
