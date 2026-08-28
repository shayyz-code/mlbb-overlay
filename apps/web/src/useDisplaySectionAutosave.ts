import type { DisplayCommand, DisplayState } from "@shayyz/contracts";
import { useEffect, useRef, useState } from "react";
import {
  DisplayCommandError,
  fetchDisplay,
  sendDisplayCommand,
  subscribeToDisplay,
} from "./api";

export type AutosaveState =
  | "saved"
  | "dirty"
  | "saving"
  | "error"
  | "conflict";

export const autosaveLabel: Record<AutosaveState, string> = {
  saved: "Saved",
  dirty: "Waiting to save…",
  saving: "Saving…",
  error: "Save failed",
  conflict: "Save conflict",
};

function equal<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useDisplaySectionAutosave<T>({
  token,
  select,
  command,
  failureMessage,
}: {
  token: string;
  select: (state: DisplayState) => T;
  command: (expectedRevision: number, value: T) => DisplayCommand;
  failureMessage: string;
}) {
  const [display, setDisplay] = useState<DisplayState>();
  const [value, setValue] = useState<T>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<AutosaveState>("saved");
  const displayRef = useRef<DisplayState | undefined>(undefined);
  const valueRef = useRef<T | undefined>(undefined);
  const baselineRef = useRef<T | undefined>(undefined);
  const pendingRef = useRef<T | undefined>(undefined);
  const versionRef = useRef(0);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const conflictRef = useRef(false);

  useEffect(() => {
    const receive = (state: DisplayState) => {
      if (displayRef.current && state.revision < displayRef.current.revision)
        return;
      displayRef.current = state;
      setDisplay(state);
      const next = select(state);
      if (!dirtyRef.current) {
        valueRef.current = next;
        baselineRef.current = next;
        setValue(next);
      } else if (
        baselineRef.current !== undefined &&
        !equal(next, baselineRef.current) &&
        !(savingRef.current && pendingRef.current && equal(next, pendingRef.current))
      ) {
        baselineRef.current = next;
        conflictRef.current = true;
        setStatus("conflict");
        setError("This section changed in another control. Choose which version to keep.");
      }
    };
    void fetchDisplay().then(receive);
    return subscribeToDisplay(receive, setConnected);
  }, [select]);

  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, []);

  useEffect(() => {
    if (
      value === undefined ||
      !dirtyRef.current ||
      savingRef.current ||
      status === "error" ||
      status === "conflict"
    )
      return;
    const timeout = window.setTimeout(async () => {
      const currentDisplay = displayRef.current;
      const currentValue = valueRef.current;
      if (!currentDisplay || currentValue === undefined) return;
      const version = versionRef.current;
      const pending = structuredClone(currentValue);
      savingRef.current = true;
      pendingRef.current = pending;
      setStatus("saving");
      setError("");
      try {
        const saved = await sendDisplayCommand(
          command(currentDisplay.revision, pending),
          token,
        );
        const savedValue = select(saved);
        displayRef.current = saved;
        baselineRef.current = savedValue;
        setDisplay(saved);
        if (conflictRef.current) setStatus("conflict");
        else if (version === versionRef.current) {
          valueRef.current = savedValue;
          dirtyRef.current = false;
          setValue(savedValue);
          setStatus("saved");
        } else setStatus("dirty");
      } catch (reason) {
        if (reason instanceof DisplayCommandError && reason.status === 409) {
          const latest = await fetchDisplay();
          const latestValue = select(latest);
          displayRef.current = latest;
          setDisplay(latest);
          if (
            baselineRef.current !== undefined &&
            equal(latestValue, baselineRef.current)
          )
            setStatus("dirty");
          else {
            baselineRef.current = latestValue;
            conflictRef.current = true;
            setStatus("conflict");
            setError(
              "This section changed in another control. Choose which version to keep.",
            );
          }
        } else {
          setStatus("error");
          setError(reason instanceof Error ? reason.message : failureMessage);
        }
      } finally {
        savingRef.current = false;
        pendingRef.current = undefined;
      }
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [command, failureMessage, select, status, token, value]);

  const edit = (next: T) => {
    valueRef.current = next;
    dirtyRef.current = true;
    versionRef.current += 1;
    setValue(next);
    if (!conflictRef.current && !savingRef.current) {
      setError("");
      setStatus("dirty");
    }
  };
  const retry = () => {
    conflictRef.current = false;
    setError("");
    setStatus("dirty");
  };
  const reload = () => {
    const latest = displayRef.current;
    if (!latest) return;
    const next = select(latest);
    valueRef.current = next;
    baselineRef.current = next;
    dirtyRef.current = false;
    conflictRef.current = false;
    setValue(next);
    setError("");
    setStatus("saved");
  };

  return { connected, display, edit, error, reload, retry, status, value };
}
