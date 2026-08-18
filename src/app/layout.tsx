import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NetSphere — Planet-Scale Internet Visualizer",
  description:
    "Watch DNS, SSL, CDN, and traceroute packets leap across a 3D globe in real time. Built for VoltHacks.",
  keywords: [
    "NetSphere",
    "TraceRoute 3D",
    "Internet Visualizer",
    "3D Globe",
    "Network Visualization",
    "VoltHacks",
  ],
  authors: [{ name: "NetSphere Team" }],
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "NetSphere — Planet-Scale Internet Visualizer",
    description:
      "Watch DNS, SSL, CDN, and traceroute packets leap across a 3D globe in real time.",
    siteName: "NetSphere",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NetSphere — Planet-Scale Internet Visualizer",
    description:
      "Watch DNS, SSL, CDN, and traceroute packets leap across a 3D globe in real time.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
