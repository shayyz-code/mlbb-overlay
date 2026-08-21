import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  AssetPackManifestSchema,
  type AssetFile,
  type AssetPackManifest,
  type AssetPackStatus,
  type Hero,
  type HeroMedia,
} from "@shayyz/contracts";

export type HeroMediaKind = keyof HeroMedia;
export type CueKind = keyof AssetPackManifest["cues"];

export interface LoadedAsset extends AssetFile {
  absolutePath: string;
}

export class LocalAssetPack {
  private constructor(
    readonly manifest: AssetPackManifest,
    private readonly files: Map<string, LoadedAsset>,
  ) {}

  static async load(
    manifestPath: string,
    required = false,
  ): Promise<LocalAssetPack | undefined> {
    if (!(await Bun.file(manifestPath).exists())) {
      if (required)
        throw new Error(`Asset manifest not found: ${manifestPath}`);
      return undefined;
    }
    const manifest = AssetPackManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    const root = await realpath(dirname(resolve(manifestPath)));
    const files = new Map<string, LoadedAsset>();
    for (const [key, file] of LocalAssetPack.entries(manifest)) {
      const candidate = resolve(root, file.path);
      if ((await lstat(candidate)).isSymbolicLink())
        throw new Error(`Asset symbolic links are not allowed: ${file.path}`);
      const absolutePath = await realpath(candidate);
      const pathFromRoot = relative(root, absolutePath);
      if (
        pathFromRoot.startsWith("..") ||
        resolve(root, pathFromRoot) !== absolutePath
      )
        throw new Error(`Asset escapes its pack: ${file.path}`);
      files.set(key, { ...file, absolutePath });
    }
    return new LocalAssetPack(manifest, files);
  }

  heroes(catalog: Hero[]): Hero[] {
    return catalog.map((hero) => {
      const media = this.manifest.heroes[hero.id];
      return {
        ...hero,
        ...(media?.portrait
          ? { portraitUrl: this.heroUrl(hero.id, "portrait") }
          : {}),
        ...(media?.poster
          ? { posterUrl: this.heroUrl(hero.id, "poster") }
          : {}),
        ...(media?.voice ? { voiceUrl: this.heroUrl(hero.id, "voice") } : {}),
      };
    });
  }

  status(heroIds: string[]): AssetPackStatus {
    const media = Object.values(this.manifest.heroes);
    const cueUrls = Object.fromEntries(
      Object.keys(this.manifest.cues).map((id) => [
        id,
        `/api/v1/media/cues/${id}`,
      ]),
    );
    return {
      enabled: true,
      packId: this.manifest.pack.id,
      displayName: this.manifest.pack.displayName,
      ...(this.manifest.pack.gameBuild
        ? { gameBuild: this.manifest.pack.gameBuild }
        : {}),
      coverage: {
        heroes: heroIds.length,
        portraits: media.filter((hero) => hero.portrait).length,
        posters: media.filter((hero) => hero.poster).length,
        voices: media.filter((hero) => hero.voice).length,
      },
      missingHeroIds: heroIds.filter(
        (id) => !this.manifest.heroes[id]?.portrait,
      ),
      cueUrls,
    };
  }

  hero(id: string, kind: HeroMediaKind): LoadedAsset | undefined {
    return this.files.get(`hero:${id}:${kind}`);
  }

  cue(id: string): LoadedAsset | undefined {
    return this.files.get(`cue:${id}`);
  }

  private heroUrl(id: string, kind: HeroMediaKind): string {
    return `/api/v1/media/heroes/${id}/${kind}`;
  }

  private static entries(
    manifest: AssetPackManifest,
  ): Array<[string, AssetFile]> {
    const result: Array<[string, AssetFile]> = [];
    for (const [id, media] of Object.entries(manifest.heroes)) {
      for (const kind of ["portrait", "poster", "voice"] as const) {
        const file = media[kind];
        if (file) result.push([`hero:${id}:${kind}`, file]);
      }
    }
    for (const [id, file] of Object.entries(manifest.cues)) {
      if (file) result.push([`cue:${id}`, file]);
    }
    return result;
  }
}

export function emptyAssetStatus(heroIds: string[]): AssetPackStatus {
  return {
    enabled: false,
    coverage: {
      heroes: heroIds.length,
      portraits: 0,
      posters: 0,
      voices: 0,
    },
    missingHeroIds: heroIds,
    cueUrls: {},
  };
}
