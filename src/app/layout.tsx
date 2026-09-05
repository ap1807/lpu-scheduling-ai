import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/app/providers";

export const metadata: Metadata = {
  title: "LPU Scheduling AI — Agentic Conflict Detection & Resolution",
  description:
    "Agentic AI platform for Lovely Professional University scheduling: deterministic conflict detection, cascading impact analysis, AI-generated resolutions with engine validation and human approval.",
  icons: { icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
