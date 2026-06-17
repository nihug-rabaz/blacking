"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TransferEncoder,
  TRANSFER_SPEED_PROFILES,
  getTransferSpeedProfile,
  ChunkBytesConfig,
  DEFAULT_CHUNK_BYTES,
  type TransferSpeed,
} from "@blacking/protocol";
import { FlashDetector, type FlashMetrics } from "@/lib/flash-detector";
import { readFilesFromInput, formatBytes } from "@/lib/file-utils";
import { generateQrDataUrl, QR_DISPLAY_SIZE } from "@/lib/qr-generator";
import { AckBlinkPattern } from "@/lib/ack-blink-pattern";

type Phase = "input" | "transfer" | "done";

export default function SenderPage() {
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [payloads, setPayloads] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [qrUrl, setQrUrl] = useState("");
  const [fileInfo, setFileInfo] = useState("");
  const [flashReady, setFlashReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [flashMetrics, setFlashMetrics] = useState<FlashMetrics | null>(null);
  const [minJump, setMinJump] = useState(18);
  const [chunkBytes, setChunkBytes] = useState(DEFAULT_CHUNK_BYTES);
  const activePreset = TRANSFER_SPEED_PROFILES.find((profile) => profile.chunkBytes === chunkBytes)?.id;
  const chunkHint = ChunkBytesConfig.hint(chunkBytes);
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<FlashDetector | null>(null);
  const resetSession = useCallback(() => {
    detectorRef.current?.stop();
    detectorRef.current = null;
    setFlashMetrics(null);
    setFlashReady(false);
    setCameraError("");
    setQrUrl("");
    setCurrentIndex(0);
    setPayloads([]);
  }, []);

  const advancingRef = useRef(false);
  const prevQrIndexRef = useRef(-1);

  const applyChunkBytes = useCallback((value: number) => {
    setChunkBytes(ChunkBytesConfig.clamp(value));
  }, []);

  const applyPreset = useCallback((speed: TransferSpeed) => {
    setChunkBytes(getTransferSpeedProfile(speed).chunkBytes);
  }, []);

  const startTransfer = useCallback(async (files: { path: string; content: Uint8Array }[]) => {
    setFlashMetrics(null);
    setFlashReady(false);
    const encoder = new TransferEncoder();
    const encoded = encoder.encode(files, { chunkBytes });
    setPayloads(encoded.payloads);
    setCurrentIndex(0);
    setFileInfo(`${encoded.fileCount} קבצים · ${encoded.totalQrs} QR · ${chunkBytes}B / QR`);
    setPhase("transfer");
  }, [chunkBytes]);

  const handleTextStart = () => {
    if (!text.trim()) {
      return;
    }
    setFlashMetrics(null);
    setFlashReady(false);
    const encoder = new TransferEncoder();
    const encoded = encoder.encodeText(text, "content.txt", { chunkBytes });
    setPayloads(encoded.payloads);
    setCurrentIndex(0);
    setFileInfo(`טקסט · ${encoded.totalQrs} QR · ${chunkBytes}B / QR`);
    setPhase("transfer");
  };

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList?.length) {
      return;
    }
    const files = await readFilesFromInput(fileList);
    const totalBytes = files.reduce((sum, file) => sum + file.content.length, 0);
    setFileInfo(`${files.length} קבצים · ${formatBytes(totalBytes)}`);
    await startTransfer(files);
  };

  const advanceQr = useCallback(() => {
    if (advancingRef.current) {
      return;
    }
    advancingRef.current = true;
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= payloads.length) {
        setPhase("done");
        detectorRef.current?.stop();
      } else {
        detectorRef.current?.rearm();
      }
      return next;
    });
    setTimeout(() => {
      advancingRef.current = false;
    }, 200);
  }, [payloads.length]);

  useEffect(() => {
    if (phase !== "transfer" || !payloads.length) {
      return;
    }

    const payload = payloads[currentIndex];
    if (!payload) {
      return;
    }

    generateQrDataUrl(payload, chunkBytes).then(setQrUrl);
  }, [phase, payloads, currentIndex, chunkBytes]);

  useEffect(() => {
    if (phase !== "transfer") {
      prevQrIndexRef.current = -1;
      return;
    }
    const detector = detectorRef.current;
    if (!detector) {
      return;
    }
    if (prevQrIndexRef.current !== currentIndex) {
      if (prevQrIndexRef.current >= 0) {
        detector.onQrChanged();
      }
      prevQrIndexRef.current = currentIndex;
    }
  }, [currentIndex, phase]);

  useEffect(() => {
    if (phase !== "transfer") {
      return;
    }

    let detector: FlashDetector;
    const setup = async () => {
      try {
        detector = new FlashDetector({
          onFlash: advanceQr,
          minJump,
          onMetrics: setFlashMetrics,
        });
        detectorRef.current = detector;
        await detector.start();
        const video = detector.getVideoElement();
        if (videoRef.current) {
          videoRef.current.srcObject = video.srcObject;
          await videoRef.current.play();
        }
        setFlashReady(true);
        setCameraError("");
      } catch {
        setCameraError("לא ניתן לגשת למצלמה — אשר גישה כדי לזהות הבהוב פנס");
        setFlashReady(false);
      }
    };

    setup();

    return () => {
      detector?.stop();
      detectorRef.current = null;
    };
  }, [phase, advanceQr]);

  useEffect(() => {
    detectorRef.current?.setMinJump(minJump);
  }, [minJump]);

  const progress = payloads.length ? Math.round((currentIndex / payloads.length) * 100) : 0;

  return (
    <main className="min-h-screen p-4 md:p-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-400 hover:text-accent">
          ← חזרה
        </Link>
        <h1 className="text-xl font-bold">מחשב — שולח</h1>
        <div className="w-16" />
      </header>

      {phase === "input" && (
        <div className="mx-auto max-w-2xl space-y-6">
          <section className="rounded-2xl border border-surface-border bg-surface-raised p-6">
            <h2 className="text-lg font-semibold">גודל נתונים לכל QR</h2>
            <p className="mt-2 text-sm text-slate-400">{chunkHint}</p>
            <div className="mt-4">
              <label className="block text-sm text-slate-300">
                בתים לכל QR (payload)
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="number"
                    min={ChunkBytesConfig.min}
                    max={ChunkBytesConfig.max}
                    step={1}
                    value={chunkBytes}
                    onChange={(event) => applyChunkBytes(Number(event.target.value))}
                    className="w-28 rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                  <span className="text-xs text-slate-500">
                    {ChunkBytesConfig.min}–{ChunkBytesConfig.max}
                  </span>
                </div>
              </label>
              <input
                type="range"
                min={ChunkBytesConfig.min}
                max={ChunkBytesConfig.max}
                step={1}
                value={chunkBytes}
                onChange={(event) => applyChunkBytes(Number(event.target.value))}
                className="mt-3 w-full accent-accent"
              />
            </div>
            <p className="mt-3 text-xs text-slate-500">קיצורי דרך</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {TRANSFER_SPEED_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => applyPreset(profile.id)}
                  className={`rounded-xl border px-4 py-3 text-right text-sm transition ${
                    activePreset === profile.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-surface-border hover:border-accent/50"
                  }`}
                >
                  <span className="block font-semibold">{profile.label}</span>
                  <span className="mt-1 block text-xs text-slate-400">{profile.chunkBytes}B / QR</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-surface-border bg-surface-raised p-6">
            <h2 className="text-lg font-semibold">העברת טקסט</h2>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="הדבק כאן טקסט ארוך..."
              className="mt-3 w-full rounded-xl border border-surface-border bg-surface p-4 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={handleTextStart}
              disabled={!text.trim()}
              className="mt-3 rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-40"
            >
              התחל העברה
            </button>
          </section>

          <section className="rounded-2xl border border-surface-border bg-surface-raised p-6">
            <h2 className="text-lg font-semibold">העברת קבצים / תיקייה</h2>
            <p className="mt-2 text-sm text-slate-400">בחר קבצים בודדים או תיקייה שלמה</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <label className="cursor-pointer rounded-xl border border-surface-border px-5 py-2.5 text-sm transition hover:border-accent">
                בחר קבצים
                <input type="file" multiple className="hidden" onChange={handleFiles} />
              </label>
              <label className="cursor-pointer rounded-xl border border-surface-border px-5 py-2.5 text-sm transition hover:border-accent">
                בחר תיקייה
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFiles}
                  {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
                />
              </label>
            </div>
          </section>
        </div>
      )}

      {phase === "transfer" && currentIndex < payloads.length && (
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 xl:flex-row xl:items-start xl:justify-center">
          <div className="flex w-full max-w-[840px] flex-col items-center">
            <div className="w-full rounded-2xl bg-white p-3 shadow-2xl shadow-accent/10 sm:p-5">
              {flashMetrics?.phase !== "calibrating" && qrUrl ? (
                <img
                  src={qrUrl}
                  alt="QR Code"
                  width={QR_DISPLAY_SIZE}
                  height={QR_DISPLAY_SIZE}
                  className="block h-auto w-full max-w-full"
                />
              ) : (
                <div
                  className="flex w-full flex-col items-center justify-center gap-2 text-slate-500"
                  style={{ aspectRatio: "1 / 1", minHeight: QR_DISPLAY_SIZE }}
                >
                  <span className="text-4xl">📷</span>
                  <span className="text-base">מכייל מצלמה...</span>
                </div>
              )}
            </div>
            <p className="mt-4 text-center text-lg font-semibold">
              QR {currentIndex + 1} מתוך {payloads.length}
            </p>
            <p className="text-sm text-slate-400">{fileInfo}</p>
            <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-surface-border">
              <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="w-full max-w-sm space-y-4">
            <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <h3 className="font-semibold">הוראות</h3>
              <ol className="mt-3 list-decimal space-y-2 pr-5 text-sm text-slate-300">
                <li>פתח את דף המקבל בטלפון</li>
                <li>הנח את <strong>גב הטלפון</strong> לכיוון מצלמת המחשב (הפנס ליד המצלמה האחורית)</li>
                <li>מצלמת הטלפון פונה ל-QR על המסך</li>
                <li>כשהטלפון סורק — הפנס יהבהב והמחשב יעבור ל-QR הבא</li>
              </ol>
            </div>

            <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <h3 className="font-semibold">זיהוי פנס</h3>
              <video
                ref={videoRef}
                playsInline
                muted
                className="mt-2 aspect-video w-full rounded-xl bg-black object-cover"
              />
              {flashMetrics && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {flashMetrics.phase === "calibrating"
                        ? `קולט בהירות רקע... ${Math.round(flashMetrics.calibrationProgress * 100)}%`
                        : flashMetrics.phase === "warmingUp"
                          ? "מתייצב עם QR על המסך..."
                        : flashMetrics.graceRemainingMs > 0
                        ? flashMetrics.graceRemainingMs <= 200
                          ? "מוכן לפנס"
                          : "מוכן בעוד רגע..."
                          : `ממתין ל-${flashMetrics.requiredSpikes} קפיצות קטנות`}
                    </span>
                    <span
                      className={
                        flashMetrics.ready && flashMetrics.spikeCount > 0
                          ? "text-emerald-400"
                          : "text-slate-500"
                      }
                    >
                      {flashMetrics.ready
                        ? `${flashMetrics.spikeCount}/${flashMetrics.requiredSpikes} קפיצות`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>רקע: {flashMetrics.baseline.toFixed(0)}</span>
                    <span>נוכחי: {flashMetrics.peak.toFixed(0)}</span>
                    <span>קפיצה: {flashMetrics.jump.toFixed(0)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-border">
                    <div
                      className={`h-full transition-all ${
                        flashMetrics.phase === "calibrating" || flashMetrics.phase === "warmingUp"
                          ? "bg-amber-400"
                          : flashMetrics.spikeCount >= flashMetrics.requiredSpikes
                            ? "bg-emerald-400"
                            : flashMetrics.jump >= minJump
                              ? "bg-yellow-400"
                              : "bg-accent"
                      }`}
                      style={{
                        width: `${
                          flashMetrics.phase === "calibrating" || flashMetrics.phase === "warmingUp"
                            ? flashMetrics.calibrationProgress * 100
                            : (flashMetrics.spikeCount / flashMetrics.requiredSpikes) * 100
                        }%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {flashMetrics.phase === "calibrating"
                      ? "מכייל מצלמה לפני הצגת QR — אל תכוון פנס"
                      : flashMetrics.phase === "warmingUp"
                        ? "QR מוצג — המתן לסיום ייצוב לפני סריקה"
                      : flashMetrics.graceRemainingMs > 0
                        ? flashMetrics.graceRemainingMs <= 200
                          ? "מוכן לפנס — הטלפון יהבהב בקרוב"
                          : "מוכן בעוד רגע..."
                        : flashMetrics.armed
                          ? `מוכן — ${AckBlinkPattern.requiredSpikes} קפיצות אור = סריקה אושרה`
                          : "סריקה זוהתה — עובר ל-QR הבא"}
                  </p>
                </div>
              )}
              <label className="mt-3 block text-xs text-slate-400">
                סף קפיצה מינימלי: {minJump}
                <input
                  type="range"
                  min="6"
                  max="25"
                  step="1"
                  value={minJump}
                  onChange={(e) => setMinJump(Number(e.target.value))}
                  className="mt-1 w-full accent-accent"
                />
              </label>
              <p className="mt-2 text-xs text-slate-400">
                {flashReady
                  ? "מצלמה פעילה — כוון לפנס בגב הטלפון"
                  : cameraError || "מאתחל מצלמה..."}
              </p>
            </div>

            <button
              onClick={advanceQr}
              className="w-full rounded-xl border border-surface-border py-2 text-sm text-slate-400 hover:border-accent hover:text-accent"
            >
              דלג ידנית ל-QR הבא
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="mx-auto max-w-md text-center">
          <div className="text-5xl">✅</div>
          <h2 className="mt-4 text-2xl font-bold">ההעברה הושלמה!</h2>
          <p className="mt-2 text-slate-400">כל ה-QR codes נשלחו. בדוק את הטלפון להורדת הקבצים.</p>
          <button
            onClick={() => {
              resetSession();
              setPhase("input");
            }}
            className="mt-6 rounded-xl bg-accent px-8 py-3 font-semibold text-slate-900"
          >
            העברה חדשה
          </button>
        </div>
      )}
    </main>
  );
}
