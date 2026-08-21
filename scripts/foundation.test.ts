import { expect, test } from "bun:test";

test("the SHAYYZ package remains private and correctly named", async () => {
  const packageJson = await Bun.file("package.json").json();

  expect(packageJson.name).toBe("shayyz-mlbb-overlay");
  expect(packageJson.private).toBe(true);
  expect(packageJson.license).toBe("SEE LICENSE IN LICENSE");
});
