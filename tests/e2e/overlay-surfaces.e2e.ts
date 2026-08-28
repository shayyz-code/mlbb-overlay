import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const routes = [
  "draft",
  "scoreboard",
  "match",
  "schedule",
  "countdown",
  "ticker",
  "roster",
  "result",
] as const;

const productionPanels: Record<(typeof routes)[number], string> = {
  draft:
    ".compact-ban-slot, .compact-pick-media, .compact-pick-name, .compact-team-logo, .compact-draft-center",
  scoreboard:
    ".broadcast-logo, .compact-team, .compact-score, .compact-right-extension, .native-hud-wrapper, .native-hud-wrapper > span",
  match: ".match-team, .broadcast-logo",
  schedule: ".schedule-list article, .broadcast-logo",
  countdown: ".countdown-card",
  ticker: ".ticker-surface",
  roster: ".roster-team .broadcast-logo, .roster-team > div, .roster-cards article",
  result: ".result-teams > span, .broadcast-logo",
};

async function saveDisplay(request: APIRequestContext, display: unknown) {
  const current = await (await request.get("/api/v1/display")).json();
  return request.post("/api/v1/display/commands", {
    data: {
      type: "set-display",
      expectedRevision: current.revision,
      display,
    },
  });
}

async function expectTransparentCanvas(page: Page, route: string) {
  const selector = route === "draft" ? ".compact-draft-canvas" : ".display-canvas";
  const canvas = page.locator(selector);
  await expect(canvas).toHaveCount(1);
  await expect
    .poll(async () => canvas.evaluate((element) => getComputedStyle(element).width))
    .toBe("1920px");
  await expect(canvas).toHaveCSS("height", "1080px");
  await expect(canvas).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
}

test("keeps every OBS surface transparent, fitted, and borderless", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const original = await (await request.get("/api/v1/display")).json();
  const {
    revision: _revision,
    updatedAt: _updatedAt,
    ...originalSettings
  } = original;
  const configured = structuredClone(originalSettings);
  const [blue, red] = configured.teams;
  expect(blue).toBeTruthy();
  expect(red).toBeTruthy();
  configured.schedule = [
    {
      id: "overlay-regression-match",
      scheduledAt: null,
      stage: "Group Stage",
      round: "Round 1",
      bestOf: 3,
      blueTeamId: blue.id,
      redTeamId: red.id,
      scores: { blue: 0, red: 0 },
      status: "scheduled",
    },
  ];
  configured.activeMatchId = "overlay-regression-match";
  configured.event = {
    ...configured.event,
    name: "Yangon Invitational",
  };
  configured.ticker = {
    ...configured.ticker,
    enabled: true,
    messages: ["Overlay regression preview"],
  };
  expect((await saveDisplay(request, configured)).ok()).toBeTruthy();

  try {
    for (const route of routes) {
      await page.goto(`/overlay/${route}`);
      await expectTransparentCanvas(page, route);
      const panels = page.locator(productionPanels[route]);
      await expect.poll(() => panels.count()).toBeGreaterThan(0);
      const borderWidths = await panels.evaluateAll((elements) =>
        elements.flatMap((element) => {
          const style = getComputedStyle(element);
          return [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ];
        }),
      );
      expect(new Set(borderWidths)).toEqual(new Set(["0px"]));
    }

    await page.goto("/overlay/draft");
    await expect(page.locator(".compact-draft-strip")).toHaveCSS("width", "1920px");
    await expect(page.locator(".compact-draft-strip")).toHaveCSS("height", "367px");
    await expect(page.getByText("Yangon Invitational", { exact: true })).toBeVisible();
    await expect(page.locator(".compact-pick-media > span")).toHaveCount(0);
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByText("Live", { exact: true })).toHaveCount(0);

    await page.goto("/overlay/ticker");
    await expect(page.getByText("UPDATE", { exact: true })).toBeVisible();
    await expect(page.getByText("LIVE UPDATE", { exact: true })).toHaveCount(0);

    await page.goto("/overlay/scoreboard");
    const scoreboard = page.locator(".display-compact-scoreboard");
    await expect(scoreboard).toHaveCSS("width", "1504px");
    await expect(scoreboard).toHaveCSS("height", "120px");
    const scoreboardBounds = await scoreboard.boundingBox();
    expect(scoreboardBounds).not.toBeNull();
    expect((scoreboardBounds?.x ?? 0) + (scoreboardBounds?.width ?? 0)).toBe(1920);

    await page.goto("/overlay/roster");
    await expect(page.getByText("EXP Lane", { exact: true })).toBeAttached();
    await expect(page.locator(".roster-role-icon.is-hero")).toHaveCount(5);
  } finally {
    expect((await saveDisplay(request, originalSettings)).ok()).toBeTruthy();
  }
});
