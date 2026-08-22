import { mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import {
  DetectorCalibrationSaveSchema,
  type DetectorCalibrationSave,
  type DetectorProfile,
} from "@shayyz/contracts";
import {
  type DetectorProfileStore,
  decodeScreenshot,
  validateDetectorProfile,
  type ScreenshotSource,
} from "@shayyz/detector";

export class DetectorCalibrationService {
  constructor(
    private readonly options: {
      profileStore: DetectorProfileStore;
      emptyFramePath: string;
      screenshotSource: (sourceName: string) => ScreenshotSource;
    },
  ) {}

  load(): Promise<DetectorProfile | null> {
    return this.options.profileStore.load();
  }

  async capture(sourceName: string): Promise<string> {
    const source = this.options.screenshotSource(sourceName);
    await source.connect();
    try {
      const imageData = await source.screenshot();
      if (!imageData.startsWith("data:image/png;base64,"))
        throw new Error("OBS calibration capture must be PNG.");
      return imageData;
    } finally {
      source.close();
    }
  }

  async save(input: DetectorCalibrationSave): Promise<DetectorProfile> {
    const parsed = DetectorCalibrationSaveSchema.parse(input);
    const profile = validateDetectorProfile(parsed.profile);
    const emptyFrame = decodeScreenshot(parsed.emptyFrameData);
    const temporary = `${this.options.emptyFramePath}.tmp`;
    await mkdir(dirname(this.options.emptyFramePath), { recursive: true });
    await Bun.write(temporary, emptyFrame);
    await rename(temporary, this.options.emptyFramePath);
    return this.options.profileStore.save(profile);
  }
}
