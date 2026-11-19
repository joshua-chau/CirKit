import "server-only";

import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { validateImage } from "@/lib/image-validation";

export interface UploadImageInput {
  /** The resource this image belongs to, used to build its R2 object key. */
  source: {
    kind: "users" | "groups" | "items";
    id: string;
  };
  file: File;
}

export interface ReadImageResult {
  body: ReadableStream<Uint8Array>;
  contentType: string;
}

export class StorageError extends Error {
  constructor(
    public readonly code: "NOT_CONFIGURED" | "INVALID_INPUT" | "NOT_FOUND",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StorageError";
  }
}

let storage: { client: S3Client; bucket: string } | undefined;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new StorageError("NOT_CONFIGURED", `Set the ${name} environment variable.`);
  }

  return value;
}

function getStorage() {
  if (storage) {
    return storage;
  }

  const endpoint = getRequiredEnv("R2_ENDPOINT");
  const bucket = getRequiredEnv("R2_BUCKET_NAME");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");

  // Validate the R2 endpoint URL.
  if (!URL.canParse(endpoint) || !/^https?:\/\//i.test(endpoint)) {
    throw new StorageError(
      "NOT_CONFIGURED",
      "R2_ENDPOINT must be a valid HTTP(S) S3 API endpoint.",
    );
  }

  // Initialize on first use so importing this module requires no credentials.
  storage = {
    bucket,
    client: new S3Client({
      endpoint,
      region: "auto",
      credentials: { accessKeyId, secretAccessKey },
      // Use the S3-compatible checksum behavior supported by R2.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
  };

  return storage;
}

function validateObjectKey(objectKey: string): void {
  if (
    typeof objectKey !== "string" ||
    objectKey.trim().length === 0 ||
    Buffer.byteLength(objectKey, "utf8") > 1024
  ) {
    throw new StorageError("INVALID_INPUT", "Provide an object key of 1 to 1024 UTF-8 bytes.");
  }
}

// Returns the prefix for an image key based on its source.
function imageKeyPrefix(source: UploadImageInput["source"]): string {
  const sourceId = encodeURIComponent(source.id).replace(/\./g, "%2E");
  return `${source.kind}/${sourceId}/`;
}

// Checks if an object key belongs to the given source.
export function isImageKeyForSource(
  objectKey: string,
  source: UploadImageInput["source"],
): boolean {
  const prefix = imageKeyPrefix(source);
  return objectKey.startsWith(prefix) && /^[a-z0-9-]+\.[a-z0-9]+$/i.test(objectKey.slice(prefix.length));
}

/**
 * Uploads an image under a unique resource-scoped key.
 * Validates the file before sending it to R2. Callers must check resource
 * permissions before uploading and save the returned objectKey in the database.
 */
export async function uploadImage(
  { source, file }: UploadImageInput,
): Promise<{ objectKey: string }> {
  if (
    !["users", "groups", "items"].includes(source.kind) ||
    typeof source.id !== "string" ||
    source.id.trim().length === 0
  ) {
    throw new StorageError("INVALID_INPUT", "Provide a supported source kind and resource ID.");
  }

  const image = await validateImage(file);
  const objectKey = `${imageKeyPrefix(source)}${randomUUID()}.${image.extension}`;
  validateObjectKey(objectKey);

  const { client, bucket } = getStorage();

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: image.bytes,
    ContentType: image.contentType,
    ContentLength: image.bytes.length,
    CacheControl: "private, no-store",
  }));

  return { objectKey };
}

/**
 * Reads the key stored on an authorized resource's database record.
 * Pass body to new Response(), with contentType as the Content-Type header.
 * Missing images throw StorageError with code NOT_FOUND.
 */
export async function readImage(objectKey: string): Promise<ReadImageResult> {
  validateObjectKey(objectKey);
  const { client, bucket } = getStorage();

  try {
    const result = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    }));

    if (!result.Body) {
      throw new Error("R2 returned an object without a response body.");
    }

    return {
      body: result.Body.transformToWebStream(),
      contentType: result.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    if (error instanceof NoSuchKey) {
      throw new StorageError("NOT_FOUND", "The image was not found.", { cause: error });
    }

    throw error;
  }
}

/**
 * Deletes an authorized resource's old image after its database change succeeds.
 * Deleting an already absent object succeeds, allowing cleanup to be retried.
 * Other R2 errors propagate to the caller.
 */
export async function deleteImage(objectKey: string): Promise<void> {
  validateObjectKey(objectKey);
  const { client, bucket } = getStorage();

  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  }));
}
