import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Video } from 'lucide-react';
import { PlaceholderPage } from '@/components/ui/PlaceholderPage';

describe('PlaceholderPage Component', () => {
  it('displays honest phase labeling, architecture section, and governance notice without fake data', () => {
    render(
      <PlaceholderPage
        title="Live Video Monitoring & CCTV Matrix"
        phase="Phase 4C"
        icon={Video}
        description="Multi-tile video matrix delivering browser-compatible HLS live feeds."
        masterArchitectureSection="master_architecture.md — Section 5.2"
        backendReadiness="MediaMTX gateway is operational."
        featuresList={['HLS.js player integration', '2x2 tactical video grid']}
      />,
    );

    expect(screen.getByText('Live Video Monitoring & CCTV Matrix')).toBeInTheDocument();
    expect(screen.getByText('Phase 4C')).toBeInTheDocument();
    expect(screen.getByText(/Multi-tile video matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/master_architecture.md — Section 5.2/i)).toBeInTheDocument();
    expect(screen.getByText(/MediaMTX gateway is operational/i)).toBeInTheDocument();
    expect(screen.getByText('HLS.js player integration')).toBeInTheDocument();
    expect(screen.getByText('2x2 tactical video grid')).toBeInTheDocument();

    // Verify presence of anti-fake governance notice
    expect(screen.getByText(/mock data and fabricated UI components are strictly forbidden/i)).toBeInTheDocument();
  });
});
