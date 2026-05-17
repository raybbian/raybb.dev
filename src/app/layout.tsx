import type { Metadata } from "next";
import { Rubik, Geist_Mono } from "next/font/google";
import "./globals.css";
import FishBackground from "@/components/FishBackground";
import NavDrawer from "@/components/NavDrawer";

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
    "Raymond Bian — CS & Math @ Georgia Tech. Projects, experience, and a procedurally animated koi pond.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${rubik.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <FishBackground />
        <NavDrawer />
        {children}
      </body>
    </html>
  );
}
