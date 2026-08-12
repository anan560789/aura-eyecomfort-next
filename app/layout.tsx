import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aura EyeGym | 數位視覺復健中心",
  description: "專為現代人設計的 3D 數位視覺復健與眼肌放鬆系統。結合睫狀肌深空追光、動態眼肌伸展與神經放鬆，每天 3 分鐘，找回清晰視力。",
  openGraph: {
    title: "Aura EyeGym | 數位視覺復健中心",
    description: "專為現代人設計的 3D 數位視覺復健系統。每天 3 分鐘，找回清晰視力。",
    siteName: "Aura EyeGym",
    locale: "zh_TW",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}