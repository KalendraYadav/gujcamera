import { describe, it, expect } from 'vitest';
import { getAuthorizedNavItems, hasRoleAccess, formatRoleName } from '@/lib/auth/rbac';

describe('RBAC Navigation Policy', () => {
  it('grants SUPER_ADMIN access to all 9 tactical command modules', () => {
    const items = getAuthorizedNavItems('SUPER_ADMIN');
    expect(items.length).toBe(9);
    const itemIds = items.map((i) => i.id);
    expect(itemIds).toContain('dashboard');
    expect(itemIds).toContain('live');
    expect(itemIds).toContain('map');
    expect(itemIds).toContain('cameras');
    expect(itemIds).toContain('vehicles');
    expect(itemIds).toContain('alerts');
    expect(itemIds).toContain('watchlist');
    expect(itemIds).toContain('audit');
    expect(itemIds).toContain('admin');
  });

  it('restricts OPERATOR from viewing Fleet Admin and Audit Trail', () => {
    const items = getAuthorizedNavItems('OPERATOR');
    const itemIds = items.map((i) => i.id);
    expect(itemIds).toContain('dashboard');
    expect(itemIds).toContain('live');
    expect(itemIds).toContain('map');
    expect(itemIds).toContain('cameras');
    expect(itemIds).toContain('vehicles');
    expect(itemIds).toContain('alerts');
    expect(itemIds).toContain('watchlist');
    expect(itemIds).not.toContain('audit');
    expect(itemIds).not.toContain('admin');
  });

  it('grants SYSTEM_AUDITOR access strictly to Audit Trail, Map, Camera Registry, and Command Center', () => {
    const items = getAuthorizedNavItems('SYSTEM_AUDITOR');
    const itemIds = items.map((i) => i.id);
    expect(itemIds).toContain('dashboard');
    expect(itemIds).toContain('map');
    expect(itemIds).toContain('cameras');
    expect(itemIds).toContain('audit');
    expect(itemIds).not.toContain('live');
    expect(itemIds).not.toContain('vehicles');
    expect(itemIds).not.toContain('admin');
  });

  it('grants DEPARTMENT_ADMIN access to Fleet Admin but restricts Audit Trail', () => {
    const items = getAuthorizedNavItems('DEPARTMENT_ADMIN');
    const itemIds = items.map((i) => i.id);
    expect(itemIds).toContain('admin');
    expect(itemIds).not.toContain('audit');
  });

  it('returns false for unauthorized role queries', () => {
    expect(hasRoleAccess('OPERATOR', ['SUPER_ADMIN', 'SYSTEM_AUDITOR'])).toBe(false);
    expect(hasRoleAccess(undefined, ['SUPER_ADMIN'])).toBe(false);
    expect(hasRoleAccess('SUPER_ADMIN', ['SUPER_ADMIN'])).toBe(true);
  });

  it('formats canonical police roles with official titles', () => {
    expect(formatRoleName('SUPER_ADMIN')).toBe('Super Admin');
    expect(formatRoleName('OPERATOR')).toBe('Control Room Operator');
    expect(formatRoleName('INVESTIGATOR')).toBe('Investigator');
    expect(formatRoleName('SYSTEM_AUDITOR')).toBe('System Auditor');
    expect(formatRoleName('DEPARTMENT_ADMIN')).toBe('Department Admin');
  });
});
