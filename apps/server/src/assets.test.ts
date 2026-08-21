import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { assetFixture } from "./asset-fixture";

const directories: string[] = [];
afterEach(async () =>
  Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  ),
);

test("loads and reports only manifest-listed private media", async () => {
  const { directory, pack } = await assetFixture();
  directories.push(directory);
  expect(pack.heroes([{ id: "miya", name: "Miya" }])[0]).toMatchObject({
    portraitUrl: "/api/v1/media/heroes/miya/portrait",
  });
  expect(pack.status(["miya", "layla"])).toMatchObject({
    enabled: true,
    coverage: { heroes: 2, portraits: 1 },
    missingHeroIds: ["layla"],
  });
  expect(pack.hero("layla", "portrait")).toBeUndefined();
});
