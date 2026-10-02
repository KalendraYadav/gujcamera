'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { LoadingState } from '@/components/ui/LoadingState';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [isMobileNavOpen, setIsMobileNavOpen] = React.useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#070B14',
        }}
      >
        <LoadingState
          message="Authenticating Police Identity..."
          subtext="Establishing secure in-memory session with state command center"
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: '#070B14',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle Atmospheric Top-Left Gradient — Matches Login Page Cinematic Depth */}
      <div
        style={{
          position: 'fixed',
          top: '-150px',
          left: '100px',
          width: '700px',
          height: '700px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(215, 25, 63, 0.035) 0%, rgba(59, 130, 246, 0.025) 50%, transparent 80%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Main Navigation Sidebar (Desktop Static / Mobile Drawer) */}
      <Sidebar
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
      />

      {/* Mobile Drawer Backdrop */}
      <div
        className={`netrava-sidebar-backdrop ${isMobileNavOpen ? 'open' : ''}`}
        onClick={() => setIsMobileNavOpen(false)}
        aria-hidden="true"
      />

      {/* Main App Container */}
      <div className="netrava-main-layout">
        <Header onToggleMobileNav={() => setIsMobileNavOpen((prev) => !prev)} />
        <main
          style={{
            flex: 1,
            padding: 'var(--page-padding-y) var(--page-padding-x)',
            overflowY: 'auto',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
