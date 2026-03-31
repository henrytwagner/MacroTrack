"use client";

import Image from "next/image";
import { useState } from "react";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

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

        <div className="flex items-center gap-4">
          <a
            href="#"
            className="hidden sm:inline-flex bg-accent text-background font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-accent-dim transition-colors"
          >
            Download
          </a>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-muted hover:text-foreground transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-card-border bg-background/95 backdrop-blur-xl">
          <div className="px-6 py-6 flex flex-col gap-4">
            <a
              href="#features"
              onClick={() => setMobileOpen(false)}
              className="text-muted hover:text-foreground transition-colors text-base py-2"
            >
              Features
            </a>
            <a
              href="#kitchen-mode"
              onClick={() => setMobileOpen(false)}
              className="text-muted hover:text-foreground transition-colors text-base py-2"
            >
              Kitchen Mode
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileOpen(false)}
              className="text-muted hover:text-foreground transition-colors text-base py-2"
            >
              How It Works
            </a>
            <a
              href="#roadmap"
              onClick={() => setMobileOpen(false)}
              className="text-muted hover:text-foreground transition-colors text-base py-2"
            >
              Roadmap
            </a>
            <a
              href="#"
              className="bg-accent text-background font-semibold text-sm px-5 py-3 rounded-full text-center mt-2 hover:bg-accent-dim transition-colors"
            >
              Download
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
