import type { Metadata, Viewport } from 'next';
import { DotGothic16, VT323 } from 'next/font/google';
import './globals.css';

const dotGothic = DotGothic16({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-dotgothic',
  display: 'swap',
});

const vt323 = VT323({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-vt323',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI一本デス大喜利 | 観戦モード',
  description: 'AI芸人5人が同じお題で一本勝負。観戦しながら進行を見守る大喜利アプリ。',
  keywords: ['AI大喜利', '観戦モード', 'ブラウザゲーム', 'AI'],
  openGraph: {
    title: 'AI一本デス大喜利 | 観戦モード',
    description: 'AI芸人5人が同じお題で一本勝負。',
    siteName: 'AI一本デス大喜利',
    locale: 'ja_JP',
    type: 'website',
  },
  icons: {
    icon: '/images/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${dotGothic.variable} ${vt323.variable} font-dotgothic antialiased`}>
        {children}
      </body>
    </html>
  );
}
