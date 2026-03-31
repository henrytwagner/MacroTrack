const steps = [
  {
    number: "01",
    title: "Open Kitchen Mode",
    description:
      "Tap the microphone and start cooking. Dialed activates real-time voice recognition and stands by to capture everything you say.",
    color: "text-cal-red",
    borderColor: "border-cal-red/30",
    bgColor: "bg-cal-red/15",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Speak naturally",
    description:
      "\"I had two eggs, some toast with peanut butter, and a glass of milk.\" Talk like you would to a friend. Dialed understands context, quantity, and food names.",
    color: "text-carb-orange",
    borderColor: "border-carb-orange/30",
    bgColor: "bg-carb-orange/15",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Macros logged",
    description:
      "Dialed instantly identifies each food, pulls verified nutritional data, and updates your daily totals. Cards appear live as you speak — review and save when done.",
    color: "text-cal-red",
    borderColor: "border-cal-red/30",
    bgColor: "bg-cal-red/15",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-28 sm:py-36">
      {/* Warm tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-carb-orange/[0.04] to-transparent" />

      <div className="relative max-w-5xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-20">
          <p className="text-carb-orange text-sm font-semibold tracking-widest uppercase mb-4">
            How It Works
          </p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            Three steps.
            <br />
            <span className="text-muted">That&apos;s it.</span>
          </h2>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line — red to orange gradient */}
          <div className="absolute left-[39px] top-0 bottom-0 w-px bg-gradient-to-b from-cal-red/50 via-carb-orange/40 to-transparent hidden sm:block" />

          <div className="space-y-16">
            {steps.map((step, i) => (
              <div key={step.number} className="flex gap-8 items-start">
                {/* Step icon */}
                <div className="flex-shrink-0 relative">
                  <div className={`w-20 h-20 rounded-2xl ${step.bgColor} border ${step.borderColor} flex items-center justify-center ${step.color}`}>
                    {step.icon}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="absolute left-1/2 -translate-x-1/2 top-full h-16 w-px bg-gradient-to-b from-card-border to-transparent sm:hidden" />
                  )}
                </div>

                {/* Content */}
                <div className="pt-2">
                  <span className={`${step.color} font-mono text-sm`}>{step.number}</span>
                  <h3 className="text-2xl sm:text-3xl font-bold mt-1">{step.title}</h3>
                  <p className="text-muted mt-3 leading-relaxed max-w-lg text-base">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
