import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { RouteMap } from '@/components/vehicles/RouteMap';
import { TimelineSighting, RouteSegment } from '@/types/vehicle';

let mapConstructorOptions: any = null;
let mapAddedSources: Record<string, any> = {};
let mapAddedLayers: any[] = [];
const mockMarkerInstances: any[] = [];

vi.mock('maplibre-gl', () => {
  class MockMarker {
    element: HTMLElement;
    lngLat: [number, number] = [0, 0];
    constructor(options?: { element?: HTMLElement }) {
      this.element = options?.element || document.createElement('div');
      mockMarkerInstances.push(this);
    }
    setLngLat(coords: [number, number]) {
      this.lngLat = coords;
      return this;
    }
    addTo(_map: any) {
      return this;
    }
    remove() {}
  }

  class MockLngLatBounds {
    extend = vi.fn();
  }

  const MockMap = vi.fn().mockImplementation((options: any) => {
    mapConstructorOptions = options;
    return {
      addControl: vi.fn(),
      addSource: vi.fn((id: string, source: any) => {
        mapAddedSources[id] = source;
      }),
      addLayer: vi.fn((layer: any) => {
        mapAddedLayers.push(layer);
      }),
      fitBounds: vi.fn(),
      flyTo: vi.fn(),
      remove: vi.fn(),
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'load') {
          setTimeout(cb, 0);
        }
      }),
    };
  });

  return {
    Map: MockMap,
    Marker: MockMarker,
    NavigationControl: vi.fn(),
    AttributionControl: vi.fn(),
    LngLatBounds: MockLngLatBounds,
  };
});

const MOCK_SIGHTINGS: any[] = [
  {
    id: 'sighting-1',
    camera_id: 'cam-1',
    camera_name: 'CAM-AHM-01: SG Highway',
    location: { address: 'Pakwan Crossroad', zone: 'West', district: 'Ahmedabad' },
    timestamp: '2026-09-09T10:00:00.000Z',
    confidence: 0.94,
    direction: 'NORTH',
    speed_estimate_kmh: 48,
    coordinates: { lat: 23.0338, long: 72.5073 },
    snapshot_url: 'http://evidence/s1.jpg',
    evidence_hash: 'abc123hash',
  },
  {
    id: 'sighting-2',
    camera_id: 'cam-2',
    camera_name: 'CAM-AHM-02: Iscon Crossroad',
    location: { address: 'Iscon Junction', zone: 'West', district: 'Ahmedabad' },
    timestamp: '2026-09-09T10:15:00.000Z',
    confidence: 0.91,
    direction: 'NORTH',
    speed_estimate_kmh: 52,
    coordinates: { lat: 23.0289, long: 72.5065 },
    snapshot_url: 'http://evidence/s2.jpg',
    evidence_hash: 'def456hash',
  },
];

const MOCK_SEGMENTS: any[] = [
  {
    from_sighting_id: 'sighting-1',
    to_sighting_id: 'sighting-2',
    distance_meters: 850,
    time_delta_seconds: 900,
    speed_kmh: 3.4,
    is_plausible: true,
    from_camera_name: 'CAM-AHM-01',
    to_camera_name: 'CAM-AHM-02',
    from_coordinates: { lat: 23.0338, long: 72.5073 },
    to_coordinates: { lat: 23.0289, long: 72.5065 },
  },
];

const DISCLAIMER_TEXT =
  'Route reflects straight-line interpolation between verified camera detections. Not an actual driving path.';

describe('RouteMap Component — Basemap & GIS Rendering', () => {
  beforeEach(() => {
    mapConstructorOptions = null;
    mapAddedSources = {};
    mapAddedLayers = [];
    mockMarkerInstances.length = 0;
    vi.clearAllMocks();
  });

  it('initializes MapLibre with the approved OpenStreetMap raster tile basemap without API keys', async () => {
    render(
      <RouteMap
        sightings={MOCK_SIGHTINGS}
        routeSegments={MOCK_SEGMENTS}
        disclaimer={DISCLAIMER_TEXT}
        plateNormalized="GJ01AB1234"
      />
    );

    expect(mapConstructorOptions).toBeDefined();
    const style = mapConstructorOptions.style;

    // Check style structure
    expect(style.sources['osm-tiles']).toBeDefined();
    expect(style.sources['osm-tiles'].type).toBe('raster');
    expect(style.sources['osm-tiles'].tiles[0]).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');

    // Confirm CARTO / cartocdn is completely eliminated
    expect(style.sources['carto-dark']).toBeUndefined();
    const styleJson = JSON.stringify(style);
    expect(styleJson).not.toContain('cartocdn');
    expect(styleJson).not.toContain('API KEY');

    // Confirm osm-tiles layer exists
    const osmLayer = style.layers.find((l: any) => l.id === 'osm-tiles');
    expect(osmLayer).toBeDefined();
    expect(osmLayer.source).toBe('osm-tiles');
  });

  it('renders simulated badge, plate label, camera count, and legal disclaimer', () => {
    render(
      <RouteMap
        sightings={MOCK_SIGHTINGS}
        routeSegments={MOCK_SEGMENTS}
        disclaimer={DISCLAIMER_TEXT}
        plateNormalized="GJ01AB1234"
      />
    );

    expect(screen.getByText(/SIMULATED/i)).toBeInTheDocument();
    expect(screen.getByText(/GJ01AB1234 — 2 cameras observed/i)).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER_TEXT)).toBeInTheDocument();
    expect(screen.getByText('First sighting')).toBeInTheDocument();
    expect(screen.getByText('Last sighting')).toBeInTheDocument();
    expect(screen.getByText('Observed route')).toBeInTheDocument();
  });

  it('adds route polyline layer and markers on load without altering route geometry', async () => {
    render(
      <RouteMap
        sightings={MOCK_SIGHTINGS}
        routeSegments={MOCK_SEGMENTS}
        disclaimer={DISCLAIMER_TEXT}
        plateNormalized="GJ01AB1234"
      />
    );

    await waitFor(() => {
      expect(mapAddedSources['route-line']).toBeDefined();
    });

    const routeLineData = mapAddedSources['route-line'].data;
    expect(routeLineData.geometry.coordinates).toEqual([
      [72.5073, 23.0338],
      [72.5065, 23.0289],
    ]);

    expect(mockMarkerInstances.length).toBe(2);
    expect(mockMarkerInstances[0].element.textContent).toBe('1');
    expect(mockMarkerInstances[1].element.textContent).toBe('2');
  });

  it('creates transform-safe numbered sighting markers where hover scales only the inner element and preserves MapLibre outer transform', async () => {
    render(
      <RouteMap
        sightings={MOCK_SIGHTINGS}
        routeSegments={MOCK_SEGMENTS}
        disclaimer={DISCLAIMER_TEXT}
        plateNormalized="GJ01AB1234"
      />
    );

    await waitFor(() => {
      expect(mockMarkerInstances.length).toBe(2);
    });

    const marker1El = mockMarkerInstances[0].element as HTMLElement;
    const marker2El = mockMarkerInstances[1].element as HTMLElement;

    expect(marker1El.className).toBe('route-sighting-marker');
    expect(marker2El.className).toBe('route-sighting-marker');

    // Simulate MapLibre setting geographic translate transform on the outer container
    marker1El.style.transform = 'translate(-50%, -50%) translate(320px, 180px)';
    marker2El.style.transform = 'translate(-50%, -50%) translate(340px, 210px)';

    const innerVisual1 = marker1El.querySelector('.route-marker-visual') as HTMLElement;
    const innerVisual2 = marker2El.querySelector('.route-marker-visual') as HTMLElement;

    expect(innerVisual1).toBeDefined();
    expect(innerVisual2).toBeDefined();
    expect(innerVisual1.textContent).toBe('1');
    expect(innerVisual2.textContent).toBe('2');

    // Verify first sighting is green (#10b981) and last sighting is red (#ef4444)
    expect(innerVisual1.style.backgroundColor).toBe('rgb(16, 185, 129)');
    expect(innerVisual2.style.backgroundColor).toBe('rgb(239, 68, 68)');

    // Trigger hover (mouseenter) on marker 1
    fireEvent.mouseEnter(marker1El);

    // Verify outer transform is NOT overwritten (preserves MapLibre geographic translate coordinates)
    expect(marker1El.style.transform).toBe('translate(-50%, -50%) translate(320px, 180px)');
    expect(marker1El.style.zIndex).toBe('50');

    // Verify inner visual element received the scale transform
    expect(innerVisual1.style.transform).toBe('scale(1.2)');

    // Trigger mouseleave on marker 1
    fireEvent.mouseLeave(marker1El);

    // Verify outer transform is still untouched
    expect(marker1El.style.transform).toBe('translate(-50%, -50%) translate(320px, 180px)');
    expect(marker1El.style.zIndex).toBe('20');

    // Verify inner visual element reset to scale(1)
    expect(innerVisual1.style.transform).toBe('scale(1)');

    // Repeat for marker 2
    fireEvent.mouseEnter(marker2El);
    expect(marker2El.style.transform).toBe('translate(-50%, -50%) translate(340px, 210px)');
    expect(marker2El.style.zIndex).toBe('50');
    expect(innerVisual2.style.transform).toBe('scale(1.2)');

    fireEvent.mouseLeave(marker2El);
    expect(marker2El.style.transform).toBe('translate(-50%, -50%) translate(340px, 210px)');
    expect(marker2El.style.zIndex).toBe('20');
    expect(innerVisual2.style.transform).toBe('scale(1)');
  });
});
