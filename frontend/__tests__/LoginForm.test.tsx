import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginForm } from '@/components/auth/LoginForm';
import { AuthProvider } from '@/lib/auth/context';

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

describe('LoginForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders official police title, email input, password input, and simulated data badge', () => {
    render(<LoginForm />);

    expect(screen.getByText('GUJARAT POLICE')).toBeInTheDocument();
    expect(screen.getByText(/Unified CCTV Intelligence Platform/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Officer Email \/ Identity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Passcode \/ Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Authenticate Session/i })).toBeInTheDocument();
    expect(screen.getByText('SIMULATED DATA')).toBeInTheDocument();
  });

  it('validates invalid email before calling login', async () => {
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/Officer Email \/ Identity/i);
    const submitBtn = screen.getByRole('button', { name: /Authenticate Session/i });

    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'invalid-email');
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Please enter a valid law enforcement officer email address/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('validates password length before calling login', async () => {
    render(<LoginForm />);

    const passwordInput = screen.getByLabelText(/Passcode \/ Password/i);
    const submitBtn = screen.getByRole('button', { name: /Authenticate Session/i });

    await userEvent.clear(passwordInput);
    await userEvent.type(passwordInput, '123');
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Password must be at least 6 characters/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('submits credentials on valid form submission', async () => {
    mockLogin.mockResolvedValueOnce({
      id: '1',
      email: 'operator.demo@gujcamera.local',
      role: 'OPERATOR',
      department_id: 'dept-1',
    });

    render(<LoginForm />);

    const submitBtn = screen.getByRole('button', { name: /Authenticate Session/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('operator.demo@gujcamera.local', 'PoliceDemo@2026!');
    });
  });

  it('pre-fills credentials when demo preset buttons are clicked', async () => {
    render(<LoginForm />);

    const superAdminPreset = screen.getByRole('button', { name: /Super Admin/i });
    fireEvent.click(superAdminPreset);

    const emailInput = screen.getByLabelText(/Officer Email \/ Identity/i) as HTMLInputElement;
    expect(emailInput.value).toBe('admin.demo@gujcamera.local');
  });
});
