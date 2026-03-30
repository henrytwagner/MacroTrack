const features = [
  {
    title: "Voice-First Logging",
    description:
      'Say "I had two eggs and toast with peanut butter" and watch it appear instantly. No searching, no typing.',
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    title: "Kitchen Mode",
    description:
      "Full-screen immersive logging while you cook. Live draft cards update in real-time as you speak.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.047 8.287 8.287 0 009 9.601a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.468 5.99 5.99 0 00-1.925 3.547 5.975 5.975 0 01-2.133-1.001A3.75 3.75 0 0012 18z" />
      </svg>
    ),
  },
  {
    title: "Barcode Scanning",
    description:
      "Scan any packaged food and get instant, accurate nutrition data. Fast and effortless.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zm0 9.75c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zm9.75-9.75c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625v4.5c0 .621.504 1.125 1.125 1.125h4.5c.621 0 1.125-.504 1.125-1.125v-4.5c0-.621-.504-1.125-1.125-1.125h-4.5a1.125 1.125 0 00-1.125 1.125z" />
      </svg>
    ),
  },
  {
    title: "Smart Macro Tracking",
    description:
      "Automatic meal categorization, daily targets, and progress visualization. Stay dialed in to your goals.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-card-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <span className="text-xl font-bold tracking-tight">Dialed</span>
          <a
            href="#download"
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-hover"
          >
            Download
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 pt-40 pb-24 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-card-border bg-card-bg px-4 py-1.5 text-sm text-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
          Now on TestFlight
        </div>
        <h1 className="max-w-3xl text-5xl font-bold leading-tight tracking-tight sm:text-7xl">
          Nutrition tracking,{" "}
          <span className="text-accent">dialed in.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
          Log meals with your voice, scan barcodes, or type it out. Dialed makes
          macro tracking fast, accurate, and effortless.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <a
            href="#download"
            className="rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-black transition-colors hover:bg-accent-hover"
          >
            Get Early Access
          </a>
          <a
            href="#features"
            className="rounded-full border border-card-border px-8 py-3.5 text-base font-semibold transition-colors hover:bg-card-bg"
          >
            See Features
          </a>
        </div>
      </section>

      {/* Screenshot placeholder */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <div className="flex items-center justify-center rounded-2xl border border-card-border bg-card-bg h-80 sm:h-[28rem]">
          <p className="text-muted text-sm">App screenshots coming soon</p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-6 pb-24">
        <h2 className="mb-4 text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Everything you need to stay on track
        </h2>
        <p className="mx-auto mb-16 max-w-2xl text-center text-muted">
          Built for people who care about what they eat but don&apos;t want logging to
          be a chore.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-card-border bg-card-bg p-8 transition-colors hover:border-accent/30"
            >
              <div className="mb-4 inline-flex items-center justify-center rounded-xl bg-accent/10 p-3 text-accent">
                {feature.icon}
              </div>
              <h3 className="mb-2 text-xl font-semibold">{feature.title}</h3>
              <p className="text-muted leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        id="download"
        className="mx-auto w-full max-w-6xl px-6 pb-24"
      >
        <div className="flex flex-col items-center rounded-2xl border border-card-border bg-card-bg px-8 py-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to get dialed in?
          </h2>
          <p className="mt-4 max-w-md text-muted">
            Dialed is currently in beta on TestFlight. Join now and help shape
            the future of nutrition tracking.
          </p>
          <a
            href="#"
            className="mt-8 rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-black transition-colors hover:bg-accent-hover"
          >
            Join the Beta
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-card-border">
        <div className="mx-auto max-w-6xl flex flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-between">
          <span className="text-sm text-muted">
            &copy; {new Date().getFullYear()} Dialed. All rights reserved.
          </span>
          <div className="flex gap-6 text-sm text-muted">
            <a href="#" className="transition-colors hover:text-foreground">
              Privacy
            </a>
            <a href="#" className="transition-colors hover:text-foreground">
              Terms
            </a>
            <a href="#" className="transition-colors hover:text-foreground">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
