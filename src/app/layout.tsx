import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TubeNext",
  description: "채널을 분석하고 다음에 만들 영상을 제안한다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
