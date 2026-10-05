import React from 'react';
import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { AuthProvider } from '@/lib/auth/context';
import { NavigationProvider } from '@/lib/navigation/context';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#070B14',
};

export const metadata: Metadata = {
  title: 'NETRAVAHA Unified CCTV Intelligence Platform',
  description: 'Mission-critical CCTV Federation, ANPR, Vehicle Intelligence, and Real-Time Alert Command Center',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <NavigationProvider>{children}</NavigationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
