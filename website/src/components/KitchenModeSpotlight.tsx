import Image from "next/image";

function WaveformVisualizer() {
  const bars = 40;
  return (
    <div className="flex items-center justify-center gap-[3px] h-16">
      {Array.from({ length: bars }).map((_, i) => {
        const delay = (i * 0.08) % 1.2;
        const baseHeight = Math.sin((i / bars) * Math.PI) * 100;
        return (
          <div
            key={i}
            className="wave-bar w-[3px] rounded-full bg-accent/60"
            style={{
              height: `${Math.max(15, baseHeight)}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${1 + Math.random() * 0.6}s`,
            }}
          />
        );
      })}
    </div>
  );
}

export default function KitchenModeSpotlight() {
  return (
    <section id="kitchen-mode" className="relative py-28 sm:py-36 overflow-hidden">
      {/* Blue gradient background for Kitchen Mode */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(10,132,255,0.08)_0%,transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(10,132,255,0.05)_0%,transparent_50%)]" />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          {/* Text content */}
          <div className="flex-1 text-center lg:text-left">
            <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">
              Kitchen Mode
            </p>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Cook. Talk.
              <br />
              <span className="text-accent">Done.</span>
            </h2>
            <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
              Kitchen Mode turns your kitchen into a smart logging studio.
              Powered by <span className="text-protein-purple">Gemini AI</span> with bidirectional audio streaming, it
              listens to you cook and logs everything in real time — hands free.
            </p>

            {/* Waveform */}
            <div className="mt-10 bg-card-bg border border-accent/20 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 bg-accent rounded-full animate-pulse-glow" />
                <span className="text-sm text-muted font-mono">Kitchen Mode active</span>
              </div>
              <WaveformVisualizer />
              <div className="mt-4 space-y-2">
                <div className="bg-surface border border-card-border rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm">&quot;Two eggs scrambled with cheese&quot;</span>
                  <span className="text-xs text-accent font-mono">+320 cal</span>
                </div>
                <div className="bg-surface border border-card-border rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm">&quot;And a banana&quot;</span>
                  <span className="text-xs text-accent font-mono">+105 cal</span>
                </div>
                <div className="bg-surface border border-card-border rounded-xl px-4 py-3 flex items-center justify-between opacity-50">
                  <span className="text-sm text-muted italic">Listening...</span>
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0s" }} />
                    <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                    <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                  </span>
                </div>
              </div>
            </div>

            {/* Feature pills */}
            <div className="mt-8 flex flex-wrap gap-3 justify-center lg:justify-start">
              {[
                { tag: "Bidirectional audio", color: "border-accent/20 text-accent" },
                { tag: "Real-time cards", color: "border-accent/20 text-accent" },
                { tag: "Gemini-powered", color: "border-protein-purple/20 text-protein-purple" },
                { tag: "Hands-free", color: "border-accent/20 text-accent" },
              ].map(({ tag, color }) => (
                <span
                  key={tag}
                  className={`bg-card-bg border ${color} text-xs font-medium px-4 py-2 rounded-full`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Phone with Kitchen Mode screenshot */}
          <div className="flex-shrink-0 relative">
            <div className="phone-frame w-[280px] sm:w-[300px] lg:w-[320px]" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 25px 50px -12px rgba(0,0,0,0.8), 0 0 60px rgba(10,132,255,0.12)" }}>
              <Image
                src="/media/screenshot-kitchen-mode.png"
                alt="Dialed Kitchen Mode with live scale integration"
                width={320}
                height={693}
                className="w-full h-auto"
              />
            </div>
            {/* Blue glow behind phone */}
            <div className="absolute -inset-16 bg-[radial-gradient(ellipse_at_center,rgba(10,132,255,0.15)_0%,transparent_60%)] -z-10" />
          </div>
        </div>
      </div>
    </section>
  );
}
