'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Video,
  MapPin,
  Car,
  BellRing,
  ListFilter,
  ShieldAlert,
  Settings,
  LogOut,
  UserCheck,
  User,
  ChevronDown,
  Camera,
  Shield,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { getAuthorizedNavItems } from '@/lib/auth/rbac';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PoliceCrest } from '@/components/auth/PoliceCrest';

// Map iconName strings to Lucide components
const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard size={16} />,
  Video: <Video size={16} />,
  MapPin: <MapPin size={16} />,
  Camera: <Camera size={16} />,
  Car: <Car size={16} />,
  BellRing: <BellRing size={16} />,
  ListFilter: <ListFilter size={16} />,
  ShieldAlert: <ShieldAlert size={16} />,
  Settings: <Settings size={16} />,
};

interface NavGroup {
  name: string;
  ids: string[];
}

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const NAV_GROUPS: NavGroup[] = [
  {
    name: 'Operations',
    ids: ['dashboard', 'live', 'map', 'cameras'],
  },
  {
    name: 'Intelligence',
    ids: ['vehicles', 'alerts', 'watchlist'],
  },
  {
    name: 'Administration',
    ids: ['audit', 'admin'],
  },
];

export function Sidebar({ isOpen = false, onClose }: SidebarProps = {}) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navItems = getAuthorizedNavItems(user?.role);

  return (
    <aside
      className={`netrava-sidebar ${isOpen ? 'mobile-open' : ''}`}
      aria-label="Main Navigation"
    >
      {/* Brand Header — Exact Match with Login Page Visual Identity */}
      <div
        style={{
          padding: '16px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0B1120',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <div style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))', flexShrink: 0 }}>
              <PoliceCrest size={32} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 900,
                  letterSpacing: '0.12em',
                  color: '#FFFFFF',
                  lineHeight: 1.1,
                }}
              >
                NETRAVA
              </div>
              <div
                style={{
                  fontSize: '8.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  lineHeight: 1.2,
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                CCTV INTELLIGENCE
              </div>
            </div>
            <div
              title="Command Operations Node Active"
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#10B981',
                boxShadow: '0 0 8px #10B981',
                flexShrink: 0,
              }}
            />
          </div>

          {/* Dismiss button visible on mobile drawer */}
          <button
            type="button"
            onClick={onClose}
            className="netrava-mobile-close-btn"
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Dual Crimson & Blue Brand Accent Bar */}
        <div
          style={{
            display: 'flex',
            gap: '2px',
            width: '100%',
            height: '2px',
            marginTop: '12px',
            borderRadius: '1px',
            overflow: 'hidden',
          }}
        >
          <div style={{ flex: 1, backgroundColor: '#D7193F' }} />
          <div style={{ flex: 1, backgroundColor: '#3B82F6' }} />
        </div>
      </div>

      {/* Navigation Links with Tactical Groups */}
      <nav
        style={{
          flex: 1,
          padding: '12px 10px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {NAV_GROUPS.map((group) => {
          const groupItems = navItems.filter((item) => group.ids.includes(item.id));
          if (groupItems.length === 0) return null;

          return (
            <div key={group.name} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div
                style={{
                  padding: '4px 10px 2px',
                  fontSize: '9.5px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {group.name}
              </div>

              {groupItems.map((item) => {
                const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.id}
                    href={item.path}
                    onClick={onClose}
                    aria-current={isActive ? 'page' : undefined}
                    data-testid={`nav-item-${item.id}`}
                    className={`netrava-nav-link ${isActive ? 'active' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="nav-icon">
                        {ICON_MAP[item.iconName] || <LayoutDashboard size={16} />}
                      </span>
                      <span>{item.label}</span>
                    </div>

                    {item.badge && (
                      <span className="nav-badge">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User Profile & Logout Rail Footer */}
      <div
        style={{
          padding: '12px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: '#070B14',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* User Identity & Organization Card */}
        <div
          style={{
            backgroundColor: 'rgba(13, 21, 39, 0.75)',
            border: '1px solid rgba(59, 130, 246, 0.18)',
            borderRadius: '12px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
          }}
        >
          {/* Top Row: Avatar + User Email + Role Badge + Dropdown Affordance */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Avatar Container with subtle dual blue/red outer illumination */}
            <div style={{ position: 'relative', width: '42px', height: '42px', flexShrink: 0 }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  padding: '2px',
                  background: 'conic-gradient(from 210deg, #3B82F6 0%, #60A5FA 35%, #EF4444 70%, #3B82F6 100%)',
                  boxShadow: '0 0 10px rgba(59, 130, 246, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    backgroundColor: '#0B1222',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#93C5FD',
                  }}
                >
                  <User size={18} strokeWidth={2.2} />
                </div>
              </div>

              {/* Online Status Dot */}
              <div
                title="Officer Session Active"
                style={{
                  position: 'absolute',
                  bottom: '-1px',
                  right: '-1px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#10B981',
                  border: '2px solid #0B1222',
                  boxShadow: '0 0 6px #10B981',
                }}
              />
            </div>

            {/* Email and Role Badge */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '0.01em',
                  lineHeight: 1.25,
                }}
                title={user?.email || 'Authenticated Officer'}
              >
                {user?.email || 'operator.demo@gujcamera.local'}
              </div>

              {/* Tactical Role Badge */}
              <div style={{ marginTop: '4px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: user?.role === 'SUPER_ADMIN' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.14)',
                    border: `1px solid ${user?.role === 'SUPER_ADMIN' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`,
                    fontSize: '9.5px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    color: user?.role === 'SUPER_ADMIN' ? '#FCA5A5' : '#60A5FA',
                    lineHeight: 1.2,
                  }}
                >
                  <span
                    style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      backgroundColor: user?.role === 'SUPER_ADMIN' ? '#EF4444' : '#3B82F6',
                      boxShadow: user?.role === 'SUPER_ADMIN' ? '0 0 4px #EF4444' : '0 0 4px #3B82F6',
                      flexShrink: 0,
                    }}
                  />
                  <span>{user?.role || 'OPERATOR'}</span>
                </span>
              </div>
            </div>

            {/* Subtle Dropdown Affordance */}
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94A3B8',
                flexShrink: 0,
              }}
              title="User Account Options"
            >
              <ChevronDown size={13} />
            </div>
          </div>

          {/* Divider between Identity and Organization */}
          <div
            style={{
              width: '100%',
              height: '1px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
            }}
          />

          {/* Bottom Row: Organization with Official Police Crest */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6))', flexShrink: 0 }}>
              <PoliceCrest size={32} />
            </div>

            <div
              style={{
                width: '1px',
                height: '32px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                flexShrink: 0,
              }}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '8.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: '#64748B',
                  lineHeight: 1.2,
                }}
              >
                ORGANIZATION
              </div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  lineHeight: 1.3,
                  marginTop: '2px',
                  wordBreak: 'break-word',
                }}
                title={user?.department_name || 'Ahmedabad City Police Commissionerate'}
              >
                {user?.department_name || 'Ahmedabad City Police Commissionerate'}
              </div>
            </div>
          </div>
        </div>

        {/* 3D Crimson Sign Out Action Button */}
        <button
          onClick={() => {
            onClose?.();
            logout();
          }}
          data-testid="sidebar-signout-btn"
          style={{
            width: '100%',
            minHeight: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'linear-gradient(180deg, #E11D48 0%, #D7193F 35%, #BE123C 75%, #9F1239 100%)',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            borderRadius: '10px',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 800,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            position: 'relative',
            userSelect: 'none',
            boxShadow:
              'inset 0 1px 0 rgba(255, 255, 255, 0.35), inset 0 -1px 0 rgba(0, 0, 0, 0.3), 0 3px 0 #70122B, 0 6px 18px rgba(215, 25, 63, 0.45)',
            transition: 'all 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(1.08)';
            e.currentTarget.style.boxShadow =
              'inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 4px 0 #70122B, 0 8px 22px rgba(215, 25, 63, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'none';
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow =
              'inset 0 1px 0 rgba(255, 255, 255, 0.35), inset 0 -1px 0 rgba(0, 0, 0, 0.3), 0 3px 0 #70122B, 0 6px 18px rgba(215, 25, 63, 0.45)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'translateY(2px)';
            e.currentTarget.style.boxShadow =
              'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 1px 0 #70122B, 0 3px 10px rgba(215, 25, 63, 0.4)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'none';
          }}
        >
          <LogOut size={15} strokeWidth={2.2} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
