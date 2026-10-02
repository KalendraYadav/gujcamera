import React from 'react';

interface PoliceCrestProps {
  size?: number;
  className?: string;
}

export function PoliceCrest({ size = 48, className }: PoliceCrestProps) {
  // Institutional Gold, Crimson, and Navy Indian Police Shield Emblem
  return (
    <svg
      width={size}
      height={size * 1.15}
      viewBox="0 0 100 115"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Shield Outer Gold Gradient */}
        <linearGradient id="shieldGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#92400E" />
        </linearGradient>

        {/* Shield Inner Crimson Gradient */}
        <linearGradient id="shieldCrimsonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#DC2626" />
          <stop offset="60%" stopColor="#B91C1C" />
          <stop offset="100%" stopColor="#7F1D1D" />
        </linearGradient>

        {/* Shield Navy Split */}
        <linearGradient id="shieldNavyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>

        {/* Laurel Gold Gradient */}
        <linearGradient id="laurelGold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>

        {/* Glow Filter */}
        <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#B45309" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Outer Shield Outline */}
      <path
        d="M50 4 C78 4 92 14 92 36 C92 72 50 102 50 102 C50 102 8 72 8 36 C8 14 22 4 50 4 Z"
        fill="url(#shieldGoldGrad)"
        filter="url(#goldGlow)"
      />

      {/* Middle Shield Border */}
      <path
        d="M50 7 C75 7 88 16 88 36 C88 69 50 97 50 97 C50 97 12 69 12 36 C12 16 25 7 50 7 Z"
        fill="#0B1020"
      />

      {/* Left Shield Half (Crimson) */}
      <path
        d="M50 9 C30 9 15 18 15 36 C15 67 50 94 50 94 L50 9 Z"
        fill="url(#shieldCrimsonGrad)"
      />

      {/* Right Shield Half (Navy) */}
      <path
        d="M50 9 C70 9 85 18 85 36 C85 67 50 94 50 94 L50 9 Z"
        fill="url(#shieldNavyGrad)"
      />

      {/* Center Golden Star Burst / Ashoka Dharma Wheel Spokes (Symbolic) */}
      <circle cx="50" cy="46" r="18" fill="#0B132B" stroke="url(#laurelGold)" strokeWidth="1.5" />
      <circle cx="50" cy="46" r="14" fill="none" stroke="url(#shieldGoldGrad)" strokeWidth="0.8" strokeDasharray="1.5 1.5" />

      {/* Center Emblem Lion Stance Silhouette (Stylized Emblem) */}
      {/* 3 Lions representation */}
      <path
        d="M48 35 H52 L54 39 L51 41 L53 45 H47 L49 41 L46 39 Z"
        fill="url(#laurelGold)"
      />
      <circle cx="43" cy="38" r="2.5" fill="url(#laurelGold)" />
      <circle cx="57" cy="38" r="2.5" fill="url(#laurelGold)" />
      <circle cx="50" cy="35" r="3" fill="url(#laurelGold)" />
      {/* Emblem Pedestal with Dharma Chakra */}
      <rect x="42" y="47" width="16" height="3" rx="1" fill="url(#laurelGold)" />
      <circle cx="50" cy="48.5" r="1.5" fill="#DC2626" />
      <rect x="44" y="51" width="12" height="2" rx="0.5" fill="url(#shieldGoldGrad)" />

      {/* 5-Pointed Stars on Shield */}
      <path
        d="M32 30 L33 33 L36 33 L33.5 35 L34.5 38 L32 36 L29.5 38 L30.5 35 L28 33 L31 33 Z"
        fill="url(#laurelGold)"
        opacity="0.9"
      />
      <path
        d="M68 30 L69 33 L72 33 L69.5 35 L70.5 38 L68 36 L65.5 38 L66.5 35 L64 33 L67 33 Z"
        fill="url(#laurelGold)"
        opacity="0.9"
      />

      {/* Laurel Wreath surrounding the lower shield */}
      <g stroke="url(#laurelGold)" strokeWidth="1.2" strokeLinecap="round" fill="none">
        {/* Left Leaves */}
        <path d="M22 48 Q20 56 24 64" />
        <path d="M20 54 Q16 57 20 60" />
        <path d="M24 62 Q20 67 26 71" />
        <path d="M26 70 Q24 76 32 80" />
        {/* Right Leaves */}
        <path d="M78 48 Q80 56 76 64" />
        <path d="M80 54 Q84 57 80 60" />
        <path d="M76 62 Q80 67 74 71" />
        <path d="M74 70 Q76 76 68 80" />
      </g>

      {/* Bottom Ribbon Banner: INDIA POLICE */}
      <path
        d="M20 88 Q50 96 80 88 L85 96 Q50 106 15 96 Z"
        fill="url(#shieldGoldGrad)"
        stroke="#78350F"
        strokeWidth="0.8"
      />
      <text
        x="50"
        y="96.5"
        textAnchor="middle"
        fill="#1E1B4B"
        fontSize="6.8"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
        letterSpacing="0.12em"
      >
        INDIA POLICE
      </text>
    </svg>
  );
}
