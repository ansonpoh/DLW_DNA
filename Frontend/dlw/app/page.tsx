import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,#0d9488_0%,#082f49_36%,#020617_76%)] text-slate-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12 sm:px-10 lg:py-16">
        <section className="flex justify-end gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-full border border-teal-100/50 bg-teal-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-300"
          >
            Register
          </Link>
        </section>

        <section className="rounded-3xl border border-white/20 bg-white/10 p-8 backdrop-blur-md sm:p-10">
          <p className="mb-4 inline-flex rounded-full border border-teal-300/50 bg-teal-400/20 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-100">
            AI Safety Hivemind
          </p>
          <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Two Signal Sources. One Public Safety Intelligence System.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-200 sm:text-lg">
            AI Safety Hivemind closes the gap between what people report and
            what data already knows by continuously combining citizen reports
            with predictive environmental risk signals.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-amber-200/40 bg-amber-100/10 p-7">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
              Inbound - Human Sensors
            </p>
            <h2 className="text-2xl font-bold text-amber-50">
              Anyone can call or message, in any language.
            </h2>
            <p className="mt-4 leading-relaxed text-amber-100/90">
              The system transcribes each report, extracts incident type,
              severity, and GPS location, then routes it directly to the right
              agency as a structured incident card.
            </p>
            <div className="mt-5 rounded-xl border border-amber-100/30 bg-black/15 p-4 text-sm text-amber-50/95">
              Call or Message to Transcribe to Classify to Geolocate to Dispatch
            </div>
          </article>

          <article className="rounded-2xl border border-cyan-200/40 bg-cyan-100/10 p-7">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
              Outbound - Environmental Sensors
            </p>
            <h2 className="text-2xl font-bold text-cyan-50">
              Data anticipates risk before reports arrive.
            </h2>
            <p className="mt-4 leading-relaxed text-cyan-100/90">
              Historical crime trends, weather context, and time-of-day patterns
              feed a live risk map. If a zone spikes, agencies receive
              preemptive caution alerts before an incident is reported.
            </p>
            <div className="mt-5 rounded-xl border border-cyan-100/30 bg-black/15 p-4 text-sm text-cyan-50/95">
              Crime History + Weather + Time Patterns to Live Risk Score
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-lime-200/30 bg-lime-100/10 p-8 sm:p-10">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-lime-200">
            The Reinforcement Loop
          </p>
          <h2 className="text-3xl font-black tracking-tight text-lime-50 sm:text-4xl">
            Reports and predictions reinforce each other in real time.
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-lime-100/30 bg-black/15 p-4 text-sm leading-relaxed text-lime-50">
              A report inside an already high-risk zone is auto-escalated.
            </div>
            <div className="rounded-xl border border-lime-100/30 bg-black/15 p-4 text-sm leading-relaxed text-lime-50">
              Nearby residents receive instant SMS advisory messages.
            </div>
            <div className="rounded-xl border border-lime-100/30 bg-black/15 p-4 text-sm leading-relaxed text-lime-50">
              Agencies get full incident context pinned to location.
            </div>
          </div>
          <p className="mt-6 max-w-4xl text-base leading-relaxed text-lime-100/95">
            Human reports and predictive signals share the same map layer,
            creating a single operational picture for faster, more precise
            public safety response.
          </p>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-white/25 bg-slate-950/40 p-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-bold text-white sm:text-2xl">
              One system. Two inputs. Zero blind spots.
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-slate-200 sm:text-base">
              Designed for agencies and communities that need faster triage,
              predictive awareness, and location-anchored coordination.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-teal-100/50 bg-teal-400 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-teal-300"
          >
            View Live Intelligence Demo
          </button>
        </section>
      </main>
    </div>
  );
}
