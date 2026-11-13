import { requireUser } from "@/lib/require-user";
import { RequestError } from "@/lib/requests/request-errors";
import { createRequestErrorResponse } from "@/lib/requests/request-error-response";
import { mapRequestRecordToResponse } from "@/lib/requests/request-response-mapper";
import { createRequest } from "@/lib/requests/request-service";
import { validateCreateRequestInput } from "@/lib/requests/request-validation";

/**
 * POST /api/requests
 *
 * Authenticates the user, parses and validates the JSON body,
 * then delegates request creation to the Service.
 * The borrower identity always comes from the authenticated session.
 */
export async function POST(
  httpRequest: Request,
): Promise<Response> {
  try {
    const user = await requireUser();

    let input: unknown;

    try {
      input = await httpRequest.json();
    } catch (error) {
      // Only JSON parsing failures are classified as invalid input here.
      if (error instanceof SyntaxError) {
        throw new RequestError(
          "INVALID_INPUT",
          "The request body must contain valid JSON.",
        );
      }

      throw error;
    }

    const validatedInput = validateCreateRequestInput(input);
    const createdRequest = await createRequest(
      user.id,
      validatedInput,
    );

    const data = mapRequestRecordToResponse(createdRequest);
    const body = {
      data: data,
    };

    const response = Response.json(body, {
      status: 201,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });

    return response;
  } catch (error) {
    const response = createRequestErrorResponse(error);

    return response;
  }
}
