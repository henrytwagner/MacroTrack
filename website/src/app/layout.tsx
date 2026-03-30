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
  title: "Dialed: Meals & Macros",
  description:
    "Track your macros effortlessly with voice-first logging, barcode scanning, and smart meal tracking. Dialed makes nutrition simple.",
  openGraph: {
    title: "Dialed: Meals & Macros",
    description:
      "Track your macros effortlessly with voice-first logging, barcode scanning, and smart meal tracking.",
    url: "https://dialedmealsandmacros.com",
    siteName: "Dialed",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dialed: Meals & Macros",
    description:
      "Track your macros effortlessly with voice-first logging, barcode scanning, and smart meal tracking.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
