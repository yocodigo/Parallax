import './globals.css';
import { Inter } from 'next/font/google';
import SiteNav from '@/components/SiteNav';
import { themeScript } from '@/lib/theme';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Parallax',
  description: 'A trading journal and performance dashboard: trade plans, reviews, and market data from Alpaca',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies a saved light or dark choice before the page draws. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        suppressHydrationWarning
        className={`${inter.className} antialiased bg-gray-50 text-gray-900`}>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}