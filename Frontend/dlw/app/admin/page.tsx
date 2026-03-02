import Link from "next/link";

export default function AdminLandingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,#7c2d12_0%,#1e293b_58%,#020617_100%)] px-6 py-10 text-slate-100 sm:px-10">
      <main className="mx-auto w-full max-w-4xl rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur-md sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
          AI Safety Hivemind
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
          Admin Portal
        </h1>
        <p className="mt-3 text-sm text-slate-200 sm:text-base">
          Review incoming reports, update report status and keep operational
          response data current.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/admin/login"
            className="rounded-full border border-amber-200/60 bg-amber-300/20 px-5 py-2 text-sm font-semibold transition hover:bg-amber-300/30"
          >
            Admin Login
          </Link>
          <Link
            href="/admin/reports"
            className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold transition hover:bg-white/10"
          >
            Manage Reports
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/40 px-5 py-2 text-sm font-semibold transition hover:bg-white/10"
          >
            Back Home
          </Link>
        </div>
      </main>
    </div>
  );
}
