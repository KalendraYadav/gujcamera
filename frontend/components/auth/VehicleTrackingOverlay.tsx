'use client';

/**
 * NETRAVA CCTV INTELLIGENCE PLATFORM — VEHICLE TRACKING OVERLAY
 * ============================================================================
 * HIGH-PRECISION MULTI-VEHICLE TRACKING CALIBRATED TO ACTUAL CCTV FOOTAGE
 *
 * Capabilities:
 * 1. MULTI-VEHICLE SIMULTANEOUS TRACKING:
 *    Simultaneously tracks 2 to 4 vehicles (Red Priority, Green Confirmed,
 *    Cyan Active, Amber Analysis) in lockstep with the highway footage.
 * 2. DETERMINISTIC TIMELINE SYNCHRONIZATION:
 *    Synchronized 60fps playback tied directly to video.currentTime with
 *    seamless 29.70s looping.
 * 3. PERSPECTIVE-ACCURATE SCALING & POSITION:
 *    Boxes follow actual vehicle speed and scale from distance to foreground.
 * 4. ATTACHED TELEMETRY BADGES:
 *    Attached headers showing Vehicle ID, Status tag, Speed (km/h), and
 *    Priority Alert indicators.
 * 5. RESTRAINED COMPUTER-VISION GLITCH:
 *    Occasional subtle 60-100ms corner illumination & scanline pulse.
 * ============================================================================
 */

import React, { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export type TrackState = 'priority' | 'active' | 'cyan' | 'amber';

export interface Keyframe {
  t: number;
  cx: number; // center x (% of video container)
  cy: number; // center y (% of video container)
  w: number;  // width (% of video container)
  h: number;  // height (% of video container)
}

export interface TrackDef {
  id: string;
  type: string;
  state: TrackState;
  badge: string;
  hasAlert?: boolean;
  speed: number;
  kfs: Keyframe[];
}

export interface ActiveBox {
  id: string;
  type: string;
  state: TrackState;
  badge: string;
  hasAlert: boolean;
  speed: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  opacity: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CALIBRATED GROUND-TRUTH MULTI-VEHICLE TRACKS (29.70s Loop)
// Calibrated directly against traffic_surveillance.mp4
// ─────────────────────────────────────────────────────────────────────────────
const TRACKS: TrackDef[] = [
  // ── 0.00s -> 2.50s (Immediate on Page Load: 3 Simultaneous Vehicles) ──
  {
    id: 'SUV 7719',
    type: 'SUV',
    state: 'priority',
    badge: 'Suspicious',
    hasAlert: true,
    speed: 78,
    kfs: [
      { t: 0.00, cx: 74.7, cy: 77.8, w: 17.0, h: 34.7 },
      { t: 0.30, cx: 70.0, cy: 58.5, w: 13.5, h: 26.0 },
      { t: 0.60, cx: 65.8, cy: 42.8, w: 10.5, h: 18.6 },
      { t: 0.90, cx: 62.2, cy: 30.5, w: 8.0,  h: 13.6 },
      { t: 1.20, cx: 59.8, cy: 21.4, w: 6.3,  h: 10.4 },
      { t: 1.50, cx: 58.0, cy: 14.5, w: 5.0,  h: 8.2 },
      { t: 1.80, cx: 56.6, cy: 9.7,  w: 4.1,  h: 6.5 },
      { t: 2.15, cx: 55.5, cy: 5.1,  w: 3.1,  h: 4.9 },
    ],
  },
  {
    id: 'CAR 3482',
    type: 'CAR',
    state: 'active',
    badge: 'Live',
    hasAlert: false,
    speed: 62,
    kfs: [
      { t: 0.00, cx: 73.5, cy: 36.0, w: 11.0, h: 18.0 },
      { t: 0.30, cx: 69.5, cy: 25.0, w: 8.5,  h: 13.5 },
      { t: 0.60, cx: 66.5, cy: 17.0, w: 6.8,  h: 10.2 },
      { t: 0.90, cx: 64.0, cy: 11.0, w: 5.2,  h: 7.6 },
      { t: 1.15, cx: 62.0, cy: 6.0,  w: 4.0,  h: 5.5 },
    ],
  },
  {
    id: 'TRUCK 9043',
    type: 'TRUCK',
    state: 'cyan',
    badge: 'Active',
    hasAlert: false,
    speed: 56,
    kfs: [
      { t: 0.00, cx: 50.5, cy: 51.0, w: 9.5,  h: 16.0 },
      { t: 0.40, cx: 49.5, cy: 38.0, w: 8.0,  h: 13.5 },
      { t: 0.80, cx: 48.5, cy: 26.0, w: 6.8,  h: 11.0 },
      { t: 1.20, cx: 47.7, cy: 16.0, w: 5.5,  h: 8.5 },
      { t: 1.55, cx: 47.0, cy: 8.0,  w: 4.2,  h: 6.0 },
    ],
  },

  // ── 1.40s -> 4.20s ──
  {
    id: 'CAR 2108',
    type: 'CAR',
    state: 'cyan',
    badge: 'Tracking',
    hasAlert: false,
    speed: 84,
    kfs: [
      { t: 1.40, cx: 26.0, cy: 48.0, w: 11.0, h: 18.0 },
      { t: 2.00, cx: 26.0, cy: 35.0, w: 9.0,  h: 14.5 },
      { t: 2.60, cx: 26.5, cy: 24.0, w: 7.5,  h: 11.0 },
      { t: 3.20, cx: 27.0, cy: 14.0, w: 5.8,  h: 8.5 },
      { t: 3.70, cx: 27.5, cy: 6.0,  w: 4.2,  h: 6.0 },
    ],
  },
  {
    id: 'HATCH 018',
    type: 'CAR',
    state: 'active',
    badge: 'Live',
    hasAlert: false,
    speed: 96,
    kfs: [
      { t: 1.80, cx: 55.0, cy: 72.0, w: 13.0, h: 24.0 },
      { t: 2.30, cx: 52.0, cy: 50.0, w: 10.0, h: 17.5 },
      { t: 2.80, cx: 49.5, cy: 32.0, w: 7.8,  h: 13.0 },
      { t: 3.30, cx: 47.8, cy: 18.0, w: 5.8,  h: 9.2 },
      { t: 3.80, cx: 46.7, cy: 8.0,  w: 4.0,  h: 6.0 },
      { t: 4.10, cx: 46.4, cy: 4.0,  w: 3.0,  h: 4.5 },
    ],
  },
  {
    id: 'SEDAN 089',
    type: 'SEDAN',
    state: 'priority',
    badge: 'Watchlist',
    hasAlert: true,
    speed: 114,
    kfs: [
      { t: 3.50, cx: 50.5, cy: 72.0, w: 13.0, h: 24.0 },
      { t: 4.00, cx: 49.3, cy: 48.0, w: 9.6,  h: 17.0 },
      { t: 4.50, cx: 48.3, cy: 29.0, w: 7.4,  h: 12.0 },
      { t: 5.00, cx: 47.4, cy: 15.0, w: 5.4,  h: 8.5 },
      { t: 5.50, cx: 46.7, cy: 6.5,  w: 3.8,  h: 5.8 },
      { t: 5.80, cx: 46.5, cy: 4.0,  w: 3.2,  h: 4.8 },
    ],
  },

  // ── 4.40s -> 7.80s ──
  {
    id: 'VAN 4012',
    type: 'VAN',
    state: 'cyan',
    badge: 'Active',
    hasAlert: false,
    speed: 72,
    kfs: [
      { t: 4.40, cx: 74.0, cy: 65.0, w: 14.5, h: 26.0 },
      { t: 5.00, cx: 68.0, cy: 46.0, w: 11.0, h: 19.5 },
      { t: 5.60, cx: 63.0, cy: 29.0, w: 8.0,  h: 13.5 },
      { t: 6.20, cx: 59.0, cy: 16.0, w: 5.8,  h: 9.2 },
      { t: 6.70, cx: 56.5, cy: 7.0,  w: 4.2,  h: 6.2 },
    ],
  },
  {
    id: 'SEDAN 027',
    type: 'CAR',
    state: 'active',
    badge: 'Verified',
    hasAlert: false,
    speed: 92,
    kfs: [
      { t: 5.50, cx: 51.0, cy: 76.0, w: 14.0, h: 26.0 },
      { t: 6.10, cx: 49.6, cy: 50.0, w: 10.0, h: 17.5 },
      { t: 6.70, cx: 48.4, cy: 29.0, w: 7.4,  h: 12.2 },
      { t: 7.30, cx: 47.4, cy: 14.0, w: 5.2,  h: 8.2 },
      { t: 7.80, cx: 46.6, cy: 5.0,  w: 3.5,  h: 5.0 },
    ],
  },
  {
    id: 'COUPE 064',
    type: 'COUPE',
    state: 'amber',
    badge: 'Speed Alert',
    hasAlert: true,
    speed: 122,
    kfs: [
      { t: 7.20, cx: 74.0, cy: 78.0, w: 16.5, h: 33.0 },
      { t: 7.80, cx: 67.2, cy: 50.0, w: 11.2, h: 20.5 },
      { t: 8.40, cx: 61.8, cy: 29.0, w: 7.8,  h: 13.5 },
      { t: 9.00, cx: 58.2, cy: 14.0, w: 5.2,  h: 8.5 },
      { t: 9.50, cx: 56.0, cy: 5.0,  w: 3.4,  h: 5.0 },
    ],
  },

  // ── 7.90s -> 11.80s ──
  {
    id: 'SUV 5541',
    type: 'SUV',
    state: 'priority',
    badge: 'Suspicious',
    hasAlert: true,
    speed: 88,
    kfs: [
      { t: 7.90,  cx: 55.0, cy: 82.0, w: 14.5, h: 28.0 },
      { t: 8.60,  cx: 51.5, cy: 54.0, w: 10.5, h: 18.5 },
      { t: 9.30,  cx: 49.0, cy: 32.0, w: 7.8,  h: 13.2 },
      { t: 10.00, cx: 47.6, cy: 16.0, w: 5.5,  h: 8.8 },
      { t: 10.60, cx: 46.8, cy: 6.5,  w: 3.8,  h: 5.8 },
    ],
  },
  {
    id: 'HATCH 015',
    type: 'CAR',
    state: 'cyan',
    badge: 'Active',
    hasAlert: false,
    speed: 98,
    kfs: [
      { t: 9.50,  cx: 51.0, cy: 75.0, w: 13.5, h: 25.0 },
      { t: 10.10, cx: 49.4, cy: 48.0, w: 9.6,  h: 16.8 },
      { t: 10.70, cx: 48.2, cy: 28.0, w: 7.2,  h: 11.8 },
      { t: 11.30, cx: 47.3, cy: 13.5, w: 5.0,  h: 7.8 },
      { t: 11.80, cx: 46.6, cy: 4.8,  w: 3.3,  h: 4.8 },
    ],
  },
  {
    id: 'SEDAN 073',
    type: 'SEDAN',
    state: 'priority',
    badge: 'Intercept',
    hasAlert: true,
    speed: 105,
    kfs: [
      { t: 11.30, cx: 51.2, cy: 77.0, w: 14.0, h: 26.0 },
      { t: 11.90, cx: 49.6, cy: 50.0, w: 10.0, h: 17.5 },
      { t: 12.50, cx: 48.4, cy: 29.0, w: 7.4,  h: 12.2 },
      { t: 13.10, cx: 47.4, cy: 14.0, w: 5.2,  h: 8.2 },
      { t: 13.60, cx: 46.6, cy: 5.0,  w: 3.4,  h: 5.0 },
    ],
  },

  // ── 12.20s -> 17.80s ──
  {
    id: 'CAB 2045',
    type: 'CAR',
    state: 'active',
    badge: 'Live',
    hasAlert: false,
    speed: 64,
    kfs: [
      { t: 12.20, cx: 74.0, cy: 68.0, w: 15.0, h: 28.0 },
      { t: 12.80, cx: 68.0, cy: 48.0, w: 11.2, h: 20.0 },
      { t: 13.40, cx: 62.5, cy: 30.0, w: 8.0,  h: 14.0 },
      { t: 14.00, cx: 58.8, cy: 16.0, w: 5.6,  h: 9.2 },
      { t: 14.50, cx: 56.5, cy: 7.0,  w: 4.0,  h: 6.0 },
    ],
  },
  {
    id: 'TRUCK 7120',
    type: 'TRUCK',
    state: 'cyan',
    badge: 'Active',
    hasAlert: false,
    speed: 58,
    kfs: [
      { t: 12.50, cx: 27.0, cy: 54.0, w: 12.0, h: 22.0 },
      { t: 13.20, cx: 27.2, cy: 38.0, w: 9.2,  h: 16.5 },
      { t: 13.90, cx: 27.6, cy: 24.0, w: 7.2,  h: 12.0 },
      { t: 14.60, cx: 28.0, cy: 13.0, w: 5.4,  h: 8.5 },
      { t: 15.20, cx: 28.5, cy: 5.5,  w: 4.0,  h: 6.0 },
    ],
  },
  {
    id: 'SEDAN 031',
    type: 'CAR',
    state: 'active',
    badge: 'Verified',
    hasAlert: false,
    speed: 94,
    kfs: [
      { t: 13.50, cx: 51.0, cy: 75.0, w: 13.8, h: 25.5 },
      { t: 14.10, cx: 49.5, cy: 49.0, w: 9.8,  h: 17.0 },
      { t: 14.70, cx: 48.3, cy: 28.0, w: 7.2,  h: 11.8 },
      { t: 15.30, cx: 47.3, cy: 13.5, w: 5.0,  h: 7.8 },
      { t: 15.80, cx: 46.6, cy: 4.8,  w: 3.3,  h: 4.8 },
    ],
  },
  {
    id: 'WAGON 052',
    type: 'WAGON',
    state: 'cyan',
    badge: 'Active',
    hasAlert: false,
    speed: 99,
    kfs: [
      { t: 15.30, cx: 74.5, cy: 77.0, w: 16.8, h: 33.5 },
      { t: 15.90, cx: 67.0, cy: 49.0, w: 11.0, h: 20.0 },
      { t: 16.50, cx: 61.5, cy: 28.0, w: 7.6,  h: 13.0 },
      { t: 17.10, cx: 58.0, cy: 13.5, w: 5.0,  h: 8.0 },
      { t: 17.60, cx: 55.8, cy: 4.8,  w: 3.3,  h: 4.9 },
    ],
  },

  // ── 16.80s -> 21.80s ──
  {
    id: 'SEDAN 088',
    type: 'SEDAN',
    state: 'priority',
    badge: 'Watchlist',
    hasAlert: true,
    speed: 110,
    kfs: [
      { t: 16.80, cx: 51.0, cy: 76.0, w: 14.0, h: 26.0 },
      { t: 17.50, cx: 49.5, cy: 50.0, w: 10.0, h: 17.5 },
      { t: 18.20, cx: 48.3, cy: 29.0, w: 7.4,  h: 12.2 },
      { t: 18.90, cx: 47.4, cy: 14.0, w: 5.2,  h: 8.2 },
      { t: 19.50, cx: 46.6, cy: 5.0,  w: 3.4,  h: 5.0 },
    ],
  },
  {
    id: 'PATROL 104',
    type: 'SUV',
    state: 'amber',
    badge: 'Patrol',
    hasAlert: false,
    speed: 82,
    kfs: [
      { t: 18.20, cx: 27.0, cy: 52.0, w: 12.0, h: 20.0 },
      { t: 18.80, cx: 27.5, cy: 37.0, w: 9.5,  h: 15.5 },
      { t: 19.40, cx: 28.0, cy: 24.0, w: 7.6,  h: 11.5 },
      { t: 20.00, cx: 28.5, cy: 14.0, w: 5.8,  h: 8.5 },
      { t: 20.50, cx: 29.0, cy: 6.0,  w: 4.2,  h: 6.0 },
    ],
  },
  {
    id: 'SEDAN 024',
    type: 'CAR',
    state: 'active',
    badge: 'Live',
    hasAlert: false,
    speed: 95,
    kfs: [
      { t: 19.50, cx: 51.0, cy: 75.0, w: 13.8, h: 25.5 },
      { t: 20.10, cx: 49.5, cy: 49.0, w: 9.8,  h: 17.0 },
      { t: 20.70, cx: 48.3, cy: 28.0, w: 7.2,  h: 11.8 },
      { t: 21.30, cx: 47.3, cy: 13.5, w: 5.0,  h: 7.8 },
      { t: 21.80, cx: 46.6, cy: 4.8,  w: 3.3,  h: 4.8 },
    ],
  },

  // ── 21.20s -> 25.80s ──
  {
    id: 'SUV 067',
    type: 'SUV',
    state: 'amber',
    badge: 'Analysis',
    hasAlert: false,
    speed: 102,
    kfs: [
      { t: 21.20, cx: 51.2, cy: 77.0, w: 14.0, h: 26.0 },
      { t: 21.80, cx: 49.6, cy: 50.0, w: 10.0, h: 17.5 },
      { t: 22.40, cx: 48.4, cy: 29.0, w: 7.4,  h: 12.2 },
      { t: 23.00, cx: 47.4, cy: 14.0, w: 5.2,  h: 8.2 },
      { t: 23.50, cx: 46.6, cy: 5.0,  w: 3.4,  h: 5.0 },
    ],
  },
  {
    id: 'COUPE 093',
    type: 'COUPE',
    state: 'priority',
    badge: 'Target',
    hasAlert: true,
    speed: 116,
    kfs: [
      { t: 23.20, cx: 74.5, cy: 77.0, w: 16.8, h: 33.5 },
      { t: 23.80, cx: 67.0, cy: 49.0, w: 11.0, h: 20.0 },
      { t: 24.40, cx: 61.5, cy: 28.0, w: 7.6,  h: 13.0 },
      { t: 25.00, cx: 58.0, cy: 13.5, w: 5.0,  h: 8.0 },
      { t: 25.50, cx: 55.8, cy: 4.8,  w: 3.3,  h: 4.9 },
    ],
  },

  // ── 24.80s -> 29.70s (Seamless Loop into 0.00s!) ──
  {
    id: 'CAR 039',
    type: 'CAR',
    state: 'cyan',
    badge: 'Active',
    hasAlert: false,
    speed: 97,
    kfs: [
      { t: 25.20, cx: 51.0, cy: 76.0, w: 14.0, h: 26.0 },
      { t: 25.80, cx: 49.5, cy: 50.0, w: 10.0, h: 17.5 },
      { t: 26.40, cx: 48.3, cy: 29.0, w: 7.4,  h: 12.2 },
      { t: 27.00, cx: 47.4, cy: 14.0, w: 5.2,  h: 8.2 },
      { t: 27.50, cx: 46.6, cy: 5.0,  w: 3.4,  h: 5.0 },
    ],
  },
  {
    id: 'CAR 3482',
    type: 'CAR',
    state: 'active',
    badge: 'Live',
    hasAlert: false,
    speed: 62,
    kfs: [
      { t: 26.80, cx: 73.5, cy: 36.0, w: 11.0, h: 18.0 },
      { t: 27.40, cx: 69.5, cy: 25.0, w: 8.5,  h: 13.5 },
      { t: 28.00, cx: 66.5, cy: 17.0, w: 6.8,  h: 10.2 },
      { t: 28.60, cx: 64.0, cy: 11.0, w: 5.2,  h: 7.6 },
      { t: 29.10, cx: 62.0, cy: 6.0,  w: 4.0,  h: 5.5 },
    ],
  },
  {
    id: 'SUV 7719',
    type: 'SUV',
    state: 'priority',
    badge: 'Suspicious',
    hasAlert: true,
    speed: 78,
    kfs: [
      { t: 27.50, cx: 74.7, cy: 77.8, w: 17.0, h: 34.7 },
      { t: 28.10, cx: 70.0, cy: 58.5, w: 13.5, h: 26.0 },
      { t: 28.70, cx: 65.8, cy: 42.8, w: 10.5, h: 18.6 },
      { t: 29.20, cx: 62.2, cy: 30.5, w: 8.0,  h: 13.6 },
      { t: 29.70, cx: 59.8, cy: 21.4, w: 6.3,  h: 10.4 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SMOOTH HERMITE INTERPOLATION
// ─────────────────────────────────────────────────────────────────────────────
function interpolateBox(t: number, track: TrackDef): ActiveBox | null {
  const kfs = track.kfs;
  const startT = kfs[0].t;
  const endT = kfs[kfs.length - 1].t;

  if (t < startT || t > endT) {
    return null;
  }

  // Find surrounding keyframe pair
  for (let i = 0; i < kfs.length - 1; i++) {
    const k0 = kfs[i];
    const k1 = kfs[i + 1];

    if (k0.t <= t && t <= k1.t) {
      const dt = k1.t - k0.t;
      const frac = dt === 0 ? 0 : (t - k0.t) / dt;

      // Smooth cubic Hermite ease
      const s = frac * frac * (3 - 2 * frac);

      const cx = k0.cx + (k1.cx - k0.cx) * s;
      const cy = k0.cy + (k1.cy - k0.cy) * s;
      const w  = k0.w  + (k1.w  - k0.w)  * s;
      const h  = k0.h  + (k1.h  - k0.h)  * s;

      // Opacity envelope
      let fadeIn = 1.0;
      if (startT > 0.05) {
        fadeIn = Math.min(1.0, (t - startT) / 0.18);
      }
      const fadeOut = Math.min(1.0, (endT - t) / 0.18);
      const edgeFade = Math.min(fadeIn, fadeOut);

      // Depth-based subtle opacity
      const depthOpacity = 0.78 + (cy / 85.0) * 0.18;
      const opacity = Math.min(0.96, depthOpacity * edgeFade);

      return {
        id: track.id,
        type: track.type,
        state: track.state,
        badge: track.badge,
        hasAlert: Boolean(track.hasAlert),
        speed: track.speed,
        cx,
        cy,
        w,
        h,
        opacity,
      };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPUTE ALL ACTIVE VEHICLE BOXES AT TIME t (Multi-Vehicle Array)
// ─────────────────────────────────────────────────────────────────────────────
function getActiveVehicleBoxes(videoTime: number): ActiveBox[] {
  // Normalize time within 29.70s duration
  const t = Math.max(0, videoTime % 29.70);

  const active: ActiveBox[] = [];

  for (let i = 0; i < TRACKS.length; i++) {
    const box = interpolateBox(t, TRACKS[i]);
    if (box && box.opacity > 0.02) {
      active.push(box);
      if (active.length >= 4) break; // Maximum 4 concurrent tracks
    }
  }

  // Initial fallback if none active
  if (active.length === 0) {
    const initial = interpolateBox(0.00, TRACKS[0]);
    if (initial) active.push(initial);
  }

  return active;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOR PALETTES — Government / CCTV Intelligence Grade
// ─────────────────────────────────────────────────────────────────────────────
const PALETTES: Record<
  TrackState,
  {
    bracket: string;
    innerFill: string;
    innerBdr: string;
    badgeBg: string;
    badgeBdr: string;
    text: string;
    dot: string;
    dotGlow: string;
    tagBg: string;
    tagText: string;
  }
> = {
  priority: {
    bracket:   'rgba(239, 68, 68, 0.95)',
    innerFill: 'rgba(239, 68, 68, 0.06)',
    innerBdr:  'rgba(239, 68, 68, 0.55)',
    badgeBg:   'rgba(153, 27, 27, 0.94)',
    badgeBdr:  'rgba(239, 68, 68, 0.85)',
    text:      '#FFFFFF',
    dot:       '#EF4444',
    dotGlow:   'rgba(239, 68, 68, 0.9)',
    tagBg:     'rgba(220, 38, 38, 0.35)',
    tagText:   '#FECACA',
  },
  active: {
    bracket:   'rgba(16, 185, 129, 0.95)',
    innerFill: 'rgba(16, 185, 129, 0.05)',
    innerBdr:  'rgba(16, 185, 129, 0.50)',
    badgeBg:   'rgba(6, 78, 59, 0.94)',
    badgeBdr:  'rgba(16, 185, 129, 0.85)',
    text:      '#FFFFFF',
    dot:       '#10B981',
    dotGlow:   'rgba(16, 185, 129, 0.9)',
    tagBg:     'rgba(16, 185, 129, 0.35)',
    tagText:   '#A7F3D0',
  },
  cyan: {
    bracket:   'rgba(6, 182, 212, 0.95)',
    innerFill: 'rgba(6, 182, 212, 0.05)',
    innerBdr:  'rgba(6, 182, 212, 0.50)',
    badgeBg:   'rgba(14, 116, 144, 0.94)',
    badgeBdr:  'rgba(6, 182, 212, 0.85)',
    text:      '#FFFFFF',
    dot:       '#06B6D4',
    dotGlow:   'rgba(6, 182, 212, 0.9)',
    tagBg:     'rgba(6, 182, 212, 0.35)',
    tagText:   '#BAE6FD',
  },
  amber: {
    bracket:   'rgba(245, 158, 11, 0.95)',
    innerFill: 'rgba(245, 158, 11, 0.05)',
    innerBdr:  'rgba(245, 158, 11, 0.50)',
    badgeBg:   'rgba(146, 64, 14, 0.94)',
    badgeBdr:  'rgba(245, 158, 11, 0.85)',
    text:      '#FFFFFF',
    dot:       '#F59E0B',
    dotGlow:   'rgba(245, 158, 11, 0.9)',
    tagBg:     'rgba(245, 158, 11, 0.35)',
    tagText:   '#FDE68A',
  },
};

const MAX_SLOTS = 4;

interface VehicleTrackingOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isReducedMotion?: boolean;
}

export function VehicleTrackingOverlay({
  videoRef,
  isReducedMotion = false,
}: VehicleTrackingOverlayProps) {
  // Direct DOM slot references for up to 4 simultaneous vehicles (60fps lockstep)
  const slotContainers = useRef<(HTMLDivElement | null)[]>([]);
  const slotInners     = useRef<(HTMLDivElement | null)[]>([]);
  const slotTLs        = useRef<(HTMLDivElement | null)[]>([]);
  const slotTRs        = useRef<(HTMLDivElement | null)[]>([]);
  const slotBLs        = useRef<(HTMLDivElement | null)[]>([]);
  const slotBRs        = useRef<(HTMLDivElement | null)[]>([]);
  const slotBadges     = useRef<(HTMLDivElement | null)[]>([]);
  const slotBadgeTexts = useRef<(HTMLSpanElement | null)[]>([]);
  const slotTagTexts   = useRef<(HTMLSpanElement | null)[]>([]);
  const slotAlertIcons = useRef<(HTMLSpanElement | null)[]>([]);
  const slotSpeeds     = useRef<(HTMLSpanElement | null)[]>([]);
  const slotDots       = useRef<(HTMLSpanElement | null)[]>([]);

  const rafRef = useRef<number>(0);
  const currentSlotStates = useRef<string[]>(Array(MAX_SLOTS).fill(''));

  // Direct DOM render function
  const renderSlots = (boxes: ActiveBox[]) => {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const container = slotContainers.current[i];
      if (!container) continue;

      const box = boxes[i];

      if (!box || box.opacity < 0.01) {
        container.style.opacity = '0';
        continue;
      }

      const left = box.cx - box.w / 2;
      const top  = box.cy - box.h / 2;

      container.style.left    = `${left}%`;
      container.style.top     = `${top}%`;
      container.style.width   = `${box.w}%`;
      container.style.height  = `${box.h}%`;
      container.style.opacity = String(box.opacity);

      // Depth scale: larger when closer to foreground (high cy), smaller when far (low cy)
      const depthScale = Math.max(0.60, Math.min(1.0, box.cy / 75.0));

      const pal = PALETTES[box.state] || PALETTES.priority;
      const stateKey = `${box.state}-${box.hasAlert}`;

      if (currentSlotStates.current[i] !== stateKey) {
        currentSlotStates.current[i] = stateKey;

        if (slotInners.current[i]) {
          slotInners.current[i]!.style.backgroundColor = pal.innerFill;
          slotInners.current[i]!.style.border = `0.8px solid ${pal.innerBdr}`;
        }
        if (slotBadges.current[i]) {
          slotBadges.current[i]!.style.backgroundColor = pal.badgeBg;
          slotBadges.current[i]!.style.borderColor = pal.badgeBdr;
          slotBadges.current[i]!.style.color = pal.text;
        }
        if (slotDots.current[i]) {
          slotDots.current[i]!.style.backgroundColor = pal.dot;
          slotDots.current[i]!.style.boxShadow = `0 0 4px ${pal.dotGlow}`;
        }
        if (slotTagTexts.current[i]) {
          slotTagTexts.current[i]!.style.backgroundColor = pal.tagBg;
          slotTagTexts.current[i]!.style.color = pal.tagText;
        }
      }

      // Corner brackets scaling
      const bracketSize = Math.max(6, Math.min(14, 6 + depthScale * 8));
      const bracketPx = `${bracketSize}px`;
      const bw = Math.max(1.2, Math.min(1.8, 1.2 + depthScale * 0.6));
      const bwStr = `${bw}px solid ${pal.bracket}`;

      if (slotTLs.current[i]) {
        slotTLs.current[i]!.style.width = bracketPx;
        slotTLs.current[i]!.style.height = bracketPx;
        slotTLs.current[i]!.style.borderTop = bwStr;
        slotTLs.current[i]!.style.borderLeft = bwStr;
      }
      if (slotTRs.current[i]) {
        slotTRs.current[i]!.style.width = bracketPx;
        slotTRs.current[i]!.style.height = bracketPx;
        slotTRs.current[i]!.style.borderTop = bwStr;
        slotTRs.current[i]!.style.borderRight = bwStr;
      }
      if (slotBLs.current[i]) {
        slotBLs.current[i]!.style.width = bracketPx;
        slotBLs.current[i]!.style.height = bracketPx;
        slotBLs.current[i]!.style.borderBottom = bwStr;
        slotBLs.current[i]!.style.borderLeft = bwStr;
      }
      if (slotBRs.current[i]) {
        slotBRs.current[i]!.style.width = bracketPx;
        slotBRs.current[i]!.style.height = bracketPx;
        slotBRs.current[i]!.style.borderBottom = bwStr;
        slotBRs.current[i]!.style.borderRight = bwStr;
      }

      // Attached Telemetry Typography & Content
      const fontSize = Math.max(6.5, Math.min(9.2, 6.5 + depthScale * 2.7));
      if (slotBadges.current[i]) {
        slotBadges.current[i]!.style.fontSize = `${fontSize}px`;
      }
      if (slotBadgeTexts.current[i]) {
        slotBadgeTexts.current[i]!.textContent = box.id;
      }
      if (slotTagTexts.current[i]) {
        slotTagTexts.current[i]!.textContent = box.badge;
      }
      if (slotAlertIcons.current[i]) {
        slotAlertIcons.current[i]!.style.display = box.hasAlert ? 'inline-block' : 'none';
      }
      if (slotSpeeds.current[i]) {
        slotSpeeds.current[i]!.textContent = `${box.speed} km/h`;
      }
    }
  };

  // Immediate synchronous initialization at t=0.00s (instant initial visibility)
  useEffect(() => {
    const initialBoxes = getActiveVehicleBoxes(0.00);
    renderSlots(initialBoxes);
  }, []);

  // 60fps synchronous render loop directly locked to video playback timeline
  useEffect(() => {
    if (isReducedMotion) {
      const initialBoxes = getActiveVehicleBoxes(0.00);
      renderSlots(initialBoxes);
      return;
    }

    const tick = () => {
      let t = 0.00;
      const vid = videoRef.current;
      if (vid && !vid.paused && vid.readyState >= 1) {
        t = vid.currentTime;
      }
      const boxes = getActiveVehicleBoxes(t);
      renderSlots(boxes);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [videoRef, isReducedMotion]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {/* Subtle Computer-Vision Processing Keyframe & Glitch Styles */}
      <style>{`
        @keyframes cvGlitchPulse {
          0%, 94%, 100% {
            filter: drop-shadow(0 2px 6px rgba(0,0,0,0.85));
            transform: none;
          }
          95% {
            filter: drop-shadow(0 0 8px rgba(239,68,68,0.7));
            transform: translate(0.5px, -0.5px);
          }
          96.5% {
            filter: drop-shadow(0 0 6px rgba(59,130,246,0.6));
            transform: translate(-0.5px, 0.5px);
          }
          98% {
            filter: drop-shadow(0 2px 6px rgba(0,0,0,0.85));
            transform: none;
          }
        }
      `}</style>

      {/* Render 4 Persistent Multi-Vehicle Tracking Slots */}
      {Array.from({ length: MAX_SLOTS }).map((_, index) => {
        const pal = PALETTES.priority;

        return (
          <div
            key={`track-slot-${index}`}
            ref={(el) => {
              slotContainers.current[index] = el;
            }}
            style={{
              position: 'absolute',
              left: '0%',
              top: '0%',
              width: '10%',
              height: '10%',
              opacity: index < 3 ? 0.92 : 0, // Slot 0, 1, 2 visible immediately on frame 0
              pointerEvents: 'none',
              willChange: 'left, top, width, height, opacity',
              animation: `cvGlitchPulse ${3.2 + index * 0.7}s ease-in-out infinite`,
            }}
          >
            {/* Subtle Inner Tint */}
            <div
              ref={(el) => {
                slotInners.current[index] = el;
              }}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: pal.innerFill,
                border: `0.8px solid ${pal.innerBdr}`,
                borderRadius: '2px',
              }}
            />

            {/* 4 Precision Corner Brackets */}
            <div
              ref={(el) => {
                slotTLs.current[index] = el;
              }}
              style={{
                position: 'absolute',
                top: '-1px',
                left: '-1px',
                width: 12,
                height: 12,
                borderTop: `1.8px solid ${pal.bracket}`,
                borderLeft: `1.8px solid ${pal.bracket}`,
              }}
            />
            <div
              ref={(el) => {
                slotTRs.current[index] = el;
              }}
              style={{
                position: 'absolute',
                top: '-1px',
                right: '-1px',
                width: 12,
                height: 12,
                borderTop: `1.8px solid ${pal.bracket}`,
                borderRight: `1.8px solid ${pal.bracket}`,
              }}
            />
            <div
              ref={(el) => {
                slotBLs.current[index] = el;
              }}
              style={{
                position: 'absolute',
                bottom: '-1px',
                left: '-1px',
                width: 12,
                height: 12,
                borderBottom: `1.8px solid ${pal.bracket}`,
                borderLeft: `1.8px solid ${pal.bracket}`,
              }}
            />
            <div
              ref={(el) => {
                slotBRs.current[index] = el;
              }}
              style={{
                position: 'absolute',
                bottom: '-1px',
                right: '-1px',
                width: 12,
                height: 12,
                borderBottom: `1.8px solid ${pal.bracket}`,
                borderRight: `1.8px solid ${pal.bracket}`,
              }}
            />

            {/* Top Attached Computer-Vision Telemetry Badge */}
            <div
              ref={(el) => {
                slotBadges.current[index] = el;
              }}
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: '3px',
                display: 'inline-flex',
                flexDirection: 'column',
                gap: '1px',
                padding: '2px 6px',
                backgroundColor: pal.badgeBg,
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                border: `0.8px solid ${pal.badgeBdr}`,
                borderRadius: '3px',
                fontSize: '8px',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                color: pal.text,
                letterSpacing: '0.05em',
                lineHeight: 1.25,
                whiteSpace: 'nowrap',
                boxShadow: '0 3px 8px rgba(0, 0, 0, 0.8)',
              }}
            >
              {/* Line 1: [Dot] Vehicle ID • [Status Tag] [Alert ⚠️] */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span
                  ref={(el) => {
                    slotDots.current[index] = el;
                  }}
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    backgroundColor: pal.dot,
                    boxShadow: `0 0 4px ${pal.dotGlow}`,
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
                <span
                  ref={(el) => {
                    slotBadgeTexts.current[index] = el;
                  }}
                >
                  SUV 7719
                </span>
                <span
                  ref={(el) => {
                    slotTagTexts.current[index] = el;
                  }}
                  style={{
                    padding: '0.5px 3.5px',
                    backgroundColor: pal.tagBg,
                    color: pal.tagText,
                    borderRadius: '2px',
                    fontSize: '0.9em',
                    fontWeight: 800,
                  }}
                >
                  Suspicious
                </span>
                <span
                  ref={(el) => {
                    slotAlertIcons.current[index] = el;
                  }}
                  style={{
                    fontSize: '0.85em',
                    display: 'inline-block',
                    marginLeft: '1px',
                  }}
                >
                  ⚠️
                </span>
              </div>

              {/* Line 2: Speed Telemetry */}
              <div
                style={{
                  fontSize: '0.88em',
                  opacity: 0.9,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                }}
              >
                <span
                  ref={(el) => {
                    slotSpeeds.current[index] = el;
                  }}
                >
                  78 km/h
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
