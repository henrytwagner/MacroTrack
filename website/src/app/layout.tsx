import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dialed — Track less. Know more.",
  description:
    "The smart nutrition tracker that fits your life. Voice-first logging, camera recognition, barcode scanning, and intelligent macro tracking. Available on iOS.",
  openGraph: {
    title: "Dialed — Track less. Know more.",
    description:
      "The smart nutrition tracker that fits your life. Voice-first logging, camera recognition, and intelligent macro tracking.",
    url: "https://dialedmealsandmacros.com",
    siteName: "Dialed",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dialed — Track less. Know more.",
    description:
      "The smart nutrition tracker that fits your life. Voice-first logging, camera recognition, and intelligent macro tracking.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
