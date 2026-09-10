'use client';

import React, { useState } from 'react';
import { Shield, Lock, Mail, Eye, EyeOff, ArrowRight, AlertCircle, KeyRound, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';

const DEMO_PRESETS = [
  { label: 'Control Room Operator', email: 'operator.demo@gujcamera.local', role: 'OPERATOR' },
  { label: 'Investigator', email: 'investigator.demo@gujcamera.local', role: 'INVESTIGATOR' },
  { label: 'Department Admin', email: 'deptadmin.demo@gujcamera.local', role: 'DEPARTMENT_ADMIN' },
  { label: 'Super Admin', email: 'admin.demo@gujcamera.local', role: 'SUPER_ADMIN' },
  { label: 'System Auditor', email: 'auditor.demo@gujcamera.local', role: 'SYSTEM_AUDITOR' },
];

export function LoginForm() {
  const { login, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('operator.demo@gujcamera.local');
  const [password, setPassword] = useState('PoliceDemo@2026!');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    if (!email || !email.includes('@')) {
      setValidationError('Please enter a valid law enforcement officer email address.');
      return;
    }

    if (!password || password.length < 6) {
      setValidationError('Password must be at least 6 characters.');
      return;
    }

    try {
      await login(email, password);
    } catch {
      // Error handled via AuthContext state
    }
  };

  const handleSelectPreset = (presetEmail: string) => {
    setEmail(presetEmail);
    setPassword('PoliceDemo@2026!');
    setValidationError(null);
    clearError();
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '440px',
        padding: 'var(--space-8)',
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-elevated)',
      }}
    >
      {/* Header Badge & Title */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            margin: '0 auto var(--space-4)',
            boxShadow: 'var(--accent-glow)',
          }}
        >
          <Shield size={28} />
        </div>

        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
          GUJARAT POLICE
        </h1>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Unified CCTV Intelligence Platform
        </p>

        <div style={{ marginTop: 'var(--space-3)', display: 'flex', justifyContent: 'center' }}>
          <SimulatedDataBadge compact />
        </div>
      </div>

      {/* Error Banners */}
      {(validationError || error) && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-2)',
            padding: 'var(--space-3)',
            backgroundColor: 'var(--status-critical-bg)',
            border: '1px solid var(--status-critical-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--status-critical)',
            fontSize: 'var(--text-xs)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{validationError || error}</span>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} noValidate>
        {/* Email Field */}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <label
            htmlFor="officer-email"
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-2)',
            }}
          >
            Officer Email / Identity
          </label>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            >
              <Mail size={16} />
            </div>
            <input
              id="officer-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              placeholder="operator.demo@gujcamera.local"
              required
              style={{
                width: '100%',
                padding: '10px 12px 10px 38px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                outline: 'none',
                transition: 'border-color var(--transition-fast)',
              }}
            />
          </div>
        </div>

        {/* Password Field */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <label
            htmlFor="officer-password"
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-2)',
            }}
          >
            Passcode / Password
          </label>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            >
              <Lock size={16} />
            </div>
            <input
              id="officer-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              placeholder="••••••••••••"
              required
              style={{
                width: '100%',
                padding: '10px 38px 10px 38px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                outline: 'none',
                transition: 'border-color var(--transition-fast)',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
            padding: '11px var(--space-4)',
            backgroundColor: 'var(--accent-primary)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: '#ffffff',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            letterSpacing: '0.03em',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
            transition: 'background var(--transition-fast)',
            boxShadow: 'var(--accent-glow)',
          }}
        >
          {isLoading ? (
            <span>Verifying Credentials...</span>
          ) : (
            <>
              <span>Authenticate Session</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      {/* Demo Identity Presets */}
      <div
        style={{
          marginTop: 'var(--space-6)',
          paddingTop: 'var(--space-5)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <KeyRound size={13} />
          <span>Demo Role Accounts (Pre-Seeded)</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
          {DEMO_PRESETS.map((preset) => (
            <button
              key={preset.role}
              type="button"
              onClick={() => handleSelectPreset(preset.email)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 8px',
                backgroundColor: email === preset.email ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                border: email === preset.email ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                color: email === preset.email ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
              }}
            >
              <UserCheck size={12} color="var(--accent-primary)" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
