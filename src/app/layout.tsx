import type { Metadata, Viewport } from "next";
import { Rubik, Geist_Mono } from "next/font/google";
import "./globals.css";
import FishBackground from "@/components/FishBackground";
import NavDrawer from "@/components/NavDrawer";
import ThemeToggle from "@/components/ThemeToggle";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { posts } from "@/content/blog";

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

const SITE_URL = "https://raybb.dev";
const fallbackThumb = `/thumbnails/${posts[0].slug}.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Raymond Bian", template: "%s — Raymond Bian" },
  description: "Welcome to my personal website!",
  applicationName: "raybb.dev",
  authors: [{ name: "Raymond Bian", url: "https://raybb.dev" }],
  creator: "Raymond Bian",
  publisher: "Raymond Bian",
  keywords: ["blog, portfolio, Raymond Bian"],
  openGraph: {
    type: "website",
    siteName: "My Personal Website",
    title: "Raymond Bian",
    description: "Welcome to my personal website!",
    url: "/",
    locale: "en_US",
    images: [{ url: fallbackThumb, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Raymond Bian",
    description: "Welcome to my personal website!",
    creator: "Raymond Bian",
    images: [fallbackThumb],
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2f8a86" },
    { media: "(prefers-color-scheme: dark)", color: "#1c5e5c" },
  ],
};

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Raymond Bian",
  url: SITE_URL,
  sameAs: [""],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
        <FishBackground />
        <NavDrawer />
        {children}
        <ThemeToggle />
        <Analytics />
      </body>
    </html>
  );
}
