import { type Metadata, type Viewport } from 'next';
import { Nunito_Sans } from 'next/font/google';

import { ServiceWorkerRegister } from '@/components/service-worker-register';

import './globals.css';

const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  variable: '--font-nunito-sans',
});

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: "Laydon's Room",
  },
  description: 'Nursery controls',
  icons: {
    apple: '/icon-192.png',
    icon: '/icon.svg',
  },
  manifest: '/manifest.webmanifest',
  title: "Laydon's Room",
};

export const viewport: Viewport = {
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#7c6bb0',
  userScalable: false,
  width: 'device-width',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={nunitoSans.variable} lang="en">
      <body className="bg-background text-foreground font-sans antialiased">
        <div className="mx-auto flex min-h-screen max-w-md flex-col">
          <main className="flex-1">{children}</main>
        </div>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
