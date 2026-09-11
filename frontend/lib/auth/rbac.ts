// ==============================================================================
// Role-Based Access Control (RBAC) Specification
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 14.2 & Section 20)
// NOTE: Frontend RBAC is for UX navigation filtering only; server guards remain authoritative.
// ==============================================================================

import { PoliceRole } from '@/types/auth';

export interface NavItemConfig {
  id: string;
  label: string;
  path: string;
  iconName: string;
  allowedRoles: PoliceRole[];
  badge?: string;
  phase: string;
}

export const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Command Center',
    path: '/',
    iconName: 'LayoutDashboard',
    allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR', 'SYSTEM_AUDITOR', 'VIEWER'],
    phase: 'Phase 4A (Foundation)',
  },
  {
    id: 'live',
    label: 'Live Monitoring',
    path: '/live',
    iconName: 'Video',
    allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'],
    badge: 'HLS',
    phase: 'Phase 4C',
  },
  {
    id: 'map',
    label: 'GIS Camera Map',
    path: '/map',
    iconName: 'MapPin',
    allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR', 'SYSTEM_AUDITOR', 'VIEWER'],
    phase: 'Phase 4B',
  },
  {
    id: 'cameras',
    label: 'Camera Registry',
    path: '/cameras',
    iconName: 'Camera',
    allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR', 'SYSTEM_AUDITOR', 'VIEWER'],
    phase: 'Phase 4B',
  },
  {
    id: 'vehicles',
    label: 'Vehicle Tracking',
    path: '/vehicles',
    iconName: 'Car',
    allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR'],
    phase: 'Phase 4D',
  },
  {
    id: 'alerts',
    label: 'Alert Engine',
    path: '/alerts',
    iconName: 'BellRing',
    allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'],
    phase: 'Phase 4E',
  },
  {
    id: 'watchlist',
    label: 'Watchlists',
    path: '/watchlist',
    iconName: 'ListFilter',
    allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN', 'INVESTIGATOR', 'OPERATOR'],
    phase: 'Phase 4E',
  },
  {
    id: 'audit',
    label: 'Audit Trail',
    path: '/audit',
    iconName: 'ShieldAlert',
    allowedRoles: ['SUPER_ADMIN', 'SYSTEM_AUDITOR'],
    phase: 'Phase 4F',
  },
  {
    id: 'admin',
    label: 'Fleet Administration',
    path: '/admin',
    iconName: 'Settings',
    allowedRoles: ['SUPER_ADMIN', 'DEPARTMENT_ADMIN'],
    phase: 'Phase 4F',
  },
];

export function hasRoleAccess(userRole: PoliceRole | undefined, allowedRoles: PoliceRole[]): boolean {
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}

export function getAuthorizedNavItems(userRole: PoliceRole | undefined): NavItemConfig[] {
  if (!userRole) return [];
  return NAV_ITEMS.filter((item) => hasRoleAccess(userRole, item.allowedRoles));
}

export function formatRoleName(role: PoliceRole | undefined): string {
  if (!role) return 'Unknown Role';
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'DEPARTMENT_ADMIN':
      return 'Department Admin';
    case 'INVESTIGATOR':
      return 'Investigator';
    case 'OPERATOR':
      return 'Control Room Operator';
    case 'SYSTEM_AUDITOR':
      return 'System Auditor';
    case 'VIEWER':
      return 'Observer / Viewer';
    default:
      return role;
  }
}

/**
 * Roles authorized to inspect and export cryptographic evidence packages.
 * Aligned with backend @Roles('INVESTIGATOR', 'SUPER_ADMIN', 'SYSTEM_AUDITOR') in evidence.controller.ts.
 */
export const EVIDENCE_EXPORT_ROLES: PoliceRole[] = [
  'INVESTIGATOR',
  'SUPER_ADMIN',
  'SYSTEM_AUDITOR',
];

export function canExportEvidence(userRole: PoliceRole | undefined): boolean {
  return hasRoleAccess(userRole, EVIDENCE_EXPORT_ROLES);
}
