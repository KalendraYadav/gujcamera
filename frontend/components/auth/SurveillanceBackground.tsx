'use client';

/**
 * NETRAVA SURVEILLANCE BACKGROUND ENVIRONMENT
 * ============================================================================
 * CINEMATIC 3D PERSPECTIVE HIGHWAY SURVEILLANCE & REAL-TIME VEHICLE TRACKING
 * 
 * SPATIAL COMPOSITION ARCHITECTURE:
 * 1. FOREGROUND (z-index: 10):
 *    - Frontal, undistorted NETRAVA authentication interface & SAFER INDIA brand.
 * 2. BACKGROUND 3D SURVEILLANCE SPACE (z-index: 1):
 *    - Real highway traffic environment receding diagonally into the screen
 *      at ~54° relative to the frontal UI plane.
 *    - Real moving vehicles with clear silhouettes & luminous headlights (+15% visibility).
 *    - Active Computer Vision Vehicle Tracking:
 *      Multi-vehicle simultaneous precision bounding boxes embedded DIRECTLY
 *      in the 3D road plane, spatially attached to moving vehicles in the traffic video.
 *    - Multi-state tracking: RED (Priority / Suspicious ⚠️), GREEN (Active / Live),
 *      CYAN (Commercial / Flow), AMBER (Analysis / Speed Alert).
 *    - ZERO camera hardware, ZERO rays, ZERO beams. The surveillance intelligence
 *      is communicated purely through active computer-vision tracking of the environment.
 * ============================================================================
 */

import React, { useEffect, useRef, useState } from 'react';
import { VehicleTrackingOverlay } from './VehicleTrackingOverlay';

export function SurveillanceBackground() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Video playback & loading states
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoFailed, setIsVideoFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 1. Ensure muted state is applied directly to DOM property for autoplay compliance
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    // 2. Immediate check: if video already has data (e.g. from cache or fast load), reveal it
    if (video.readyState >= 2 || video.currentTime > 0) {
      setIsVideoLoaded(true);
    }

    // 3. Safe play function with promise rejection handling
    const safePlay = () => {
      const v = videoRef.current;
      if (!v) return;
      v.muted = true;
      if (v.paused) {
        v.play().catch(() => {
          // Autoplay blocked by browser policy; will recover on user interaction
        });
      }
    };

    // Initial play attempt
    safePlay();

    // 4. Recover on visibility change (e.g. tab switch or minimize/restore)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        safePlay();
      }
    };

    // 5. Browser autoplay policy unlock: if initial autoplay was blocked,
    // resume immediately on the very first user interaction anywhere on the page
    const handleUserInteraction = () => {
      safePlay();
      removeInteractionListeners();
    };

    const removeInteractionListeners = () => {
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    };

    window.addEventListener('pointerdown', handleUserInteraction, { passive: true, once: true });
    window.addEventListener('keydown', handleUserInteraction, { passive: true, once: true });
    window.addEventListener('touchstart', handleUserInteraction, { passive: true, once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 6. Handle playback interruptions (stalled, pause)
    const handlePause = () => {
      if (!document.hidden && videoRef.current?.paused) {
        safePlay();
      }
    };

    video.addEventListener('pause', handlePause);
    video.addEventListener('stalled', safePlay);
    video.addEventListener('waiting', safePlay);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      removeInteractionListeners();
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('stalled', safePlay);
      video.removeEventListener('waiting', safePlay);
    };
  }, []);

  const handleMediaReady = () => {
    setIsVideoLoaded(true);
    const video = videoRef.current;
    if (video) {
      video.muted = true;
      if (video.paused) {
        video.play().catch(() => {});
      }
    }
  };

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        backgroundColor: '#070B14',
      }}
    >
      {/* =====================================================================
          1. 3D PERSPECTIVE HIGHWAY SURVEILLANCE ENVIRONMENT (BACKGROUND PLANE)
             - True 3D perspective projection (perspective: 1100px, 54° tilt).
             - Road recedes diagonally into the screen toward the vanishing point.
             - Moving vehicles travel INTO the scene, naturally converging in depth.
             - Real-time Computer Vision Tracking Overlays embedded directly inside
               this 3D plane so tracking boxes move with the vehicles in lockstep!
          ===================================================================== */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          perspective: '1100px',
          perspectiveOrigin: '40% 26%', // Aligned with the road vanishing region
          transformStyle: 'preserve-3d',
          zIndex: 1,
        }}
      >
        {/* The 3D Road Plane receding at ~54° into the depth of the screen */}
        <div
          style={{
            position: 'absolute',
            width: '146%',
            height: '146%',
            left: '-23%',
            top: '-16%',
            // rotateX(54deg): tilts road plane back into depth away from viewer
            // rotateY(-8deg) & rotateZ(16deg): aligns road to recede diagonally into depth
            transform: 'rotateX(54deg) rotateY(-8deg) rotateZ(16deg) scale(1.05) translateZ(0)',
            transformOrigin: '40% 48%',
            transformStyle: 'preserve-3d',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            // Feathered soft boundary so no harsh video edges ever show
            maskImage:
              'radial-gradient(ellipse 74% 70% at 42% 48%, black 40%, rgba(0,0,0,0.85) 68%, transparent 100%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 74% 70% at 42% 48%, black 40%, rgba(0,0,0,0.85) 68%, transparent 100%)',
          }}
        >
          {/* Seamless Fallback Poster Frame (High-Res Freeze Frame with enhanced vehicle visibility) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'url(/images/traffic_poster.jpg)',
              backgroundSize: 'cover',
              backgroundPosition: 'center 40%',
              opacity: isVideoLoaded && !isVideoFailed ? 0 : 0.94,
              transition: 'opacity 1.2s ease-in-out',
              filter: 'brightness(0.96) contrast(1.20) saturate(1.08)',
            }}
          />

          {/* Real Highway Traffic MP4 Video (+15% vehicle visibility & vivid reflections) */}
          {!isVideoFailed && (
            <video
              ref={videoRef}
              src="/videos/traffic_surveillance.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster="/images/traffic_poster.jpg"
              onLoadedData={handleMediaReady}
              onCanPlay={handleMediaReady}
              onPlaying={handleMediaReady}
              onTimeUpdate={() => {
                if (!isVideoLoaded) setIsVideoLoaded(true);
              }}
              onError={() => setIsVideoFailed(true)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 40%',
                opacity: isVideoLoaded ? 0.98 : 0,
                transition: 'opacity 1.2s ease-in-out',
                filter: 'brightness(0.96) contrast(1.22) saturate(1.10)',
              }}
            >
              <source src="/videos/traffic_surveillance.mp4" type="video/mp4" />
            </video>
          )}

          {/* =================================================================
              2. MULTI-VEHICLE COMPUTER VISION TRACKING OVERLAYS
                 - Rendered INSIDE the 3D road plane directly over the traffic!
                 - Inherits perspective, road angle, and depth scale automatically.
                 - Bounding boxes move synchronously with the vehicles at 60fps.
              ================================================================= */}
          <VehicleTrackingOverlay
            videoRef={videoRef}
            isReducedMotion={false}
          />
        </div>
      </div>

      {/* =====================================================================
          3. CINEMATIC COLOR-GRADING, DEPTH HAZE & UI CONTRAST OVERLAYS
          ===================================================================== */}
      {/* A. Atmospheric Vanishing Horizon Depth Mist (dissolves top road into night sky) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '42%',
          background:
            'linear-gradient(180deg, #070B14 0%, rgba(7, 11, 20, 0.65) 20%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* B. Base Subdued Dark Overlay (Elevates vehicle visibility by ~15%) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(7, 11, 20, 0.16)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* C. Deep Navy Institutional Color Grade Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(135deg, rgba(15, 23, 42, 0.22) 0%, rgba(7, 11, 20, 0.28) 65%, rgba(215, 25, 63, 0.02) 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* D. Right-Hand Falloff Gradient: Complete black/navy protection for the Login Card */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '58%',
          background:
            'linear-gradient(90deg, transparent 0%, rgba(7, 11, 20, 0.35) 25%, rgba(7, 11, 20, 0.85) 55%, rgba(7, 11, 20, 0.98) 85%, #070B14 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* E. Soft Perimeter Radial Vignette (Preserves center traffic action) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 38% 46%, transparent 0%, rgba(7, 11, 20, 0.38) 55%, rgba(7, 11, 20, 0.90) 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* F. CCTV Monitor Scanline Texture (Very faint 1.2% opacity) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px)',
          backgroundSize: '100% 4px',
          opacity: 0.35,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
    </div>
  );
}
