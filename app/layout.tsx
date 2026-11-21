import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

// Self-hosted at build time: no render-blocking request to Google Fonts and no
// visitor IPs sent to Google on every page view.
const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
});

function siteUrl(): URL | undefined {
  try {
    return process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined;
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: 'Talivity — AI Visibility Audit',
  description:
    "See how AI is presenting your employer brand to candidates — and who's winning the conversation instead.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
