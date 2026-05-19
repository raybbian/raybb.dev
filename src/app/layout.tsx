import type { Metadata } from "next";
import { Rubik, Geist_Mono } from "next/font/google";
import "./globals.css";
import FishBackground from "@/components/FishBackground";
import NavDrawer from "@/components/NavDrawer";
import ThemeToggle from "@/components/ThemeToggle";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";

// /public/theme-bootstrap.js sets `data-theme` before the body paints
// (avoids a flash of the wrong theme). Loaded as an external file rather
// than inline so React never has to render a <script> node.

const rubik = Rubik({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Raymond Bian",
  description:
    "Welcome to my personal website!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${rubik.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Script src="/theme-bootstrap.js" strategy="beforeInteractive" />
        <FishBackground />
        <NavDrawer />
        {children}
        <ThemeToggle />
        <Analytics />
      </body>
    </html>
  );
}
