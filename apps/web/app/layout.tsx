import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Workspace",
  description: "可继续、可暂停、可交付的 Agent 工作空间",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
