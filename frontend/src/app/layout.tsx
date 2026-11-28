import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
import { AuthProvider } from "@/components/auth";
import { CursorGlow } from "@/components/interactive";
import { ScrollMotion } from "@/components/Reveal";
import { LanguageProvider } from "@/components/language";
import { SplashGate } from "@/components/Splash";

import "./globals.css";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
});

const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-noto-devanagari",
  subsets: ["devanagari"],
});

export const metadata: Metadata = {
  title: "BolKhata",
  description: "BolKhata: bolo aur hisaab likho. A voice khata for Indian shopkeepers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf6ee",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="hi"
      className={`${notoSans.variable} ${notoDevanagari.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CursorGlow />
        <ScrollMotion />
        <LanguageProvider>
          <AuthProvider>
            <SplashGate />
            {children}
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
