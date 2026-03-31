import Image from "next/image";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden noise-bg pt-16">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,127,0.06)_0%,transparent_70%)]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(0,255,127,0.08)_0%,transparent_60%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
        {/* Text content */}
        <div className="flex-1 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse-glow" />
            <span className="text-accent text-sm font-medium">Now on iOS</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight leading-[0.95]">
            Track less.
            <br />
            <span className="text-accent">Know more.</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted max-w-lg mx-auto lg:mx-0 leading-relaxed">
            The nutrition tracker that fits your life. Just speak, scan, or snap
            — Dialed handles the rest.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
            <a
              href="#"
              className="group flex items-center gap-3 bg-foreground text-background font-semibold px-8 py-4 rounded-2xl hover:bg-foreground/90 transition-all"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div className="text-left">
                <div className="text-[10px] leading-none opacity-70">Download on the</div>
                <div className="text-base leading-tight">App Store</div>
              </div>
            </a>

            <a
              href="#features"
              className="text-muted hover:text-foreground transition-colors text-sm font-medium flex items-center gap-2"
            >
              See features
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>

          {/* Macro color bar */}
          <div className="mt-12 flex items-center gap-1 justify-center lg:justify-start">
            <div className="h-1 w-12 rounded-full bg-cal-red" />
            <div className="h-1 w-12 rounded-full bg-protein-purple" />
            <div className="h-1 w-12 rounded-full bg-carb-orange" />
            <div className="h-1 w-12 rounded-full bg-fat-cyan" />
          </div>
        </div>

        {/* Phone mockup */}
        <div className="flex-shrink-0 relative animate-float">
          <div className="phone-frame w-[280px] sm:w-[300px] lg:w-[340px]">
            <Image
              src="/media/screenshot-dashboard-dark.png"
              alt="Dialed app dashboard showing macro tracking"
              width={340}
              height={736}
              priority
              className="w-full h-auto"
            />
          </div>
          {/* Glow behind phone */}
          <div className="absolute -inset-10 bg-[radial-gradient(ellipse_at_center,rgba(0,255,127,0.12)_0%,transparent_70%)] -z-10" />
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <div className="w-6 h-10 rounded-full border-2 border-muted/30 flex justify-center pt-2">
          <div className="w-1 h-2 bg-muted/50 rounded-full animate-bounce" />
        </div>
      </div>
    </section>
  );
}
