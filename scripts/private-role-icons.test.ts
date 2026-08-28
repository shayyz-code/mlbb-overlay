import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssetPackManifestSchema } from "../packages/contracts/src/index";
import { installRoleIcons, roleIds } from "./private-role-icons";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

test("installs five checksummed private role icons atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-roles-"));
  directories.push(directory);
  const source = join(directory, "source");
  const pack = join(directory, "pack");
  await mkdir(source);
  await mkdir(pack);
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  await Promise.all(
    roleIds.map((role) => writeFile(join(source, `${role}.png`), png)),
  );
  await Bun.write(
    join(pack, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      pack: {
        id: "test-pack",
        displayName: "Test pack",
        usage: "personal-local-no-redistribution",
        createdAt: new Date().toISOString(),
      },
      heroes: {},
      cues: {},
    }),
  );
  const roles = await installRoleIcons({
    source,
    manifestPath: join(pack, "manifest.json"),
    attribution: "Local test source",
  });
  expect(Object.keys(roles)).toEqual(roleIds);
  const saved = AssetPackManifestSchema.parse(
    JSON.parse(await readFile(join(pack, "manifest.json"), "utf8")),
  );
  expect(saved.roles.exp?.path).toMatch(/^roles\/exp-[a-f0-9]{12}\.png$/);
  expect(
    await Bun.file(join(pack, "roles/provenance.json")).exists(),
  ).toBeTrue();
});

test("rejects a mislabeled role icon before changing the manifest", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shayyz-roles-invalid-"));
  directories.push(directory);
  const source = join(directory, "source");
  const pack = join(directory, "pack");
  await mkdir(source);
  await mkdir(pack);
  await Promise.all(
    roleIds.map((role) => writeFile(join(source, `${role}.png`), "bad")),
  );
  const original = JSON.stringify({
    schemaVersion: 1,
    pack: {
      id: "test-pack",
      displayName: "Test pack",
      usage: "personal-local-no-redistribution",
      createdAt: new Date().toISOString(),
    },
    heroes: {},
    cues: {},
  });
  await Bun.write(join(pack, "manifest.json"), original);
  await expect(
    installRoleIcons({
      source,
      manifestPath: join(pack, "manifest.json"),
      attribution: "Local test source",
    }),
  ).rejects.toThrow("Role icon must be a PNG");
  expect(await readFile(join(pack, "manifest.json"), "utf8")).toBe(original);
});
