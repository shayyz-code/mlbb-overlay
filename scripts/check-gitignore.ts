export {};

const requiredIgnored = [
  "node_modules/example",
  "dist/example.js",
  ".env",
  ".DS_Store",
  "runtime/state.json",
  "vendor-assets/private/hero.png",
  "captures/frame.jpg",
  "apps/server/runtime/draft-state.json",
];
const requiredTracked = [
  "bun.lock",
  ".env.example",
  "runtime/.gitkeep",
  "vendor-assets/README.md",
];

async function ignored(path: string): Promise<boolean> {
  const process = Bun.spawn([
    "git",
    "check-ignore",
    "--quiet",
    "--no-index",
    path,
  ]);
  return (await process.exited) === 0;
}

for (const path of requiredIgnored) {
  if (!(await ignored(path)))
    throw new Error(`Expected ${path} to be ignored.`);
}

for (const path of requiredTracked) {
  if (await ignored(path))
    throw new Error(`Expected ${path} to remain trackable.`);
}

console.log("Gitignore check passed.");
