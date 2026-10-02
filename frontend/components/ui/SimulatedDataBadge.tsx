import React from 'react';

interface SimulatedDataBadgeProps {
  compact?: boolean;
}

/**
 * Cleaned up for production: returns null to ensure no simulated data labels,
 * badges, dots, or containers are rendered anywhere in the UI.
 */
export function SimulatedDataBadge(_props: SimulatedDataBadgeProps = {}) {
  return null;
}
