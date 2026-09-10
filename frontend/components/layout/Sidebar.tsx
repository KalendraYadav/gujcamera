'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield,
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
  Camera,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { getAuthorizedNavItems, formatRoleName } from '@/lib/auth/rbac';
import { StatusBadge } from '@/components/ui/StatusBadge';

// Map iconName strings to Lucide components
const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard size={18} />,
  Video: <Video size={18} />,
  MapPin: <MapPin size={18} />,
  Camera: <Camera size={18} />,
  Car: <Car size={18} />,
  BellRing: <BellRing size={18} />,
  ListFilter: <ListFilter size={18} />,
  ShieldAlert: <ShieldAlert size={18} />,
  Settings: <Settings size={18} />,
};

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navItems = getAuthorizedNavItems(user?.role);

  return (
    <aside
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--bg-primary)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: 'var(--accent-glow)',
            flexShrink: 0,
          }}
        >
          <Shield size={20} />
        </div>
        <div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
            GUJARAT POLICE
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            CCTV Intelligence
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav
        style={{
          flex: 1,
          padding: 'var(--space-3) var(--space-2)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
          }}
        >
          Command Modules
        </div>

        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.id}
              href={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--accent-subtle)' : 'transparent',
                border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
                textDecoration: 'none',
                fontSize: 'var(--text-sm)',
                fontWeight: isActive ? 600 : 500,
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                  {ICON_MAP[item.iconName] || <LayoutDashboard size={18} />}
                </span>
                <span>{item.label}</span>
              </div>

              {item.badge && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    color: 'var(--accent-primary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile & Logout Rail Footer */}
      <div
        style={{
          padding: 'var(--space-4)',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              flexShrink: 0,
            }}
          >
            <UserCheck size={16} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={user?.email}
            >
              {user?.email || 'Unknown Identity'}
            </div>
            <div style={{ marginTop: '2px' }}>
              <StatusBadge
                label={user?.role || 'VIEWER'}
                variant={user?.role === 'SUPER_ADMIN' ? 'critical' : 'info'}
              />
            </div>
          </div>
        </div>

        {user?.department_name && (
          <div
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={user.department_name}
          >
            {user.department_name}
          </div>
        )}

        <button
          onClick={logout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--status-critical-bg)';
            e.currentTarget.style.color = 'var(--status-critical)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <LogOut size={13} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
