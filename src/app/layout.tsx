import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { getEffectiveTheme } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CONNEXA — Connect. Share. Belong.", template: "%s | CONNEXA" },
  description: "CONNEXA is a modern social network where you can connect with friends, share moments, and build communities.",
  keywords: ["social network", "connect", "share", "community", "CONNEXA"],
  authors: [{ name: "CONNEXA" }],
  creator: "CONNEXA",
  manifest: "/manifest.webmanifest",
  // Chrome and Firefox take the SVG; Safari wants the PNG sizes and the iOS
  // home-screen tile, and Windows still asks for an .ico.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "CONNEXA",
    statusBarStyle: "default",
  },
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getEffectiveTheme();
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
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
