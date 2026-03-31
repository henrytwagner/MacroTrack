import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionDivider from "@/components/SectionDivider";

export const metadata: Metadata = {
  title: "Kitchen Mode — Dialed",
  description:
    "Hands-free, voice-first food logging. Talk naturally while you cook and Dialed logs everything in real time. Powered by Gemini AI with BLE scale integration.",
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
      "As you speak, live draft cards appear with identified foods and nutrition data. Edit quantities, remove items, or add corrections — everything updates in real time.",
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
      "Hit save and your entire meal is logged with accurate macros. All entries are auto-categorized by meal type based on time of day. Cancel discards everything cleanly.",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

const capabilities = [
  {
    title: "Natural language understanding",
    description: "Say \"two eggs and some toast\" or \"about 200 grams of chicken breast\" — Dialed parses quantities, food names, and preparation methods from natural speech.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
  },
  {
    title: "Multi-item logging",
    description: "Log your entire meal in one sentence. \"Scrambled eggs, two slices of bacon, toast with butter, and a coffee with cream\" becomes four entries instantly.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
  },
  {
    title: "Voice corrections",
    description: "Made a mistake? Just say \"actually that was rice, not quinoa\" or \"remove the banana.\" Dialed edits your draft cards in real time without restarting.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  {
    title: "Custom food creation",
    description: "If Dialed can't find a food, it guides you through creating one by voice. \"What's the protein per serving?\" — speak the values and a new custom food is saved.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
  },
  {
    title: "Smart meal categorization",
    description: "Entries are auto-labeled as breakfast, lunch, dinner, or snack based on time of day and calorie density. All items from one Kitchen Mode session are grouped together.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Session state machine",
    description: "Kitchen Mode tracks session state — normal logging vs. mid-custom-food-creation — so it always knows context. Your session is never confused about what you're doing.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
];

export default function KitchenModePage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero — Blue themed */}
        <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(10,132,255,0.08)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(10,132,255,0.05)_0%,transparent_60%)]" />

          <div className="relative max-w-7xl mx-auto px-6">
            <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
              <div className="flex-1 text-center lg:text-left">
                <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">
                  Kitchen Mode
                </p>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                  Cook. Talk.
                  <br />
                  <span className="text-accent">Done.</span>
                </h1>
                <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
                  Kitchen Mode turns your kitchen into a smart logging studio.
                  Powered by <span className="text-protein-purple">Gemini AI</span> with bidirectional audio streaming, it
                  listens to you cook and logs everything in real time — completely
                  hands free.
                </p>
                <div className="mt-8 flex flex-wrap gap-3 justify-center lg:justify-start">
                  {[
                    { tag: "Bidirectional audio", color: "border-accent/20 text-accent" },
                    { tag: "Real-time cards", color: "border-accent/20 text-accent" },
                    { tag: "Gemini-powered", color: "border-protein-purple/20 text-protein-purple" },
                    { tag: "Scale-integrated", color: "border-fat-cyan/20 text-fat-cyan" },
                    { tag: "Auto-progression", color: "border-fat-cyan/20 text-fat-cyan" },
                    { tag: "Hands-free", color: "border-accent/20 text-accent" },
                  ].map(({ tag, color }) => (
                    <span
                      key={tag}
                      className={`bg-card-bg border ${color} text-xs font-medium px-4 py-2 rounded-full`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-10">
                  <Link
                    href="/access"
                    className="inline-flex btn-kitchen px-8 py-3.5 rounded-full"
                  >
                    Try Kitchen Mode
                  </Link>
                </div>
              </div>

              <div className="flex-shrink-0 relative">
                <div className="phone-frame w-[280px] sm:w-[300px] lg:w-[320px]" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 25px 50px -12px rgba(0,0,0,0.8), 0 0 60px rgba(10,132,255,0.12)" }}>
                  <Image
                    src="/media/screenshot-kitchen-mode.png"
                    alt="Kitchen Mode with live voice logging"
                    width={320}
                    height={693}
                    priority
                    className="w-full h-auto"
                  />
                </div>
                <div className="absolute -inset-16 bg-[radial-gradient(ellipse_at_center,rgba(10,132,255,0.15)_0%,transparent_60%)] -z-10" />
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

            <div className="bg-card-bg border border-accent/20 rounded-2xl p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-3 h-3 bg-accent rounded-full animate-pulse-glow" />
                <span className="text-sm text-muted font-mono">Kitchen Mode active</span>
              </div>
              <WaveformVisualizer />
              <div className="mt-6 space-y-3">
                <div className="bg-surface border border-card-border rounded-xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">&quot;Two eggs scrambled with cheese&quot;</span>
                    <div className="flex gap-4 mt-1.5">
                      <span className="text-xs text-protein-purple">24g protein</span>
                      <span className="text-xs text-carb-orange">2g carbs</span>
                      <span className="text-xs text-fat-cyan">22g fat</span>
                    </div>
                  </div>
                  <span className="text-sm text-cal-red font-mono">+320 cal</span>
                </div>
                <div className="bg-surface border border-card-border rounded-xl px-5 py-4 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">&quot;Toast with peanut butter&quot;</span>
                    <div className="flex gap-4 mt-1.5">
                      <span className="text-xs text-protein-purple">9g protein</span>
                      <span className="text-xs text-carb-orange">22g carbs</span>
                      <span className="text-xs text-fat-cyan">17g fat</span>
                    </div>
                  </div>
                  <span className="text-sm text-cal-red font-mono">+275 cal</span>
                </div>
                <div className="bg-surface border border-card-border rounded-xl px-5 py-4 flex items-center justify-between opacity-50">
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
                      <div className="w-20 h-20 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
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

        {/* Capabilities grid */}
        <section className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">
                Capabilities
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                More than a microphone
              </h2>
              <p className="mt-4 text-muted text-lg max-w-2xl mx-auto">
                Kitchen Mode is a full voice-driven food logging system with intent
                parsing, corrections, and custom food creation built in.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {capabilities.map((cap) => (
                <div
                  key={cap.title}
                  className="bg-card-bg border border-card-border rounded-2xl p-7 hover:border-accent/20 transition-all duration-300"
                >
                  <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-5">
                    {cap.icon}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{cap.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">{cap.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Scale integration — Cyan themed */}
        <section className="py-20 sm:py-28 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(64,200,224,0.06)_0%,transparent_50%)]" />

          <div className="relative max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="text-fat-cyan text-sm font-semibold tracking-widest uppercase mb-4">
                Scale Integration
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                Voice + scale ={" "}
                <span className="text-fat-cyan">perfect data.</span>
              </h2>
              <p className="mt-6 text-muted text-lg max-w-2xl mx-auto leading-relaxed">
                Kitchen Mode knows <em>what</em> you&apos;re eating. A connected Bluetooth
                scale knows <em>how much</em>. Together, they eliminate guesswork entirely.
              </p>
            </div>

            {/* How it works with scale */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
              <div className="bg-card-bg border border-fat-cyan/15 rounded-2xl p-8">
                <div className="w-12 h-12 rounded-xl bg-fat-cyan/10 flex items-center justify-center text-fat-cyan mb-5">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Place food on scale</h3>
                <p className="text-muted text-sm leading-relaxed">
                  Set your ingredient on the connected Bluetooth scale. Weight streams
                  live to Dialed — grams update on your phone in real time.
                </p>
              </div>

              <div className="bg-card-bg border border-accent/15 rounded-2xl p-8">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent mb-5">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Tell Dialed what it is</h3>
                <p className="text-muted text-sm leading-relaxed">
                  Say &quot;that&apos;s chicken breast&quot; or select the food manually. Kitchen Mode
                  pairs the food with the scale&apos;s exact weight automatically.
                </p>
              </div>

              <div className="bg-card-bg border border-carb-orange/15 rounded-2xl p-8">
                <div className="w-12 h-12 rounded-xl bg-carb-orange/10 flex items-center justify-center text-carb-orange mb-5">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Tare, add, repeat</h3>
                <p className="text-muted text-sm leading-relaxed">
                  Zero the scale, add your next ingredient, log it. Build an entire
                  bowl or plate one ingredient at a time — every addition weighed perfectly.
                </p>
              </div>

              <div className="bg-card-bg border border-cal-red/15 rounded-2xl p-8">
                <div className="w-12 h-12 rounded-xl bg-cal-red/10 flex items-center justify-center text-cal-red mb-5">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Gram-perfect macros</h3>
                <p className="text-muted text-sm leading-relaxed">
                  No more &quot;about one cup.&quot; The scale&apos;s weight feeds directly into
                  the nutrition calculation — every macro is exact.
                </p>
              </div>
            </div>

            {/* Scale features detail */}
            <div className="bg-card-bg border border-card-border rounded-3xl p-8 sm:p-10">
              <div className="flex flex-col lg:flex-row gap-10 items-start">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-6">
                    How scale integration works in Kitchen Mode
                  </h3>
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-fat-cyan/10 flex items-center justify-center text-fat-cyan flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1">Auto-connect</h4>
                        <p className="text-muted text-sm leading-relaxed">
                          Pair once and your scale reconnects automatically every time you open Kitchen Mode. No re-pairing, no setup.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-fat-cyan/10 flex items-center justify-center text-fat-cyan flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1">Live weight streaming</h4>
                        <p className="text-muted text-sm leading-relaxed">
                          Weight data streams continuously over BLE. You see the number update in real time as you add or remove food from the scale — no delay, no polling.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-fat-cyan/10 flex items-center justify-center text-fat-cyan flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1">Stability detection</h4>
                        <p className="text-muted text-sm leading-relaxed">
                          Dialed knows when the scale reading has stabilized vs. when you&apos;re still adding food. It waits for a stable reading before locking in the weight.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-fat-cyan/10 flex items-center justify-center text-fat-cyan flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1">Multi-unit support</h4>
                        <p className="text-muted text-sm leading-relaxed">
                          Grams, ounces, pounds &amp; ounces, or milliliters — Dialed reads whatever unit your scale is set to and converts automatically.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-fat-cyan/10 flex items-center justify-center text-fat-cyan flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-1">Tare &amp; stack ingredients</h4>
                        <p className="text-muted text-sm leading-relaxed">
                          Zero the scale between ingredients and keep building your bowl. Add rice, tare, add chicken, tare, add sauce — each ingredient logged individually with its exact weight. Perfect for meal prep and composed dishes.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Visual: scale + phone mockup */}
                <div className="lg:w-[300px] flex-shrink-0">
                  <div className="bg-surface border border-card-border rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-3 h-3 bg-fat-cyan rounded-full animate-pulse-glow" />
                      <span className="text-sm text-muted font-mono">Scale connected</span>
                    </div>
                    <div className="text-center py-8">
                      <div className="text-5xl font-bold text-fat-cyan font-mono">247.3</div>
                      <div className="text-muted text-sm mt-2">grams &middot; stable</div>
                    </div>
                    <div className="border-t border-card-border pt-4 mt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">Food</span>
                        <span>Chicken breast</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">Calories</span>
                        <span className="text-cal-red">408 cal</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">Protein</span>
                        <span className="text-protein-purple">76.5g</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">Carbs</span>
                        <span className="text-carb-orange">0g</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted">Fat</span>
                        <span className="text-fat-cyan">8.9g</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-muted text-xs mt-4">
                    Currently supports <Link href="/features/scale" className="text-fat-cyan hover:text-fat-cyan/80 transition-colors">Etekcity ESN00</Link>
                  </p>
                </div>
              </div>
            </div>

            {/* Why scale matters */}
            <div className="mt-10 bg-fat-cyan/5 border border-fat-cyan/15 rounded-2xl p-8 text-center">
              <p className="text-fat-cyan font-semibold mb-2">Why this matters</p>
              <p className="text-muted max-w-2xl mx-auto leading-relaxed">
                Studies show people underestimate portions by 30-50%. A &quot;tablespoon&quot; of
                peanut butter can be off by 100+ calories. Kitchen Mode with a scale gives
                you <strong className="text-foreground">the most accurate macro tracking possible</strong> — and
                it&apos;s actually <em>faster</em> than eyeballing and typing a guess.
              </p>
            </div>

            {/* Smart Auto-Progression callout */}
            <div className="mt-6 bg-card-bg border border-fat-cyan/20 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="font-semibold mb-1">Smart Auto-Progression</p>
                <p className="text-muted text-sm leading-relaxed max-w-xl">
                  Prep five ingredients. Place each on the scale, scan the barcode, move on.
                  Each new scan confirms the last item and resets the scale — log a whole meal without touching your phone.
                </p>
              </div>
              <Link href="/features/scale" className="flex-shrink-0 text-fat-cyan text-sm font-medium flex items-center gap-1.5 hover:gap-2.5 transition-all whitespace-nowrap">
                See how it works
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </div>
        </section>

        <SectionDivider />


        {/* Draft card states */}
        <section className="py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="text-carb-orange text-sm font-semibold tracking-widest uppercase mb-4">
                Draft Cards
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Three states. Always clear.
              </h2>
              <p className="mt-4 text-muted text-lg max-w-2xl mx-auto">
                Every draft card in Kitchen Mode has a distinct visual state so you always know what&apos;s happening.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-card-bg border border-card-border rounded-2xl p-7">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-accent" />
                  <span className="text-sm font-semibold">Normal</span>
                </div>
                <p className="text-muted text-sm leading-relaxed">
                  Food identified, nutrition loaded. Ready to save. You can tap to
                  edit the quantity or swap the food match.
                </p>
              </div>
              <div className="bg-card-bg border border-carb-orange/30 rounded-2xl p-7">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-carb-orange animate-pulse" />
                  <span className="text-sm font-semibold text-carb-orange">Clarifying</span>
                </div>
                <p className="text-muted text-sm leading-relaxed">
                  Dialed needs more info. The card pulses with a highlighted question —
                  &quot;Did you mean brown rice or white rice?&quot; Respond by voice.
                </p>
              </div>
              <div className="bg-card-bg border border-protein-purple/30 rounded-2xl p-7">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-protein-purple animate-pulse" />
                  <span className="text-sm font-semibold text-protein-purple">Creating</span>
                </div>
                <p className="text-muted text-sm leading-relaxed">
                  Food not found — Dialed is guiding you through creating a custom food.
                  Fields fill progressively as you speak each nutrition value.
                </p>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* AI trust section — Purple themed */}
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-6">
            <div className="rounded-3xl border border-protein-purple/20 bg-card-bg p-8 sm:p-12">
              <div className="flex flex-col sm:flex-row gap-8 items-start">
                <div className="w-16 h-16 rounded-2xl bg-protein-purple/10 flex items-center justify-center text-protein-purple flex-shrink-0">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-3">
                    <span className="text-protein-purple">AI</span> that parses, never fabricates
                  </h3>
                  <p className="text-muted leading-relaxed text-base mb-4">
                    Gemini AI understands what you said and identifies the foods you mentioned. It <strong className="text-foreground">never generates, estimates,
                    or approximates nutritional data</strong>. Every calorie and gram comes from
                    USDA FoodData Central or your own verified custom foods.
                  </p>
                  <p className="text-muted leading-relaxed text-base">
                    This is a deliberate design choice. If Dialed can&apos;t find a food with verified
                    data, it asks you to clarify or guides you through creating it — it never guesses.
                    The food lookup chain is: your custom foods &rarr; community foods &rarr; USDA database &rarr; voice-guided creation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Session behavior */}
        <section className="py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Session outcomes
              </h2>
              <p className="mt-4 text-muted text-lg max-w-2xl mx-auto">
                Kitchen Mode sessions are designed to be safe and predictable.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-card-bg border border-accent/15 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-4">
                  <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-lg font-bold">Save or navigate away</h3>
                </div>
                <p className="text-muted text-sm leading-relaxed">
                  All draft entries are persisted to your food log. Any custom foods you
                  created during the session are saved permanently for future use.
                </p>
              </div>
              <div className="bg-card-bg border border-cal-red/15 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-4">
                  <svg className="w-6 h-6 text-cal-red" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <h3 className="text-lg font-bold">Cancel</h3>
                </div>
                <p className="text-muted text-sm leading-relaxed">
                  Everything is discarded cleanly — all draft entries <em>and</em> any custom
                  foods created during the session are deleted. Nothing persists.
                </p>
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
                className="mt-8 rounded-full btn-kitchen px-8 py-3.5"
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
