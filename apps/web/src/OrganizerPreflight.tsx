import type {
  AssetPackStatus,
  DisplayState,
  DraftState,
} from "@shayyz/contracts";

type PreflightState = "ready" | "attention" | "info";

function PreflightItem({
  state,
  label,
  detail,
  href,
}: {
  state: PreflightState;
  label: string;
  detail: string;
  href?: string | undefined;
}) {
  return (
    <li className={`preflight-item ${state}`}>
      <i aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      {href && (
        <a className="preflight-fix" href={href}>
          Fix
        </a>
      )}
    </li>
  );
}

export function OrganizerPreflight({
  connected,
  draft,
  display,
  assets,
}: {
  connected: boolean;
  draft: DraftState;
  display: DisplayState;
  assets: AssetPackStatus | undefined;
}) {
  const activeMatch = display.schedule.find(
    (match) => match.id === display.activeMatchId,
  );
  const plannedMatches = display.schedule.filter(
    (match) => match.status !== "complete",
  ).length;
  const teamsReady = display.teams.length >= 2;
  const mediaReady = Boolean(
    assets?.enabled && assets.coverage.portraits === assets.coverage.heroes,
  );
  const ready = connected && teamsReady && mediaReady;
  return (
    <section className="organizer-preflight" aria-labelledby="preflight-title">
      <header>
        <div>
          <small>Verified by this app</small>
          <h2 id="preflight-title">Preflight</h2>
        </div>
        <strong className={ready ? "ready" : "attention"}>
          {ready ? "Ready" : "Needs attention"}
        </strong>
      </header>
      <ul>
        <PreflightItem
          state={connected ? "ready" : "attention"}
          label="Local sync"
          detail={
            connected ? "Live updates connected" : "Reconnecting to the server"
          }
        />
        <PreflightItem
          state={teamsReady ? "ready" : "attention"}
          label="Teams"
          detail={`${display.teams.length} managed ${display.teams.length === 1 ? "team" : "teams"}`}
          href={teamsReady ? undefined : "/control/teams"}
        />
        <PreflightItem
          state={plannedMatches > 0 ? "ready" : "info"}
          label="Match plan"
          detail={
            plannedMatches > 0
              ? `${plannedMatches} upcoming ${plannedMatches === 1 ? "match" : "matches"}`
              : "No schedule; Quick Series remains available"
          }
          href={plannedMatches > 0 ? undefined : "/control/matches"}
        />
        <PreflightItem
          state={mediaReady ? "ready" : "attention"}
          label="Local media"
          detail={
            assets?.enabled
              ? `${assets.coverage.portraits}/${assets.coverage.heroes} portraits loaded`
              : "Private media pack is not loaded"
          }
        />
        <PreflightItem
          state={activeMatch?.status === "live" ? "ready" : "info"}
          label="Series"
          detail={
            activeMatch?.status === "live"
              ? `Game ${display.scoreboard.gameNumber} · score ${draft.scoreboard.scores.blue}–${draft.scoreboard.scores.red}`
              : activeMatch?.status === "complete"
                ? "Completed; final result remains available"
                : "No series active"
          }
        />
      </ul>
      <p>
        OBS source visibility and placement must be checked manually. The
        optional visual detector does not block manual operation.
      </p>
    </section>
  );
}
