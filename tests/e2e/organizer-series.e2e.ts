import { expect, test } from "@playwright/test";

test("runs a reviewed series without destructive match selection", async ({
  page,
  request,
}) => {
  const savedDisplay = await (await request.get("/api/v1/display")).json();
  const { revision, updatedAt: _updatedAt, ...display } = savedDisplay;
  const [blue, red] = display.teams;
  expect(blue).toBeTruthy();
  expect(red).toBeTruthy();
  display.activeMatchId = null;
  display.schedule = [
    {
      id: "e2e-series",
      scheduledAt: null,
      stage: "Finals",
      round: "Grand Final",
      bestOf: 3,
      blueTeamId: blue.id,
      redTeamId: red.id,
      scores: { blue: 0, red: 0 },
      status: "scheduled",
    },
  ];
  const setup = await request.post("/api/v1/display/commands", {
    data: { type: "set-display", expectedRevision: revision, display },
  });
  expect(setup.ok()).toBeTruthy();

  await page.goto("/control/live");
  await expect(page.getByRole("heading", { name: "Preflight" })).toBeVisible();
  const draftBeforeSelection = await (
    await request.get("/api/v1/draft")
  ).json();
  await page.getByLabel("Planned match").selectOption("e2e-series");
  await expect(page.getByRole("button", { name: "Start Series" })).toBeVisible();
  const draftAfterSelection = await (
    await request.get("/api/v1/draft")
  ).json();
  expect(draftAfterSelection.revision).toBe(draftBeforeSelection.revision);

  await page.getByRole("button", { name: "Start Series" }).click();
  await expect(page.getByText("Live series", { exact: true })).toBeVisible();
  await expect(page.getByText("Game 1 · 0–0 · Best of 3")).toBeVisible();

  await page.getByRole("button", { name: "Aamon Select" }).click();
  await expect.poll(async () => (await (await request.get("/api/v1/draft")).json()).timer)
    .toMatchObject({ running: true, remainingSeconds: 50 });
  await page.getByRole("button", { name: "Increase Blue Team score" }).click();
  await page.getByRole("button", { name: "Next Game", exact: true }).click();
  await expect(page.getByText("Game 2 · 1–0 · Best of 3")).toBeVisible();
  await expect.poll(async () => await (await request.get("/api/v1/draft")).json())
    .toMatchObject({ phaseIndex: 0, scoreboard: { scores: { blue: 1, red: 0 } } });

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Complete Series" }).click();
  await expect(page.getByText("Completed; final result remains available")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next Game", exact: true }),
  ).toHaveCount(0);
});
