import { requireUser } from "@/lib/require-user";
import { jsonData, jsonError } from "@/server/api-response";
import { getPendingInvitationsForEmail } from "@/server/groups/group.queries";

/**
 * GET /api/invitations: the signed-in user's invitation inbox (pending,
 * unexpired invitations sent to their email), newest first.
 *
 * 200 { data: [{ token, createdAt, expiresAt,
 *                group: { id, name, image, _count: { members } },
 *                invitedBy: { name } }] }
 *
 * Accept / decline with POST /api/invitations/{token}/accept | /decline.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    return jsonData(await getPendingInvitationsForEmail(user.email));
  } catch (error) {
    return jsonError(error);
  }
}
