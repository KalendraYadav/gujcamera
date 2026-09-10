'use client';

// ==============================================================================
// Vehicle Search Bar Component
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 14.2)
//                  docs/API.md (Section 5.1: Vehicle Search)
//
// Features:
//   - License plate input with real-time normalization preview
//   - Gujarat plate format hint (GJ 01 AB 1234)
//   - Keyboard shortcut: Enter to search, Escape to clear
//   - Input sanitization preview (strips spaces, hyphens, lowercases)
// ==============================================================================

import React, { useState, useRef, useCallback } from 'react';
import { Search, X, ScanLine, Keyboard } from 'lucide-react';

interface VehicleSearchBarProps {
  onSearch: (plate: string) => void;
  isLoading?: boolean;
  initialValue?: string;
}

function normalizePlatePreview(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-]/g, '');
}

export function VehicleSearchBar({ onSearch, isLoading = false, initialValue = '' }: VehicleSearchBarProps) {
  const [inputValue, setInputValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedPreview = normalizePlatePreview(inputValue);
  const hasInput = inputValue.trim().length > 0;

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!hasInput || isLoading) return;
      onSearch(normalizedPreview);
    },
    [hasInput, isLoading, normalizedPreview, onSearch]
  );

  const handleClear = () => {
    setInputValue('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label="Vehicle license plate search">
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5) var(--space-6)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {/* Label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <ScanLine size={16} color="var(--accent-primary)" />
          <label
            htmlFor="vehicle-plate-search"
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            License Plate Search
          </label>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Keyboard size={11} />
            Enter to search · Esc to clear
          </span>
        </div>

        {/* Input row */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'stretch' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={16}
              color="var(--text-muted)"
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                flexShrink: 0,
              }}
            />
            <input
              ref={inputRef}
              id="vehicle-plate-search"
              type="text"
              placeholder="GJ 01 AB 1234 or partial prefix GJ01..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              style={{
                width: '100%',
                padding: '12px 40px 12px 42px',
                fontSize: 'var(--text-md)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color var(--transition-fast)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-primary)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            />
            {hasInput && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search input"
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!hasInput || isLoading}
            aria-label="Search vehicle"
            id="vehicle-search-submit"
            style={{
              padding: '0 var(--space-6)',
              backgroundColor: hasInput && !isLoading ? 'var(--accent-primary)' : 'var(--bg-elevated)',
              border: '1px solid',
              borderColor: hasInput && !isLoading ? 'var(--accent-primary)' : 'var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: hasInput && !isLoading ? '#fff' : 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              cursor: hasInput && !isLoading ? 'pointer' : 'not-allowed',
              transition: 'all var(--transition-fast)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              whiteSpace: 'nowrap',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {isLoading ? (
              <>
                <Search size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Searching…
              </>
            ) : (
              <>
                <Search size={14} />
                Search
              </>
            )}
          </button>
        </div>

        {/* Normalization preview */}
        {hasInput && normalizedPreview !== inputValue.trim() && (
          <div
            style={{
              marginTop: 'var(--space-2)',
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Will search as:</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--accent-primary)',
                backgroundColor: 'var(--accent-subtle)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              {normalizedPreview}
            </span>
            <span style={{ opacity: 0.7 }}>(spaces and hyphens removed, uppercased)</span>
          </div>
        )}

        {/* Format hint */}
        <div
          style={{
            marginTop: 'var(--space-2)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <span>
            Examples:{' '}
            {['GJ01AB1234', 'GJ05', 'MH12DE4567'].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInputValue(ex)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0 2px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textDecorationStyle: 'dashed',
                }}
              >
                {ex}
              </button>
            ))}{' '}
          </span>
          <span>· Partial prefix matching supported</span>
        </div>
      </div>
    </form>
  );
}
