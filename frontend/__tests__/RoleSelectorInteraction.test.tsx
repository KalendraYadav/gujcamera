import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoginForm } from '@/components/auth/LoginForm';

const mockLogin = vi.fn();
const mockClearError = vi.fn();

vi.mock('@/lib/auth/context', async () => {
  const actual = await vi.importActual('@/lib/auth/context');
  return {
    ...actual,
    useAuth: () => ({
      login: mockLogin,
      isLoading: false,
      error: null,
      clearError: mockClearError,
    }),
  };
});

describe('Role Selector Interaction Lifecycle & Animation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders all 5 pre-seeded role control buttons with initial active operator role', () => {
    render(<LoginForm />);

    const operatorBtn = screen.getByRole('button', { name: /Control Room Operator/i });
    const investigatorBtn = screen.getByRole('button', { name: /Investigator/i });
    const deptAdminBtn = screen.getByRole('button', { name: /Department Admin/i });
    const superAdminBtn = screen.getByRole('button', { name: /Super Admin/i });
    const auditorBtn = screen.getByRole('button', { name: /System Auditor/i });

    expect(operatorBtn).toBeInTheDocument();
    expect(investigatorBtn).toBeInTheDocument();
    expect(deptAdminBtn).toBeInTheDocument();
    expect(superAdminBtn).toBeInTheDocument();
    expect(auditorBtn).toBeInTheDocument();

    // Operator starts as default selected role
    expect(operatorBtn).toHaveAttribute('aria-pressed', 'true');
    expect(investigatorBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('triggers activation sweep and switches selected active role to Investigator', () => {
    render(<LoginForm />);

    const investigatorBtn = screen.getByRole('button', { name: /Investigator/i });
    const operatorBtn = screen.getByRole('button', { name: /Control Room Operator/i });

    expect(investigatorBtn).toHaveAttribute('aria-pressed', 'false');

    // Click Investigator
    act(() => {
      fireEvent.click(investigatorBtn);
    });

    // Email input is updated immediately
    const emailInput = screen.getByLabelText(/Officer Email \/ Identity/i) as HTMLInputElement;
    expect(emailInput.value).toBe('investigator.demo@gujcamera.local');

    // Investigator is now pressed, Operator is idle
    expect(investigatorBtn).toHaveAttribute('aria-pressed', 'true');
    expect(operatorBtn).toHaveAttribute('aria-pressed', 'false');

    // Fast-forward animation timer
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(investigatorBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches between roles smoothly with one active role at a time', () => {
    render(<LoginForm />);

    const superAdminBtn = screen.getByRole('button', { name: /Super Admin/i });
    const auditorBtn = screen.getByRole('button', { name: /System Auditor/i });

    // Select Super Admin
    act(() => {
      fireEvent.click(superAdminBtn);
    });
    expect(superAdminBtn).toHaveAttribute('aria-pressed', 'true');
    expect(auditorBtn).toHaveAttribute('aria-pressed', 'false');

    // Select System Auditor
    act(() => {
      fireEvent.click(auditorBtn);
    });
    expect(auditorBtn).toHaveAttribute('aria-pressed', 'true');
    expect(superAdminBtn).toHaveAttribute('aria-pressed', 'false');

    const emailInput = screen.getByLabelText(/Officer Email \/ Identity/i) as HTMLInputElement;
    expect(emailInput.value).toBe('auditor.demo@gujcamera.local');
  });
});
