'use client';

// ==============================================================================
// Vehicle Route GIS Map Component
// Gujarat Police Innovation Challenge 2026
// Source of Truth: master_architecture.md (Section 10, 14.2)
//
// Renders a MapLibre GL map with:
//   - Numbered sighting markers (camera observation points)
//   - Route polyline connecting consecutive sightings (straight-line between camera points)
//   - Implausibility warning overlays for flagged segments
//   - Simulated data badge (mandatory hackathon governance)
//
// GOVERNANCE:
//   The polyline is a STRAIGHT LINE between camera GPS coordinates.
//   It does NOT represent an actual driving route or navigation path.
//   The disclaimer text from the backend must be displayed persistently.
//   This reflects plate-based cross-camera correlation ONLY.
// ==============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Navigation, Target } from 'lucide-react';
import { TimelineSighting, RouteSegment } from '@/types/vehicle';
import { SimulatedDataBadge } from '@/components/ui/SimulatedDataBadge';

import {
  Map as MapLibreMap,
  NavigationControl,
  AttributionControl,
  LngLatBounds,
  Marker,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Stable, openly accessible basemap style for MapLibre (OpenStreetMap standard raster tiles - No API key required)
// Exactly matches the approved GisCameraMap basemap configuration
const TACTICAL_DARK_STYLE: any = process.env.NEXT_PUBLIC_MAP_STYLE || {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};


interface RouteMapProps {
  sightings: TimelineSighting[];
  routeSegments: RouteSegment[];
  disclaimer: string;
  plateNormalized: string;
}

export function RouteMap({ sightings, routeSegments, disclaimer, plateNormalized }: RouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const hasImplausible = routeSegments.some((s) => !s.is_plausible);

  useEffect(() => {
    if (!mapContainerRef.current || sightings.length === 0) return;
    let isMounted = true;

    try {
      const map = new MapLibreMap({
        container: mapContainerRef.current,
        style: TACTICAL_DARK_STYLE,
        // Start with a default center; will be fitted after load
        center: [72.5714, 23.08],
        zoom: 10,
        minZoom: 4,
        maxZoom: 18,
        attributionControl: false,
      });

      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
      map.addControl(
        new AttributionControl({
          compact: true,
          customAttribution: 'Gujarat Police | MapLibre Open GIS | PostGIS Route Reconstruction',
        }),
        'bottom-left'
      );

      map.on('load', () => {
        if (!isMounted) return;
        mapInstanceRef.current = map;

        // --- Route Polyline Layer ---
        const lineCoordinates = sightings.map((s) => [s.coordinates.long, s.coordinates.lat]);

        map.addSource('route-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: lineCoordinates,
            },
          },
        });

        // Outer glow line (blue)
        map.addLayer({
          id: 'route-glow',
          type: 'line',
          source: 'route-line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#2563eb',
            'line-width': 6,
            'line-opacity': 0.25,
            'line-blur': 3,
          },
        });

        // Main route line
        map.addLayer({
          id: 'route-path',
          type: 'line',
          source: 'route-line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#3b82f6',
            'line-width': 2.5,
            'line-opacity': 0.9,
            'line-dasharray': [4, 2],
          },
        });

        // --- Implausible Segment Highlighting ---
        if (hasImplausible) {
          const implausibleCoords = routeSegments
            .filter((seg) => !seg.is_plausible)
            .map((seg) => [
              [seg.from_coordinates.long, seg.from_coordinates.lat],
              [seg.to_coordinates.long, seg.to_coordinates.lat],
            ]);

          const implausibleFeatures = implausibleCoords.map((coords) => ({
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: coords },
          }));

          map.addSource('route-implausible', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: implausibleFeatures },
          });

          map.addLayer({
            id: 'route-implausible-path',
            type: 'line',
            source: 'route-implausible',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#ef4444',
              'line-width': 3,
              'line-opacity': 0.85,
              'line-dasharray': [2, 3],
            },
          });
        }

        // --- Sighting Markers (numbered) ---
        sightings.forEach((sighting, index) => {
          // Outer marker container - MapLibre uses el.style.transform for geographic positioning.
          // DO NOT apply transform or transition: transform to el.
          const el = document.createElement('div');
          el.className = 'route-sighting-marker';

          const isFirst = index === 0;
          const isLast = index === sightings.length - 1;
          const bgColor = isFirst ? '#10b981' : isLast ? '#ef4444' : '#2563eb';
          const borderColor = isFirst ? '#6ee7b7' : isLast ? '#fca5a5' : '#93c5fd';

          el.style.width = '32px';
          el.style.height = '32px';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.cursor = 'default';
          el.style.zIndex = isFirst || isLast ? '20' : '10';
          el.title = `Sighting ${index + 1}: ${sighting.camera_name} at ${new Date(sighting.timestamp).toLocaleTimeString()}`;

          // Inner visual element - handles styling and scale micro-interactions safely
          const inner = document.createElement('div');
          inner.className = 'route-marker-visual';
          inner.style.width = '100%';
          inner.style.height = '100%';
          inner.style.borderRadius = '50%';
          inner.style.backgroundColor = bgColor;
          inner.style.border = `2px solid ${borderColor}`;
          inner.style.boxShadow = `0 0 12px ${bgColor}80, 0 2px 4px rgba(0,0,0,0.6)`;
          inner.style.display = 'flex';
          inner.style.alignItems = 'center';
          inner.style.justifyContent = 'center';
          inner.style.color = '#fff';
          inner.style.fontSize = '11px';
          inner.style.fontWeight = '700';
          inner.style.fontFamily = 'JetBrains Mono, monospace';
          inner.style.pointerEvents = 'none';
          inner.style.transformOrigin = 'center center';
          inner.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';
          inner.innerHTML = `${index + 1}`;

          el.appendChild(inner);

          // Micro-interactions apply only to inner visual element and outer z-index
          el.onmouseenter = () => {
            inner.style.transform = 'scale(1.2)';
            el.style.zIndex = '50';
          };
          el.onmouseleave = () => {
            inner.style.transform = 'scale(1)';
            el.style.zIndex = isFirst || isLast ? '20' : '10';
          };

          const marker = new Marker({ element: el })
            .setLngLat([sighting.coordinates.long, sighting.coordinates.lat])
            .addTo(map);

          markersRef.current.push(marker);
        });

        // --- Fit map bounds to show all sightings ---
        if (sightings.length >= 2) {
          const bounds = new LngLatBounds(
            [sightings[0].coordinates.long, sightings[0].coordinates.lat],
            [sightings[0].coordinates.long, sightings[0].coordinates.lat]
          );
          sightings.forEach((s) => bounds.extend([s.coordinates.long, s.coordinates.lat]));
          map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 1000 });
        } else if (sightings.length === 1) {
          map.flyTo({
            center: [sightings[0].coordinates.long, sightings[0].coordinates.lat],
            zoom: 13,
            duration: 800,
          });
        }

        setMapReady(true);
      });

      map.on('error', (e) => {
        if (isMounted) {
          console.error('RouteMap MapLibre error:', e);
        }
      });
    } catch (err: any) {
      console.error('RouteMap init error:', err);
      if (isMounted) {
        setMapError('Failed to initialize GIS Map. WebGL may not be available.');
      }
    }

    return () => {
      isMounted = false;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [sightings, routeSegments, hasImplausible]);

  if (sightings.length === 0) {
    return (
      <div
        style={{
          height: '300px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          color: 'var(--text-muted)',
        }}
      >
        <Navigation size={28} opacity={0.4} />
        <span style={{ fontSize: 'var(--text-sm)' }}>No sightings to map</span>
      </div>
    );
  }

  if (mapError) {
    return (
      <div
        style={{
          height: '300px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--status-critical-border)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          color: 'var(--status-critical)',
          padding: 'var(--space-4)',
          textAlign: 'center',
        }}
      >
        <AlertTriangle size={24} />
        <span style={{ fontSize: 'var(--text-sm)' }}>{mapError}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '380px',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--border-default)',
        backgroundColor: '#0a0f1d',
      }}
    >
      {/* Map canvas */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Top-left overlay: simulated badge + plate */}
      <div
        style={{
          position: 'absolute',
          top: 'var(--space-3)',
          left: 'var(--space-3)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          pointerEvents: 'none',
        }}
      >
        <SimulatedDataBadge compact />
        <div
          style={{
            backgroundColor: 'rgba(11, 15, 25, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 10px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent-primary)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Target size={11} />
          {plateNormalized} — {sightings.length} camera{sightings.length !== 1 ? 's' : ''} observed
        </div>
      </div>

      {/* Implausibility warning badge */}
      {hasImplausible && (
        <div
          style={{
            position: 'absolute',
            top: 'var(--space-3)',
            right: 'var(--space-3)',
            zIndex: 10,
            backgroundColor: 'var(--status-critical-bg)',
            border: '1px solid var(--status-critical-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 10px',
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--status-critical)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <AlertTriangle size={11} />
          IMPLAUSIBLE SEGMENT
        </div>
      )}

      {/* Bottom disclaimer strip — MANDATORY per architecture */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(11, 15, 25, 0.92)',
          borderTop: '1px solid var(--border-subtle)',
          padding: '5px 12px',
          fontSize: '10px',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      >
        {disclaimer}
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '30px',
          right: 'var(--space-3)',
          zIndex: 10,
          backgroundColor: 'rgba(11, 15, 25, 0.88)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '6px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          fontSize: '10px',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span>First sighting</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
          <span>Last sighting</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '22px',
              height: '2px',
              background: 'repeating-linear-gradient(90deg, #3b82f6 0 4px, transparent 4px 6px)',
            }}
          />
          <span>Observed route</span>
        </div>
        {hasImplausible && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '22px',
                height: '2px',
                background: 'repeating-linear-gradient(90deg, #ef4444 0 2px, transparent 2px 5px)',
              }}
            />
            <span style={{ color: 'var(--status-critical)' }}>Implausible hop</span>
          </div>
        )}
      </div>

      {/* Map loading skeleton */}
      {!mapReady && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#0a0f1d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-2)',
              color: 'var(--text-muted)',
            }}
          >
            <Navigation size={20} style={{ animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 'var(--text-xs)' }}>Loading route GIS map…</span>
          </div>
        </div>
      )}
    </div>
  );
}
