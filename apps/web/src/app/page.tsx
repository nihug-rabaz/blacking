import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Blacking</h1>
        <p className="mt-3 max-w-md text-slate-400">
          העברת קבצים וטקסט בין מחשב לטלפון דרך QR — ללא רשת, פנס או סאונד
        </p>
      </div>

      <div className="grid w-full max-w-lg gap-4 sm:grid-cols-2">
        <Link
          href="/sender"
          className="group rounded-2xl border border-surface-border bg-surface-raised p-6 transition hover:border-accent"
        >
          <div className="text-3xl">🖥️</div>
          <h2 className="mt-3 text-xl font-semibold">מחשב (שולח)</h2>
          <p className="mt-2 text-sm text-slate-400">
            העלה קבצים או טקסט, הצג QR codes, וזהה פנס או סאונד מהטלפון
          </p>
        </Link>

        <Link
          href="/receiver"
          className="group rounded-2xl border border-surface-border bg-surface-raised p-6 transition hover:border-accent"
        >
          <div className="text-3xl">📱</div>
          <h2 className="mt-3 text-xl font-semibold">טלפון (מקבל)</h2>
          <p className="mt-2 text-sm text-slate-400">
            סרוק QR codes מהמסך — אישור בפנס או ב-2 תדרים ייחודיים
          </p>
        </Link>
      </div>
    </main>
  );
}
