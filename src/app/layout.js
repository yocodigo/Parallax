import './globals.css';
import { Inter } from 'next/font/google';
import SiteNav from '@/components/SiteNav';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Financial Dashboard',
  description: 'Market data and portfolio tracking built on the Alpaca API',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.className} antialiased bg-gray-50 text-gray-900`}>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}