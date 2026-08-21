import { existsSync, statSync } from "node:fs";

const roots = [
  ".github",
  "apps",
  "config",
  "docs",
  "packages",
  "scripts",
  "vendor-assets",
  "README.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "NOTICE",
];
const blockedWords = [
  "untuk",
  "fungsi",
  "jika",
  "simpan",
  "tampilan",
  "pengaturan",
  "berhasil",
  "gagal",
];

const glob = new Bun.Glob("**/*.{ts,tsx,css,md,json}");
const failures: string[] = [];

for (const root of roots) {
  if (!existsSync(root)) continue;

  const file = Bun.file(root);
  if (statSync(root).isFile()) {
    const text = (await file.text()).toLowerCase();
    for (const word of blockedWords) {
      if (text.includes(word)) failures.push(`${root}: ${word}`);
    }
    continue;
  }

  for await (const path of glob.scan({
    cwd: root,
    absolute: true,
    onlyFiles: true,
  })) {
    if (path.endsWith("check-english.ts")) continue;
    const text = (await Bun.file(path).text()).toLowerCase();
    for (const word of blockedWords) {
      if (text.includes(word)) failures.push(`${path}: ${word}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Non-English language signals found:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log("English-language check passed.");
