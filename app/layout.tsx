import { type Metadata, type Viewport } from 'next';
import { Nunito_Sans } from 'next/font/google';

import { BottomNav } from '@/components/bottom-nav';
import { LullabyAudioProvider } from '@/components/lullaby-audio-provider';
import { NoiseAudioProvider } from '@/components/noise-audio-provider';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { getEnvironment } from '@/lib/environment';

// eslint-disable-next-line import/no-unassigned-import -- A stylesheet has nothing to bind.
import './globals.css';

const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  variable: '--font-nunito-sans',
});

export function generateMetadata(): Metadata {
  const { APP_TITLE } = getEnvironment();

  return {
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: APP_TITLE,
    },
    description: 'Nursery controls',
    icons: {
      apple: '/icon-192.png',
      icon: '/icon.svg',
    },
    manifest: '/manifest.webmanifest',
    title: APP_TITLE,
  };
}

export const viewport: Viewport = {
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#000000',
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
        {/*
          Both audio providers sit above the router so that sound outlives a tab
          change, and above the nav so it can show what is playing.
        */}
        <LullabyAudioProvider>
          <NoiseAudioProvider>
            <div className="mx-auto flex min-h-screen max-w-md flex-col">
              <main className="flex-1 pb-24">{children}</main>
            </div>
            <BottomNav />
          </NoiseAudioProvider>
        </LullabyAudioProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
