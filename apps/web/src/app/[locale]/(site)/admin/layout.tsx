import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'SanQ Admin',
  description: 'SanQ administration workspace.',
  manifest: '/admin.webmanifest',
  icons: {
    apple: [
      {
        url: '/images/pwa/admin-v1.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
  appleWebApp: {
    title: 'SanQ Admin',
    statusBarStyle: 'default',
    capable: true,
  },
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
