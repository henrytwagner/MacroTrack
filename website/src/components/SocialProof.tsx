const stats = [
  {
    value: "10,000+",
    label: "Meals logged",
    sublabel: "and counting",
  },
  {
    value: "500K+",
    label: "USDA foods",
    sublabel: "in our database",
  },
  {
    value: "<3s",
    label: "Average log time",
    sublabel: "with Kitchen Mode",
  },
  {
    value: "4.9",
    label: "User rating",
    sublabel: "App Store",
  },
];

export default function SocialProof() {
  return (
    <section className="relative py-28 sm:py-36">
      <div className="max-w-7xl mx-auto px-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="text-center p-8 bg-card-bg border border-card-border rounded-2xl"
            >
              <div className="text-4xl sm:text-5xl font-bold text-accent mb-2">
                {stat.value}
              </div>
              <div className="text-foreground font-medium">{stat.label}</div>
              <div className="text-muted text-sm mt-1">{stat.sublabel}</div>
            </div>
          ))}
        </div>

        {/* Trust badges */}
        <div className="mt-16 text-center">
          <p className="text-muted text-sm mb-6">Trusted data sources</p>
          <div className="flex flex-wrap items-center justify-center gap-8 text-muted/60">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span className="text-sm font-medium">USDA FoodData Central</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <span className="text-sm font-medium">Gemini AI Parser</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
              <span className="text-sm font-medium">iOS Native</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
