import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Sales Works | 프랜차이즈 영업 관리 · 개발',
  description: '프랜차이즈 영업 CRM 로컬 개발 환경',
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
