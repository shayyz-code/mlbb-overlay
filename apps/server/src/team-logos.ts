import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { TeamLogoUploadResult } from "@shayyz/contracts";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_FILENAME = /^[a-f0-9]{64}\.(png|jpg|webp)$/;
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

type ImageMimeType = keyof typeof IMAGE_TYPES;

export class LocalImageStore {
  constructor(
    readonly directory: string,
    private readonly mediaPath: string,
    private readonly label: string,
  ) {}

  protected async saveImage(file: File) {
    if (!(file.type in IMAGE_TYPES))
      throw new Error(`${this.label} must be PNG, JPEG, or WebP images.`);
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES)
      throw new Error(`${this.label} must be between 1 byte and 5 MB.`);

    const mimeType = file.type as ImageMimeType;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasExpectedSignature(bytes, mimeType))
      throw new Error("The uploaded file does not match its image type.");

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const filename = `${sha256}.${IMAGE_TYPES[mimeType]}`;
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
      mediaUrl: `${this.mediaPath}/${filename}`,
      sha256,
      mimeType,
    };
  }

  async resolve(
    filename: string,
  ): Promise<{ absolutePath: string; mimeType: ImageMimeType } | null> {
    const match = filename.match(IMAGE_FILENAME);
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

export class TeamLogoStore extends LocalImageStore {
  constructor(directory: string) {
    super(directory, "/api/v1/media/team-logos", "Team logos");
  }

  async save(file: File): Promise<TeamLogoUploadResult> {
    const { mediaUrl: logoUrl, ...result } = await this.saveImage(file);
    return { logoUrl, ...result };
  }
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: ImageMimeType) {
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
