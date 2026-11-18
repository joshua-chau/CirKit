import { requireUser } from "@/lib/require-user";
import { jsonData, jsonError } from "@/server/api-response";
import { declineInvitation } from "@/server/groups/invitation.service";

type Context = { params: Promise<{ token: string }> };

/**
 * POST /api/invitations/{token}/decline: decline the invitation.
 * 200 { data: null }. Declining twice is fine.
 * 403 if it was sent to another email; 404 unknown token; 409 if no
 * longer pending (accepted, revoked or expired).
 */
export async function POST(_request: Request, context: Context): Promise<Response> {
  try {
    const user = await requireUser();
    const { token } = await context.params;
    await declineInvitation(token, user);
    return jsonData(null);
  } catch (error) {
    return jsonError(error);
  }
}
