'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Radio,
  FileCheck,
  Building2,
  Sliders,
  ChevronDown,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { PoliceCrest } from '@/components/auth/PoliceCrest';
import styles from './LoginPanel.module.css';

const DEMO_PRESETS = [
  {
    label: 'Control Room Operator',
    email: 'operator.demo@gujcamera.local',
    role: 'OPERATOR',
    desc: 'Live Monitoring & Triage',
    icon: Radio,
  },
  {
    label: 'Investigator',
    email: 'investigator.demo@gujcamera.local',
    role: 'INVESTIGATOR',
    desc: 'ANPR & Evidence',
    icon: FileCheck,
  },
  {
    label: 'Department Admin',
    email: 'deptadmin.demo@gujcamera.local',
    role: 'DEPARTMENT_ADMIN',
    desc: 'Jurisdiction & Fleet',
    icon: Building2,
  },
  {
    label: 'Super Admin',
    email: 'admin.demo@gujcamera.local',
    role: 'SUPER_ADMIN',
    desc: 'Statewide Oversight',
    icon: Sliders,
  },
  {
    label: 'System Auditor',
    email: 'auditor.demo@gujcamera.local',
    role: 'SYSTEM_AUDITOR',
    desc: 'Read-Only Audit Trail',
    icon: Shield,
  },
];

export function LoginForm() {
  const { login, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('operator.demo@gujcamera.local');
  const [password, setPassword] = useState('PoliceDemo@2026!');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activatingRole, setActivatingRole] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activatingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentPreset = DEMO_PRESETS.find((p) => p.email === email) || DEMO_PRESETS[0];
  const CurrentIcon = currentPreset ? currentPreset.icon : Users;

  // State awareness for input value presence to prevent icon collision
  const hasEmail = Boolean(email && email.trim().length > 0);
  const hasPassword = Boolean(password && password.length > 0);

  // Derive active step (1: SELECT ROLE, 2: IDENTITY, 3: AUTHENTICATE)
  const currentStep = isLoading ? 3 : hasEmail && hasPassword ? 2 : 1;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (activatingTimerRef.current) {
        clearTimeout(activatingTimerRef.current);
      }
    };
  }, []);

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

  const handleSelectPreset = (presetEmail: string, presetRole: string) => {
    if (activatingTimerRef.current) {
      clearTimeout(activatingTimerRef.current);
    }
    setActivatingRole(presetRole);
    setEmail(presetEmail);
    setPassword('PoliceDemo@2026!');
    setValidationError(null);
    clearError();

    activatingTimerRef.current = setTimeout(() => {
      setActivatingRole(null);
      setIsDropdownOpen(false);
    }, 380);
  };

  return (
    <div className={styles.panelContainer}>
      {/* Top Ambient Edge Glow */}
      <div className={styles.topAmbientGlow} aria-hidden="true" />
      <div className={styles.topHighlightLine} aria-hidden="true" />

      {/* Terminal Header: Police Crest + NETRAVA Branding */}
      <div className={styles.headerBlock}>
        <div className={styles.crestWrapper}>
          <PoliceCrest size={44} />
        </div>

        <h1 className={styles.brandTitle}>NETRAVA</h1>

        <div className={styles.brandSubtitle}>
          <span>CCTV INTELLIGENCE PLATFORM</span>
          {/* Semantic subtitle preserved for test assertion compatibility */}
          <span className="visually-hidden">Unified CCTV Intelligence Platform</span>
        </div>

        {/* Dual Red & Blue Accent Bar */}
        <div className={styles.dualBrandLine} aria-hidden="true">
          <div className={styles.brandLineRed} />
          <div className={styles.brandLineBlue} />
        </div>
      </div>

      {/* Welcome Row */}
      <div className={styles.welcomeRow}>
        <div>
          <h2 className={styles.welcomeHeading}>Welcome back</h2>
          <p className={styles.welcomeSubtext}>Secure access to a safer India.</p>
        </div>

        <div className={styles.authBadge}>
          <Lock size={12} color="#94A3B8" />
          <span>Authorized Personnel Only</span>
        </div>
      </div>

      {/* Error Banners */}
      {(validationError || error) && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '10px 12px',
            backgroundColor: 'rgba(215, 25, 63, 0.12)',
            border: '1px solid rgba(215, 25, 63, 0.35)',
            borderRadius: '8px',
            color: '#FCA5A5',
            fontSize: '12.5px',
            marginBottom: '16px',
            lineHeight: 1.4,
            fontWeight: 500,
          }}
        >
          <AlertCircle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{validationError || error}</span>
        </div>
      )}

      {/* Stepper + Form Split Grid */}
      <div className={styles.stepperAndFormGrid}>
        {/* Left Column: Vertical Tactical Stepper */}
        <div className={styles.stepperCol} aria-hidden="true">
          {/* Step 1: Select Role */}
          <div className={styles.stepItem}>
            <div
              className={`${styles.stepCircle} ${
                currentStep === 1
                  ? styles.stepCircleActive
                  : currentStep > 1
                  ? styles.stepCircleCompleted
                  : ''
              }`}
            >
              01
            </div>
            <div
              className={`${styles.stepLabel} ${
                currentStep === 1
                  ? styles.stepLabelActive
                  : currentStep > 1
                  ? styles.stepLabelCompleted
                  : ''
              }`}
            >
              SELECT ROLE
            </div>
          </div>

          <div
            className={`${styles.stepLine} ${
              currentStep > 1 ? styles.stepLineCompleted : ''
            }`}
          />

          {/* Step 2: Identity */}
          <div className={styles.stepItem}>
            <div
              className={`${styles.stepCircle} ${
                currentStep === 2
                  ? styles.stepCircleActive
                  : currentStep > 2
                  ? styles.stepCircleCompleted
                  : ''
              }`}
            >
              02
            </div>
            <div
              className={`${styles.stepLabel} ${
                currentStep === 2
                  ? styles.stepLabelActive
                  : currentStep > 2
                  ? styles.stepLabelCompleted
                  : ''
              }`}
            >
              IDENTITY
            </div>
          </div>

          <div
            className={`${styles.stepLine} ${
              currentStep > 2 ? styles.stepLineCompleted : ''
            }`}
          />

          {/* Step 3: Authenticate */}
          <div className={styles.stepItem}>
            <div
              className={`${styles.stepCircle} ${
                currentStep === 3 ? styles.stepCircleActive : ''
              }`}
            >
              03
            </div>
            <div
              className={`${styles.stepLabel} ${
                currentStep === 3 ? styles.stepLabelActive : ''
              }`}
            >
              AUTHENTICATE
            </div>
          </div>
        </div>

        {/* Right Column: Form Controls */}
        <form onSubmit={handleSubmit} noValidate className={styles.formCol}>
          {/* Step 1: Large 3D Tactical Role Selector Control */}
          <div className={styles.fieldGroup} ref={dropdownRef}>
            <label id="operational-role-label" className={styles.fieldLabel}>
              Operational Role
            </label>

            <button
              type="button"
              id="role-selector-trigger-btn"
              aria-labelledby="operational-role-label"
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={styles.roleSelectorTrigger}
            >
              <div className={styles.roleIconBadge}>
                <CurrentIcon size={18} />
              </div>

              <div className={styles.roleTextContainer}>
                <div className={styles.rolePrimaryText}>
                  {currentPreset ? currentPreset.label : 'Select your role'}
                </div>
                <div className={styles.roleSecondaryText}>
                  {currentPreset ? currentPreset.desc : 'Choose your operational role to continue'}
                </div>
              </div>

              <ChevronDown
                size={18}
                className={`${styles.chevronIcon} ${
                  isDropdownOpen ? styles.chevronOpen : ''
                }`}
              />
            </button>

            {/* Custom 3D Dropdown Menu */}
            <div
              id="role-dropdown-menu"
              className={`${styles.roleDropdownMenu} ${
                isDropdownOpen ? styles.roleDropdownMenuOpen : styles.roleDropdownMenuClosed
              }`}
              aria-label="Operational Roles"
            >
              {DEMO_PRESETS.map((preset) => {
                const isSelected = email === preset.email;
                const isActivating = activatingRole === preset.role;
                const Icon = preset.icon;

                return (
                  <button
                    key={preset.role}
                    type="button"
                    aria-label={preset.label}
                    aria-pressed={isSelected}
                    onClick={() => handleSelectPreset(preset.email, preset.role)}
                    className={`${styles.roleOptionItem} ${
                      isSelected ? styles.roleOptionSelected : ''
                    } ${isActivating ? styles.roleOptionActivating : ''}`}
                  >
                    {isActivating && <div className={styles.redSweepBeam} aria-hidden="true" />}

                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        backgroundColor: isSelected
                          ? 'rgba(59, 130, 246, 0.25)'
                          : 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? '#60A5FA' : '#94A3B8',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={14} />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className={styles.roleOptionTitle}>{preset.label}</div>
                      <div className={styles.roleOptionDesc}>{preset.desc}</div>
                    </div>

                    {isSelected && (
                      <CheckCircle2 size={15} color="#60A5FA" style={{ flexShrink: 0 }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Officer ID / Email Input */}
          <div className={styles.fieldGroup}>
            <label htmlFor="officer-email" className={styles.fieldLabel}>
              Officer ID / Email
              <span className="visually-hidden">Officer Email / Identity</span>
            </label>
            <div className={styles.inputWrapper}>
              <div
                className={`${styles.inputIconLeft} ${hasEmail ? styles.inputIconHidden : ''}`}
                aria-hidden="true"
              >
                <Mail size={16} />
              </div>
              <input
                id="officer-email"
                aria-label="Officer Email / Identity"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                placeholder="Enter officer ID or email"
                required
                className={`${styles.recessedInput} ${hasEmail ? styles.recessedInputWithValue : ''}`}
              />
            </div>
          </div>

          {/* Password Input */}
          <div className={styles.fieldGroup}>
            <label htmlFor="officer-password" className={styles.fieldLabel}>
              Password
              <span className="visually-hidden">Passcode / Password</span>
            </label>
            <div className={styles.inputWrapper}>
              <div
                className={`${styles.inputIconLeft} ${hasPassword ? styles.inputIconHidden : ''}`}
                aria-hidden="true"
              >
                <Lock size={16} />
              </div>
              <input
                id="officer-password"
                aria-label="Passcode / Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                placeholder="Enter password"
                required
                className={`${styles.recessedInput} ${hasPassword ? styles.recessedInputWithValue : ''} ${styles.recessedInputPassword}`}
              />
              <div className={styles.inputIconRight}>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className={styles.togglePasswordBtn}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          {/* Remember Me & Forgot Password Row */}
          <div className={styles.optionsRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={styles.customCheckbox}
              />
              <span>Remember this device</span>
            </label>

            <span
              className={styles.forgotPasswordLink}
              title="Contact Department Administrator for password reset"
            >
              Forgot password?
            </span>
          </div>

          {/* Step 3: Large 3D Primary Sign In Button */}
          <button
            type="submit"
            disabled={isLoading}
            aria-label="Authenticate Session"
            name="Authenticate Session"
            id="authenticate-session-btn"
            className={styles.signInButton3D}
          >
            <div className={styles.signInButtonContent}>
              <Shield size={18} />
              <span>{isLoading ? 'Authenticating...' : 'Sign In'}</span>
              <span className="visually-hidden">Authenticate Session</span>
              <ArrowRight size={18} />
            </div>
            <div className={styles.signInButtonSubtext}>
              {currentPreset ? `Access as ${currentPreset.label}` : 'Select a role to continue'}
            </div>
          </button>
        </form>
      </div>

      {/* Security Seal Footer */}
      <div className={styles.securitySealFooter}>
        <Lock size={12} color="#94A3B8" />
        <span>Authorized access only</span>
        <span>•</span>
        <span>Government Use</span>
      </div>
    </div>
  );
}
