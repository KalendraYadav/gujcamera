'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Shield, Clock, Menu } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { NAV_ITEMS } from '@/lib/auth/rbac';

export interface HeaderProps {
  onToggleMobileNav?: () => void;
}

export function Header({ onToggleMobileNav }: HeaderProps = {}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('en-IN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Kolkata',
        }) + ' IST'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentNav = NAV_ITEMS.find((item) => item.path === pathname || (item.path !== '/' && pathname.startsWith(item.path))) || {
    label: 'Command Center',
  };

  return (
    <header
      style={{
        height: 'var(--header-height)',
        backgroundColor: 'rgba(7, 11, 20, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--page-padding-x)',
        position: 'sticky',
        top: 0,
        zIndex: 90,
        gap: '10px',
      }}
    >
      {/* Left: Mobile Menu Button + Active Screen Title (without redundant NETRAVAHA / prefix) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        {/* Mobile Hamburger Toggle Button */}
        <button
          type="button"
          onClick={onToggleMobileNav}
          className="netrava-menu-toggle-btn"
          aria-label="Open navigation menu"
          id="netrava-mobile-menu-trigger"
        >
          <Menu size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <h2
            style={{
              fontSize: 'clamp(13px, 3.5vw, 16px)',
              fontWeight: 600,
              color: '#FFFFFF',
              letterSpacing: '0.02em',
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {currentNav.label}
          </h2>
        </div>
      </div>

      {/* Right: Operational Status / Context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {/* Tactical Clock in IST */}
        {timeStr && (
          <div
            className="tactical-clock-indicator"
            title="State Command Center Operational Clock (IST)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              padding: '2px 8px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-xs)',
              letterSpacing: '0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <Clock size={13} color="#60A5FA" />
            <span>{timeStr}</span>
          </div>
        )}

        {/* System Auditor Oversight Mode Indicator */}
        {user?.role === 'SYSTEM_AUDITOR' && (
          <div
            id="auditor-oversight-badge"
            title="Active Role: System Auditor (Statutory Read-Only Compliance Review)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              color: '#60A5FA',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.32)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs)',
              fontWeight: 600,
              letterSpacing: '0.02em',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Shield size={12} />
            <span>Read-Only Oversight</span>
          </div>
        )}
      </div>
    </header>
  );
}

