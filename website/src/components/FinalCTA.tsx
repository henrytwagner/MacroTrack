import Image from "next/image";

export default function FinalCTA() {
  return (
    <section className="relative py-28 sm:py-36 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,127,0.08)_0%,transparent_50%)]" />

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <Image
          src="/media/app-icon-dark.png"
          alt="Dialed"
          width={80}
          height={80}
          className="mx-auto rounded-2xl mb-8"
        />

        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
          Your macros,
          <br />
          <span className="text-accent">on autopilot.</span>
        </h2>

        <p className="mt-6 text-muted text-lg max-w-xl mx-auto leading-relaxed">
          Stop spending minutes logging every meal. Dialed makes nutrition tracking
          as effortless as talking to a friend.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center">
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
        </div>

        {/* Macro color bar */}
        <div className="mt-16 flex items-center gap-1 justify-center">
          <div className="h-1 w-16 rounded-full bg-cal-red" />
          <div className="h-1 w-16 rounded-full bg-protein-purple" />
          <div className="h-1 w-16 rounded-full bg-carb-orange" />
          <div className="h-1 w-16 rounded-full bg-fat-cyan" />
        </div>
      </div>
    </section>
  );
}
