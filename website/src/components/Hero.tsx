import Image from "next/image";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden noise-bg pt-16">
      {/* Warm gradient background — red and orange dominant */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-full h-[60%] bg-[radial-gradient(ellipse_at_top_left,rgba(255,55,95,0.15)_0%,transparent_50%)]" />
        <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(255,159,10,0.12)_0%,transparent_50%)]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
        {/* Text content */}
        <div className="flex-1 text-center lg:text-left">
          <Image
            src="/media/app-icon-dark.png"
            alt="Dialed"
            width={80}
            height={80}
            className="rounded-2xl mb-8 glow-rings mx-auto lg:mx-0 rotate-90"
          />

          <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight leading-[0.95]">
            Done cooking.
            <br />
            <span className="text-brand-gradient-animated">Done logging.</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted max-w-lg mx-auto lg:mx-0 leading-relaxed">
            Other trackers ask for your best guess. Dialed records what you actually ate
            — exact grams, verified nutrition, logged while your hands are full.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
            <Link
              href="/access"
              className="btn-brand flex items-center gap-3 px-8 py-4 rounded-2xl"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div className="text-left">
                <div className="text-[10px] leading-none opacity-70">Download on the</div>
                <div className="text-base leading-tight">App Store</div>
              </div>
            </Link>

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

          {/* Macro color bar — bold */}
          <div className="mt-12 flex items-center gap-1.5 justify-center lg:justify-start">
            <div className="h-2 w-16 rounded-full bg-cal-red macro-bar-shimmer" />
            <div className="h-2 w-10 rounded-full bg-protein-purple macro-bar-shimmer" />
            <div className="h-2 w-16 rounded-full bg-carb-orange macro-bar-shimmer" />
            <div className="h-2 w-10 rounded-full bg-fat-cyan macro-bar-shimmer" />
          </div>
        </div>

        {/* Phone mockup */}
        <div className="flex-shrink-0 relative animate-float">
          <div className="phone-frame glow-rings w-[280px] sm:w-[300px] lg:w-[340px]">
            <Image
              src="/media/screenshot-dashboard-dark.png"
              alt="Dialed app dashboard showing macro tracking"
              width={340}
              height={736}
              priority
              className="w-full h-auto"
            />
          </div>
          {/* Warm glow behind phone */}
          <div className="absolute -inset-16 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,55,95,0.14)_0%,transparent_50%)] -translate-x-[15%]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,159,10,0.12)_0%,transparent_50%)] translate-x-[15%] translate-y-[10%]" />
          </div>
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
