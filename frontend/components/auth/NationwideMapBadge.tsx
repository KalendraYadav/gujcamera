'use client';

import React from 'react';

export function NationwideMapBadge() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4, 16px)',
        padding: '10px 14px',
        backgroundColor: 'rgba(11, 16, 32, 0.75)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 'var(--radius-sm, 6px)',
        width: '100%',
        maxWidth: '390px',
        boxSizing: 'border-box',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(59, 130, 246, 0.06)',
      }}
    >
      {/* Geographically Authentic India Survey of India Map SVG */}
      <div style={{ position: 'relative', width: '84px', height: '92px', flexShrink: 0 }}>
        <svg
          viewBox="0 0 100 110"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.7))' }}
        >
          <defs>
            <linearGradient id="authenticIndiaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(59, 130, 246, 0.14)" />
              <stop offset="50%" stopColor="rgba(16, 24, 39, 0.5)" />
              <stop offset="100%" stopColor="rgba(215, 25, 63, 0.12)" />
            </linearGradient>

            <linearGradient id="authenticIndiaStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(147, 197, 253, 0.65)" />
              <stop offset="50%" stopColor="rgba(59, 130, 246, 0.55)" />
              <stop offset="85%" stopColor="rgba(239, 68, 68, 0.6)" />
              <stop offset="100%" stopColor="rgba(147, 197, 253, 0.65)" />
            </linearGradient>
          </defs>

          {/* Tactical Coordinate Grid Overlay */}
          <line x1="10" y1="35" x2="90" y2="35" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="0.7" strokeDasharray="3 3" />
          <line x1="8" y1="67" x2="75" y2="67" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="0.7" strokeDasharray="3 3" />
          <line x1="32" y1="10" x2="32" y2="104" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="0.7" strokeDasharray="3 3" />
          <line x1="68" y1="35" x2="68" y2="85" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="0.7" strokeDasharray="3 3" />

          {/* Official Survey of India Sovereign Boundary Path (Verified GeoJSON) */}
          <path
            d="M 33.4 11.2 L 39.4 9.5 L 41.3 11.2 L 42.3 11.1 L 41.8 13.2 L 39.9 14.7 L 39.4 16.2 L 37.8 16.2 L 38.3 17.4 L 37.9 18.4 L 39.2 19 L 39.8 20.8 L 38.1 21.7 L 37.1 20.8 L 36.4 21.1 L 37.3 23.2 L 37.4 25.4 L 38.4 24.9 L 40 26.6 L 40.7 26.5 L 44.3 28.9 L 42.4 30.8 L 41.6 33.8 L 47.2 37.1 L 49.7 37.6 L 50.1 38.3 L 53.3 38.8 L 54.3 38.3 L 57.6 40.8 L 59.1 40.5 L 59.5 41.3 L 62.4 41.9 L 63.4 41.5 L 64.3 42.2 L 66.4 42.2 L 67 40.7 L 66.5 39.7 L 66.9 37 L 68.2 36.3 L 69.1 36.9 L 68.8 39.5 L 70.2 40.6 L 79.3 40.5 L 79.1 38.5 L 77.7 38.1 L 78 37.4 L 80.4 37.3 L 82.9 34.8 L 86.1 33.5 L 87.2 32.3 L 89.3 33 L 91.7 32 L 93.5 34.1 L 93.2 35.2 L 93.9 34.7 L 96 36.6 L 94.4 38 L 95.1 39.4 L 94 38.8 L 92.5 39 L 88.8 41.6 L 89 43.1 L 87.3 45.6 L 87.5 47 L 85.8 50.7 L 83.2 50.2 L 83.3 53 L 82.6 53.8 L 82.8 55.8 L 81.9 57 L 80.8 56.7 L 79.9 51.2 L 79 51.1 L 78.5 53.3 L 77.9 53.7 L 76.3 51.2 L 77 49.9 L 78.2 49.7 L 79.7 48.5 L 79.8 47.3 L 80.5 47.2 L 80.1 46.6 L 72.3 45.8 L 71.8 42.9 L 70.7 43.4 L 69.8 42.2 L 68.8 42.4 L 67.7 41.3 L 68.1 42.2 L 66.8 43.9 L 69 45.2 L 69.4 46.2 L 67.9 46.1 L 66.5 47.9 L 68.7 49.3 L 68.2 51.4 L 68.8 52.8 L 69.5 52.9 L 69.2 53.6 L 69.7 58.3 L 68.8 58.1 L 68.5 56.8 L 67.3 58.3 L 66.7 56.3 L 66 57.8 L 62.9 59.4 L 63.2 61.6 L 61.5 63.7 L 56.7 66.3 L 53.9 69.7 L 48.5 73.8 L 48.2 75.5 L 45.3 76.3 L 44.1 78.3 L 43.5 77.8 L 42.2 78.4 L 41.4 80.7 L 42.3 86.3 L 40.5 92.2 L 40.7 96.8 L 39 97 L 37.9 99.2 L 38.4 100.1 L 36.2 100.8 L 35 103.3 L 33.3 104.2 L 30.5 101.6 L 27.9 93.1 L 26.1 90.9 L 23.5 82.3 L 20.8 77.4 L 18.9 69.2 L 19.2 66.9 L 18.7 67.5 L 18.9 66.2 L 18.2 64.5 L 18.9 61.8 L 18 59.4 L 18.9 58.1 L 17.7 58.1 L 18.3 57.2 L 17.7 56.9 L 18.8 56.2 L 17 56.2 L 16.6 57.6 L 17 58.3 L 16.2 59.8 L 12.3 61.4 L 10.3 60.2 L 6.4 55.9 L 10.2 55.1 L 11.1 53.7 L 10.5 53.5 L 8.9 54.4 L 7.3 54.2 L 5.3 52.9 L 4.8 51.7 L 6 50.6 L 4 51.5 L 4.6 50.3 L 5.7 50.3 L 5.9 49.4 L 9.6 49.6 L 11.6 48.8 L 12.3 49.4 L 13.3 48.8 L 11.9 44.6 L 10.2 43.8 L 10.3 41.8 L 8.3 40.9 L 8.3 39.7 L 10.9 36.6 L 12.4 37.6 L 15.8 36.6 L 17.2 34.1 L 19.1 32.8 L 20.4 30.2 L 22.1 29.3 L 22.3 28.2 L 24.5 26.1 L 24 25.8 L 24.2 23.5 L 26.5 22.4 L 26.2 21.7 L 24.4 21.2 L 24.5 20.4 L 21.2 19.3 L 20.6 14.4 L 22.6 12.6 L 21.6 12.1 L 21.3 11 L 19.6 10.4 L 19.8 10 L 17.9 10 L 17.8 8.8 L 19.7 7 L 25.9 6 L 30.7 8.8 L 31.3 9.9 L 33.4 11.2 Z"
            fill="url(#authenticIndiaGrad)"
            stroke="url(#authenticIndiaStroke)"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />

          {/* Faint Internal Inter-Agency Network Arcs */}
          {/* Delhi <-> Mumbai */}
          <path d="M 32.4 34.5 Q 23 50 18.8 66.9" stroke="rgba(215, 25, 63, 0.65)" strokeWidth="0.9" fill="none" />
          {/* Delhi <-> Kolkata */}
          <path d="M 32.4 34.5 Q 52 46 67.6 55.0" stroke="rgba(59, 130, 246, 0.55)" strokeWidth="0.8" fill="none" strokeDasharray="2 2" />
          {/* Mumbai <-> Bengaluru */}
          <path d="M 18.8 66.9 Q 25 78 33.7 87.6" stroke="rgba(215, 25, 63, 0.65)" strokeWidth="0.9" fill="none" />
          {/* Delhi <-> Ahmedabad */}
          <line x1="32.4" y1="34.5" x2="17.8" y2="53.5" stroke="rgba(59, 130, 246, 0.5)" strokeWidth="0.8" />
          {/* Kolkata <-> Guwahati */}
          <path d="M 67.6 55.0 Q 73 48 78.2 42.9" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="0.8" fill="none" strokeDasharray="2 2" />
          {/* Hyderabad <-> Bengaluru */}
          <line x1="36.5" y1="72.7" x2="33.7" y2="87.6" stroke="rgba(59, 130, 246, 0.45)" strokeWidth="0.8" />
          {/* Delhi <-> Srinagar */}
          <line x1="32.4" y1="34.5" x2="24.9" y2="16.0" stroke="rgba(215, 25, 63, 0.55)" strokeWidth="0.8" strokeDasharray="2 2" />

          {/* Command City Nodes (Geographically Projected) */}
          {/* Delhi NCR (HQ) */}
          <circle cx="32.4" cy="34.5" r="2.8" fill="#D7193F" />
          <circle cx="32.4" cy="34.5" r="1.1" fill="#FFFFFF" />
          <circle cx="32.4" cy="34.5" r="7" stroke="#D7193F" strokeWidth="0.6" opacity="0.6">
            <animate attributeName="r" values="3;11;3" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0;0.7" dur="2.6s" repeatCount="indefinite" />
          </circle>

          {/* Mumbai */}
          <circle cx="18.8" cy="66.9" r="2.2" fill="#3B82F6" />

          {/* Ahmedabad */}
          <circle cx="17.8" cy="53.5" r="2.0" fill="#3B82F6" />

          {/* Kolkata */}
          <circle cx="67.6" cy="55.0" r="2.2" fill="#3B82F6" />

          {/* Bengaluru */}
          <circle cx="33.7" cy="87.6" r="2.2" fill="#D7193F" />

          {/* Hyderabad */}
          <circle cx="36.5" cy="72.7" r="2.0" fill="#60A5FA" />

          {/* Guwahati */}
          <circle cx="78.2" cy="42.9" r="2.0" fill="#38BDF8" />

          {/* Srinagar */}
          <circle cx="24.9" cy="16.0" r="1.8" fill="#D7193F" />
        </svg>
      </div>

      {/* Editorial Telemetry Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: '#FFFFFF',
            textTransform: 'uppercase',
          }}
        >
          Pan-India Police Network
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: '8px',
            marginTop: '2px',
          }}
        >
          <div style={{ width: '2px', backgroundColor: '#D7193F', borderRadius: '1px', flexShrink: 0 }} />
          <div
            style={{
              fontSize: '10.5px',
              fontFamily: 'var(--font-mono, monospace)',
              color: '#CBD5E1',
              letterSpacing: '0.06em',
              lineHeight: 1.4,
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            <div>Pan-India Police Jurisdictions</div>
            <div>Simulated RTSP Gateway</div>
            <div>ANPR Intelligence Pipeline</div>
          </div>
        </div>
      </div>
    </div>
  );
}
