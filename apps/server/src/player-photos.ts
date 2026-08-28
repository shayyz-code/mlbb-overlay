import type { PlayerPhotoUploadResult } from "@shayyz/contracts";
import { LocalImageStore } from "./team-logos";

export class PlayerPhotoStore extends LocalImageStore {
  constructor(directory: string) {
    super(directory, "/api/v1/media/player-photos", "Player photos");
  }

  async save(file: File): Promise<PlayerPhotoUploadResult> {
    const { mediaUrl: photoUrl, ...result } = await this.saveImage(file);
    return { photoUrl, ...result };
  }
}
