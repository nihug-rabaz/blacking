"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TransferDecoder } from "@blacking/protocol";
import type { TransferFile } from "@blacking/protocol";
import { QrScanner } from "@/lib/qr-scanner";
import { TorchController } from "@/lib/torch-controller";
import { ScreenAckFlasher } from "@/lib/screen-ack-flasher";
import { downloadAsZip, downloadFile, formatBytes } from "@/lib/file-utils";

type Phase = "idle" | "scanning" | "done";

export default function ReceiverPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ received: 0, total: 0, filesComplete: 0, fileCount: 0 });
  const [lastIndex, setLastIndex] = useState(-1);
  const [assembledFiles, setAssembledFiles] = useState<TransferFile[]>([]);
  const [status, setStatus] = useState("לחץ להתחלת סריקה");
  const [torchSupported, setTorchSupported] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const decoderRef = useRef(new TransferDecoder());
  const torchRef = useRef(new TorchController());
  const screenAckRef = useRef(new ScreenAckFlasher());
  const processingRef = useRef(false);
  const lastAckAtRef = useRef(0);

  const handleScan = useCallback(async (raw: string) => {
    if (processingRef.current) {
      return;
    }

    const decoder = decoderRef.current;
    const result = decoder.ingest(raw);

    if (!result.accepted) {
      return;
    }

    if (result.duplicate) {
      return;
    }

    processingRef.current = true;
    const prog = decoder.getProgress();
    setProgress(prog);
    setLastIndex(prog.received - 1);
    setStatus(`נקלט QR ${prog.received}/${prog.total}`);

    const now = Date.now();
    if (now - lastAckAtRef.current > 900) {
      lastAckAtRef.current = now;
      const torchOk = await torchRef.current.blinkAck();
      await screenAckRef.current.blinkAck();
      setTorchSupported(torchOk);
    }

    if (result.complete) {
      const files = decoder.assemble();
      setAssembledFiles(files);
      setPhase("done");
      setStatus("ההעברה הושלמה!");
      scannerRef.current?.stop();
      await torchRef.current.off();
    }

    processingRef.current = false;
  }, []);

  const startScanning = async () => {
    decoderRef.current.reset();
    setProgress({ received: 0, total: 0, filesComplete: 0, fileCount: 0 });
    setLastIndex(-1);
    setAssembledFiles([]);
    setPhase("scanning");
    setStatus("מאתחל מצלמה...");

    const scanner = new QrScanner();
    scannerRef.current = scanner;

    if (!videoRef.current) {
      return;
    }

    try {
      await scanner.start(videoRef.current, handleScan);
      const stream = scanner.getStream();
      if (stream) {
        torchRef.current.bind(stream);
        const probe = await torchRef.current.setEnabled(true);
        await torchRef.current.off();
        setTorchSupported(probe);
      }
      setStatus("סרוק את ה-QR מהמסך");
    } catch {
      setStatus("שגיאה בגישה למצלמה — אשר הרשאות");
      setPhase("idle");
    }
  };

  const stopScanning = () => {
    scannerRef.current?.stop();
    torchRef.current.off();
    setPhase("idle");
    setStatus("הסריקה הופסקה");
  };

  useEffect(() => {
    return () => {
      scannerRef.current?.stop();
      torchRef.current.off();
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
            {torchSupported === false && (
              <p className="mt-2 text-center text-xs text-amber-400">
                פנס לא זמין — נשלח הבהוב מסך לבן כאות למחשב
              </p>
            )}
            {torchSupported === true && (
              <p className="mt-2 text-center text-xs text-emerald-400">פנס פעיל — אות אופטי נשלח למחשב</p>
            )}
          </div>

          {phase === "idle" ? (
            <button
              onClick={startScanning}
              className="w-full rounded-2xl bg-accent py-4 text-lg font-bold text-slate-900"
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
              <li>ברגע זיהוי — הפנס יהבהב לאישור אופטי</li>
              <li>המחשב יעבור אוטומטית ל-QR הבא</li>
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
