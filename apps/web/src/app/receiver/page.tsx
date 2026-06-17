"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TransferDecoder } from "@blacking/protocol";
import type { TransferFile } from "@blacking/protocol";
import { createQrScanner, type IQrScanner } from "@/lib/qr-scanner-factory";
import { getStoredQrMode, storeQrMode, qrModeLabel, type QrVisualMode } from "@/lib/qr-mode";
import { ScanAckSender } from "@/lib/scan-ack-sender";
import { getStoredAckChannel, storeAckChannel } from "@/lib/ack-channel";
import type { AckChannel } from "@blacking/protocol";
import { downloadAsZip, downloadFile, formatBytes } from "@/lib/file-utils";
import { getCameraBlockedReason, getLocalNetworkHint } from "@/lib/camera-access";

type Phase = "idle" | "scanning" | "done";

export default function ReceiverPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ received: 0, total: 0, filesComplete: 0, fileCount: 0 });
  const [lastIndex, setLastIndex] = useState(-1);
  const [assembledFiles, setAssembledFiles] = useState<TransferFile[]>([]);
  const [status, setStatus] = useState("לחץ להתחלת סריקה");
  const [torchSupported, setTorchSupported] = useState<boolean | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState<string | null>(null);
  const [networkHint, setNetworkHint] = useState("");
  const [ackChannel, setAckChannel] = useState<AckChannel>("optical");
  const [qrMode, setQrMode] = useState<QrVisualMode>("standard");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<IQrScanner | null>(null);
  const decoderRef = useRef(new TransferDecoder());
  const ackRef = useRef(new ScanAckSender());
  const processingRef = useRef(false);
  const lastScanAtRef = useRef(Date.now());

  const sendAck = useCallback(async (scanner: IQrScanner | null) => {
    ackRef.current.setMode(ackChannel);
    await ackRef.current.send(scanner);
    setTorchSupported(ackRef.current.isTorchSupported());
  }, [ackChannel]);

  const handleScan = useCallback(
    async (raw: string) => {
      if (processingRef.current) {
        return;
      }

      const decoder = decoderRef.current;
      const result = decoder.ingest(raw);

      if (!result.accepted || result.duplicate) {
        return;
      }

      processingRef.current = true;
      lastScanAtRef.current = Date.now();

      try {
        const prog = decoder.getProgress();
        setProgress(prog);
        setLastIndex(prog.received - 1);
        setStatus(
          ackChannel === "audio"
            ? `נקלט QR ${prog.received}/${prog.total} — משמיע אות...`
            : `נקלט QR ${prog.received}/${prog.total} — שולח אות פנס...`,
        );
        scannerRef.current?.notifyAccepted(prog.received - 1);

        await sendAck(scannerRef.current);
        setStatus(`נקלט QR ${prog.received}/${prog.total} — המשך לסרוק את ה-QR הבא`);

        if (result.complete) {
          const files = decoder.assemble();
          setAssembledFiles(files);
          setPhase("done");
          setStatus("ההעברה הושלמה!");
          scannerRef.current?.stop();
          await ackRef.current.off();
        }
      } finally {
        processingRef.current = false;
      }
    },
    [sendAck],
  );

  const startScanning = async () => {
    const blocked = getCameraBlockedReason();
    if (blocked) {
      setCameraBlocked(blocked);
      setStatus(blocked);
      return;
    }

    decoderRef.current.reset();
    ackRef.current.reset();
    ackRef.current.setMode(ackChannel);
    setProgress({ received: 0, total: 0, filesComplete: 0, fileCount: 0 });
    setLastIndex(-1);
    setAssembledFiles([]);
    setPhase("scanning");
    setStatus("מאתחל מצלמה...");
    lastScanAtRef.current = Date.now();

    const scanner = createQrScanner(qrMode);
    scannerRef.current = scanner;

    if (!videoRef.current) {
      return;
    }

    try {
      await scanner.start(videoRef.current, handleScan);
      const stream = scanner.getStream();
      if (stream) {
        ackRef.current.bindScannerStream(stream);
      }
      setStatus("סרוק את ה-QR מהמסך");
    } catch {
      setStatus("שגיאה בגישה למצלמה — אשר הרשאות בדפדפן");
      setPhase("idle");
    }
  };

  useEffect(() => {
    setCameraBlocked(getCameraBlockedReason());
    setNetworkHint(getLocalNetworkHint(window.location.port ? Number(window.location.port) : 3000));
    setAckChannel(getStoredAckChannel());
    setQrMode(getStoredQrMode());
  }, []);

  const selectQrMode = (mode: QrVisualMode) => {
    setQrMode(mode);
    storeQrMode(mode);
  };

  const selectAckChannel = (channel: AckChannel) => {
    setAckChannel(channel);
    storeAckChannel(channel);
  };

  const stopScanning = () => {
    scannerRef.current?.stop();
    ackRef.current.off();
    setPhase("idle");
    setStatus("הסריקה הופסקה");
  };

  useEffect(() => {
    if (phase !== "scanning") {
      return;
    }

    const watchdog = window.setInterval(() => {
      const scanner = scannerRef.current;
      if (!scanner || processingRef.current) {
        return;
      }
      const idleMs = Date.now() - lastScanAtRef.current;
      if (idleMs > 5000 && !scanner.isHealthy()) {
        void scanner.recoverAfterAck().then(() => {
          const stream = scanner.getStream();
          if (stream) {
            ackRef.current.bindScannerStream(stream);
          }
        });
      }
    }, 2500);

    return () => window.clearInterval(watchdog);
  }, [phase]);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop();
      ackRef.current.off();
    };
  }, []);

  const handleDownloadAll = async () => {
    if (assembledFiles.length === 1) {
      downloadFile(assembledFiles[0].path, assembledFiles[0].content);
      return;
    }
    await downloadAsZip(assembledFiles);
  };

  const progressPercent = progress.total ? Math.round((progress.received / progress.total) * 100) : 0;

  return (
    <main className="min-h-screen p-4">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-400 hover:text-accent">
          ← חזרה
        </Link>
        <h1 className="text-xl font-bold">טלפון — מקבל</h1>
        <div className="w-16" />
      </header>

      {phase !== "done" && (
        <div className="mx-auto max-w-lg space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-surface-border bg-black">
            <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
            {phase === "scanning" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-48 w-48 rounded-2xl border-2 border-accent/60" />
              </div>
            )}
          </div>

          {cameraBlocked && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
              <p className="font-semibold">המצלמה חסומה — חיבור לא מאובטח</p>
              <p className="mt-2">{cameraBlocked}</p>
              <p className="mt-3 font-mono text-xs text-amber-100/90">{networkHint}</p>
              <p className="mt-3 text-xs text-amber-200/80">
                במחשב הרץ: <span className="font-mono">npm run dev:mobile</span>
                <br />
                בטלפון אשר את אזהרת האבטחה (תעודה עצמית) ואז אשר מצלמה
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
            <p className="text-center font-medium">{status}</p>
            {progress.total > 0 && (
              <>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-border">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-2 text-center text-xs text-slate-400">
                  {progress.received}/{progress.total} QR · {progress.filesComplete}/{progress.fileCount} קבצים
                  {lastIndex >= 0 && ` · אחרון: #${lastIndex}`}
                </p>
              </>
            )}
            {ackChannel === "optical" && torchSupported === false && (
              <p className="mt-2 text-center text-xs text-amber-400">
                פנס לא זמין — נשלח הבהוב מסך לבן כאות למחשב
              </p>
            )}
            {ackChannel === "optical" && torchSupported === true && (
              <p className="mt-2 text-center text-xs text-emerald-400">פנס פעיל — אות אופטי נשלח למחשב</p>
            )}
            {ackChannel === "audio" && phase === "scanning" && (
              <p className="mt-2 text-center text-xs text-emerald-400">מצב סאונד — ודא שהמחשב מאזין למיקרופון</p>
            )}
          </div>

          {phase === "idle" && (
            <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <p className="font-medium text-slate-200">סוג QR</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["standard", "color", "auto"] as QrVisualMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => selectQrMode(mode)}
                    className={`rounded-xl border px-3 py-3 text-sm transition ${
                      qrMode === mode
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-surface-border hover:border-accent/50"
                    }`}
                  >
                    {qrModeLabel(mode)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {phase === "idle" && (
            <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
              <p className="font-medium text-slate-200">אות אישור למחשב</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => selectAckChannel("optical")}
                  className={`rounded-xl border px-3 py-3 text-sm transition ${
                    ackChannel === "optical"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-surface-border hover:border-accent/50"
                  }`}
                >
                  🔦 פנס
                </button>
                <button
                  type="button"
                  onClick={() => selectAckChannel("audio")}
                  className={`rounded-xl border px-3 py-3 text-sm transition ${
                    ackChannel === "audio"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-surface-border hover:border-accent/50"
                  }`}
                >
                  🔊 סאונד
                </button>
              </div>
              {ackChannel === "audio" && (
                <p className="mt-2 text-xs text-slate-500">
                  הטלפון משמיע 2 תדרים ייחודיים — ודא שגם במחשב נבחר מצב סאונד
                </p>
              )}
            </div>
          )}

          {phase === "idle" ? (
            <button
              onClick={startScanning}
              disabled={!!cameraBlocked}
              className="w-full rounded-2xl bg-accent py-4 text-lg font-bold text-slate-900 disabled:opacity-40"
            >
              התחל סריקה
            </button>
          ) : (
            <button
              onClick={stopScanning}
              className="w-full rounded-2xl border border-red-500/50 py-3 text-red-400"
            >
              עצור
            </button>
          )}

          <div className="rounded-2xl border border-surface-border bg-surface-raised p-4 text-sm text-slate-400">
            <p className="font-medium text-slate-200">איך זה עובד?</p>
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>כוון את המצלמה ל-QR על מסך המחשב</li>
              <li>
                {ackChannel === "audio"
                  ? "ברגע זיהוי — הטלפון משמיע 2 תדרים קצרים"
                  : "ברגע זיהוי — הפנס יהבהב מיד לאישור"}
              </li>
              <li>אחרי ההבהוב — כוון ל-QR הבא על המחשב</li>
              <li>בסיום — הקבצים יורדו לטלפון</li>
            </ul>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="mx-auto max-w-lg space-y-4">
          <div className="text-center">
            <div className="text-5xl">✅</div>
            <h2 className="mt-3 text-2xl font-bold">הקבצים מוכנים!</h2>
            <p className="mt-1 text-slate-400">
              {assembledFiles.length} קבצים ·{" "}
              {formatBytes(assembledFiles.reduce((s, f) => s + f.content.length, 0))}
            </p>
          </div>

          <ul className="max-h-60 space-y-2 overflow-y-auto rounded-2xl border border-surface-border bg-surface-raised p-4">
            {assembledFiles.map((file) => (
              <li
                key={file.path}
                className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm"
              >
                <span className="truncate">{file.path}</span>
                <span className="mr-2 shrink-0 text-slate-400">{formatBytes(file.content.length)}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={handleDownloadAll}
            className="w-full rounded-2xl bg-accent py-4 text-lg font-bold text-slate-900"
          >
            {assembledFiles.length === 1 ? "הורד קובץ" : "הורד ZIP"}
          </button>

          <button
            onClick={() => {
              decoderRef.current.reset();
              setPhase("idle");
              setAssembledFiles([]);
              setProgress({ received: 0, total: 0, filesComplete: 0, fileCount: 0 });
              setStatus("לחץ להתחלת סריקה");
            }}
            className="w-full rounded-2xl border border-surface-border py-3 text-slate-400"
          >
            העברה חדשה
          </button>
        </div>
      )}
    </main>
  );
}
