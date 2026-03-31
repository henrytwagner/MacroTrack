import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionDivider from "@/components/SectionDivider";

export const metadata: Metadata = {
  title: "Kitchen Mode — Dialed",
  description:
    "Hands-free, voice-first food logging. Talk naturally while you cook and Dialed logs everything in real time. Powered by Gemini AI.",
};

function WaveformVisualizer() {
  const bars = 40;
  return (
    <div className="flex items-center justify-center gap-[3px] h-16">
      {Array.from({ length: bars }).map((_, i) => {
        const delay = (i * 0.08) % 1.2;
        const baseHeight = Math.sin((i / bars) * Math.PI) * 100;
        return (
          <div
            key={i}
            className="wave-bar w-[3px] rounded-full bg-accent/60"
            style={{
              height: `${Math.max(15, baseHeight)}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${1 + Math.random() * 0.6}s`,
            }}
          />
        );
      })}
    </div>
  );
}

const steps = [
  {
    number: "01",
    title: "Open Kitchen Mode",
    description:
      "Tap the microphone icon from anywhere in the app. Dialed activates real-time voice recognition and begins listening.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Speak naturally",
    description:
      "\"I had two eggs, some toast with peanut butter, and a glass of milk.\" Talk like you normally would. Dialed understands context, quantity, and food names.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Review draft cards",
    description:
      "As you speak, live draft cards appear with identified foods and nutrition data. Edit, remove, or add — everything updates in real time.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
  },
  {
    number: "04",
    title: "Save and done",
    description:
      "Hit save and your entire meal is logged with accurate macros. All entries are auto-categorized by meal type based on time of day.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function KitchenModePage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,255,127,0.06)_0%,transparent_60%)]" />

          <div className="relative max-w-7xl mx-auto px-6">
            <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
              {/* Text */}
              <div className="flex-1 text-center lg:text-left">
                <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">
                  Hero Feature
                </p>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                  Cook. Talk.
                  <br />
                  <span className="text-accent">Done.</span>
                </h1>
                <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
                  Kitchen Mode turns your kitchen into a smart logging studio.
                  Powered by Gemini AI with bidirectional audio streaming, it
                  listens to you cook and logs everything in real time — completely
                  hands free.
                </p>
                <div className="mt-8 flex flex-wrap gap-3 justify-center lg:justify-start">
                  {["Bidirectional audio", "Real-time cards", "Gemini-powered", "Hands-free"].map(
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
                <div className="mt-10">
                  <Link
                    href="/access"
                    className="inline-flex bg-accent text-background font-semibold px-8 py-3.5 rounded-full hover:bg-accent-dim transition-colors"
                  >
                    Try Kitchen Mode
                  </Link>
                </div>
              </div>

              {/* Phone */}
              <div className="flex-shrink-0 relative">
                <div className="phone-frame w-[280px] sm:w-[300px] lg:w-[320px]">
                  <Image
                    src="/media/screenshot-kitchen-mode.png"
                    alt="Kitchen Mode with live voice logging"
                    width={320}
                    height={693}
                    priority
                    className="w-full h-auto"
                  />
                </div>
                <div className="absolute -inset-16 bg-[radial-gradient(ellipse_at_center,rgba(0,255,127,0.1)_0%,transparent_60%)] -z-10" />
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Waveform demo */}
        <section className="py-20 sm:py-28">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Real-time voice parsing
              </h2>
              <p className="mt-4 text-muted text-lg">
                Speak naturally. Watch your entries appear live.
              </p>
            </div>

            <div className="bg-surface/80 border border-card-border rounded-2xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-3 h-3 bg-accent rounded-full animate-pulse-glow" />
                <span className="text-sm text-muted font-mono">Kitchen Mode active</span>
              </div>
              <WaveformVisualizer />
              <div className="mt-6 space-y-3">
                <div className="bg-card-bg border border-card-border rounded-xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">&quot;Two eggs scrambled with cheese&quot;</span>
                    <div className="flex gap-4 mt-1.5">
                      <span className="text-xs text-protein-purple">24g protein</span>
                      <span className="text-xs text-carb-orange">2g carbs</span>
                      <span className="text-xs text-fat-cyan">22g fat</span>
                    </div>
                  </div>
                  <span className="text-sm text-accent font-mono">+320 cal</span>
                </div>
                <div className="bg-card-bg border border-card-border rounded-xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">&quot;Toast with peanut butter&quot;</span>
                    <div className="flex gap-4 mt-1.5">
                      <span className="text-xs text-protein-purple">9g protein</span>
                      <span className="text-xs text-carb-orange">22g carbs</span>
                      <span className="text-xs text-fat-cyan">17g fat</span>
                    </div>
                  </div>
                  <span className="text-sm text-accent font-mono">+275 cal</span>
                </div>
                <div className="bg-card-bg border border-card-border rounded-xl px-5 py-4 flex items-center justify-between opacity-50">
                  <span className="text-sm text-muted italic">Listening...</span>
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
                    <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                    <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* How it works */}
        <section className="py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-20">
              <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">
                How It Works
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                Four steps.
                <br />
                <span className="text-muted">That&apos;s it.</span>
              </h2>
            </div>

            <div className="relative">
              <div className="absolute left-[39px] top-0 bottom-0 w-px bg-gradient-to-b from-accent/40 via-accent/20 to-transparent hidden sm:block" />
              <div className="space-y-16">
                {steps.map((step, i) => (
                  <div key={step.number} className="flex gap-8 items-start">
                    <div className="flex-shrink-0 relative">
                      <div className="w-20 h-20 rounded-2xl bg-surface border border-card-border flex items-center justify-center text-accent">
                        {step.icon}
                      </div>
                      {i < steps.length - 1 && (
                        <div className="absolute left-1/2 -translate-x-1/2 top-full h-16 w-px bg-gradient-to-b from-card-border to-transparent sm:hidden" />
                      )}
                    </div>
                    <div className="pt-2">
                      <span className="text-accent font-mono text-sm">{step.number}</span>
                      <h3 className="text-2xl sm:text-3xl font-bold mt-1">{step.title}</h3>
                      <p className="text-muted mt-3 leading-relaxed max-w-lg text-base">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* AI trust section */}
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-6">
            <div className="rounded-3xl border border-card-border bg-card-bg p-8 sm:p-12">
              <div className="flex flex-col sm:flex-row gap-8 items-start">
                <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-3">AI that parses, never fabricates</h3>
                  <p className="text-muted leading-relaxed text-base">
                    Our Gemini AI integration is a parser — it understands what you said and
                    identifies the foods you mentioned. It <strong className="text-foreground">never generates, estimates,
                    or approximates nutritional data</strong>. Every calorie and gram comes from
                    USDA FoodData Central or your own verified custom foods. This is a
                    deliberate design choice: we&apos;d rather ask you to clarify than guess wrong.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* CTA */}
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-6">
            <div className="flex flex-col items-center rounded-3xl border border-card-border bg-card-bg px-8 py-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Try Kitchen Mode
              </h2>
              <p className="mt-4 max-w-md text-muted leading-relaxed">
                Join the beta and experience hands-free macro tracking. Your
                kitchen is about to get a lot smarter.
              </p>
              <Link
                href="/access"
                className="mt-8 rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-background transition-colors hover:bg-accent-dim"
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
