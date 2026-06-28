import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoClip AI - AI-Powered Video Clipping Dashboard",
  description: "Transform long-form videos into engaging short clips with AI-powered automation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
