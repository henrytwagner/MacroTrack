import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionDivider from "@/components/SectionDivider";

export const metadata: Metadata = {
  title: "About — Dialed",
  description:
    "The story behind Dialed. Built by Henry Wagner at the University of Michigan, Dialed is reimagining how people track nutrition.",
};

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,255,127,0.04)_0%,transparent_60%)]" />
          <div className="relative max-w-4xl mx-auto px-6 text-center">
            <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">
              About
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              Built by someone who
              <br />
              <span className="text-muted">couldn&apos;t find the right app.</span>
            </h1>
          </div>
        </section>

        <SectionDivider />

        {/* Story */}
        <section className="py-20 sm:py-28">
          <div className="max-w-3xl mx-auto px-6">
            <div className="flex flex-col sm:flex-row items-start gap-8 mb-12">
              {/* Placeholder for Henry's photo */}
              <div className="flex-shrink-0 w-24 h-24 rounded-2xl bg-card-bg border border-card-border flex items-center justify-center">
                <svg className="w-10 h-10 text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold">Henry Wagner</h2>
                <p className="text-muted mt-1">Builder &middot; University of Michigan</p>
              </div>
            </div>

            <div className="prose prose-invert max-w-none space-y-6 text-muted leading-relaxed text-base">
              <p>
                Over the past year, I&apos;ve become deeply invested in the gym and my health.
                Like a lot of people, I turned to macro tracking to understand what I was
                eating — and like a lot of people, I got frustrated fast.
              </p>
              <p>
                Every app I tried fell into one of two buckets: <strong className="text-foreground">super
                manual entry</strong> (search, scroll, tap, repeat) or <strong className="text-foreground">overly
                AI-based apps that make guesses</strong> about nutrition data. Neither felt right.
                Manual logging killed my flow while cooking. And I didn&apos;t trust apps that
                were just guessing my macros.
              </p>
              <p>
                I wanted something that worked <em>with me</em> while I cooked. Something I
                could talk to naturally, that would pull from verified data sources, and
                that supported multiple ways to log — voice, barcode, camera, or just
                typing it in. I wanted an app that met me where I was, not one that forced
                me into a single workflow.
              </p>
              <p>
                That&apos;s how <strong className="text-foreground">Kitchen Mode</strong> was born — a hands-free,
                voice-first logging experience powered by AI that parses what you say but
                never fabricates nutrition data. You cook, you talk, and your macros are
                logged.
              </p>
              <p>
                Then I realized a Bluetooth scale could change everything. If Kitchen Mode
                already knows <em>what</em> you&apos;re eating, and a scale knows <em>how much</em>,
                you get incredibly accurate logging with almost zero effort. No more eyeballing
                portions. No more guessing if that was one tablespoon or two.
              </p>
              <p>
                The longer-term vision goes further. I&apos;m focused on building a reputable
                database of foods with barcode data and complete nutrition information. The
                goal is to make collecting great data really easy — and then see how that
                data can help people. Anonymized, high-quality nutrition data has the
                potential to power assistive health models that help people understand
                patterns in how they eat and feel.
              </p>
              <p>
                But that starts with getting the basics right: making it dead simple to log
                what you eat, with data you can actually trust.
              </p>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* University context */}
        <section className="py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-6">
            <div className="rounded-3xl border border-card-border bg-card-bg p-8 sm:p-12">
              <div className="flex flex-col sm:flex-row gap-8">
                <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-[#00274C]/20 border border-[#FFCB05]/20 flex items-center justify-center text-[#FFCB05]">
                  <span className="text-2xl font-bold">M</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-3">University of Michigan</h3>
                  <p className="text-muted leading-relaxed">
                    Dialed is being developed at the University of Michigan, combining
                    research in human-computer interaction, mobile computing, and
                    health informatics. The project draws on faculty guidance in AR/HCI
                    and a rigorous engineering approach to building consumer health tools
                    that are both technically sound and genuinely useful.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Tech stack */}
        <section className="py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Built with
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { name: "SwiftUI", detail: "Native iOS" },
                { name: "Gemini AI", detail: "Voice parsing" },
                { name: "USDA FoodData", detail: "Nutrition data" },
                { name: "CoreBluetooth", detail: "Scale integration" },
                { name: "Fastify", detail: "API server" },
                { name: "PostgreSQL", detail: "Database" },
                { name: "WebSocket", detail: "Real-time streaming" },
                { name: "Prisma", detail: "Data layer" },
              ].map((tech) => (
                <div
                  key={tech.name}
                  className="bg-card-bg border border-card-border rounded-xl p-5 text-center hover:border-accent/20 transition-colors"
                >
                  <p className="font-semibold text-sm">{tech.name}</p>
                  <p className="text-muted text-xs mt-1">{tech.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Contact */}
        <section className="py-20 sm:py-28">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Get in touch
            </h2>
            <p className="text-muted text-lg mb-10">
              Questions, feedback, or just want to chat about macro tracking?
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="mailto:henry@dialedmealsandmacros.com"
                className="inline-flex items-center gap-2 bg-card-bg border border-card-border rounded-full px-6 py-3 text-sm font-medium hover:border-accent/30 transition-colors"
              >
                <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                Email
              </a>
              {/* Placeholder social links — update URLs when ready */}
              <a
                href="#"
                className="inline-flex items-center gap-2 bg-card-bg border border-card-border rounded-full px-6 py-3 text-sm font-medium hover:border-accent/30 transition-colors"
              >
                <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Twitter / X
              </a>
              <a
                href="#"
                className="inline-flex items-center gap-2 bg-card-bg border border-card-border rounded-full px-6 py-3 text-sm font-medium hover:border-accent/30 transition-colors"
              >
                <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                LinkedIn
              </a>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* CTA */}
        <section className="py-20 sm:py-28">
          <div className="max-w-4xl mx-auto px-6">
            <div className="flex flex-col items-center rounded-3xl border border-card-border bg-card-bg px-8 py-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Try Dialed
              </h2>
              <p className="mt-4 max-w-md text-muted leading-relaxed">
                Join the beta and see what macro tracking should feel like.
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
