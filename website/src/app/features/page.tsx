import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionDivider from "@/components/SectionDivider";

export const metadata: Metadata = {
  title: "Features — Dialed",
  description:
    "Voice-first Kitchen Mode, barcode scanning, smart macro tracking, and BLE scale support. Every way to log, zero friction.",
};

const features = [
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
    name: "Kitchen Mode",
    description:
      "Hands-free, voice-first food logging. Talk naturally while you cook — Dialed listens, identifies foods, and logs macros in real time.",
    color: "text-accent",
    bgColor: "bg-accent/10",
    href: "/features/kitchen-mode",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
      </svg>
    ),
    name: "BLE Smart Scale",
    description:
      "Place food on the scale, scan the barcode, move to the next ingredient. Dialed logs the exact weight and queues the next food automatically. Prep an entire meal without lifting your phone.",
    color: "text-fat-cyan",
    bgColor: "bg-fat-cyan/10",
    href: "/features/scale",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
      </svg>
    ),
    name: "Scan & Identify",
    description:
      "Point your camera at a barcode or a meal — Dialed handles the rest. Continuous barcode detection for packaged foods, recognition for whole foods and restaurant meals.",
    color: "text-protein-purple",
    bgColor: "bg-protein-purple/10",
    href: null,
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    name: "Smart Macro Tracking",
    description:
      "Full breakdown of protein, carbs, fat, and calories. Automatic meal categorization, daily targets, and real-time progress visualization.",
    color: "text-cal-red",
    bgColor: "bg-cal-red/10",
    href: null,
  },
];

export default function FeaturesPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,255,127,0.05)_0%,transparent_60%)]" />
          <div className="relative max-w-7xl mx-auto px-6 text-center">
            <p className="text-cal-red text-sm font-semibold tracking-widest uppercase mb-4">
              Features
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              Every way to log.
              <br />
              <span className="text-muted">Zero friction.</span>
            </h1>
            <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
              Voice, barcode, camera, or manual entry. Dialed supports every input modality
              so you can log in whatever way feels natural. No single method is required
              — use any combination that works for you.
            </p>
          </div>
        </section>

        <SectionDivider />

        {/* Feature cards */}
        <section className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature) => {
                const Card = (
                  <div
                    key={feature.name}
                    className={`group relative bg-card-bg border border-card-border rounded-3xl p-8 sm:p-10 hover:border-accent/20 transition-all duration-500 ${
                      feature.href ? "cursor-pointer" : ""
                    }`}
                  >
                    <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl ${feature.bgColor} ${feature.color} mb-6`}>
                      {feature.icon}
                    </div>
                    <h3 className="text-2xl font-bold mb-3">{feature.name}</h3>
                    <p className="text-muted leading-relaxed text-base">{feature.description}</p>
                    {feature.href && (
                      <div className="mt-6 flex items-center gap-2 text-cal-red text-sm font-medium">
                        Learn more
                        <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-3xl bg-accent/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  </div>
                );

                return feature.href ? (
                  <Link key={feature.name} href={feature.href} className="block">
                    {Card}
                  </Link>
                ) : (
                  <div key={feature.name}>{Card}</div>
                );
              })}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* App screenshots */}
        <section className="py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                See it in action
              </h2>
              <p className="mt-4 text-muted text-lg">
                Clean, dark-mode native design built for speed and clarity.
              </p>
            </div>
            <div className="flex justify-center gap-6 sm:gap-10 overflow-hidden">
              <div className="phone-frame w-[200px] sm:w-[240px] -rotate-3">
                <Image
                  src="/media/screenshot-log-dark.png"
                  alt="Food log view"
                  width={240}
                  height={520}
                  className="w-full h-auto"
                />
              </div>
              <div className="phone-frame w-[220px] sm:w-[260px] relative z-10 glow-green">
                <Image
                  src="/media/screenshot-dashboard-dark.png"
                  alt="Dashboard with macro progress"
                  width={260}
                  height={563}
                  className="w-full h-auto"
                />
              </div>
              <div className="phone-frame w-[200px] sm:w-[240px] rotate-3">
                <Image
                  src="/media/screenshot-food-detail.png"
                  alt="Food detail view"
                  width={240}
                  height={520}
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Data trust section */}
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <p className="text-cal-red text-sm font-semibold tracking-widest uppercase mb-4">
              Data You Can Trust
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Real nutrition data.
              <br />
              <span className="text-muted">Never estimated.</span>
            </h2>
            <p className="mt-6 text-muted text-lg max-w-2xl mx-auto leading-relaxed">
              Unlike apps that use AI to guess your macros, Dialed sources every
              nutritional value from USDA FoodData Central or user-verified entries.
              Our AI parses what you say — it never fabricates nutrition data.
            </p>
            <div className="mt-12 flex flex-wrap justify-center gap-4">
              {["USDA FoodData Central", "500K+ verified foods", "AI parser, not estimator", "Community-verified"].map(
                (tag) => (
                  <span
                    key={tag}
                    className="bg-card-bg border border-card-border text-muted text-sm font-medium px-5 py-2.5 rounded-full"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* CTA */}
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-6">
            <div className="flex flex-col items-center rounded-3xl border border-card-border bg-card-bg px-8 py-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Ready to try it?
              </h2>
              <p className="mt-4 max-w-md text-muted leading-relaxed">
                Dialed is in beta on TestFlight. Sign up for early access and help
                shape the future of macro tracking.
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
