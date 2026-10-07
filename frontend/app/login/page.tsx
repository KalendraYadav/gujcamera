'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { LoginForm } from '@/components/auth/LoginForm';
import { PoliceCrest } from '@/components/auth/PoliceCrest';
import { SurveillanceBackground } from '@/components/auth/SurveillanceBackground';
import { NationwideMapBadge } from '@/components/auth/NationwideMapBadge';
import { Video, BarChart3, ShieldCheck } from 'lucide-react';
import styles from '@/components/auth/LoginPage.module.css';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className={styles.pageContainer}>
      {/* 1. Cinematic Live Surveillance Highway Background */}
      <SurveillanceBackground />

      {/* 2. Top Minimal Bar */}
      <header className={styles.header}>
        {/* Brand identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }}>
            <PoliceCrest size={38} />
          </div>
          <div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 900,
                letterSpacing: '0.12em',
                color: '#FFFFFF',
                lineHeight: 1,
              }}
            >
              NETRAVA
            </div>
            <div
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#CBD5E1',
                marginTop: '4px',
              }}
            >
              CCTV INTELLIGENCE PLATFORM
            </div>
          </div>
        </div>
      </header>

      {/* 3. Main Split View: Hero Intelligence Context (Left) + High-Security Terminal (Right) */}
      <main className={styles.main}>
        <div className={styles.grid}>
          {/* Left Column: Mission Context & Intelligence Signals */}
          <div className={styles.heroColumn}>
            {/* Hero Heading: SAFER INDIA */}
            <div>
              <div className={styles.saferIndiaHeading}>
                <div style={{ color: '#FFFFFF' }}>SAFER</div>
                <div
                  style={{
                    color: '#D7193F',
                    textShadow: '0 0 35px rgba(215, 25, 63, 0.45)',
                  }}
                >
                  INDIA
                </div>
              </div>

              <p className={styles.heroSubtext}>
                Real-time CCTV intelligence for smarter policing and safer communities.
              </p>
            </div>

            {/* Feature Indicators with Translucent Glass Badges */}
            <div className={styles.featureList}>
              {[
                {
                  icon: Video,
                  label: 'LIVE',
                  sub: 'Surveillance',
                },
                {
                  icon: BarChart3,
                  label: 'INTELLIGENCE',
                  sub: 'Analytics',
                },
                {
                  icon: ShieldCheck,
                  label: 'FASTER',
                  sub: 'Response',
                },
              ].map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '9px 15px',
                      backgroundColor: 'rgba(11, 16, 32, 0.65)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                    }}
                  >
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#93B3E6',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          color: '#FFFFFF',
                          fontFamily: 'var(--font-mono)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {feature.label}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#CBD5E1',
                          fontWeight: 600,
                        }}
                      >
                        {feature.sub}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Representative Corridor Map Badge */}
            <div style={{ marginTop: '8px' }}>
              <NationwideMapBadge />
            </div>
          </div>

          {/* Right Column: High-Trust Login Panel */}
          <div className={styles.terminalColumn}>
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}
