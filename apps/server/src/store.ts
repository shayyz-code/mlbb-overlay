import { mkdir, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  applySelection,
  createDefaultDraftState,
  type DraftCommand,
  DraftCommandSchema,
  type DraftState,
  DraftStateSchema,
} from "@shayyz/contracts";

export class RevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(
      `Expected revision does not match current revision ${currentRevision}.`,
    );
  }
}

export class DraftStore {
  readonly filePath: string;
  #state: DraftState;
  #past: DraftState[] = [];

  constructor(
    runtimeDirectory: string,
    initialState = createDefaultDraftState(),
  ) {
    this.filePath = join(runtimeDirectory, "draft-state.json");
    this.#state = DraftStateSchema.parse(initialState);
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const saved = JSON.parse(await readFile(this.filePath, "utf8"));
      const migratedTimer = saved.timer?.durationSeconds !== 50;
      if (migratedTimer)
        saved.timer = {
          ...saved.timer,
          durationSeconds: 50,
          remainingSeconds: Math.min(50, saved.timer?.remainingSeconds ?? 50),
        };
      this.#state = DraftStateSchema.parse(saved);
      if (
        migratedTimer ||
        saved.presentation === undefined ||
        saved.scoreboard === undefined
      )
        await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        await rename(this.filePath, backup).catch(() => undefined);
      }
      await this.persist();
    }
  }

  get state(): DraftState {
    return structuredClone(this.#state);
  }

  async dispatch(input: DraftCommand): Promise<DraftState> {
    const command = DraftCommandSchema.parse(input);
    if (command.expectedRevision !== this.#state.revision) {
      throw new RevisionConflictError(this.#state.revision);
    }

    if (command.type === "undo") {
      const previous = this.#past.pop();
      if (!previous) return this.state;
      if (previous.phaseIndex !== this.#state.phaseIndex)
        previous.timer = {
          durationSeconds: 50,
          remainingSeconds: 50,
          running: false,
          startedAt: null,
        };
      this.#state = this.withRevision(previous);
      await this.persist();
      return this.state;
    }

    this.#past.push(this.state);
    if (this.#past.length > 100) this.#past.shift();

    switch (command.type) {
      case "select-hero":
        this.#state = applySelection(this.#state, {
          heroId: command.heroId,
          source: command.source,
          ...(command.confidence === undefined
            ? {}
            : { confidence: command.confidence }),
        });
        break;
      case "reset": {
        const reset = createDefaultDraftState();
        reset.teams = structuredClone(this.#state.teams);
        reset.presentation = structuredClone(this.#state.presentation);
        reset.scoreboard = structuredClone(this.#state.scoreboard);
        reset.revision = this.#state.revision;
        this.#state = this.withRevision(reset);
        break;
      }
      case "swap-sides": {
        const next = this.state;
        [next.teams.blue, next.teams.red] = [next.teams.red, next.teams.blue];
        [next.selections.blue, next.selections.red] = [
          next.selections.red,
          next.selections.blue,
        ];
        [next.scoreboard.scores.blue, next.scoreboard.scores.red] = [
          next.scoreboard.scores.red,
          next.scoreboard.scores.blue,
        ];
        this.#state = this.withRevision(next);
        break;
      }
      case "activate-match": {
        const reset = createDefaultDraftState();
        reset.teams = { blue: command.blue, red: command.red };
        reset.presentation = structuredClone(this.#state.presentation);
        reset.revision = this.#state.revision;
        this.#state = this.withRevision(reset);
        break;
      }
      case "set-team": {
        const next = this.state;
        next.teams[command.side] = command.team;
        this.#state = this.withRevision(next);
        break;
      }
      case "start-timer": {
        const next = this.state;
        next.timer.remainingSeconds = 50;
        next.timer.running = true;
        next.timer.startedAt = Date.now();
        this.#state = this.withRevision(next);
        break;
      }
      case "pause-timer": {
        const next = this.state;
        if (next.timer.running && next.timer.startedAt !== null) {
          const elapsed = Math.floor(
            (Date.now() - next.timer.startedAt) / 1000,
          );
          next.timer.remainingSeconds = Math.max(
            0,
            next.timer.remainingSeconds - elapsed,
          );
        }
        next.timer.running = false;
        next.timer.startedAt = null;
        this.#state = this.withRevision(next);
        break;
      }
      case "set-scoreboard-score": {
        const next = this.state;
        next.scoreboard.scores[command.side] = command.score;
        this.#state = this.withRevision(next);
        break;
      }
      case "reset-scoreboard": {
        const next = this.state;
        next.scoreboard.scores = { blue: 0, red: 0 };
        this.#state = this.withRevision(next);
        break;
      }
      case "set-presentation": {
        const next = this.state;
        next.presentation = command.presentation;
        this.#state = this.withRevision(next);
        break;
      }
    }

    await this.persist();
    return this.state;
  }

  private withRevision(state: DraftState): DraftState {
    return DraftStateSchema.parse({
      ...state,
      revision: this.#state.revision + 1,
      updatedAt: new Date().toISOString(),
    });
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.filePath}.tmp`;
    await Bun.write(temporaryPath, `${JSON.stringify(this.#state, null, 2)}\n`);
    await rename(temporaryPath, this.filePath);
  }
}
