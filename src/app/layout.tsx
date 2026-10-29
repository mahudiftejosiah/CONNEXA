import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CONNEXA — Connect. Share. Belong.", template: "%s | CONNEXA" },
  description: "CONNEXA is a modern social network where you can connect with friends, share moments, and build communities.",
  keywords: ["social network", "connect", "share", "community", "CONNEXA"],
  authors: [{ name: "CONNEXA" }],
  creator: "CONNEXA",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: "CONNEXA",
    title: "CONNEXA — Connect. Share. Belong.",
    description: "A modern social network for meaningful connections.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CONNEXA — Connect. Share. Belong.",
    description: "A modern social network for meaningful connections.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#12372A" },
    { media: "(prefers-color-scheme: dark)",  color: "#0d1f18" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
