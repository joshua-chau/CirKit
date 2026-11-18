import "server-only";

import sharp from "sharp";

export const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

const imageFormats = new Map([
  ["image/jpeg", { format: "jpeg", extension: "jpg" }],
  ["image/png", { format: "png", extension: "png" }],
  ["image/webp", { format: "webp", extension: "webp" }],
]);

export interface ValidatedImage {
  bytes: Buffer;
  contentType: string;
  extension: string;
}

export class ImageValidationError extends Error {
  constructor(
    public readonly code:
      | "INVALID_FILE"
      | "IMAGE_TOO_LARGE"
      | "UNSUPPORTED_IMAGE_TYPE"
      | "INVALID_IMAGE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ImageValidationError";
  }
}

/** Validates a FormData file and returns the original bytes ready for upload. */
export async function validateImage(input: unknown): Promise<ValidatedImage> {
  if (!(input instanceof File) || input.size === 0) {
    throw new ImageValidationError("INVALID_FILE", "Provide a non-empty image file.");
  }

  // Check size before reading the file into memory.
  if (input.size > MAX_IMAGE_SIZE_BYTES) {
    throw new ImageValidationError("IMAGE_TOO_LARGE", "Images must be at most 2 MiB.");
  }

  const imageFormat = imageFormats.get(input.type);

  if (!imageFormat) {
    throw new ImageValidationError(
      "UNSUPPORTED_IMAGE_TYPE",
      "Only JPEG, PNG, and WebP images are supported.",
    );
  }

  const bytes = Buffer.from(await input.arrayBuffer());

  try {
    const image = sharp(bytes, { animated: true, failOn: "warning" });
    const metadata = await image.metadata();

    if (metadata.format !== imageFormat.format) {
      throw new ImageValidationError(
        "INVALID_IMAGE",
        "The image contents must match the declared file type.",
      );
    }

    // Decode the pixels too, so a valid header alone cannot pass validation.
    await image.stats();
  } catch (error) {
    if (error instanceof ImageValidationError) {
      throw error;
    }

    throw new ImageValidationError(
      "INVALID_IMAGE",
      "The image file is damaged or cannot be decoded.",
      { cause: error },
    );
  }

  return {
    bytes,
    contentType: input.type,
    extension: imageFormat.extension,
  };
}
