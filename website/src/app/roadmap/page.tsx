import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionDivider from "@/components/SectionDivider";

export const metadata: Metadata = {
  title: "Roadmap — Dialed",
  description:
    "See what's live, in development, and planned for Dialed. We're building toward a future where nutrition logging is invisible.",
};

const statusStyles: Record<string, { badge: string; dot: string }> = {
  Live: {
    badge: "bg-accent/15 text-accent border-accent/25",
    dot: "bg-accent",
  },
  "In Development": {
    badge: "bg-carb-orange/15 text-carb-orange border-carb-orange/25",
    dot: "bg-carb-orange",
  },
  Planned: {
    badge: "bg-protein-purple/15 text-protein-purple border-protein-purple/25",
    dot: "bg-protein-purple",
  },
};

const sections = [
  {
    title: "Live Now",
    description: "Shipped and available in the current beta.",
    status: "Live",
    items: [
      {
        title: "Kitchen Mode",
        description:
          "Hands-free voice logging powered by Gemini AI. Speak naturally while you cook — draft cards appear in real time.",
        link: "/features/kitchen-mode",
      },
      {
        title: "Barcode Scanner",
        description:
          "Continuous barcode detection for packaged foods. Point, scan, log — in one fluid motion.",
        link: null,
      },
      {
        title: "Smart Macro Tracking",
        description:
          "Full macro breakdowns, automatic meal categorization, daily targets, and real-time progress rings.",
        link: null,
      },
      {
        title: "Custom Foods",
        description:
          "Create your own foods with exact nutrition data. Voice-guided creation flow built into Kitchen Mode.",
        link: null,
      },
      {
        title: "USDA Food Database",
        description:
          "Access to 500K+ verified foods from USDA FoodData Central. Real data, never estimated.",
        link: null,
      },
      {
        title: "BLE Smart Scale",
        description:
          "Place food on the scale, scan the barcode, move to the next ingredient. Gram-perfect accuracy, live weight streaming, hands-free from start to finish.",
        link: "/features/scale",
      },
      {
        title: "Smart Auto-Progression",
        description:
          "Prep five ingredients. Scan each one. Done — macros for everything, exact to the gram. Each scan confirms the previous item and resets the scale automatically.",
        link: "/features/scale",
      },
    ],
  },
  {
    title: "In Development",
    description: "Actively being built. Coming in upcoming releases.",
    status: "In Development",
    items: [
      {
        title: "Nutrition Label Scanning",
        description:
          "Point your camera at any nutrition label and Dialed reads it instantly using on-device OCR.",
        link: null,
      },
      {
        title: "Portion Depth Estimation",
        description:
          "Estimate serving sizes from a single photo using monocular depth analysis via iOS Vision framework.",
        link: null,
      },
      {
        title: "Smart Auto-Progression",
        description:
          "Scan-to-confirm scale workflow. Each barcode scan locks in the previous item's weight, zeros the scale, and queues the next food automatically. Five ingredients, five scans, zero extra taps.",
        link: "/features/kitchen-mode",
      },
    ],
  },
  {
    title: "Planned",
    description: "On the roadmap. Timelines will be shared as development begins.",
    status: "Planned",
    items: [
      {
        title: "Camera Food Recognition",
        description:
          "Point your camera at a meal and Dialed identifies it. Starting with common produce and whole foods.",
        link: null,
      },
      {
        title: "Apple Health Sync",
        description:
          "Two-way sync with Apple Health. Macros, weight, and nutrition data flow between Dialed and your health ecosystem.",
        link: null,
      },
      {
        title: "Meal Planning & Goal Pacing",
        description:
          "Weekly goals with real-time pacing insights. Dialed suggests what to eat next to stay on target.",
        link: null,
      },
      {
        title: "Community Food Database",
        description:
          "User-verified food entries with reputation scoring. Better data, built by the community.",
        link: null,
      },
    ],
  },
];

export default function RoadmapPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,255,127,0.05)_0%,transparent_60%)]" />
          <div className="relative max-w-7xl mx-auto px-6 text-center">
            <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">
              Roadmap
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              What we&apos;re building.
              <br />
              <span className="text-muted">And what&apos;s next.</span>
            </h1>
            <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
              We&apos;re building toward a future where nutrition logging is invisible.
              Here&apos;s an honest look at where things stand — what&apos;s shipped,
              what&apos;s in progress, and what&apos;s on the horizon.
            </p>
          </div>
        </section>

        <SectionDivider />

        {/* Roadmap sections */}
        {sections.map((section, sectionIdx) => (
          <div key={section.title}>
            <section className="py-20 sm:py-28">
              <div className="max-w-5xl mx-auto px-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-3 h-3 rounded-full ${statusStyles[section.status].dot}`} />
                  <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                    {section.title}
                  </h2>
                  <span
                    className={`text-xs font-medium px-3 py-1 rounded-full border ${statusStyles[section.status].badge}`}
                  >
                    {section.status}
                  </span>
                </div>
                <p className="text-muted text-lg mb-12 ml-7">
                  {section.description}
                </p>

                <div className="space-y-4">
                  {section.items.map((item) => (
                    <div
                      key={item.title}
                      className="group bg-card-bg border border-card-border rounded-2xl p-6 sm:p-8 hover:border-card-border/80 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold">{item.title}</h3>
                          <p className="text-muted text-sm leading-relaxed mt-1 max-w-xl">
                            {item.description}
                          </p>
                        </div>
                        {item.link && (
                          <Link
                            href={item.link}
                            className="flex-shrink-0 text-cal-red text-sm font-medium flex items-center gap-1.5 hover:gap-2.5 transition-all"
                          >
                            Learn more
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            {sectionIdx < sections.length - 1 && <SectionDivider />}
          </div>
        ))}

        <SectionDivider />

        {/* Vision */}
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-6">
            <div className="rounded-3xl border border-card-border bg-card-bg p-8 sm:p-12">
              <h3 className="text-2xl font-bold mb-4">Where we&apos;re headed</h3>
              <p className="text-muted leading-relaxed">
                The long-term vision for Dialed is a world where your phone becomes a
                passive nutrition observer. Combine a Bluetooth scale for weight,
                a camera for food identification, and voice for corrections — and
                logging becomes something that happens while you cook, not after.
                We&apos;re focused on making the collection of great nutritional data
                effortless. From there, anonymized data can power assistive health
                models that help people understand their bodies better.
              </p>
              <p className="text-muted leading-relaxed mt-4">
                But we&apos;re building this responsibly. Every feature ships when it&apos;s
                ready, not when it&apos;s promised. This roadmap reflects our honest
                assessment of what&apos;s next.
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
                Help shape what&apos;s next
              </h2>
              <p className="mt-4 max-w-md text-muted leading-relaxed">
                Join the beta and your feedback directly influences what we build.
                Every feature on this roadmap is shaped by real users.
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
