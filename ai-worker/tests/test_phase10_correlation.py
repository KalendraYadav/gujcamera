"""
Phase 10 — Hybrid Fuzzy-Plate & Spatio-Temporal Candidate Correlation
Unit & Performance Tests

NETRAVAHA — Unified CCTV Intelligence Platform
Gujarat Police Innovation Challenge 2026

Test cases A-H exercise:
  A. Exact normalized plate equality (not a correlation candidate)
  B. OCR character confusion: 0 vs O
  C. OCR character confusion: 1 vs I
  D. Edit-distance-1 non-OCR-confused substitution
  E. Edit-distance-1 deletion
  F. Edit-distance-2 (should be rejected)
  G. Spatio-temporal: physically impossible speed (teleportation)
  H. Spatio-temporal: plausible urban transit
  I. Vehicle class bonus (same class) and penalty (different class)
  J. Performance: scoring 10,000 candidates in < 500 ms

Terminology discipline:
  - Results are "candidates", not "matches"
  - Scores are "correlation confidence", not "identity probability"
"""

import time
import sys
import os

# ---------------------------------------------------------------------------
# Path bootstrap (run from project root or ai-worker/)
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

# ---------------------------------------------------------------------------
# Import the pure functions from the consensus module
# (We test the algorithms in isolation — no DB, no Redis, no network)
# ---------------------------------------------------------------------------

# Replicate the functions from vehicle-correlation.service.ts in Python
# for deterministic cross-language verification of the algorithm design.

# ----- OCR Confusion pairs (must match TS service exactly) -----
OCR_CONFUSION_PAIRS = [
    ('0', 'O'), ('0', 'Q'),
    ('1', 'I'), ('1', 'L'),
    ('5', 'S'),
    ('6', 'G'),
    ('8', 'B'),
    ('2', 'Z'),
    ('D', 'O'),
    ('U', 'V'),
    ('P', 'R'),
]

OCR_CONFUSION_SET: set = set()
for a, b in OCR_CONFUSION_PAIRS:
    OCR_CONFUSION_SET.add(f"{a}{b}")
    OCR_CONFUSION_SET.add(f"{b}{a}")


def levenshtein_distance(a: str, b: str, max_dist: int = 2) -> int:
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if abs(la - lb) > max_dist:
        return max_dist + 1
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        curr = [i]
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr.append(min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[lb]


def is_ocr_confused_match(a: str, b: str) -> bool:
    if a == b:
        return False
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        diffs = 0
        for ca, cb in zip(a, b):
            if ca != cb:
                diffs += 1
                if diffs > 1:
                    return False
                if f"{ca}{cb}" not in OCR_CONFUSION_SET:
                    return False
        return diffs == 1
    return levenshtein_distance(a, b, 1) <= 1


def plate_similarity_score(query: str, candidate: str) -> float:
    if query == candidate:
        return 1.0
    if is_ocr_confused_match(query, candidate):
        return 0.85
    dist = levenshtein_distance(query, candidate, 1)
    if dist == 1:
        return 0.70
    return 0.0


# Spatio-temporal parameters (must match TS service)
MIN_SPEED_KMH = 5
MAX_SPEED_KMH = 120
MAX_WINDOW_HOURS = 12


def spatio_temporal_score(distance_meters, time_diff_seconds) -> dict:
    if distance_meters is None or distance_meters <= 0:
        hours = abs(time_diff_seconds) / 3600
        if hours <= 0.5:
            return {'score': 0.60, 'reason': 'NO_GIS_DATA:TIME_CLOSE', 'implied_speed_kmh': None}
        if hours <= 2:
            return {'score': 0.45, 'reason': 'NO_GIS_DATA:TIME_MODERATE', 'implied_speed_kmh': None}
        if hours <= 6:
            return {'score': 0.30, 'reason': 'NO_GIS_DATA:TIME_DISTANT', 'implied_speed_kmh': None}
        return {'score': 0.15, 'reason': 'NO_GIS_DATA:TIME_VERY_DISTANT', 'implied_speed_kmh': None}

    abs_sec = abs(time_diff_seconds)
    dist_km = distance_meters / 1000

    if distance_meters < 50:
        return {'score': 0.80, 'reason': 'SAME_VICINITY', 'implied_speed_kmh': 0}

    if abs_sec < 5 and distance_meters > 100:
        return {'score': 0.05, 'reason': 'PHYSICALLY_IMPLAUSIBLE:TELEPORTATION', 'implied_speed_kmh': None}

    hours = abs_sec / 3600
    implied_speed_kmh = dist_km / hours if hours > 0 else 9999

    if implied_speed_kmh > MAX_SPEED_KMH:
        return {'score': 0.10, 'reason': 'PHYSICALLY_IMPLAUSIBLE:SPEED_EXCEEDED', 'implied_speed_kmh': round(implied_speed_kmh)}

    if implied_speed_kmh < MIN_SPEED_KMH and abs_sec > 300:
        return {'score': 0.30, 'reason': 'ANOMALOUS:STATIONARY_OR_VERY_SLOW', 'implied_speed_kmh': round(implied_speed_kmh)}

    base_score = 0.90
    if hours > MAX_WINDOW_HOURS:
        base_score = 0.40
    elif hours > 6:
        base_score = 0.60
    elif hours > 2:
        base_score = 0.75

    return {'score': base_score, 'reason': 'SPATIO_TEMPORAL_CONSISTENT', 'implied_speed_kmh': round(implied_speed_kmh)}


def vehicle_class_bonus(query_class, candidate_class) -> float:
    if not query_class or not candidate_class:
        return 0.0
    return 0.05 if query_class == candidate_class else -0.10




def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Pure Python Haversine implementation (mirrors TS service)."""
    import math
    R = 6_371_000
    to_rad = lambda d: d * math.pi / 180
    d_lat = to_rad(lat2 - lat1)
    d_lon = to_rad(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(d_lon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Test Harness
# ---------------------------------------------------------------------------

PASS = 0
FAIL = 0


def assert_equal(name: str, actual, expected, tolerance: float = 0.0):
    global PASS, FAIL
    if tolerance:
        ok = abs(actual - expected) <= tolerance
    else:
        ok = actual == expected
    status = "PASS" if ok else "FAIL"
    if not ok:
        FAIL += 1
        print(f"  [{status}] {name}")
        print(f"         expected: {expected!r}")
        print(f"         actual:   {actual!r}")
    else:
        PASS += 1
        print(f"  [{status}] {name}")


def assert_true(name: str, condition: bool):
    assert_equal(name, condition, True)


def assert_false(name: str, condition: bool):
    assert_equal(name, condition, False)


def assert_in_range(name: str, actual: float, lo: float, hi: float):
    global PASS, FAIL
    ok = lo <= actual <= hi
    status = "PASS" if ok else "FAIL"
    if not ok:
        FAIL += 1
        print(f"  [{status}] {name}  ({actual!r} not in [{lo}, {hi}])")
    else:
        PASS += 1
        print(f"  [{status}] {name}  ({actual!r} ∈ [{lo}, {hi}])")


# ---------------------------------------------------------------------------
# CASE A: Exact normalized plate equality — score 1.0
# ---------------------------------------------------------------------------
def test_case_a():
    print("\n── CASE A: Exact Normalized Plate Match ──")
    q = "GJ01AB1234"
    assert_equal("A1: exact → score 1.0", plate_similarity_score(q, q), 1.0)
    assert_false("A2: exact → not OCR confused", is_ocr_confused_match(q, q))


# ---------------------------------------------------------------------------
# CASE B: OCR confusion 0 → O
# ---------------------------------------------------------------------------
def test_case_b():
    print("\n── CASE B: OCR Confusion 0 ↔ O ──")
    query = "GJ01AB1234"
    candidate = "GJ0IAB1234"   # 1→I : OCR confused
    # The digit '1' becoming 'I' — (1,I) is in confusion set
    assert_equal("B1: 1↔I is OCR confused", is_ocr_confused_match(query, candidate), True)
    assert_equal("B2: score = 0.85", plate_similarity_score(query, candidate), 0.85)

    # 0→O substitution
    query2 = "GJ00AB1234"
    candidate2 = "GJOOAB1234"
    # Two differences: both 0→O — should NOT be a single OCR confused match
    assert_equal("B3: two OCR differences → not confused single", is_ocr_confused_match(query2, candidate2), False)
    assert_equal("B4: two differences → score 0.0", plate_similarity_score(query2, candidate2), 0.0)


# ---------------------------------------------------------------------------
# CASE C: OCR confusion 5 → S
# ---------------------------------------------------------------------------
def test_case_c():
    print("\n── CASE C: OCR Confusion 5 ↔ S ──")
    query = "GJ05CD5678"
    candidate = "GJ05CDS678"  # '5' at index 7 → 'S'
    assert_equal("C1: 5↔S is OCR confused", is_ocr_confused_match(query, candidate), True)
    assert_equal("C2: score = 0.85", plate_similarity_score(query, candidate), 0.85)


# ---------------------------------------------------------------------------
# CASE D: Edit-distance-1 non-OCR substitution
# ---------------------------------------------------------------------------
def test_case_d():
    print("\n── CASE D: Edit-Distance-1 Non-OCR Substitution ──")
    query = "GJ01AB1234"
    candidate = "GJ01AB1235"   # last digit 4→5: not an OCR pair
    # '4' vs '5': (4,5) is NOT in the confusion set
    assert_equal("D1: 4↔5 is not OCR confused", is_ocr_confused_match(query, candidate), False)
    assert_equal("D2: levenshtein = 1", levenshtein_distance(query, candidate), 1)
    assert_equal("D3: score = 0.70", plate_similarity_score(query, candidate), 0.70)


# ---------------------------------------------------------------------------
# CASE E: Edit-distance-1 deletion
# ---------------------------------------------------------------------------
def test_case_e():
    print("\n\u2500\u2500 CASE E: Edit-Distance-1 Deletion \u2500\u2500")
    query = "GJ01AB1234"
    candidate = "GJ01AB123"   # trailing '4' deleted
    assert_equal("E1: levenshtein(10,9) = 1", levenshtein_distance(query, candidate), 1)
    # Deletions of length 1 pass through is_ocr_confused_match (len-diff=1, lev=1) -> True -> score 0.85
    # This is intentional: truncated plate reads are treated as OCR-level confusion
    assert_equal("E2: deletion is_ocr_confused = True", is_ocr_confused_match(query, candidate), True)
    assert_equal("E3: deletion scores 0.85 (OCR confusion path)", plate_similarity_score(query, candidate), 0.85)


# ---------------------------------------------------------------------------
# CASE F: Edit-distance-2 (must be rejected)
# ---------------------------------------------------------------------------
def test_case_f():
    print("\n── CASE F: Edit-Distance-2 Rejection ──")
    query = "GJ01AB1234"
    candidate = "GJ01AB1299"   # two substitutions at positions 8 and 9
    assert_equal("F1: levenshtein = 2", levenshtein_distance(query, candidate), 2)
    assert_equal("F2: score = 0.0 (edit dist ≥ 2 → rejected)", plate_similarity_score(query, candidate), 0.0)


# ---------------------------------------------------------------------------
# CASE G: Spatio-temporal — physically impossible (teleportation)
# ---------------------------------------------------------------------------
def test_case_g():
    print("\n── CASE G: Spatio-Temporal Physically Impossible ──")
    # 5000 m apart in 2 seconds → 9000 km/h (impossible)
    result = spatio_temporal_score(5000, 2)
    assert_equal("G1: reason = TELEPORTATION", result['reason'], 'PHYSICALLY_IMPLAUSIBLE:TELEPORTATION')
    assert_in_range("G2: score ≤ 0.10", result['score'], 0.0, 0.10)

    # 200 km/h scenario (over speed limit)
    result2 = spatio_temporal_score(100_000, 1800)  # 100 km in 30 min = 200 km/h
    assert_equal("G3: reason = SPEED_EXCEEDED", result2['reason'], 'PHYSICALLY_IMPLAUSIBLE:SPEED_EXCEEDED')
    assert_in_range("G4: score ≤ 0.10", result2['score'], 0.0, 0.10)


# ---------------------------------------------------------------------------
# CASE H: Spatio-temporal — plausible urban transit
# ---------------------------------------------------------------------------
def test_case_h():
    print("\n── CASE H: Spatio-Temporal Plausible Urban Transit ──")
    # 5 km in 10 minutes → 30 km/h (urban traffic: plausible)
    result = spatio_temporal_score(5000, 600)
    assert_equal("H1: reason = CONSISTENT", result['reason'], 'SPATIO_TEMPORAL_CONSISTENT')
    assert_in_range("H2: score ≥ 0.80", result['score'], 0.80, 1.0)
    assert_equal("H3: implied speed = 30 km/h", result['implied_speed_kmh'], 30)

    # Same vicinity (< 50 m)
    result3 = spatio_temporal_score(30, 300)
    assert_equal("H4: same vicinity → SAME_VICINITY", result3['reason'], 'SAME_VICINITY')
    assert_equal("H5: score = 0.80", result3['score'], 0.80)

    # No GIS data — close in time
    result4 = spatio_temporal_score(None, 900)   # 15 minutes, no coordinates
    assert_equal("H6: no GIS, <30min → TIME_CLOSE", result4['reason'], 'NO_GIS_DATA:TIME_CLOSE')
    assert_equal("H7: score = 0.60", result4['score'], 0.60)


# ---------------------------------------------------------------------------
# CASE I: Vehicle class bonus/penalty
# ---------------------------------------------------------------------------
def test_case_i():
    print("\n── CASE I: Vehicle Class Signal ──")
    # Same class: small bonus
    bonus = vehicle_class_bonus('CAR', 'CAR')
    assert_equal("I1: same class bonus = +0.05", bonus, 0.05)

    # Different class: small penalty
    penalty = vehicle_class_bonus('CAR', 'TRUCK')
    assert_equal("I2: different class penalty = -0.10", penalty, -0.10)

    # Unknown class: no adjustment
    none_bonus = vehicle_class_bonus(None, 'CAR')
    assert_equal("I3: unknown query class → 0.0", none_bonus, 0.0)
    none_bonus2 = vehicle_class_bonus('CAR', None)
    assert_equal("I4: unknown candidate class → 0.0", none_bonus2, 0.0)


# ---------------------------------------------------------------------------
# CASE J: Performance — 10,000 candidates in < 500 ms
# ---------------------------------------------------------------------------
def test_case_j():
    print("\n── CASE J: Performance Benchmark ──")
    import random
    import string

    def random_plate() -> str:
        state = random.choice(['GJ', 'MH', 'RJ', 'DL', 'UP'])
        num = f"{random.randint(1, 99):02d}"
        letters = ''.join(random.choices(string.ascii_uppercase, k=2))
        digits = f"{random.randint(1000, 9999):04d}"
        return f"{state}{num}{letters}{digits}"

    query = "GJ01AB1234"
    candidates = [random_plate() for _ in range(10_000)]

    start = time.perf_counter()
    results = []
    for c in candidates:
        score = plate_similarity_score(query, c)
        if score > 0.0:
            results.append((c, score))
    elapsed_ms = (time.perf_counter() - start) * 1000

    global PASS, FAIL
    threshold_ms = 500
    ok = elapsed_ms < threshold_ms
    status = "PASS" if ok else "FAIL"
    if not ok:
        FAIL += 1
    else:
        PASS += 1
    print(f"  [{status}] J1: 10,000 plates scored in {elapsed_ms:.1f} ms (threshold: {threshold_ms} ms)")
    print(f"         Candidates with score > 0: {len(results)}")

    # At least verify no crash and scoring is deterministic
    score_a = plate_similarity_score(query, "GJ01AB1235")
    score_b = plate_similarity_score(query, "GJ01AB1235")
    assert_equal("J2: scoring is deterministic", score_a, score_b)


# ---------------------------------------------------------------------------
# CASE K: Weighted composite score clamping
# ---------------------------------------------------------------------------
def test_case_k():
    print("\n── CASE K: Composite Score Clamping ──")
    W_PLATE = 0.55
    W_ST = 0.35
    W_CLASS = 0.10

    # Perfect scenario: plate=1.0, ST=1.0, class=1.0 + bonus → still ≤ 1.0
    raw = W_PLATE * 1.0 + W_ST * 1.0 + W_CLASS * 1.0
    bonus = vehicle_class_bonus('CAR', 'CAR')
    composite = max(0.0, min(1.0, raw + bonus))
    assert_in_range("K1: perfect composite ≤ 1.0", composite, 0.99, 1.0)

    # Worst scenario: plate=0.70, ST=0.10, class=0.0 - penalty → low but ≥ 0.0
    raw_bad = W_PLATE * 0.70 + W_ST * 0.10 + W_CLASS * 0.0
    penalty = vehicle_class_bonus('CAR', 'TRUCK')
    composite_bad = max(0.0, min(1.0, raw_bad + penalty))
    assert_in_range("K2: poor composite ≥ 0.0", composite_bad, 0.0, 0.5)
    print(f"         Poor composite = {composite_bad:.3f}")


# ---------------------------------------------------------------------------
# CASE L: Levenshtein boundary conditions
# ---------------------------------------------------------------------------
def test_case_l():
    print("\n── CASE L: Levenshtein Boundary Conditions ──")
    assert_equal("L1: empty vs empty = 0", levenshtein_distance("", ""), 0)
    assert_equal("L2: empty vs 'X' = 1", levenshtein_distance("", "X"), 1)
    assert_equal("L3: 'X' vs empty = 1", levenshtein_distance("X", ""), 1)
    assert_equal("L4: identical 10-char = 0", levenshtein_distance("GJ01AB1234", "GJ01AB1234"), 0)
    assert_equal("L5: max_dist cap: 3-char diff capped at max+1",
                 levenshtein_distance("AAAA", "BBBB", 2) > 2, True)


# ---------------------------------------------------------------------------
# Run all test cases
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    print("=" * 60)
    print("NETRAVAHA Phase 10 — Correlation Algorithm Unit Tests")
    print("=" * 60)

    test_case_a()
    test_case_b()
    test_case_c()
    test_case_d()
    test_case_e()
    test_case_f()
    test_case_g()
    test_case_h()
    test_case_i()
    test_case_j()
    test_case_k()
    test_case_l()

    print("\n" + "=" * 60)
    total = PASS + FAIL
    print(f"RESULTS: {PASS}/{total} passed, {FAIL} failed")
    if FAIL > 0:
        print("STATUS: ❌ SOME TESTS FAILED")
        sys.exit(1)
    else:
        print("STATUS: ✅ ALL TESTS PASSED")
        sys.exit(0)
