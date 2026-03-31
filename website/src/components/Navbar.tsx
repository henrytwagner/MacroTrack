import Image from "next/image";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-card-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-3">
          <Image
            src="/media/app-icon-dark.png"
            alt="Dialed"
            width={36}
            height={36}
            className="rounded-lg"
          />
          <span className="font-semibold text-lg tracking-tight">dialed</span>
        </a>

        <div className="hidden md:flex items-center gap-8 text-sm text-muted">
          <a href="#features" className="hover:text-foreground transition-colors">
            Features
          </a>
          <a href="#kitchen-mode" className="hover:text-foreground transition-colors">
            Kitchen Mode
          </a>
          <a href="#how-it-works" className="hover:text-foreground transition-colors">
            How It Works
          </a>
          <a href="#roadmap" className="hover:text-foreground transition-colors">
            Roadmap
          </a>
        </div>

        <a
          href="#"
          className="bg-accent text-background font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-accent-dim transition-colors"
        >
          Download
        </a>
      </div>
    </nav>
  );
}
