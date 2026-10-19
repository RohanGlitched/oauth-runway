import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OAuth Runway",
  description: "How long until your agent's users can connect an app: OAuth app setup and approval guides, researched by an agent.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <div className="wrap">
          <header className="top">
            <Link href="/" className="brand"><span className="brand-mark" aria-hidden /> OAuth Runway</Link>
            <nav aria-label="Main">
              <Link href="/">Library</Link>
              <Link href="/how-we-checked">How we checked</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
