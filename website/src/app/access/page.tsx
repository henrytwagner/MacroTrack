"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// TODO: Update this to your actual server URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function AccessPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch(`${API_URL}/api/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Something went wrong. Please try again.");
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen flex items-center justify-center pt-16">
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-28 w-full">
          <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
            {/* Left side — form */}
            <div className="flex-1 w-full max-w-md">
              <p className="text-accent text-sm font-semibold tracking-widest uppercase mb-4">
                Early Access
              </p>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                Get Dialed.
              </h1>
              <p className="mt-4 text-muted text-lg leading-relaxed">
                Dialed is currently in beta on TestFlight for iOS. Sign up below
                and we&apos;ll send you an invite.
              </p>

              {status === "success" ? (
                <div className="mt-10 rounded-2xl border border-accent/30 bg-accent/5 p-8">
                  <div className="flex items-center gap-3 mb-3">
                    <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-xl font-bold">You&apos;re in!</h3>
                  </div>
                  <p className="text-muted leading-relaxed">
                    We&apos;ll send a TestFlight invite to <strong className="text-foreground">{email}</strong> shortly.
                    Check your inbox (and spam folder) for the link.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-10 space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium mb-2">
                      Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full bg-card-bg border border-card-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium mb-2">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-card-bg border border-card-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/50 transition-colors"
                    />
                  </div>

                  {status === "error" && (
                    <p className="text-cal-red text-sm">{errorMessage}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="w-full bg-accent text-background font-semibold py-3.5 rounded-xl hover:bg-accent-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === "loading" ? "Submitting..." : "Request Access"}
                  </button>

                  <p className="text-muted/60 text-xs text-center mt-4">
                    iOS only. We&apos;ll never share your email or send spam.
                  </p>
                </form>
              )}
            </div>

            {/* Right side — phone + info */}
            <div className="flex-shrink-0 flex flex-col items-center gap-8">
              <div className="phone-frame w-[260px] sm:w-[280px]">
                <Image
                  src="/media/screenshot-dashboard-dark.png"
                  alt="Dialed app"
                  width={280}
                  height={606}
                  className="w-full h-auto"
                />
              </div>

              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-accent rounded-full animate-pulse-glow" />
                  <span className="text-sm text-muted">Beta on TestFlight</span>
                </div>
                <div className="flex gap-4 text-xs text-muted/60">
                  <span>iOS 17+</span>
                  <span>&middot;</span>
                  <span>Free</span>
                  <span>&middot;</span>
                  <span>No ads</span>
                </div>
              </div>
            </div>
          </div>

          {/* What you get */}
          <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                title: "Full app access",
                description: "Kitchen Mode, barcode scanning, macro tracking — everything that's shipped.",
              },
              {
                title: "Direct feedback line",
                description: "Your input shapes what we build next. Report bugs, suggest features, influence the roadmap.",
              },
              {
                title: "Early feature access",
                description: "Test new features like smart scale integration before they're publicly available.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-card-bg border border-card-border rounded-2xl p-6">
                <h3 className="font-bold mb-2">{item.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
