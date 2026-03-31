import Image from "next/image";

const screens = [
  {
    src: "/media/screenshot-dashboard-dark.png",
    alt: "Dashboard with daily progress rings",
    label: "Dashboard",
  },
  {
    src: "/media/screenshot-log-dark.png",
    alt: "Detailed food log with macro breakdown",
    label: "Food Log",
  },
  {
    src: "/media/screenshot-food-detail.png",
    alt: "Food detail card with macro numbers",
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
            Every screen designed for speed and clarity. Dark mode native. Information-dense without the clutter.
          </p>
        </div>

        {/* Phone gallery */}
        <div className="flex items-end justify-center gap-6 sm:gap-8 lg:gap-12">
          {screens.map((screen, i) => (
            <div
              key={screen.label}
              className={`flex-shrink-0 ${
                i === 0
                  ? "w-[200px] sm:w-[240px] lg:w-[280px] opacity-80"
                  : i === 1
                  ? "w-[240px] sm:w-[280px] lg:w-[320px] z-10"
                  : "w-[200px] sm:w-[240px] lg:w-[280px] opacity-80"
              }`}
            >
              <div className={`phone-frame ${i === 1 ? "glow-green" : ""}`}>
                <Image
                  src={screen.src}
                  alt={screen.alt}
                  width={320}
                  height={693}
                  className="w-full h-auto"
                />
              </div>
              <p className="text-center text-muted text-sm mt-4 font-medium">
                {screen.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
