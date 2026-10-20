import { type Metadata, type Viewport } from 'next';
import { Nunito_Sans } from 'next/font/google';
import Script from 'next/script';

import { BottomNav } from '@/components/bottom-nav';
import { Footer } from '@/components/footer';
import { InstallBanner } from '@/components/install-banner';
import { LullabyAudioProvider } from '@/components/lullaby-audio-provider';
import { NanitAudioProvider } from '@/components/nanit-audio-provider';
import { NoiseAudioProvider } from '@/components/noise-audio-provider';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { getEnvironment } from '@/constants/environment';
import { THEME_KEY } from '@/constants/theme';

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

/**
 * Runs before the first paint, so a phone set to light or dark never flashes the other one first. hooks/use-theme.ts applies later changes itself.
 */
const APPLY_THEME_SCRIPT = `try { const theme = localStorage.getItem('${THEME_KEY}'); if (theme === 'light' || theme === 'dark') { document.documentElement.dataset.theme = theme; } } catch {}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /**
     * The script below sets `data-theme` before React hydrates, which React would otherwise report as a mismatch.
     */
    <html className={nunitoSans.variable} lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground font-sans antialiased">
        <Script id="apply-theme" strategy="beforeInteractive">
          {APPLY_THEME_SCRIPT}
        </Script>
        {/*
          All three audio providers sit above the router so that sound outlives
          a tab change, and above the nav so it can show what is playing. The
          Nanit one is why "on all the time" keeps listening once the app is in
          the background.
        */}
        <LullabyAudioProvider>
          <NoiseAudioProvider>
            <NanitAudioProvider>
              <div className="flex min-h-screen flex-col">
                <div className="mx-auto w-full max-w-md">
                  <InstallBanner />
                </div>
                {/*
                  At least a screen tall, so the footer always sits below the fold. The navigation after it is sticky rather than fixed: it holds to the bottom of the screen until the page is scrolled past the end of this, and then rides up with the page to show the footer.
                */}
                <main className="mx-auto min-h-screen w-full max-w-md flex-1 pb-6">{children}</main>
                <BottomNav />
                <Footer />
              </div>
            </NanitAudioProvider>
          </NoiseAudioProvider>
        </LullabyAudioProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
