"""
Integration & Benchmark Test against Phase 3A Deterministic Video Fixtures (Phase 3C)
Measures actual CPU inference latency and throughput on decoded frames.
"""

import os
import platform
import time
from typing import List
import cv2
import pytest

from app.detector import InferencePipeline, PlateLocalizer, YoloVehicleDetector
from app.frame_contract import FramePayload


def resolve_fixture_path(filename: str) -> str:
    """Find fixture path either in container /fixtures or relative workspace"""
    candidates = [
        os.path.join("/fixtures", filename),
        os.path.join(os.path.dirname(__file__), "..", "..", "video-gateway", "fixtures", filename),
        os.path.join("video-gateway", "fixtures", filename),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return ""


@pytest.mark.parametrize("fixture_name,camera_id", [
    ("cam-ahm-01.mp4", "CAM-AHM-01"),
    ("cam-ahm-02.mp4", "CAM-AHM-02"),
])
def test_fixture_inference_benchmark(fixture_name: str, camera_id: str):
    fixture_path = resolve_fixture_path(fixture_name)
    if not fixture_path or not os.path.exists(fixture_path):
        pytest.skip(f"Fixture file {fixture_name} not accessible in environment")

    # Locate model weights
    model_candidates = [
        "/app/models/yolov8n.pt",
        os.path.join(os.path.dirname(__file__), "..", "models", "yolov8n.pt"),
        "models/yolov8n.pt",
    ]
    model_path = next((m for m in model_candidates if os.path.exists(m)), "")

    vehicle_detector = YoloVehicleDetector(
        model_path=model_path,
        confidence_threshold=0.35,
        device="cpu",
    )
    plate_detector = PlateLocalizer(
        model_path=None,
        confidence_threshold=0.30,
        device="cpu",
    )
    pipeline = InferencePipeline(
        vehicle_detector=vehicle_detector,
        plate_detector=plate_detector,
    )

    cap = cv2.VideoCapture(fixture_path)
    assert cap.isOpened(), f"Failed to open fixture video: {fixture_path}"

    frame_count = 0
    max_test_frames = 25
    latencies: List[float] = []
    total_vehicles = 0
    total_plates = 0
    frame_width = 0
    frame_height = 0

    try:
        while frame_count < max_test_frames:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            frame_count += 1
            h, w = frame.shape[:2]
            frame_width, frame_height = w, h

            payload = FramePayload(
                camera_id=camera_id,
                frame_index=frame_count,
                captured_at=time.time(),
                sampled_at=time.time(),
                width=w,
                height=h,
                frame=frame,
            )

            result = pipeline.process_frame(payload)
            latencies.append(result.inference_latency_ms)
            total_vehicles += result.vehicle_count
            total_plates += result.plate_count

    finally:
        cap.release()

    assert frame_count > 0, "No frames could be decoded from fixture"
    assert len(latencies) == frame_count

    import numpy as np

    overall_avg = sum(latencies) / len(latencies)
    overall_min = min(latencies)
    overall_max = max(latencies)
    overall_p50 = float(np.percentile(latencies, 50))
    overall_p90 = float(np.percentile(latencies, 90))
    overall_p99 = float(np.percentile(latencies, 99))
    overall_fps = 1000.0 / overall_avg if overall_avg > 0 else 0.0

    # Cold-start vs Warmed-up distinction
    cold_start_latency = latencies[0]
    warmed_up_latencies = latencies[1:]
    warmed_up_count = len(warmed_up_latencies)

    if warmed_up_count > 0:
        warm_avg = sum(warmed_up_latencies) / warmed_up_count
        warm_min = min(warmed_up_latencies)
        warm_max = max(warmed_up_latencies)
        warm_p50 = float(np.percentile(warmed_up_latencies, 50))
        warm_p90 = float(np.percentile(warmed_up_latencies, 90))
        warm_p99 = float(np.percentile(warmed_up_latencies, 99))
        warm_fps = 1000.0 / warm_avg if warm_avg > 0 else 0.0
    else:
        warm_avg = warm_min = warm_max = warm_p50 = warm_p90 = warm_p99 = warm_fps = 0.0

    print("\n" + "=" * 70)
    print(f"  PHASE 3C INFERENCE BENCHMARK REPORT: {camera_id}")
    print("=" * 70)
    print(f"  Fixture File             : {os.path.basename(fixture_path)}")
    print(f"  Hardware / Device        : CPU ({platform.processor() or platform.machine()})")
    print(f"  Model Loaded             : {os.path.basename(model_path) if model_path else 'None (Fallback)'}")
    print(f"  Detector Status          : {'ACTIVE' if vehicle_detector.is_ready() else 'IDLE FALLBACK'}")
    print(f"  Plate Localizer Mode     : {pipeline.plate_detector.mode_name}")
    print(f"  Input Resolution         : {frame_width}x{frame_height}")
    print(f"  Total Frames Tested      : {frame_count}")
    print(f"  Vehicles Detected        : {total_vehicles}")
    print(f"  Plates Localized         : {total_plates}")
    print("-" * 70)
    print(f"  A. Cold-Start Latency    : {cold_start_latency:.2f} ms (Frame 1 graph initialization)")
    print("-" * 70)
    print(f"  B. Warmed-Up Latency     : {warmed_up_count} frames (Frames 2..{frame_count})")
    print(f"     - Min Latency         : {warm_min:.2f} ms")
    print(f"     - p50 (Median)        : {warm_p50:.2f} ms")
    print(f"     - p90 Latency         : {warm_p90:.2f} ms")
    print(f"     - p99 Latency         : {warm_p99:.2f} ms")
    print(f"     - Max Latency         : {warm_max:.2f} ms")
    print(f"     - Warmed-up Average   : {warm_avg:.2f} ms")
    print(f"     - Warmed-up FPS       : {warm_fps:.1f} FPS (Target Sampling: 3.0-5.0 FPS)")
    print("-" * 70)
    print(f"  C. Overall Summary       : All {frame_count} frames (including cold-start)")
    print(f"     - Overall Average     : {overall_avg:.2f} ms")
    print(f"     - Overall Achievable  : {overall_fps:.1f} FPS")
    print("=" * 70 + "\n")
