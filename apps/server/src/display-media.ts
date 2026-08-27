import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { DisplayMediaUploadResult } from "@shayyz/contracts";

const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const MEDIA_FILENAME = /^[a-f0-9]{64}\.(png|jpg|webp)$/;
const MEDIA_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
type MediaMimeType = keyof typeof MEDIA_TYPES;

export class DisplayMediaStore {
  constructor(readonly directory: string) {}

  async save(file: File): Promise<DisplayMediaUploadResult> {
    if (!(file.type in MEDIA_TYPES))
      throw new Error("Display media must be PNG, JPEG, or WebP.");
    if (file.size === 0 || file.size > MAX_MEDIA_BYTES)
      throw new Error("Display media must be between 1 byte and 15 MB.");
    const mimeType = file.type as MediaMimeType;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasExpectedSignature(bytes, mimeType))
      throw new Error("The uploaded file does not match its image type.");

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const filename = `${sha256}.${MEDIA_TYPES[mimeType]}`;
    await mkdir(this.directory, { recursive: true });
    const temporaryPath = join(
      this.directory,
      `.${filename}.${randomUUID()}.tmp`,
    );
    await Bun.write(temporaryPath, bytes);
    try {
      await rename(temporaryPath, join(this.directory, filename));
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
    return {
      mediaUrl: `/api/v1/media/displays/${filename}`,
      sha256,
      mimeType,
    };
  }

  async resolve(
    filename: string,
  ): Promise<{ absolutePath: string; mimeType: MediaMimeType } | null> {
    const match = filename.match(MEDIA_FILENAME);
    if (!match) return null;
    const absolutePath = join(this.directory, filename);
    try {
      if (!(await stat(absolutePath)).isFile()) return null;
    } catch {
      return null;
    }
    const mimeType =
      match[1] === "png"
        ? "image/png"
        : match[1] === "jpg"
          ? "image/jpeg"
          : "image/webp";
    return { absolutePath, mimeType };
  }
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: MediaMimeType) {
  if (mimeType === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    );
  if (mimeType === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}
