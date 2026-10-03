import type { Metadata } from "next";
import "./globals.css";
import "./system-architecture.css";
import "./universe.css";

export const metadata: Metadata = {
  title: "信念宇宙 · Belief Atlas",
  description: "在三维结构中观察、校准和改写自己的信念。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
