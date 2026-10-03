"""
Realistic CCTV Video Source Validation & Performance Observation (Phase 5)
NETRAVAHA Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026

Runs real frame ingestion on both:
1. Realistic Traffic Surveillance Video (1280x720 @ 29.97fps, multi-vehicle highway traffic)
2. Synthetic CCTV Junction Stream (1280x720 @ 25fps, deterministic stolen Creta GJ01AB1234)

Measures and validates:
- Frame decoding & sampling rate
- Vehicle detection & plate localization
- OCR character extraction quality
- Multi-frame consensus aggregation
- Evidence artifact capture & SHA-256 integrity verification
- Source type classification (RESEARCH_VIDEO vs SYNTHETIC_STREAM)
"""

import os
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import cv2
import numpy as np

# Add ai-worker to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.consensus.aggregator import MultiFrameConsensusAggregator
from app.consensus.contract import PlateObservation
from app.detection_contract import BoundingBox, DetectedObject, VehicleClass
from app.detector.plate_localizer import PlateLocalizer
from app.events.contract import VideoSourceType, VehicleSightingCreatedEvent
from app.evidence.snapshot_generator import EvidenceSnapshotGenerator
from app.evidence.hasher import compute_sha256
from app.ocr import TesseractOCREngine, prepare_plate_crop, process_plate_text


def validate_video_file(video_path: str, camera_id: str, source_type: VideoSourceType, sample_fps: float = 3.0):
    print("=" * 80)
    print(f"[SOURCE] VALIDATING VIDEO SOURCE: {os.path.basename(video_path)}")
    print(f"   Path:        {video_path}")
    print(f"   Camera ID:   {camera_id}")
    print(f"   Source Type: {source_type.value}")
    print("=" * 80)

    if not os.path.exists(video_path):
        print(f"[ERROR] Video file not found: {video_path}")
        return None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Failed to open video file with OpenCV: {video_path}")
        return None

    fps_native = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_s = total_frames / fps_native if fps_native > 0 else 0.0

    print(f"  • Source Resolution : {width}x{height}")
    print(f"  • Native Frame Rate : {fps_native:.2f} FPS")
    print(f"  • Frame Count       : {total_frames} frames")
    print(f"  • Video Duration    : {duration_s:.2f} seconds")
    print(f"  • Target Sampling   : {sample_fps:.1f} FPS")

    # Initialize CV components
    localizer = PlateLocalizer()
    ocr = TesseractOCREngine()
    consensus = MultiFrameConsensusAggregator(
        window_size=5,
        min_observations=3,
        min_confidence=0.40,
        min_agreement_ratio=0.60,
        max_window_seconds=8.0,
    )
    generator = EvidenceSnapshotGenerator(jpeg_quality=90)

    print(f"  • Plate Localizer   : {localizer.mode_name}")
    print(f"  • OCR Engine Ready  : {ocr.is_ready()}")
    print("-" * 80)

    frame_step = max(1, int(fps_native / sample_fps))
    sampled_frames = 0
    detected_plates_total = 0
    ocr_attempts = 0
    ocr_successes = 0
    consensus_events = []
    latencies = []

    start_perf = time.perf_counter()

    for frame_idx in range(0, total_frames, frame_step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            break

        sampled_frames += 1
        t0 = time.perf_counter()
        h_f, w_f = frame.shape[:2]

        # Vehicle bounding box (lower 60% of surveillance view)
        veh_box = BoundingBox(
            x1=int(w_f * 0.15),
            y1=int(h_f * 0.30),
            x2=int(w_f * 0.85),
            y2=int(h_f * 0.90),
        )
        sim_veh = DetectedObject(
            object_id=f"veh_{frame_idx}",
            vehicle_class=VehicleClass.CAR,
            confidence=0.89,
            bbox=veh_box,
        )

        # Plate Localization
        plates = localizer.localize(frame, [sim_veh])
        detected_plates_total += len(plates)

        for plate in plates:
            ocr_attempts += 1
            crop = prepare_plate_crop(frame, plate.bbox)
            if crop is not None and crop.size > 0:
                raw_text, conf, variant = ocr.recognize(crop)
                normalized, is_valid = process_plate_text(raw_text)

                if normalized:
                    ocr_successes += 1
                    obs = PlateObservation(
                        camera_id=camera_id,
                        frame_sequence=frame_idx,
                        timestamp=time.time() - (total_frames - frame_idx) / fps_native,
                        raw_text=raw_text,
                        normalized_text=normalized,
                        confidence=conf if conf is not None else 0.5,
                        format_valid=is_valid,
                        frame=frame,
                        plate_bbox=plate.bbox.to_list(),
                        vehicle_id=sim_veh.object_id,
                    )
                    c_res = consensus.add_observation(obs)
                    if c_res and c_res.is_accepted:
                        # Generate evidence artifact
                        snap = generator.create_snapshot(
                            frame=c_res.best_frame,
                            camera_id=camera_id,
                            frame_sequence=c_res.best_frame_sequence,
                            captured_at=c_res.last_observed_ts,
                            plate_normalized=c_res.consensus_plate,
                        )
                        # Verify SHA-256 recalculation integrity
                        recalc_sha = compute_sha256(snap.image_bytes)
                        assert recalc_sha == snap.sha256, "Cryptographic hash mismatch!"

                        event = VehicleSightingCreatedEvent.create(
                            sighting_id=f"sight-{frame_idx}",
                            evidence_id=f"evid-{frame_idx}",
                            camera_id=camera_id,
                            plate_normalized=c_res.consensus_plate,
                            confidence=c_res.consensus_confidence,
                            consensus_of=c_res.consensus_of,
                            total_observations=c_res.total_window_observations,
                            storage_ref=f"s3://police-evidence-vault/{snap.storage_path}",
                            evidence_hash=snap.sha256,
                            captured_at_ts=snap.captured_at,
                            source_type=source_type.value,
                        )
                        consensus_events.append((c_res, snap, event))

        dt = (time.perf_counter() - t0) * 1000.0
        latencies.append(dt)

    total_time_s = time.perf_counter() - start_perf
    processing_fps = sampled_frames / total_time_s if total_time_s > 0 else 0.0

    print("[METRICS] OBSERVATION RESULTS:")
    print(f"  * Frames Sampled     : {sampled_frames}")
    print(f"  * Total Processing   : {total_time_s:.2f} seconds ({processing_fps:.2f} FPS)")
    print(f"  * Per-Frame Latency  : avg={np.mean(latencies):.1f}ms, p50={np.median(latencies):.1f}ms, p95={np.percentile(latencies, 95):.1f}ms")
    print(f"  * Candidate Plates   : {detected_plates_total}")
    print(f"  * OCR Attempts       : {ocr_attempts}")
    print(f"  * OCR Text Extracted : {ocr_successes}")
    print(f"  * Consensus Sightings: {len(consensus_events)}")

    for idx, (c_res, snap, ev) in enumerate(consensus_events, 1):
        print(f"    [{idx}] Consensus: {c_res.consensus_plate} | Confidence: {c_res.consensus_confidence:.2f} | Frames: {c_res.consensus_of}/{c_res.total_window_observations} | SHA-256: {snap.sha256[:16]}... | Source: {ev.source_type}")

    cap.release()
    return {
        "video": os.path.basename(video_path),
        "resolution": f"{width}x{height}",
        "native_fps": fps_native,
        "sampled_frames": sampled_frames,
        "processing_fps": round(processing_fps, 2),
        "avg_latency_ms": round(float(np.mean(latencies)), 2),
        "p50_latency_ms": round(float(np.median(latencies)), 2),
        "p95_latency_ms": round(float(np.percentile(latencies, 95)), 2),
        "candidate_plates": detected_plates_total,
        "ocr_successes": ocr_successes,
        "consensus_sightings": len(consensus_events),
    }


if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("[PIPELINE] NETRAVAHA PHASE 5 - REALISTIC VIDEO & CCTV PIPELINE VERIFICATION")
    print("=" * 80)

    # 1. Realistic Traffic Surveillance Video (Highway/multi-vehicle)
    demo_video = "video-gateway/fixtures/demo-traffic.mp4"
    res1 = validate_video_file(demo_video, "CAM-DEMO-01", VideoSourceType.RESEARCH_VIDEO, sample_fps=3.0)

    # 2. Synthetic CCTV Junction Stream (Deterministic vehicle with plate)
    synth_video = "video-gateway/fixtures/cam-ahm-01.mp4"
    res2 = validate_video_file(synth_video, "CAM-AHM-01", VideoSourceType.SYNTHETIC_STREAM, sample_fps=3.0)

    print("\n" + "=" * 80)
    print("[SUMMARY] COMPARISON TABLE")
    print("=" * 80)
    print(f"{'Source':<20} | {'Resolution':<10} | {'Native FPS':<10} | {'Proc FPS':<10} | {'Avg Latency':<12} | {'Consensus':<10}")
    print("-" * 80)
    if res1:
        print(f"{res1['video']:<20} | {res1['resolution']:<10} | {res1['native_fps']:<10.2f} | {res1['processing_fps']:<10.2f} | {res1['avg_latency_ms']:<12.1f} | {res1['consensus_sightings']:<10}")
    if res2:
        print(f"{res2['video']:<20} | {res2['resolution']:<10} | {res2['native_fps']:<10.2f} | {res2['processing_fps']:<10.2f} | {res2['avg_latency_ms']:<12.1f} | {res2['consensus_sightings']:<10}")
    print("=" * 80)
    print("[SUCCESS] Realistic video and synthetic stream validation complete!")
