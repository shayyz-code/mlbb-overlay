import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type AdbRunner = (args: string[]) => Promise<CommandResult>;

export interface AndroidAuditOptions {
  packageId: string;
  serial?: string;
  run: AdbRunner;
}

export function parseDevices(output: string): string[] {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts[0] && parts[1] === "device")
    .map((parts) => parts[0] as string);
}

function clean(result: CommandResult): string {
  return result.stdout.trim();
}

function property(result: CommandResult): string | undefined {
  const value = clean(result);
  return result.code === 0 && value ? value : undefined;
}

function access(result: CommandResult) {
  return {
    accessible: result.code === 0,
    detail: (result.code === 0 ? result.stdout : result.stderr)
      .trim()
      .slice(0, 800),
  };
}

export async function auditAndroid(options: AndroidAuditOptions) {
  if (!/^[a-zA-Z0-9._]+$/.test(options.packageId))
    throw new Error("Package ID contains unsupported characters.");
  const devicesResult = await options.run(["devices"]);
  const devices = parseDevices(devicesResult.stdout);
  const serial =
    options.serial ?? (devices.length === 1 ? devices[0] : undefined);
  if (!serial)
    throw new Error(
      devices.length === 0
        ? "No authorized Android device is connected."
        : "Multiple devices are connected; pass --serial.",
    );
  if (!devices.includes(serial))
    throw new Error(`Android device is not online: ${serial}`);

  const adb = (args: string[]) => options.run(["-s", serial, ...args]);
  const shell = (...args: string[]) => adb(["shell", ...args]);
  const [model, release, sdk, tags, id, playStore, packagePaths, packageInfo] =
    await Promise.all([
      shell("getprop", "ro.product.model"),
      shell("getprop", "ro.build.version.release"),
      shell("getprop", "ro.build.version.sdk"),
      shell("getprop", "ro.build.tags"),
      shell("id"),
      shell("pm", "path", "com.android.vending"),
      shell("pm", "path", options.packageId),
      shell("dumpsys", "package", options.packageId),
    ]);
  const installed =
    packagePaths.code === 0 && clean(packagePaths).includes("package:");
  const versionName = packageInfo.stdout.match(/versionName=([^\s]+)/)?.[1];
  const versionCode = packageInfo.stdout.match(/versionCode=(\d+)/)?.[1];
  const [externalData, externalObb, privateData, screencap, screenrecord] =
    await Promise.all([
      shell("ls", "-la", `/sdcard/Android/data/${options.packageId}`),
      shell("ls", "-la", `/sdcard/Android/obb/${options.packageId}`),
      shell("ls", "-la", `/data/user/0/${options.packageId}`),
      shell("ls", "/system/bin/screencap"),
      shell("ls", "/system/bin/screenrecord"),
    ]);
  const root = /uid=0\(root\)/.test(clean(id));
  const hasPlayStore = playStore.code === 0;

  return {
    capturedAt: new Date().toISOString(),
    packageId: options.packageId,
    device: {
      serial,
      model: property(model),
      androidRelease: property(release),
      sdk: property(sdk),
      buildTags: property(tags),
      root,
      hasPlayStore,
    },
    package: {
      installed,
      versionName,
      versionCode,
      apkPaths: installed
        ? clean(packagePaths)
            .split(/\r?\n/)
            .map((line) => line.replace(/^package:/, ""))
        : [],
    },
    storage: {
      externalData: access(externalData),
      externalObb: access(externalObb),
      privateData: access(privateData),
    },
    capture: {
      screencap: screencap.code === 0,
      screenrecord: screenrecord.code === 0,
    },
    recommendedPath: root
      ? "Audit private app storage locally, then import only selected personal media."
      : hasPlayStore
        ? "Use screen recording first. Play Store system images do not support adb root; test an AOSP AVD separately only if recording is insufficient."
        : "Use screen recording, or run adb root on an AOSP emulator before auditing private storage.",
  };
}

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
}

if (import.meta.main) {
  const adb = argument("--adb") ?? "adb";
  const run: AdbRunner = async (args) => {
    const process = Bun.spawn([adb, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    return { code, stdout, stderr };
  };
  const serial = argument("--serial");
  const report = await auditAndroid({
    packageId: argument("--package") ?? "com.mobile.legends",
    ...(serial ? { serial } : {}),
    run,
  });
  const timestamp = report.capturedAt.replaceAll(/[:.]/g, "-");
  const output = resolve(
    argument("--output") ?? join("captures", "android-audit", timestamp),
  );
  await mkdir(output, { recursive: true });
  const reportPath = join(output, "report.json");
  await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Private Android audit written to ${reportPath}`);
  console.log(report.recommendedPath);
}
