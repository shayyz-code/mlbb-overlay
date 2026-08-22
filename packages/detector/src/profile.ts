import { mkdir, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DetectorProfileSchema,
  type DetectorProfile,
  type PixelRect,
} from "@shayyz/contracts";
import sharp from "sharp";
import {
  describeImage,
  type ImageDescriptor,
  type ReferenceDescriptor,
} from ".";

const heroIdPattern = /^[a-z0-9-]+$/;

export function validateDetectorProfile(value: unknown): DetectorProfile {
  const profile = DetectorProfileSchema.parse(value);
  const keys = new Set<string>();
  for (const item of profile.slots) {
    const key = `${item.side}:${item.kind}:${item.slot}`;
    if (keys.has(key)) throw new Error(`Duplicate detector slot: ${key}`);
    keys.add(key);
    if (
      item.rect.x + item.rect.width > profile.frame.width ||
      item.rect.y + item.rect.height > profile.frame.height
    )
      throw new Error(`Detector slot is outside the frame: ${key}`);
  }
  return profile;
}

export class DetectorProfileStore {
  constructor(readonly filePath: string) {}

  async load(): Promise<DetectorProfile | null> {
    try {
      return validateDetectorProfile(
        JSON.parse(await readFile(this.filePath, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(value: unknown): Promise<DetectorProfile> {
    const profile = validateDetectorProfile(value);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await Bun.write(temporary, `${JSON.stringify(profile, null, 2)}\n`);
    await rename(temporary, this.filePath);
    return profile;
  }
}

export async function describeEncodedImage(
  input: Uint8Array,
  rect?: PixelRect,
): Promise<ImageDescriptor> {
  const pipeline = sharp(input, { failOn: "error" });
  if (rect)
    pipeline.extract({
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
    });
  const { data, info } = await pipeline
    .toColorspace("srgb")
    .removeAlpha()
    .resize(32, 32, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error("Expected normalized RGB pixels.");
  return describeImage({
    width: info.width,
    height: info.height,
    data: new Uint8Array(data),
  });
}

export async function loadReferenceDescriptors(
  directory: string,
  heroIds: string[],
): Promise<{ references: ReferenceDescriptor[]; missing: string[] }> {
  const references: ReferenceDescriptor[] = [];
  const missing: string[] = [];
  for (const heroId of heroIds) {
    if (!heroIdPattern.test(heroId)) throw new Error(`Invalid hero ID: ${heroId}`);
    try {
      const descriptor = await describeEncodedImage(
        new Uint8Array(await readFile(join(directory, `${heroId}.png`))),
      );
      references.push({ heroId, descriptor });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        missing.push(heroId);
        continue;
      }
      throw new Error(`Unable to load detector reference: ${heroId}`, {
        cause: error,
      });
    }
  }
  return { references, missing };
}

export function isAutomaticProfileReady(
  profile: DetectorProfile,
  loadedReferences: number,
  expectedReferences = 133,
): boolean {
  return (
    loadedReferences === expectedReferences &&
    profile.validation.referenceCount === expectedReferences &&
    profile.validation.validatedAt !== null
  );
}
