'use client';

// ==============================================================================
// Global Collapsible Sidebar & Navigation Drawer Component
// Gujarat Police Innovation Challenge 2026 - NETRAVA
// Collapsed Rail + Compact Profile + Left-Side Auto-Closing Detail Panel
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
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
  User,
  Camera,
  X,
  Menu,
  ChevronRight,
  Mail,
  Building2,
  Moon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { getAuthorizedNavItems, formatRoleName } from '@/lib/auth/rbac';
import { PoliceCrest } from '@/components/auth/PoliceCrest';

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

interface NavGroup {
  name: string;
  ids: string[];
}

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
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

export function Sidebar({
  isOpen = false,
  onClose,
  isCollapsed = true,
  onToggleCollapse,
}: SidebarProps = {}) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const railAvatarRef = useRef<HTMLButtonElement>(null);

  const navItems = getAuthorizedNavItems(user?.role);

  // Derive human-readable display name and operational role title
  const displayName = user?.email
    ? user.email.includes('operator')
      ? 'Operator Demo'
      : user.email.includes('admin')
      ? 'Administrator Demo'
      : user.email.includes('auditor')
      ? 'System Auditor'
      : user.email.split('@')[0].replace('.', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Operator Demo';

  const roleTitle =
    user?.role === 'SUPER_ADMIN'
      ? 'State System Administrator'
      : user?.role === 'SYSTEM_AUDITOR'
      ? 'Oversight & Compliance Officer'
      : 'Control Room Operator';

  // Auto-close on click outside or Escape key
  useEffect(() => {
    if (!isProfileOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      // If clicking inside the panel, do not close
      if (panelRef.current && panelRef.current.contains(target)) {
        return;
      }
      // If clicking the profile trigger button that opened it, let its onClick handle toggling
      if (
        (profileTriggerRef.current && profileTriggerRef.current.contains(target)) ||
        (railAvatarRef.current && railAvatarRef.current.contains(target))
      ) {
        return;
      }
      // Otherwise outside click -> close immediately
      setIsProfileOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileOpen]);

  // Close profile panel on route change
  useEffect(() => {
    setIsProfileOpen(false);
  }, [pathname]);

  return (
    <>
      <aside
        className={`netrava-sidebar ${isCollapsed ? 'collapsed' : ''} ${isOpen ? 'mobile-open' : ''}`}
        aria-label="Main Navigation"
        data-testid="netrava-sidebar"
      >
        {/* Brand Header */}
        <div
          className="sidebar-header"
          style={{
            padding: isCollapsed ? '12px 8px' : '14px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: isCollapsed ? 'center' : 'stretch',
            backgroundColor: '#0B1120',
            transition: 'padding 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {isCollapsed ? (
            /* ==========================================================
               COLLAPSED RAIL HEADER: EXACTLY ONE HAMBURGER TOGGLE BUTTON
               (Duplicate crest toggle removed per UX refinement spec)
               ========================================================== */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <button
                type="button"
                onClick={onToggleCollapse}
                data-testid="sidebar-toggle-btn"
                className="netrava-rail-toggle-btn"
                aria-label="Expand navigation"
                aria-expanded={false}
                title="Expand navigation (Ctrl+B)"
              >
                <Menu size={18} />
              </button>

              {/* Accessible text for test assertions & screen readers */}
              <div className="visually-hidden-rail">
                <span>NETRAVA</span>
                <span>CCTV INTELLIGENCE</span>
              </div>
            </div>
          ) : (
            /* ==========================================================
               EXPANDED DRAWER HEADER: Brand Logo + Text + Menu Toggle
               ========================================================== */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                  <div style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))', flexShrink: 0 }}>
                    <PoliceCrest size={30} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '14px',
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
                        fontSize: '8px',
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

                {/* Three-line Menu Button to collapse */}
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  data-testid="sidebar-toggle-btn"
                  className="netrava-rail-toggle-btn"
                  aria-label="Collapse navigation"
                  aria-expanded={true}
                  title="Collapse navigation (Ctrl+B)"
                >
                  <Menu size={16} />
                </button>

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
                  marginTop: '10px',
                  borderRadius: '1px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ flex: 1, backgroundColor: '#D7193F' }} />
                <div style={{ flex: 1, backgroundColor: '#3B82F6' }} />
              </div>
            </div>
          )}
        </div>

        {/* Navigation Links with Tactical Groups */}
        <nav
          style={{
            flex: 1,
            padding: isCollapsed ? '8px 4px' : '10px 8px',
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: isCollapsed ? '6px' : '12px',
          }}
        >
          {NAV_GROUPS.map((group, groupIdx) => {
            const groupItems = navItems.filter((item) => group.ids.includes(item.id));
            if (groupItems.length === 0) return null;

            return (
              <div key={group.name} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {isCollapsed ? (
                  /* In collapsed rail: subtle divider between groups */
                  groupIdx > 0 ? (
                    <div
                      style={{
                        height: '1px',
                        backgroundColor: 'var(--border-subtle)',
                        margin: '4px 8px',
                      }}
                    />
                  ) : null
                ) : (
                  /* In expanded drawer: tactical group title */
                  <div
                    className="nav-group-header"
                    style={{
                      padding: '4px 8px 2px',
                      fontSize: '9px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {group.name}
                  </div>
                )}

                {groupItems.map((item) => {
                  const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                  return (
                    <Link
                      key={item.id}
                      href={item.path}
                      onClick={() => {
                        setIsProfileOpen(false);
                        onClose?.();
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      data-testid={`nav-item-${item.id}`}
                      className={`netrava-nav-link ${isActive ? 'active' : ''}`}
                      title={isCollapsed ? item.label : undefined}
                      aria-label={item.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'space-between',
                        width: isCollapsed ? '42px' : '100%',
                        height: isCollapsed ? '42px' : '38px',
                        margin: isCollapsed ? '1px auto' : '0',
                        padding: isCollapsed ? '0' : '0 10px',
                        borderRadius: 'var(--radius-sm)',
                        textDecoration: 'none',
                        position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="nav-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {ICON_MAP[item.iconName] || <LayoutDashboard size={18} />}
                        </span>
                        <span className="nav-text" style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
                          {item.label}
                        </span>
                      </div>

                      {item.badge && (
                        <span
                          className="nav-badge"
                          style={{
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 'var(--radius-xs)',
                          }}
                        >
                          {item.badge}
                        </span>
                      )}

                      {/* Collapsed notification dot if badge exists */}
                      {isCollapsed && item.badge && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: item.id === 'alerts' ? '#EF4444' : '#3B82F6',
                            boxShadow: item.id === 'alerts' ? '0 0 4px #EF4444' : '0 0 4px #3B82F6',
                          }}
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer Area: Collapsed Rail Avatar vs Expanded Compact Profile Row */}
        <div
          className="sidebar-footer"
          style={{
            padding: isCollapsed ? '10px 4px' : '10px 12px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: '#070B14',
            display: 'flex',
            flexDirection: 'column',
            alignItems: isCollapsed ? 'center' : 'stretch',
          }}
        >
          {isCollapsed ? (
            /* ==========================================================
               COLLAPSED RAIL FOOTER: Compact Avatar with Online Dot
               (Clicking opens the Profile Detail Panel)
               ========================================================== */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <button
                type="button"
                ref={railAvatarRef}
                onClick={() => setIsProfileOpen((prev) => !prev)}
                data-testid="sidebar-rail-profile-btn"
                className="netrava-rail-avatar-btn"
                aria-label="Officer profile details"
                aria-expanded={isProfileOpen}
                aria-controls="profile-detail-panel"
                style={{
                  position: 'relative',
                  width: '38px',
                  height: '38px',
                  flexShrink: 0,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  borderRadius: '50%',
                  outline: 'none',
                }}
                title={`${displayName} (${formatRoleName(user?.role)})`}
              >
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    padding: '2px',
                    background: isProfileOpen
                      ? 'conic-gradient(from 210deg, #3B82F6 0%, #60A5FA 50%, #2563EB 100%)'
                      : 'conic-gradient(from 210deg, #3B82F6 0%, #60A5FA 35%, #EF4444 70%, #3B82F6 100%)',
                    boxShadow: isProfileOpen
                      ? '0 0 12px rgba(59, 130, 246, 0.65)'
                      : '0 0 8px rgba(59, 130, 246, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'box-shadow 0.15s ease',
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
                    <User size={16} strokeWidth={2.2} />
                  </div>
                </div>

                {/* Online Status Dot */}
                <div
                  title="Officer Session Active"
                  style={{
                    position: 'absolute',
                    bottom: '-1px',
                    right: '-1px',
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    backgroundColor: '#10B981',
                    border: '2px solid #0B1222',
                    boxShadow: '0 0 5px #10B981',
                  }}
                />
              </button>

            </div>
          ) : (
            /* ==========================================================
               EXPANDED DRAWER FOOTER: Compact 1-line Profile Row
               [Avatar + Dot] [Name + Role Pill] [>]
               ========================================================== */
            <div style={{ width: '100%' }}>
              <button
                type="button"
                ref={profileTriggerRef}
                onClick={() => setIsProfileOpen((prev) => !prev)}
                data-testid="sidebar-compact-profile-btn"
                className="netrava-compact-profile-btn"
                aria-label="Officer profile details"
                aria-expanded={isProfileOpen}
                aria-controls="profile-detail-panel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '7px 8px',
                  borderRadius: '8px',
                  backgroundColor: isProfileOpen ? 'rgba(59, 130, 246, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                  border: isProfileOpen ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.07)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  outline: 'none',
                }}
              >
                {/* Avatar with Conic Border and Green Online Status Dot */}
                <div style={{ position: 'relative', width: '34px', height: '34px', flexShrink: 0 }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      padding: '2px',
                      background: 'conic-gradient(from 210deg, #3B82F6 0%, #60A5FA 35%, #EF4444 70%, #3B82F6 100%)',
                      boxShadow: '0 0 8px rgba(59, 130, 246, 0.35)',
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
                      <User size={15} strokeWidth={2.2} />
                    </div>
                  </div>

                  {/* Online Status Dot */}
                  <div
                    title="Officer Session Active"
                    style={{
                      position: 'absolute',
                      bottom: '-1px',
                      right: '-1px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#10B981',
                      border: '2px solid #0B1222',
                      boxShadow: '0 0 5px #10B981',
                    }}
                  />
                </div>

                {/* Display Name & Role Pill */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.25,
                    }}
                    title={displayName}
                  >
                    {displayName}
                  </div>
                  <div style={{ marginTop: '2px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '1px 6px',
                        borderRadius: '9999px',
                        backgroundColor: user?.role === 'SUPER_ADMIN' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.14)',
                        border: `1px solid ${user?.role === 'SUPER_ADMIN' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`,
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        color: user?.role === 'SUPER_ADMIN' ? '#FCA5A5' : '#60A5FA',
                        lineHeight: 1.2,
                      }}
                    >
                      {user?.role || 'OPERATOR'}
                    </span>
                  </div>
                </div>

                {/* Chevron Right */}
                <div style={{ color: isProfileOpen ? '#60A5FA' : '#64748B', display: 'flex', alignItems: 'center' }}>
                  <ChevronRight size={16} />
                </div>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ==========================================================
          PROFILE DETAIL PANEL (Left-side auto-closing overlay)
          Slides adjacent to the left navigation area. Auto-closes
          on outside click or ESC key without blocking backdrops.
          ========================================================== */}
      <div
        ref={panelRef}
        id="profile-detail-panel"
        data-testid="profile-detail-panel"
        className={`netrava-profile-panel ${isProfileOpen ? 'open' : ''}`}
        role="region"
        aria-label="Officer Profile Details"
        style={{
          position: 'fixed',
          left: isCollapsed ? '72px' : '248px',
          bottom: '12px',
          width: '320px',
          maxHeight: 'calc(100vh - 24px)',
          backgroundColor: '#0B1120',
          border: '1px solid rgba(59, 130, 246, 0.22)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 250,
          padding: '14px',
        }}
      >
        {/* Top Header Row: Large Avatar + Display Name + Role Badge + Close X */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            {/* Avatar Circle with Online Dot */}
            <div style={{ position: 'relative', width: '44px', height: '44px', flexShrink: 0 }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  padding: '2px',
                  background: 'conic-gradient(from 210deg, #3B82F6 0%, #60A5FA 40%, #2563EB 100%)',
                  boxShadow: '0 0 12px rgba(59, 130, 246, 0.4)',
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
                    backgroundColor: '#070B14',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#93C5FD',
                  }}
                >
                  <User size={22} strokeWidth={2} />
                </div>
              </div>

              {/* Online Dot */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '0',
                  right: '0',
                  width: '11px',
                  height: '11px',
                  borderRadius: '50%',
                  backgroundColor: '#10B981',
                  border: '2px solid #0B1120',
                  boxShadow: '0 0 6px #10B981',
                }}
              />
            </div>

            {/* Display Name and Role Pill */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={displayName}
              >
                {displayName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '1px 7px',
                    borderRadius: '9999px',
                    backgroundColor: user?.role === 'SUPER_ADMIN' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.14)',
                    border: `1px solid ${user?.role === 'SUPER_ADMIN' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`,
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    color: user?.role === 'SUPER_ADMIN' ? '#FCA5A5' : '#60A5FA',
                    lineHeight: 1.2,
                  }}
                >
                  {user?.role || 'OPERATOR'}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: '#10B981',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  ● ONLINE
                </span>
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={() => setIsProfileOpen(false)}
            aria-label="Close profile details"
            className="netrava-panel-close-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              color: '#94A3B8',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Subtle Divider */}
        <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.07)', margin: '12px 0' }} />

        {/* Detailed Information List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Organization */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '1px',
              }}
            >
              <PoliceCrest size={20} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#F1F5F9', lineHeight: 1.3 }}>
                {user?.department_name || 'Ahmedabad City Police Commissionerate'}
              </div>
              <div
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginTop: '2px',
                }}
              >
                ORGANIZATION
              </div>
            </div>
          </div>

          {/* Role */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94A3B8',
                flexShrink: 0,
                marginTop: '1px',
              }}
            >
              <User size={16} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#F1F5F9', lineHeight: 1.3 }}>
                {roleTitle}
              </div>
              <div
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginTop: '2px',
                }}
              >
                ROLE
              </div>
            </div>
          </div>

          {/* Email */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94A3B8',
                flexShrink: 0,
                marginTop: '1px',
              }}
            >
              <Mail size={16} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#F1F5F9',
                  lineHeight: 1.3,
                  wordBreak: 'break-all',
                }}
              >
                {user?.email || 'operator.demo@gujcamera.local'}
              </div>
              <div
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginTop: '2px',
                }}
              >
                EMAIL
              </div>
            </div>
          </div>

          {/* Workstation */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94A3B8',
                flexShrink: 0,
                marginTop: '1px',
              }}
            >
              <Building2 size={16} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#F1F5F9', lineHeight: 1.3 }}>
                State Control Room, Gandhinagar
              </div>
              <div
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginTop: '2px',
                }}
              >
                WORKSTATION
              </div>
            </div>
          </div>
        </div>

        {/* Subtle Divider */}
        <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.07)', margin: '12px 0' }} />

        {/* Secondary Action Menu Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <button
            type="button"
            className="netrava-panel-menu-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '7px 8px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#CBD5E1',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={15} style={{ color: '#94A3B8' }} />
              <span>Account Settings</span>
            </div>
            <ChevronRight size={14} style={{ color: '#64748B' }} />
          </button>

          <button
            type="button"
            className="netrava-panel-menu-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '7px 8px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#CBD5E1',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Moon size={15} style={{ color: '#94A3B8' }} />
              <span>Appearance</span>
            </div>
            <ChevronRight size={14} style={{ color: '#64748B' }} />
          </button>
        </div>

        {/* Subtle Divider */}
        <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.07)', margin: '12px 0' }} />

        {/* Compact Danger Red Sign Out Action Button */}
        <button
          type="button"
          onClick={() => {
            setIsProfileOpen(false);
            onClose?.();
            logout();
          }}
          data-testid="sidebar-signout-btn"
          aria-label="Sign Out"
          className="netrava-panel-signout-btn"
          style={{
            width: '100%',
            minHeight: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '7px 14px',
            backgroundColor: 'rgba(225, 29, 72, 0.12)',
            border: '1px solid rgba(225, 29, 72, 0.45)',
            borderRadius: '8px',
            color: '#FDA4AF',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <LogOut size={15} strokeWidth={2.2} />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );
}
