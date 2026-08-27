import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import {
  createDefaultDisplayState,
  DisplayCommandSchema,
  DisplayStateSchema,
  type DisplayCommand,
  type DisplayState,
} from "@shayyz/contracts";
import { RevisionConflictError } from "./store";

export class DisplayStore {
  readonly filePath: string;
  #database?: Database;
  #state = createDefaultDisplayState();

  constructor(runtimeDirectory: string) {
    this.filePath = join(runtimeDirectory, "overlay.sqlite");
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    this.#database = new Database(this.filePath, { create: true });
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS display_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        document TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const saved = this.#database
      .query<{ document: string }, []>(
        "SELECT document FROM display_state WHERE id = 1",
      )
      .get();
    if (saved) {
      try {
        this.#state = DisplayStateSchema.parse(JSON.parse(saved.document));
        return;
      } catch {
        this.#database.exec("DELETE FROM display_state WHERE id = 1");
      }
    }
    this.persist();
  }

  get state(): DisplayState {
    return structuredClone(this.#state);
  }

  dispatch(input: DisplayCommand): DisplayState {
    const command = DisplayCommandSchema.parse(input);
    if (command.expectedRevision !== this.#state.revision)
      throw new RevisionConflictError(this.#state.revision);
    const now = new Date().toISOString();
    this.#state = DisplayStateSchema.parse({
      ...(command.type === "set-display" ? command.display : this.#state),
      cueRevision:
        command.type === "cue"
          ? this.#state.cueRevision + 1
          : command.display.cueRevision,
      revision: this.#state.revision + 1,
      updatedAt: now,
    });
    this.persist();
    return this.state;
  }

  close(): void {
    this.#database?.close();
  }

  private persist(): void {
    if (!this.#database) throw new Error("Display store is not initialized.");
    const document = JSON.stringify(this.#state);
    this.#database.transaction(() => {
      this.#database
        ?.query(
          `INSERT INTO display_state (id, document, updated_at)
           VALUES (1, ?1, ?2)
           ON CONFLICT(id) DO UPDATE SET
             document = excluded.document,
             updated_at = excluded.updated_at`,
        )
        .run(document, this.#state.updatedAt);
    })();
  }
}
