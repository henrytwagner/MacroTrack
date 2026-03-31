import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionDivider from "@/components/SectionDivider";

export const metadata: Metadata = {
  title: "Smart Scale Support — Dialed",
  description:
    "Connect a Bluetooth nutrition scale for gram-perfect accuracy. Live weight streaming feeds directly into Kitchen Mode for effortless, precise logging.",
};

const supportedScales = [
  {
    name: "Etekcity ESN00",
    type: "Nutrition Scale",
    connection: "Bluetooth Low Energy (BLE)",
    units: ["Grams (g)", "Ounces (oz)", "Pounds & ounces (lb:oz)", "Milliliters (ml)"],
    features: ["Live weight streaming", "Stability detection", "Auto-connect", "Multi-unit support", "Smart Auto-Progression"],
    status: "Fully Supported",
  },
];

const howItWorks = [
  {
    number: "01",
    title: "Pair your scale",
    description:
      "Open Dialed, go to scale settings, and tap connect. Your Etekcity ESN00 appears automatically — one tap to pair.",
  },
  {
    number: "02",
    title: "Place food on the scale",
    description:
      "Set your ingredient on the scale. The weight streams live to Dialed — you see grams update in real time on your phone.",
  },
  {
    number: "03",
    title: "Log with precision",
    description:
      "Tell Kitchen Mode what you're weighing or select the food manually. The scale's exact weight replaces estimation, giving you gram-perfect macros.",
  },
];

export default function ScalePage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(0,210,211,0.06)_0%,transparent_60%)]" />
          <div className="relative max-w-7xl mx-auto px-6">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-fat-cyan text-sm font-semibold tracking-widest uppercase mb-4">
                Smart Scale
              </p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                Gram-perfect
                <br />
                <span className="text-fat-cyan">accuracy.</span>
              </h1>
              <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
                Connect a Bluetooth nutrition scale and eliminate guesswork entirely.
                Live weight data streams directly into Dialed, giving you the most
                accurate macro tracking possible — no estimation, no rounding.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 justify-center">
                {["Live BLE streaming", "Smart Auto-Progression", "Auto-reconnect", "Multi-unit", "Kitchen Mode integrated"].map(
                  (tag) => (
                    <span
                      key={tag}
                      className="bg-card-bg border border-card-border text-muted text-xs font-medium px-4 py-2 rounded-full"
                    >
                      {tag}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Why scale > estimation */}
        <section className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Why a scale changes everything
              </h2>
              <p className="mt-4 text-muted text-lg max-w-2xl mx-auto">
                Most tracking apps rely on your best guess. Dialed gives you ground truth.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-card-bg border border-card-border rounded-2xl p-8">
                <div className="w-12 h-12 rounded-xl bg-cal-red/10 flex items-center justify-center text-cal-red mb-5">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-2">Estimation is broken</h3>
                <p className="text-muted text-sm leading-relaxed">
                  Studies show people underestimate portions by 30-50%. A &quot;tablespoon&quot;
                  of peanut butter can be off by 100+ calories. Your eyes lie — a scale doesn&apos;t.
                </p>
              </div>

              <div className="bg-card-bg border border-card-border rounded-2xl p-8">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent mb-5">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-2">Zero extra effort</h3>
                <p className="text-muted text-sm leading-relaxed">
                  Place food on the scale, tell Dialed what it is. The weight populates
                  automatically. It&apos;s actually faster than eyeballing and typing a guess.
                </p>
              </div>

              <div className="bg-card-bg border border-card-border rounded-2xl p-8">
                <div className="w-12 h-12 rounded-xl bg-fat-cyan/10 flex items-center justify-center text-fat-cyan mb-5">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-2">Compound accuracy</h3>
                <p className="text-muted text-sm leading-relaxed">
                  When every ingredient is weighed, your daily totals are precise. Over weeks
                  and months, this precision compounds into far better data and results.
                </p>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* How it works */}
        <section className="py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="text-fat-cyan text-sm font-semibold tracking-widest uppercase mb-4">
                How It Works
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Connect, weigh, log
              </h2>
            </div>

            <div className="space-y-12">
              {howItWorks.map((step) => (
                <div key={step.number} className="flex gap-6 sm:gap-8 items-start">
                  <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-fat-cyan/10 border border-fat-cyan/20 flex items-center justify-center">
                    <span className="text-fat-cyan font-mono font-bold text-lg">{step.number}</span>
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold">{step.title}</h3>
                    <p className="text-muted mt-2 leading-relaxed max-w-lg">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Smart Auto-Progression */}
        <section className="py-20 sm:py-28 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(64,200,224,0.05)_0%,transparent_55%)]" />
          <div className="relative max-w-5xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="text-fat-cyan text-sm font-semibold tracking-widest uppercase mb-4">
                Smart Auto-Progression
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Scan. Weigh. Next.
              </h2>
              <p className="mt-4 text-muted text-lg max-w-2xl mx-auto leading-relaxed">
                For meal prep with multiple ingredients, Auto-Progression turns your barcode scanner
                into a seamless weighing pipeline. No tapping between items — just scan and go.
              </p>
            </div>

            <div className="bg-card-bg border border-fat-cyan/15 rounded-3xl p-8 sm:p-10">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                <div>
                  <h3 className="text-xl font-bold mb-6">The pipeline</h3>
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-fat-cyan/10 border border-fat-cyan/20 flex items-center justify-center text-fat-cyan flex-shrink-0 mt-0.5 font-mono text-xs font-bold">
                        1
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm mb-1">Scan → food queues, scale activates</h4>
                        <p className="text-muted text-sm leading-relaxed">Barcode scan identifies the food and starts live weight streaming from the scale.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0 mt-0.5 font-mono text-xs font-bold">
                        2
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm mb-1">Place food → live macro preview</h4>
                        <p className="text-muted text-sm leading-relaxed">Weight streams in real time. You see calories and macros update as food lands on the scale.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-carb-orange/10 border border-carb-orange/20 flex items-center justify-center text-carb-orange flex-shrink-0 mt-0.5 font-mono text-xs font-bold">
                        3
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm mb-1">Scan next → previous auto-confirms + zeros</h4>
                        <p className="text-muted text-sm leading-relaxed">The new scan locks in the previous item&apos;s weight and resets the scale in one motion. New item lookup starts in parallel.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-cal-red/10 border border-cal-red/20 flex items-center justify-center text-cal-red flex-shrink-0 mt-0.5 font-mono text-xs font-bold">
                        4
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm mb-1">Save → last item auto-confirms</h4>
                        <p className="text-muted text-sm leading-relaxed">Hit save and the final item locks in. Your entire weighed meal is logged with exact macros.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-surface border border-card-border rounded-2xl p-5">
                    <p className="text-sm font-semibold mb-3">Additional smart triggers</p>
                    <ul className="space-y-2 text-sm text-muted">
                      <li className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span><strong className="text-foreground">Voice chain</strong> — speaking a new food name also fires the pipeline</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span><strong className="text-foreground">Stability timer</strong> — auto-confirm after weight holds stable (1.5–5s, off by default)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <span><strong className="text-foreground">Confirmation chime</strong> — optional audible feedback for fully hands-free use</span>
                      </li>
                    </ul>
                  </div>
                  <div className="bg-surface border border-card-border rounded-2xl p-5">
                    <p className="text-sm font-semibold mb-1">All settings are mid-session toggleable</p>
                    <p className="text-sm text-muted">
                      Long-press the scale icon in Kitchen Mode to open the settings sheet.
                      Disable Auto-Progression at any point and return to manual confirm instantly.
                    </p>
                  </div>
                  <div className="bg-fat-cyan/5 border border-fat-cyan/15 rounded-2xl p-5 text-center">
                    <p className="text-fat-cyan text-sm font-semibold">5 ingredients = 5 scans</p>
                    <p className="text-muted text-xs mt-1">That&apos;s 15–30 fewer taps for a typical meal prep session.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Supported scales */}
        <section className="py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="text-fat-cyan text-sm font-semibold tracking-widest uppercase mb-4">
                Compatibility
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Supported scales
              </h2>
              <p className="mt-4 text-muted text-lg">
                We&apos;re actively adding support for more BLE scales. Here&apos;s what works today.
              </p>
            </div>

            {supportedScales.map((scale) => (
              <div
                key={scale.name}
                className="bg-card-bg border border-card-border rounded-3xl p-8 sm:p-10"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-2xl font-bold">{scale.name}</h3>
                      <span className="bg-accent/15 text-accent text-xs font-medium px-3 py-1 rounded-full border border-accent/25">
                        {scale.status}
                      </span>
                    </div>
                    <p className="text-muted">{scale.type} &middot; {scale.connection}</p>
                  </div>
                  {/* Placeholder for scale image */}
                  <div className="w-24 h-24 rounded-2xl bg-surface border border-card-border flex items-center justify-center">
                    <svg className="w-10 h-10 text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
                    </svg>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                      Supported Units
                    </h4>
                    <ul className="space-y-2">
                      {scale.units.map((unit) => (
                        <li key={unit} className="flex items-center gap-2 text-sm">
                          <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          {unit}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                      Features
                    </h4>
                    <ul className="space-y-2">
                      {scale.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm">
                          <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}

            {/* Coming soon */}
            <div className="mt-8 rounded-2xl border border-dashed border-card-border p-8 text-center">
              <p className="text-muted">
                More scales coming soon. Have a specific scale you&apos;d like supported?{" "}
                <Link href="/about" className="text-fat-cyan hover:text-fat-cyan/80 transition-colors">
                  Let us know.
                </Link>
              </p>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* CTA */}
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-6">
            <div className="flex flex-col items-center rounded-3xl border border-card-border bg-card-bg px-8 py-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Stop guessing portions
              </h2>
              <p className="mt-4 max-w-md text-muted leading-relaxed">
                Pair your scale with Dialed and get the most accurate macro
                tracking possible. Join the beta today.
              </p>
              <Link
                href="/access"
                className="mt-8 rounded-full btn-brand px-8 py-3.5 text-base"
              >
                Get Early Access
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
