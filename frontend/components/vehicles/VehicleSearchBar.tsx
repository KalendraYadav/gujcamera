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
        className="netrava-card"
        style={{
          padding: 'var(--space-4) var(--space-5)',
        }}
      >
        {/* Label Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <ScanLine size={15} color="var(--accent-primary)" />
          <label
            htmlFor="vehicle-plate-search"
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            License Plate ANPR Search
          </label>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)',
              fontWeight: 500,
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Keyboard size={11} />
            ENTER to search &bull; ESC to clear
          </span>
        </div>

        {/* Input & Action Row */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'stretch' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={16}
              color="var(--text-dim)"
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
              placeholder="GJ 01 AB 1234 or prefix GJ01..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              style={{
                width: '100%',
                padding: '11px 40px 11px 42px',
                fontSize: 'var(--text-md)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-blue)';
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.25)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-medium)';
                e.currentTarget.style.boxShadow = 'none';
              }}
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
                  padding: '4px',
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
            className="btn-primary"
            style={{
              padding: '0 var(--space-5)',
              opacity: !hasInput || isLoading ? 0.45 : 1,
              cursor: !hasInput || isLoading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isLoading ? (
              <>
                <Search size={14} className="animate-spin" />
                <span>Searching…</span>
              </>
            ) : (
              <>
                <Search size={14} />
                <span>Search</span>
              </>
            )}
          </button>
        </div>

        {/* Normalization Preview */}
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
            <span>Target:</span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--accent-primary)',
                backgroundColor: 'var(--accent-primary-subtle)',
                border: '1px solid var(--accent-primary-border)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-xs)',
              }}
            >
              {normalizedPreview}
            </span>
            <span style={{ opacity: 0.7 }}>(normalized)</span>
          </div>
        )}

        {/* Format Hints */}
        <div
          style={{
            marginTop: 'var(--space-3)',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '11px',
            color: 'var(--text-dim)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
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
                  padding: '0 4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--accent-blue)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textDecorationStyle: 'dotted',
                }}
              >
                {ex}
              </button>
            ))}{' '}
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
            &bull; Prefix matching enabled
          </span>
        </div>
      </div>
    </form>
  );
}
