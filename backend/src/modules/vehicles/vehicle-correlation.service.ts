/**
 * Vehicle Correlation Service (Phase 10)
 * Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
 *
 * Implements deterministic, explainable candidate observation discovery for
 * a queried license plate. Combines:
 *   1. Fuzzy plate matching (Levenshtein edit distance ≤ 1 + OCR confusion matrix)
 *   2. Spatio-temporal consistency scoring (camera proximity + travel-time plausibility)
 *
 * TERMINOLOGY (enforced throughout):
 *   - "VEHICLE OBSERVATION"       : a VehicleSighting record
 *   - "CORRELATION CANDIDATE"     : an observation surfaced as potentially related
 *   - "OCR SIMILARITY"            : lexical plate similarity, NOT an identity claim
 *   - "SPATIO-TEMPORAL CONSISTENCY": whether camera distance and time gap are physically plausible
 *   - "CORRELATION CONFIDENCE"    : explainable weighted signal (0.0–1.0), NOT an identity claim
 *
 * This service NEVER claims two observations belong to the same physical vehicle.
 * It exposes ranked candidates with structured reasons so an investigator can decide.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeLicensePlate } from './utils/plate-normalizer';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

// ---------------------------------------------------------------------------
// OCR Character Confusion Matrix
// Covers common OCR substitution errors for Indian license plate fonts.
// Symmetric: if A→B is confused, B→A is also a candidate substitution.
// ---------------------------------------------------------------------------
const OCR_CONFUSION_PAIRS: Array<[string, string]> = [
  ['0', 'O'], ['0', 'Q'],
  ['1', 'I'], ['1', 'L'],
  ['5', 'S'],
  ['6', 'G'],
  ['8', 'B'],
  ['2', 'Z'],
  ['D', 'O'],
  ['U', 'V'],
  ['P', 'R'],
];

// Build fast lookup set: "AB" -> true  (both orders)
const OCR_CONFUSION_SET = new Set<string>();
for (const [a, b] of OCR_CONFUSION_PAIRS) {
  OCR_CONFUSION_SET.add(`${a}${b}`);
  OCR_CONFUSION_SET.add(`${b}${a}`);
}

// ---------------------------------------------------------------------------
// Levenshtein edit distance (max-distance bounded for performance)
// ---------------------------------------------------------------------------
function levenshteinDistance(a: string, b: string, maxDist: number = 2): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > maxDist) return maxDist + 1;

  // Single-row rolling DP
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    const curr = [i];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[lb];
}

// ---------------------------------------------------------------------------
// OCR-aware similarity: returns true if plates differ by at most 1 edit
// AND all differing character pairs are in the confusion matrix.
// ---------------------------------------------------------------------------
function isOcrConfusedMatch(a: string, b: string): boolean {
  if (a === b) return false; // exact matches are handled separately
  if (Math.abs(a.length - b.length) > 1) return false;

  // For same-length plates: check if exactly 1 character differs by confusion
  if (a.length === b.length) {
    let diffs = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        diffs++;
        if (diffs > 1) return false;
        const pair = `${a[i]}${b[i]}`;
        if (!OCR_CONFUSION_SET.has(pair)) return false;
      }
    }
    return diffs === 1;
  }

  // For length-1 difference: use Levenshtein ≤ 1 (deletion/insertion)
  return levenshteinDistance(a, b, 1) <= 1;
}

// ---------------------------------------------------------------------------
// Plate similarity score: returns [0.0, 1.0]
//   1.00  = exact normalized plate match
//   0.85  = OCR-confused character substitution
//   0.70  = edit distance 1 (non-OCR-explained)
//   0.0   = edit distance ≥ 2 (not a candidate)
// ---------------------------------------------------------------------------
function plateSimilarityScore(query: string, candidate: string): number {
  if (query === candidate) return 1.0;
  if (isOcrConfusedMatch(query, candidate)) return 0.85;
  const dist = levenshteinDistance(query, candidate, 1);
  if (dist === 1) return 0.70;
  return 0.0;
}

// ---------------------------------------------------------------------------
// Spatio-temporal plausibility scoring
// Inputs: distance in meters, time difference in seconds
// Returns a score [0.0, 1.0] and a human-readable reason
// ---------------------------------------------------------------------------
const MIN_SPEED_KMH = 5;    // Very slow (traffic jam threshold)
const MAX_SPEED_KMH = 120;  // Maximum plausible road vehicle speed (highways)
const MAX_WINDOW_HOURS = 12; // Beyond 12 h the correlation is weak but not zero

interface SpatioTemporalResult {
  score: number;
  reason: string;
  impliedSpeedKmh: number | null;
}

function spatioTemporalScore(
  distanceMeters: number | null,
  timeDiffSeconds: number,
): SpatioTemporalResult {
  // No GIS data available: apply a neutral time-based score
  if (distanceMeters === null || distanceMeters <= 0) {
    const hours = Math.abs(timeDiffSeconds) / 3600;
    if (hours <= 0.5) return { score: 0.60, reason: 'NO_GIS_DATA:TIME_CLOSE', impliedSpeedKmh: null };
    if (hours <= 2)   return { score: 0.45, reason: 'NO_GIS_DATA:TIME_MODERATE', impliedSpeedKmh: null };
    if (hours <= 6)   return { score: 0.30, reason: 'NO_GIS_DATA:TIME_DISTANT', impliedSpeedKmh: null };
    return { score: 0.15, reason: 'NO_GIS_DATA:TIME_VERY_DISTANT', impliedSpeedKmh: null };
  }

  const absSec = Math.abs(timeDiffSeconds);
  const distKm = distanceMeters / 1000;

  // Same camera or very close (< 50 m): high consistency regardless of time
  if (distanceMeters < 50) {
    return { score: 0.80, reason: 'SAME_VICINITY', impliedSpeedKmh: 0 };
  }

  // Zero or near-zero time difference but non-trivial distance: physically impossible
  if (absSec < 5 && distanceMeters > 100) {
    return { score: 0.05, reason: 'PHYSICALLY_IMPLAUSIBLE:TELEPORTATION', impliedSpeedKmh: null };
  }

  const hours = absSec / 3600;
  const impliedSpeedKmh = hours > 0 ? distKm / hours : 9999;

  if (impliedSpeedKmh > MAX_SPEED_KMH) {
    return { score: 0.10, reason: 'PHYSICALLY_IMPLAUSIBLE:SPEED_EXCEEDED', impliedSpeedKmh: Math.round(impliedSpeedKmh) };
  }

  if (impliedSpeedKmh < MIN_SPEED_KMH && absSec > 300) {
    // Extremely slow and not in same vicinity: suspicious stationary
    return { score: 0.30, reason: 'ANOMALOUS:STATIONARY_OR_VERY_SLOW', impliedSpeedKmh: Math.round(impliedSpeedKmh) };
  }

  // Plausible speed range: score degrades gently with time gap
  let baseScore = 0.90;
  if (hours > MAX_WINDOW_HOURS) {
    baseScore = 0.40;
  } else if (hours > 6) {
    baseScore = 0.60;
  } else if (hours > 2) {
    baseScore = 0.75;
  }

  return {
    score: baseScore,
    reason: 'SPATIO_TEMPORAL_CONSISTENT',
    impliedSpeedKmh: Math.round(impliedSpeedKmh),
  };
}

// ---------------------------------------------------------------------------
// Vehicle class consistency bonus
// Same class → small positive bonus; class mismatch → small penalty
// ---------------------------------------------------------------------------
function vehicleClassBonus(queryClass: string | null, candidateClass: string | null): number {
  if (!queryClass || !candidateClass) return 0.0;  // unknown: no adjustment
  return queryClass === candidateClass ? 0.05 : -0.10;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CorrelationReason {
  signal: string;
  detail: string;
  score: number;
}

export interface CorrelationCandidate {
  sightingId: string;
  plateNormalized: string;
  cameraId: string;
  cameraName: string | null;
  cameraCity: string | null;
  ts: string;
  vehicleClass: string | null;
  confidence: number;           // OCR confidence of candidate sighting
  correlationScore: number;     // Composite weighted score [0.0, 1.0]
  plateSimilarity: number;      // Plate lexical similarity [0.0, 1.0]
  matchType: 'EXACT' | 'OCR_CONFUSED' | 'EDIT_DISTANCE_1';
  spatioTemporalConsistency: number;
  impliedSpeedKmh: number | null;
  timeDiffSeconds: number;
  distanceMeters: number | null;
  reasons: CorrelationReason[];
}

export interface CorrelationCandidatesResult {
  queryPlate: string;
  queryPlateClass: string | null;
  totalCandidates: number;
  searchWindowDays: number;
  candidates: CorrelationCandidate[];
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class VehicleCorrelationService {
  private readonly logger = new Logger(VehicleCorrelationService.name);

  // Weights for composite correlation score
  private static readonly W_PLATE = 0.55;
  private static readonly W_SPATIO_TEMPORAL = 0.35;
  private static readonly W_CLASS = 0.10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Find correlation candidates for a given license plate.
   *
   * Steps:
   *   1. Resolve reference sightings for the query plate.
   *   2. Build a candidate pool from plates with edit distance ≤ 1.
   *   3. Score each candidate using plate similarity + spatio-temporal consistency.
   *   4. Return ranked candidates with structured explainability reasons.
   *
   * @param rawPlate  - Raw plate string from URL param (will be normalized)
   * @param windowDays - How many days back to search (default: 7, max: 30)
   * @param limit      - Maximum candidates returned (default: 50, max: 200)
   */
  async findCorrelationCandidates(
    rawPlate: string,
    user: AuthenticatedUser,
    requestId?: string,
    windowDays: number = 7,
    limit: number = 50,
  ): Promise<CorrelationCandidatesResult> {
    const queryPlate = normalizeLicensePlate(rawPlate);
    if (!queryPlate) {
      throw new NotFoundException(`Invalid plate format: '${rawPlate}'`);
    }

    const effectiveWindow = Math.min(Math.max(windowDays, 1), 30);
    const effectiveLimit = Math.min(Math.max(limit, 1), 200);
    const since = new Date(Date.now() - effectiveWindow * 86_400_000);

    this.logger.log(
      `[Correlation] Query plate: ${queryPlate} | window: ${effectiveWindow}d | limit: ${effectiveLimit} | user: ${user.id}`,
    );

    // --- Step 1: Fetch the most recent reference sighting for the query plate
    // We use it to anchor the spatio-temporal scoring
    const refSighting = await this.prisma.vehicleSighting.findFirst({
      where: { plateNormalized: queryPlate },
      orderBy: { ts: 'desc' },
      select: {
        id: true,
        plateNormalized: true,
        vehicleClass: true,
        ts: true,
        camera: {
          select: {
            id: true,
            name: true,
            lat: true,
            long: true,
            location: { select: { district: true } },
          },
        },
      },
    });

    const queryClass: string | null = refSighting?.vehicleClass ?? null;

    // --- Step 2: Fetch all plates in the window that could be edit-distance ≤ 1
    // We use a prefix/suffix approach: query all plates whose length is ±1 of query
    // (Prisma/PostgreSQL does not natively support edit distance; we do it in JS)
    const minLen = queryPlate.length - 1;
    const maxLen = queryPlate.length + 1;

    const candidateSightings = await this.prisma.vehicleSighting.findMany({
      where: {
        ts: { gte: since },
        NOT: { plateNormalized: queryPlate }, // Exact matches of query plate are NOT candidates
      },
      orderBy: { ts: 'desc' },
      select: {
        id: true,
        plateNormalized: true,
        cameraId: true,
        ts: true,
        confidence: true,
        vehicleClass: true,
        camera: {
          select: {
            id: true,
            name: true,
            lat: true,
            long: true,
            location: { select: { district: true } },
          },
        },
      },
    });

    this.logger.debug(
      `[Correlation] Pool size before fuzzy filter: ${candidateSightings.length}`,
    );

    // --- Step 3: Fuzzy plate matching + spatio-temporal scoring
    const scored: CorrelationCandidate[] = [];

    for (const s of candidateSightings) {
      const plate = s.plateNormalized;

      // Length gate (fast reject before Levenshtein)
      if (plate.length < minLen || plate.length > maxLen) continue;

      const plateSim = plateSimilarityScore(queryPlate, plate);
      if (plateSim === 0.0) continue; // edit distance ≥ 2: skip

      // Determine match type
      let matchType: CorrelationCandidate['matchType'];
      if (plateSim === 1.0) {
        matchType = 'EXACT'; // Shouldn't reach here due to NOT clause, defensive
      } else if (isOcrConfusedMatch(queryPlate, plate)) {
        matchType = 'OCR_CONFUSED';
      } else {
        matchType = 'EDIT_DISTANCE_1';
      }

      // Spatio-temporal scoring relative to reference sighting
      let distanceMeters: number | null = null;
      let timeDiffSeconds = 0;
      let stResult: SpatioTemporalResult = { score: 0.5, reason: 'NO_REFERENCE_SIGHTING', impliedSpeedKmh: null };

      if (refSighting) {
        timeDiffSeconds = Math.round(
          (s.ts.getTime() - refSighting.ts.getTime()) / 1000,
        );

        // PostGIS distance if both cameras have coordinates
        const refCam = refSighting.camera;
        const candCam = s.camera;

        if (
          refCam?.lat != null && refCam?.long != null &&
          candCam?.lat != null && candCam?.long != null
        ) {
          // Haversine approximation (fast, avoids DB round-trip)
          distanceMeters = haversineMeters(
            Number(refCam.lat), Number(refCam.long),
            Number(candCam.lat), Number(candCam.long),
          );
        }

        stResult = spatioTemporalScore(distanceMeters, timeDiffSeconds);
      }

      // Vehicle class signal (pending schema migration — use optional access)
      const sVehicleClass: string | null = (s as any).vehicleClass ?? null;
      const classBonus = vehicleClassBonus(queryClass, sVehicleClass);

      // Composite correlation score
      const rawScore =
        VehicleCorrelationService.W_PLATE * plateSim +
        VehicleCorrelationService.W_SPATIO_TEMPORAL * stResult.score +
        VehicleCorrelationService.W_CLASS * (queryClass ? (sVehicleClass === queryClass ? 1.0 : 0.0) : 0.5);

      const correlationScore = Math.max(0.0, Math.min(1.0, rawScore + classBonus));

      // Build explainability reasons
      const reasons: CorrelationReason[] = [];

      reasons.push({
        signal: 'PLATE_SIMILARITY',
        detail: matchType === 'OCR_CONFUSED'
          ? `Plate '${plate}' differs by 1 OCR-confused character from '${queryPlate}'`
          : `Plate '${plate}' is 1 edit away from '${queryPlate}'`,
        score: plateSim,
      });

      reasons.push({
        signal: 'SPATIO_TEMPORAL',
        detail: `${stResult.reason}${stResult.impliedSpeedKmh !== null ? ` (implied ${stResult.impliedSpeedKmh} km/h)` : ''}`,
        score: stResult.score,
      });

      if (queryClass && sVehicleClass) {
        reasons.push({
          signal: 'VEHICLE_CLASS',
          detail: queryClass === sVehicleClass
            ? `Both observations classified as ${queryClass}`
            : `Query class '${queryClass}' differs from candidate class '${sVehicleClass}'`,
          score: queryClass === sVehicleClass ? 1.0 : 0.0,
        });
      }

      scored.push({
        sightingId: s.id,
        plateNormalized: plate,
        cameraId: s.cameraId,
        cameraName: s.camera?.name ?? null,
        cameraCity: s.camera?.location?.district ?? null,
        ts: s.ts.toISOString(),
        vehicleClass: sVehicleClass,
        confidence: Number(s.confidence),
        correlationScore: Math.round(correlationScore * 1000) / 1000,
        plateSimilarity: plateSim,
        matchType,
        spatioTemporalConsistency: Math.round(stResult.score * 1000) / 1000,
        impliedSpeedKmh: stResult.impliedSpeedKmh,
        timeDiffSeconds,
        distanceMeters: distanceMeters !== null ? Math.round(distanceMeters) : null,
        reasons,
      });
    }

    // Sort by correlationScore descending, then by plate similarity descending
    scored.sort((a, b) =>
      b.correlationScore - a.correlationScore ||
      b.plateSimilarity - a.plateSimilarity,
    );

    const top = scored.slice(0, effectiveLimit);

    // Audit log
    try {
      await this.auditService.recordAudit({
        actorId: user.id,
        action: 'VEHICLE_CORRELATION_QUERY',
        resource: `VEHICLE:${queryPlate}`,
        after: {
          queryPlate,
          windowDays: effectiveWindow,
          candidatesFound: top.length,
          requestId,
        },
        correlationId: requestId,
      });
    } catch (auditErr: any) {
      this.logger.warn(`Audit log failed for correlation query: ${auditErr.message}`);
    }

    return {
      queryPlate,
      queryPlateClass: queryClass,
      totalCandidates: top.length,
      searchWindowDays: effectiveWindow,
      candidates: top,
      disclaimer:
        'NETRAVA correlation candidates are presented for investigator review only. ' +
        'A high correlation score indicates observational similarity — it does NOT establish ' +
        'that the observations belong to the same physical vehicle. ' +
        'All conclusions require independent verification by a qualified officer.',
    };
  }
}

// ---------------------------------------------------------------------------
// Haversine distance (meters) between two WGS-84 coordinates
// ---------------------------------------------------------------------------
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
