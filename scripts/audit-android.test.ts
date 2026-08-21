import { expect, test } from "bun:test";
import { auditAndroid, parseDevices, type AdbRunner } from "./audit-android";

test("parses only authorized online devices", () => {
  expect(
    parseDevices(
      "List of devices attached\nemulator-5554\tdevice\nphone\tunauthorized\n",
    ),
  ).toEqual(["emulator-5554"]);
});

test("recommends recording for a non-rooted Play Store emulator", async () => {
  const run: AdbRunner = async (args) => {
    const command = args.join(" ");
    if (command === "devices")
      return {
        code: 0,
        stdout: "List of devices attached\nemulator-5554\tdevice\n",
        stderr: "",
      };
    if (command.endsWith("shell id"))
      return { code: 0, stdout: "uid=2000(shell)", stderr: "" };
    if (command.includes("pm path com.android.vending"))
      return {
        code: 0,
        stdout: "package:/system/priv-app/Vending.apk",
        stderr: "",
      };
    if (command.includes("pm path com.mobile.legends"))
      return {
        code: 0,
        stdout: "package:/data/app/base.apk",
        stderr: "",
      };
    return { code: 0, stdout: "available", stderr: "" };
  };
  const report = await auditAndroid({ packageId: "com.mobile.legends", run });
  expect(report.package.installed).toBe(true);
  expect(report.device.root).toBe(false);
  expect(report.recommendedPath).toContain("screen recording first");
});
