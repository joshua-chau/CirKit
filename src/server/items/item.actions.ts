"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { ItemError } from "@/lib/items/item-errors";
import {
  archiveItem,
  createItem,
  createItemAccess,
  deleteItemAccess,
  getMyItem,
  removeItemImage,
  setItemImage,
  updateItem,
} from "@/lib/items/item-service";
import {
  ItemValidationError,
  validateCreateItemInput,
  validateUpdateItemInput,
} from "@/lib/items/item-validation";
import { ImageValidationError } from "@/lib/image-validation";
import { StorageError } from "@/lib/storage";
import { getCurrentUser, requireUser } from "@/server/auth/session";

// Added: Return expected failures to interactive item controls.
type ItemActionFailure = {
  ok: false;
  code: string;
  error: string;
};

export type ItemActionResult =
  | { ok: true; itemId: string }
  | ItemActionFailure;

// Added: Group sharing changes access without returning a listing record.
export type ItemAccessActionResult =
  | { ok: true }
  | ItemActionFailure;

/** Added: Invalidate item views and the request/group views affected by sharing. */
function revalidateItemPages(itemId: string): void {
  const encodedId = encodeURIComponent(itemId);
  const itemPath = "/myitems/" + encodedId;
  revalidatePath("/myitems");
  revalidatePath(itemPath);
  revalidatePath("/dashboard");
  revalidatePath("/borrowing-items");
  revalidatePath("/lending-items");
  revalidatePath("/groups/[groupId]", "page");
}

function validateActionIdentifier(value: unknown, fieldName = "Item ID"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ItemValidationError("Provide a valid " + fieldName + ".");
  }
  const identifier = value.trim();

  return identifier;
}

function createItemActionFailure(error: unknown): ItemActionFailure {
  if (error instanceof ItemValidationError) {
    const result: ItemActionFailure = {
      ok: false,
      code: "INVALID_INPUT",
      error: error.message,
    };

    return result;
  }
  if (error instanceof ImageValidationError) {
    const result: ItemActionFailure = {
      ok: false,
      code: error.code,
      error: error.message,
    };

    return result;
  }
  if (error instanceof StorageError) {
    let message = error.message;
    if (error.code === "NOT_CONFIGURED") {
      message = "Image storage is not configured. Your item record is retained.";
    }
    const result: ItemActionFailure = {
      ok: false,
      code: error.code,
      error: message,
    };

    return result;
  }
  if (error instanceof ItemError) {
    const result: ItemActionFailure = {
      ok: false,
      code: error.code,
      error: error.message,
    };

    return result;
  }

  throw error;
}

/** Added: Archive through a Server Action while keeping all rules in the Service. */
export async function archiveItemAction(itemId: string): Promise<ItemActionResult> {
  const user = await getCurrentUser();
  if (user === null) {
    const result: ItemActionFailure = {
      ok: false,
      code: "UNAUTHENTICATED",
      error: "Please sign in to continue.",
    };

    return result;
  }

  try {
    const validatedId = validateActionIdentifier(itemId);
    const item = await archiveItem(user.id, validatedId);
    revalidateItemPages(item.itemId);
    const result: ItemActionResult = { ok: true, itemId: item.itemId };

    return result;
  } catch (error) {
    const result = createItemActionFailure(error);

    return result;
  }
}

/** Added: Share an owned item from the group's existing selection form. */
export async function shareItemWithGroupAction(
  groupId: string,
  _previousState: ItemAccessActionResult | null,
  formData: FormData,
): Promise<ItemAccessActionResult> {
  const user = await requireUser();
  try {
    requireItemForm(formData);
    const validatedGroupId = validateActionIdentifier(groupId, "Group ID");
    const itemId = formData.get("itemId");
    const validatedItemId = validateActionIdentifier(itemId);
    const access = await createItemAccess(user.id, validatedItemId, validatedGroupId);
    revalidateItemPages(access.itemId);
    const result: ItemAccessActionResult = { ok: true };

    return result;
  } catch (error) {
    const failure = createItemActionFailure(error);
    return failure;
  }
}

/** Added: Revoke group access using the existing Service's business rules. */
export async function unshareItemFromGroupAction(
  groupId: string,
  itemId: string,
): Promise<ItemAccessActionResult> {
  const user = await requireUser();
  try {
    const validatedGroupId = validateActionIdentifier(groupId, "Group ID");
    const validatedItemId = validateActionIdentifier(itemId);
    await deleteItemAccess(user.id, validatedItemId, validatedGroupId);
    revalidateItemPages(validatedItemId);
    const result: ItemAccessActionResult = { ok: true };

    return result;
  } catch (error) {
    const failure = createItemActionFailure(error);
    return failure;
  }
}

function requireItemForm(formData: unknown): asserts formData is FormData {
  if (!(formData instanceof FormData)) {
    throw new ItemValidationError("Provide a valid item form.");
  }
}

/** Added: Create listing data through an Action; photos are a separate retryable step. */
export async function createItemAction(formData: FormData): Promise<ItemActionResult> {
  const user = await getCurrentUser();
  if (user === null) {
    const failure: ItemActionFailure = { ok: false, code: "UNAUTHENTICATED", error: "Please sign in to continue." };
    return failure;
  }
  try {
    requireItemForm(formData);
    const rawInput = {
      itemName: formData.get("itemName"),
      itemDescription: formData.get("itemDescription"),
      itemCategory: formData.get("itemCategory"),
      itemCondition: formData.get("itemCondition"),
    };
    const input = validateCreateItemInput(rawInput);
    const item = await createItem(user.id, input);
    revalidateItemPages(item.itemId);
    const result: ItemActionResult = { ok: true, itemId: item.itemId };

    return result;
  } catch (error) {
    const failure = createItemActionFailure(error);
    return failure;
  }
}

/** Added: Preserve the existing partial listing update capability as an Action. */
export async function updateItemAction(itemId: string, formData: FormData): Promise<ItemActionResult> {
  const user = await getCurrentUser();
  if (user === null) {
    const failure: ItemActionFailure = { ok: false, code: "UNAUTHENTICATED", error: "Please sign in to continue." };
    return failure;
  }
  try {
    const validatedId = validateActionIdentifier(itemId);
    requireItemForm(formData);
    const rawInput = Object.fromEntries(formData);
    const input = validateUpdateItemInput(rawInput);
    const item = await updateItem(user.id, validatedId, input);
    revalidateItemPages(item.itemId);
    const result: ItemActionResult = { ok: true, itemId: item.itemId };

    return result;
  } catch (error) {
    const failure = createItemActionFailure(error);
    return failure;
  }
}

/** Added: Upload multipart image data through an Action with server-side validation. */
export async function setItemImageAction(itemId: string, formData: FormData): Promise<ItemActionResult> {
  const user = await getCurrentUser();
  if (user === null) {
    const failure: ItemActionFailure = { ok: false, code: "UNAUTHENTICATED", error: "Please sign in to continue." };
    return failure;
  }
  try {
    const validatedId = validateActionIdentifier(itemId);
    // Check ownership before parsing or uploading a file.
    await getMyItem(user.id, validatedId);
    requireItemForm(formData);
    const file = formData.get("image");
    if (!(file instanceof File)) {
      throw new ItemValidationError("Provide an image file.");
    }
    const item = await setItemImage(user.id, validatedId, file);
    revalidateItemPages(item.itemId);
    const result: ItemActionResult = { ok: true, itemId: item.itemId };

    return result;
  } catch (error) {
    const failure = createItemActionFailure(error);
    return failure;
  }
}

/** Added: Remove a photo through an Action while retaining its listing. */
export async function removeItemImageAction(itemId: string): Promise<ItemActionResult> {
  const user = await getCurrentUser();
  if (user === null) {
    const failure: ItemActionFailure = { ok: false, code: "UNAUTHENTICATED", error: "Please sign in to continue." };
    return failure;
  }
  try {
    const validatedId = validateActionIdentifier(itemId);
    await removeItemImage(user.id, validatedId);
    revalidateItemPages(validatedId);
    const result: ItemActionResult = { ok: true, itemId: validatedId };

    return result;
  } catch (error) {
    const failure = createItemActionFailure(error);
    return failure;
  }
}
