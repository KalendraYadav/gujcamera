'use client';

// ==============================================================================
// Global Navigation State & Collapsible Drawer Context
// Gujarat Police Innovation Challenge 2026 - NETRAVA
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface NavigationContextType {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  toggleMobileOpen: () => void;
}

const STORAGE_KEY = 'netrava_sidebar_collapsed';
const LEGACY_STORAGE_KEY = 'netravaha_sidebar_collapsed';

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

// Shared in-memory cache to prevent layout flicker across Next.js client transitions
let inMemoryCollapsedState: boolean = true; // DEFAULT: COLLAPSED RAIL

function getInitialCollapsedState(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored !== null) {
        inMemoryCollapsedState = stored === 'true';
        return inMemoryCollapsedState;
      }
    } catch {
      // storage unavailable
    }
  }
  inMemoryCollapsedState = true;
  return true; // DEFAULT: COLLAPSED RAIL
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsedState] = useState<boolean>(getInitialCollapsedState);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);

  // Sync state changes with in-memory cache and localStorage
  const setIsCollapsed = useCallback((collapsed: boolean) => {
    inMemoryCollapsedState = collapsed;
    setIsCollapsedState(collapsed);
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
      localStorage.setItem(LEGACY_STORAGE_KEY, String(collapsed));
    } catch {
      // storage unavailable / quota exceeded
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(!inMemoryCollapsedState);
  }, [setIsCollapsed]);

  const toggleMobileOpen = useCallback(() => {
    setIsMobileOpen((prev) => !prev);
  }, []);

  // Command Deck Keyboard Shortcut (Ctrl+B / Cmd+B to toggle navigation rail)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapsed]);

  return (
    <NavigationContext.Provider
      value={{
        isCollapsed,
        setIsCollapsed,
        toggleCollapsed,
        isMobileOpen,
        setIsMobileOpen,
        toggleMobileOpen,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextType {
  const context = useContext(NavigationContext);
  if (!context) {
    // Resilient fallback for testing and isolated components
    return {
      isCollapsed: inMemoryCollapsedState,
      setIsCollapsed: (collapsed: boolean) => {
        inMemoryCollapsedState = collapsed;
      },
      toggleCollapsed: () => {
        inMemoryCollapsedState = !inMemoryCollapsedState;
      },
      isMobileOpen: false,
      setIsMobileOpen: () => {},
      toggleMobileOpen: () => {},
    };
  }
  return context;
}
