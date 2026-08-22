import {
  STANDARD_TEN_BAN_FORMAT,
  type DetectorProfile,
  type DetectorSlot,
} from "@shayyz/contracts";
import { useState, type PointerEvent } from "react";
import { captureDetectorFrame, saveDetectorCalibration } from "./api";

const phases = STANDARD_TEN_BAN_FORMAT.phases;
const key = (slot: Pick<DetectorSlot, "side" | "kind" | "slot">) =>
  `${slot.side}:${slot.kind}:${slot.slot}`;

export function CalibrationWizard({
  token,
  referenceCount,
  onClose,
}: {
  token: string;
  referenceCount: number;
  onClose: () => void;
}) {
  const [sourceName, setSourceName] = useState("MLBB");
  const [gameBuild, setGameBuild] = useState("");
  const [language, setLanguage] = useState("en");
  const [imageData, setImageData] = useState("");
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [slots, setSlots] = useState<DetectorSlot[]>([]);
  const [step, setStep] = useState(0);
  const [start, setStart] = useState<{ x: number; y: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Calibration failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const point = (event: PointerEvent<HTMLImageElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          frame.width - 1,
          Math.round(
            ((event.clientX - bounds.left) / bounds.width) * frame.width,
          ),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          frame.height - 1,
          Math.round(
            ((event.clientY - bounds.top) / bounds.height) * frame.height,
          ),
        ),
      ),
    };
  };
  const finishRect = (event: PointerEvent<HTMLImageElement>) => {
    if (!start) return;
    const end = point(event);
    setStart(undefined);
    const rect = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
    if (rect.width < 2 || rect.height < 2) {
      setError("Drag a rectangle at least two source pixels wide and high.");
      return;
    }
    const phase = phases[step];
    if (!phase) return;
    const next = { ...phase, rect };
    setSlots((current) => [
      ...current.filter((slot) => key(slot) !== key(next)),
      next,
    ]);
    if (step < phases.length - 1) setStep(step + 1);
  };
  const active = phases[step];

  const save = () =>
    run(async () => {
      if (!imageData || frame.width === 0 || slots.length !== phases.length)
        throw new Error("Capture a frame and draw all 20 draft slots first.");
      const id = `mlbb-${gameBuild}`
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-|-$/g, "");
      const profile: DetectorProfile = {
        schemaVersion: 1,
        id,
        gameBuild,
        language,
        sourceName,
        frame,
        slots,
        thresholds: {
          proposal: 0.94,
          automatic: 0.985,
          proposalMargin: 0.015,
          automaticMargin: 0.025,
          empty: 0.98,
        },
        validation: {
          referenceCount: Math.min(133, referenceCount),
          validatedAt: null,
        },
      };
      await saveDetectorCalibration(
        { profile, emptyFrameData: imageData },
        token,
      );
      setSaved(true);
    });

  return (
    <div className="calibration-card">
      <header>
        <div>
          <small>Visual setup</small>
          <h2>Draft Slot Calibration</h2>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="calibration-fields">
        <label>
          OBS source
          <input
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
          />
        </label>
        <label>
          Game build
          <input
            value={gameBuild}
            placeholder="1.9.x"
            onChange={(event) => setGameBuild(event.target.value)}
          />
        </label>
        <label>
          Language
          <input
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={busy || !sourceName || !gameBuild}
          onClick={() =>
            run(async () => {
              setImageData(await captureDetectorFrame(sourceName, token));
              setSlots([]);
              setStep(0);
              setSaved(false);
            })
          }
        >
          Capture empty draft
        </button>
      </div>
      {imageData && active && (
        <>
          <div className="calibration-step">
            <strong>
              {step + 1} / {phases.length}: {active.side} {active.kind}{" "}
              {active.slot + 1}
            </strong>
            <span>Drag tightly around the empty slot.</span>
          </div>
          <div className="calibration-canvas">
            <img
              src={imageData}
              alt="OBS calibration frame"
              draggable={false}
              onLoad={(event) =>
                setFrame({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onPointerDown={(event) => setStart(point(event))}
              onPointerUp={finishRect}
            />
            {slots.map((slot) => (
              <span
                key={key(slot)}
                className={key(slot) === key(active) ? "active" : ""}
                style={{
                  left: `${(slot.rect.x / frame.width) * 100}%`,
                  top: `${(slot.rect.y / frame.height) * 100}%`,
                  width: `${(slot.rect.width / frame.width) * 100}%`,
                  height: `${(slot.rect.height / frame.height) * 100}%`,
                }}
              >
                {slot.side[0]?.toUpperCase()}
                {slot.kind[0]?.toUpperCase()}
                {slot.slot + 1}
              </span>
            ))}
          </div>
          <div className="calibration-actions">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={step === phases.length - 1}
              onClick={() => setStep(step + 1)}
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => {
                setSlots([]);
                setStep(0);
              }}
            >
              Reset rectangles
            </button>
            <button
              type="button"
              className="accept"
              disabled={
                busy ||
                slots.length !== phases.length ||
                !gameBuild ||
                language.length < 2
              }
              onClick={save}
            >
              Save calibration
            </button>
          </div>
        </>
      )}
      {error && <p className="detector-error">{error}</p>}
      {saved && (
        <p className="calibration-success">
          Saved locally. Restart the server to load it. Automatic mode remains
          locked until replay validation.
        </p>
      )}
    </div>
  );
}
