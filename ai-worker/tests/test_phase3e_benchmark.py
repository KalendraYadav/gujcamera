"""
Performance Latency Benchmark for Phase 3E Components
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026

BENCHMARK PROTOCOL & DISCLAIMER:
Measures execution time of Phase 3E components on CPU across 25 iterations:
1. Multi-Frame Consensus Aggregation Latency
2. JPEG Evidence Snapshot Encoding Latency (640x360 & 1280x720)
3. SHA-256 Cryptographic Byte Hashing Latency
4. In-Memory Domain Conversion Latency

DISCLAIMER:
This benchmark measures CPU execution latency of isolated software components.
Current CCTV fixtures are synthetic countdown patterns with zero real vehicles;
therefore, this benchmark does NOT establish statewide ANPR throughput or live video accuracy.
"""

import time
import numpy as np
import pytest

from app.consensus.contract import PlateObservation
from app.consensus.aggregator import MultiFrameConsensusAggregator
from app.domain import convert_consensus_to_domain
from app.evidence import EvidenceSnapshotGenerator, compute_sha256


def test_phase3e_components_latency_benchmark():
    """Execute latency benchmark across 25 iterations on CPU and log metrics"""
    iterations = 25
    synthetic_frame = np.full((720, 1280, 3), 120, dtype=np.uint8)

    consensus_latencies = []
    encoding_latencies = []
    hashing_latencies = []
    domain_conversion_latencies = []

    snapshot_gen = EvidenceSnapshotGenerator(jpeg_quality=90)

    for i in range(iterations):
        # 1. Benchmark Multi-Frame Consensus Aggregation
        aggregator = MultiFrameConsensusAggregator(window_size=5, min_observations=3)
        t_c0 = time.perf_counter()
        c_res = None
        for frame_idx in range(5):
            obs = PlateObservation(
                camera_id="BENCHMARK-CAM",
                frame_sequence=frame_idx + 1,
                timestamp=time.time() + frame_idx * 0.3,
                raw_text="GJ01AB1234" if frame_idx != 2 else "GJ01AB1284",
                normalized_text="GJ01AB1234" if frame_idx != 2 else "GJ01AB1284",
                confidence=0.85 + (frame_idx * 0.02),
                frame=synthetic_frame,
            )
            res = aggregator.add_observation(obs)
            if res:
                c_res = res
        t_c1 = time.perf_counter()
        consensus_latencies.append((t_c1 - t_c0) * 1000.0)

        # 2. Benchmark JPEG Evidence Encoding
        t_e0 = time.perf_counter()
        artifact = snapshot_gen.create_snapshot(
            frame=synthetic_frame,
            camera_id="BENCHMARK-CAM",
            frame_sequence=1,
            captured_at=time.time(),
            plate_normalized="GJ01AB1234",
        )
        t_e1 = time.perf_counter()
        encoding_latencies.append((t_e1 - t_e0) * 1000.0)

        # 3. Benchmark SHA-256 Cryptographic Hashing
        raw_bytes = artifact.image_bytes
        t_h0 = time.perf_counter()
        hash_digest = compute_sha256(raw_bytes)
        t_h1 = time.perf_counter()
        hashing_latencies.append((t_h1 - t_h0) * 1000.0)

        # 4. Benchmark In-Memory Domain Conversion
        t_d0 = time.perf_counter()
        sighting, evidence = convert_consensus_to_domain(
            consensus=c_res,
            evidence_artifact=artifact,
        )
        t_d1 = time.perf_counter()
        domain_conversion_latencies.append((t_d1 - t_d0) * 1000.0)

    def calc_stats(lat_list):
        cold = lat_list[0]
        warm = lat_list[1:]
        return {
            "cold_ms": round(cold, 3),
            "warm_avg_ms": round(sum(warm) / len(warm), 3),
            "warm_min_ms": round(min(warm), 3),
            "warm_p50_ms": round(np.percentile(warm, 50), 3),
            "warm_p90_ms": round(np.percentile(warm, 90), 3),
            "warm_max_ms": round(max(warm), 3),
        }

    c_stats = calc_stats(consensus_latencies)
    e_stats = calc_stats(encoding_latencies)
    h_stats = calc_stats(hashing_latencies)
    d_stats = calc_stats(domain_conversion_latencies)

    print("\n=======================================================")
    print("       PHASE 3E LATENCY BENCHMARK RESULTS (CPU)        ")
    print("=======================================================")
    print(f"Iterations: {iterations} runs | Image: 1280x720 JPEG (Q=90)")
    print("-------------------------------------------------------")
    print(f"1. Consensus (5-frame window) : Cold={c_stats['cold_ms']}ms | Warmed Avg={c_stats['warm_avg_ms']}ms (p50={c_stats['warm_p50_ms']}ms, p90={c_stats['warm_p90_ms']}ms)")
    print(f"2. Evidence JPEG Encoding     : Cold={e_stats['cold_ms']}ms | Warmed Avg={e_stats['warm_avg_ms']}ms (p50={e_stats['warm_p50_ms']}ms, p90={e_stats['warm_p90_ms']}ms)")
    print(f"3. SHA-256 Hashing            : Cold={h_stats['cold_ms']}ms | Warmed Avg={h_stats['warm_avg_ms']}ms (p50={h_stats['warm_p50_ms']}ms, p90={h_stats['warm_p90_ms']}ms)")
    print(f"4. Domain Record Conversion   : Cold={d_stats['cold_ms']}ms | Warmed Avg={d_stats['warm_avg_ms']}ms (p50={d_stats['warm_p50_ms']}ms, p90={d_stats['warm_p90_ms']}ms)")
    print("-------------------------------------------------------")
    total_estimated_sum = round(
        c_stats["warm_avg_ms"] + e_stats["warm_avg_ms"] + h_stats["warm_avg_ms"] + d_stats["warm_avg_ms"], 3
    )
    print(f"Estimated Component-Sum Latency: ~{total_estimated_sum}ms")
    print("=======================================================\n")

    # Verification assertions
    assert c_stats["warm_avg_ms"] < 2.0, "Consensus algorithm took unexpectedly long"
    assert e_stats["warm_avg_ms"] < 50.0, "JPEG encoding took unexpectedly long"
    assert h_stats["warm_avg_ms"] < 2.0, "SHA-256 hashing took unexpectedly long"
    assert d_stats["warm_avg_ms"] < 1.0, "Domain record conversion took unexpectedly long"
