import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackjacked",
  description: "1v1 blackjack combat — best of 3 rondes, elke ronde tot K.O.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg text-text font-body">{children}</body>
    </html>
  );
}
