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
    <section className="relative py-28 sm:py-36 overflow-hidden section-gradient-warm">
      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-carb-orange text-sm font-semibold tracking-widest uppercase mb-4">
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
              <div className={`phone-frame ${i === 1 ? "glow-rings" : ""}`}>
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
            { label: "Dark mode native", color: "text-cal-red" },
            { label: "Real-time progress", color: "text-carb-orange" },
            { label: "Meal categorization", color: "text-protein-purple" },
            { label: "USDA verified", color: "text-fat-cyan" },
          ].map((pill) => (
            <div
              key={pill.label}
              className="flex items-center gap-2 bg-card-bg border border-card-border rounded-full px-5 py-2.5"
            >
              <span className={`w-2 h-2 rounded-full ${pill.color.replace("text-", "bg-")}`} />
              <span className="text-sm text-muted">{pill.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
