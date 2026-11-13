export interface CreateItemInput {
  itemName: string;
  itemDescription: string;
  itemCategory: string;
  itemCondition: string;
}

export type UpdateItemInput = Partial<CreateItemInput>;

export function validateUpdateItemInput(input: unknown): UpdateItemInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ItemValidationError("The request body must be a JSON object.");
  }

  const fields = input as Record<string, unknown>;
  const allowedFields = ["itemName", "itemDescription", "itemCategory", "itemCondition"] as const;
  if (Object.keys(fields).some(key => !allowedFields.some(field => field === key))) {
    throw new ItemValidationError("Only listing fields can be edited.");
  }

  const result: UpdateItemInput = {};
  for (const field of allowedFields) {
    if (!Object.hasOwn(fields, field)) continue;
    const value = fields[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ItemValidationError(`${field} must be a non-empty string.`);
    }
    result[field] = value.trim();
  }
  if (Object.keys(result).length === 0) {
    throw new ItemValidationError("Provide at least one listing field to edit.");
  }
  return result;
}

export class ItemValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ItemValidationError";
  }
}

export function validateCreateItemInput(input: unknown): CreateItemInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ItemValidationError("The request body must be a JSON object.");
  }

  const fields = input as Record<string, unknown>;
  function readRequiredString(field: keyof CreateItemInput): string {
    const value = fields[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ItemValidationError(`${field} must be a non-empty string.`);
    }
    return value.trim();
  }

  // Explicitly select listing fields; ignore client-supplied IDs and status.
  return {
    itemName: readRequiredString("itemName"),
    itemDescription: readRequiredString("itemDescription"),
    itemCategory: readRequiredString("itemCategory"),
    itemCondition: readRequiredString("itemCondition"),
  };
}
