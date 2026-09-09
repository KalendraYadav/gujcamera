"""
Integration & Benchmark Test against Phase 3A Deterministic Video Fixtures (Phase 3C)
Measures actual CPU inference latency and throughput on decoded frames.
"""

import os
import platform
import time
from typing import List
import cv2
import numpy as np
import pytest

from app.detector import InferencePipeline, PlateLocalizer, YoloVehicleDetector
from app.frame_contract import FramePayload
from app.ocr import TesseractOCREngine
def create_synthetic_plate_image(text: str, width: int = 240, height: int = 60) -> np.ndarray:
    """Generate synthetic license plate image with black text on white background"""
    img = np.full((height, width, 3), 255, dtype=np.uint8)
    cv2.rectangle(img, (2, 2), (width - 3, height - 3), (20, 20, 20), 2)
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 1.0
    thickness = 2
    (text_w, text_h), _ = cv2.getTextSize(text, font, font_scale, thickness)
    text_x = max(10, (width - text_w) // 2)
    text_y = max(height - 15, (height + text_h) // 2)
    cv2.putText(img, text, (text_x, text_y), font, font_scale, (0, 0, 0), thickness, cv2.LINE_AA)
    return img


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
    ocr_engine = TesseractOCREngine()
    pipeline = InferencePipeline(
        vehicle_detector=vehicle_detector,
        plate_detector=plate_detector,
        ocr_engine=ocr_engine,
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


def test_ocr_crop_benchmark():
    """
    Dedicated OCR-only Latency & Throughput Benchmark.
    Runs Tesseract 5 LSTM engine on 25 synthetic plate crop fixtures on CPU.
    """
    engine = TesseractOCREngine()
    if not engine.is_ready():
        pytest.skip("Tesseract OCR not installed or available in test environment")

    # Generate synthetic plate fixture
    test_plate = create_synthetic_plate_image("GJ01AB1234", width=240, height=60)

    num_iterations = 25
    latencies: List[float] = []

    for _ in range(num_iterations):
        t0 = time.perf_counter()
        raw_text, conf, variant = engine.recognize(test_plate)
        dt_ms = (time.perf_counter() - t0) * 1000.0
        latencies.append(dt_ms)

    import numpy as np

    overall_avg = sum(latencies) / len(latencies)
    overall_min = min(latencies)
    overall_max = max(latencies)
    overall_p50 = float(np.percentile(latencies, 50))
    overall_p90 = float(np.percentile(latencies, 90))
    overall_p99 = float(np.percentile(latencies, 99))
    overall_fps = 1000.0 / overall_avg if overall_avg > 0 else 0.0

    cold_start = latencies[0]
    warmed_up = latencies[1:]
    warm_avg = sum(warmed_up) / len(warmed_up) if warmed_up else 0.0
    warm_min = min(warmed_up) if warmed_up else 0.0
    warm_max = max(warmed_up) if warmed_up else 0.0
    warm_p50 = float(np.percentile(warmed_up, 50)) if warmed_up else 0.0
    warm_p90 = float(np.percentile(warmed_up, 90)) if warmed_up else 0.0
    warm_p99 = float(np.percentile(warmed_up, 99)) if warmed_up else 0.0
    warm_fps = 1000.0 / warm_avg if warm_avg > 0 else 0.0

    print("\n" + "=" * 70)
    print("  PHASE 3D OCR-ONLY LATENCY BENCHMARK REPORT")
    print("=" * 70)
    print("  OCR Engine               : Tesseract 5 (LSTM) via pytesseract")
    print(f"  Hardware / Device        : CPU ({platform.processor() or platform.machine()})")
    print("  Input Type               : Preprocessed License Plate Crop (240x60)")
    print(f"  Iterations Tested        : {num_iterations}")
    print("-" * 70)
    print(f"  A. Cold-Start Latency    : {cold_start:.2f} ms (First crop execution)")
    print("-" * 70)
    print(f"  B. Warmed-Up Latency     : {len(warmed_up)} crops (Crops 2..{num_iterations})")
    print(f"     - Min Latency         : {warm_min:.2f} ms")
    print(f"     - p50 (Median)        : {warm_p50:.2f} ms")
    print(f"     - p90 Latency         : {warm_p90:.2f} ms")
    print(f"     - p99 Latency         : {warm_p99:.2f} ms")
    print(f"     - Max Latency         : {warm_max:.2f} ms")
    print(f"     - Warmed-up Average   : {warm_avg:.2f} ms")
    print(f"     - Warmed-up FPS       : {warm_fps:.1f} crops/sec")
    print("-" * 70)
    print(f"  C. Overall Summary       : All {num_iterations} crops (including cold-start)")
    print(f"     - Overall Average     : {overall_avg:.2f} ms")
    print(f"     - Overall Achievable  : {overall_fps:.1f} crops/sec")
    print("=" * 70 + "\n")
