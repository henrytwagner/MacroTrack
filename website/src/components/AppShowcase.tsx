import Image from "next/image";

const screens = [
  {
    src: "/media/screenshot-log-dark.png",
    alt: "Detailed food log with macro breakdown",
    label: "Food Log",
  },
  {
    src: "/media/screenshot-dashboard-dark.png",
    alt: "Dashboard with daily progress rings",
    label: "Dashboard",
  },
  {
    src: "/media/screenshot-food-detail.png",
    alt: "Quick log food detail with macro numbers",
    label: "Quick Log",
  },
];

export default function AppShowcase() {
  return (
    <section className="relative py-28 sm:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,255,127,0.04)_0%,transparent_60%)]" />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">
            The App
          </p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            Beautiful by default.
          </h2>
          <p className="mt-4 text-muted text-lg max-w-xl mx-auto">
            Every screen designed for speed and clarity. Dark mode native.
            Information-dense without the clutter.
          </p>
        </div>

        {/* Phone gallery */}
        <div className="flex items-end justify-center gap-4 sm:gap-6 lg:gap-10">
          {screens.map((screen, i) => (
            <div
              key={screen.label}
              className={`flex-shrink-0 transition-all duration-500 ${
                i === 1
                  ? "w-[220px] sm:w-[260px] lg:w-[300px] z-10 -mt-4"
                  : "w-[180px] sm:w-[220px] lg:w-[260px] opacity-75 hidden sm:block"
              }`}
            >
              <div className={`phone-frame ${i === 1 ? "glow-green" : ""}`}>
                <Image
                  src={screen.src}
                  alt={screen.alt}
                  width={300}
                  height={650}
                  className="w-full h-auto"
                />
              </div>
              <p className="text-center text-muted text-sm mt-4 font-medium">
                {screen.label}
              </p>
            </div>
          ))}
        </div>

        {/* Feature pills below showcase */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-4">
          {[
            { label: "Dark mode native", icon: "moon" },
            { label: "Real-time progress", icon: "chart" },
            { label: "Meal categorization", icon: "clock" },
            { label: "USDA verified", icon: "check" },
          ].map((pill) => (
            <div
              key={pill.label}
              className="flex items-center gap-2 bg-card-bg border border-card-border rounded-full px-5 py-2.5"
            >
              {pill.icon === "moon" && (
                <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
              {pill.icon === "chart" && (
                <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
                </svg>
              )}
              {pill.icon === "clock" && (
                <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {pill.icon === "check" && (
                <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span className="text-sm text-muted">{pill.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
