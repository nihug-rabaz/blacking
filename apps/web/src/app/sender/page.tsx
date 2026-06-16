"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TransferEncoder } from "@blacking/protocol";
import { FlashDetector, type FlashMetrics } from "@/lib/flash-detector";
import { readFilesFromInput, formatBytes } from "@/lib/file-utils";
import { generateQrDataUrl } from "@/lib/qr-generator";

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
  const [sensitivity, setSensitivity] = useState(1.45);
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<FlashDetector | null>(null);
  const advancingRef = useRef(false);

  const startTransfer = useCallback(async (files: { path: string; content: Uint8Array }[]) => {
    const encoder = new TransferEncoder();
    const encoded = encoder.encode(files);
    setPayloads(encoded.payloads);
    setCurrentIndex(0);
    setFileInfo(`${encoded.fileCount} קבצים · ${encoded.totalQrs} QR codes`);
    setPhase("transfer");
  }, []);

  const handleTextStart = () => {
    if (!text.trim()) {
      return;
    }
    const encoder = new TransferEncoder();
    const encoded = encoder.encodeText(text);
    setPayloads(encoded.payloads);
    setCurrentIndex(0);
    setFileInfo(`טקסט · ${encoded.totalQrs} QR codes`);
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
    }, 600);
  }, [payloads.length]);

  useEffect(() => {
    if (phase !== "transfer" || !payloads.length) {
      return;
    }

    const payload = payloads[currentIndex];
    if (!payload) {
      return;
    }

    generateQrDataUrl(payload).then(setQrUrl);
  }, [phase, payloads, currentIndex]);

  useEffect(() => {
    if (phase !== "transfer") {
      return;
    }

    let detector: FlashDetector;
    const setup = async () => {
      try {
        detector = new FlashDetector({
          onFlash: advanceQr,
          thresholdMultiplier: sensitivity,
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
    detectorRef.current?.setThreshold(sensitivity);
  }, [sensitivity]);

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
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
          <div className="flex flex-col items-center">
            <div className="rounded-2xl bg-white p-4 shadow-2xl shadow-accent/10">
              {qrUrl ? (
                <img src={qrUrl} alt="QR Code" width={400} height={400} className="block" />
              ) : (
                <div className="flex h-[400px] w-[400px] items-center justify-center text-slate-500">
                  טוען...
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
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>בהירות שיא</span>
                    <span>{flashMetrics.ratio.toFixed(2)}x מהרקע</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-border">
                    <div
                      className={`h-full transition-all ${flashMetrics.ratio >= sensitivity ? "bg-emerald-400" : "bg-accent"}`}
                      style={{ width: `${Math.min(100, (flashMetrics.ratio / 3) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {flashMetrics.armed
                      ? flashMetrics.spikes > 0
                        ? `זוהתה הבהוב (${flashMetrics.spikes})...`
                        : "ממתין להבהוב — ודא שגב הטלפון פונה למצלמה"
                      : "אושר — עובר ל-QR הבא"}
                  </p>
                </div>
              )}
              <label className="mt-3 block text-xs text-slate-400">
                רגישות זיהוי: {sensitivity.toFixed(2)}
                <input
                  type="range"
                  min="1.15"
                  max="2.5"
                  step="0.05"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
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
              setPhase("input");
              setPayloads([]);
              setCurrentIndex(0);
              setQrUrl("");
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
