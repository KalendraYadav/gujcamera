import React from 'react';
import type { Metadata } from 'next';
import '@/styles/globals.css';
import { AuthProvider } from '@/lib/auth/context';

export const metadata: Metadata = {
  title: 'Gujarat Police Unified CCTV Intelligence Platform',
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
