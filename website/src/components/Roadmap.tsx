const roadmapItems = [
  {
    title: "Portion Depth Estimation",
    description:
      "Estimate serving sizes from a single photo using monocular depth analysis via iOS Vision framework. No extra hardware needed.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
      </svg>
    ),
    status: "In Development",
  },
  {
    title: "Nutrition Label Scanning",
    description:
      "Point your camera at any nutrition label and Dialed reads it instantly using on-device OCR. Packaged foods logged in seconds.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    status: "In Development",
  },
  {
    title: "BLE Smart Scale",
    description:
      "Connect any Bluetooth nutrition scale for gram-perfect accuracy. Live weight streaming feeds directly into your food entries as you plate up.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
      </svg>
    ),
    status: "Coming Soon",
  },
  {
    title: "Correction Flywheel",
    description:
      "Dialed learns from your corrections and habits. The more you use it, the smarter it gets — auto-suggesting portions, meals, and timing.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
    status: "Planned",
  },
  {
    title: "Apple Health Sync",
    description:
      "Seamless two-way sync with Apple Health. Your macros, weight, and nutrition data flow between Dialed and your health ecosystem automatically.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
    status: "Planned",
  },
  {
    title: "Meal Planning & Goal Pacing",
    description:
      "Set weekly goals and get real-time pacing insights. Dialed tells you exactly how you're tracking — and suggests what to eat next to stay on target.",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    status: "Planned",
  },
];

const statusColors: Record<string, string> = {
  "In Development": "bg-accent/15 text-accent border-accent/25",
  "Coming Soon": "bg-carb-orange/15 text-carb-orange border-carb-orange/25",
  "Planned": "bg-protein-purple/15 text-protein-purple border-protein-purple/25",
};

export default function Roadmap() {
  return (
    <section id="roadmap" className="relative py-28 sm:py-36">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-20">
          <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">
            Roadmap
          </p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            What&apos;s coming
            <br />
            <span className="text-muted">to Dialed.</span>
          </h2>
          <p className="mt-6 text-muted text-lg max-w-2xl mx-auto">
            We&apos;re building toward a future where logging is invisible. Here&apos;s what&apos;s next.
          </p>
        </div>

        {/* Roadmap grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {roadmapItems.map((item) => (
            <div
              key={item.title}
              className="group bg-card-bg border border-card-border rounded-2xl p-7 hover:border-card-border/80 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-5">
                <div className="w-11 h-11 rounded-xl bg-surface border border-card-border flex items-center justify-center text-muted group-hover:text-foreground transition-colors">
                  {item.icon}
                </div>
                <span
                  className={`text-xs font-medium px-3 py-1 rounded-full border ${statusColors[item.status]}`}
                >
                  {item.status}
                </span>
              </div>
              <h3 className="text-lg font-bold mb-2">{item.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
