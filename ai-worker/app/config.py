"""
Configuration Management for AI Vision Worker (Phase 3B)
"""

import json
import re
from typing import List
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def sanitize_url(url: str) -> str:
    """Mask credentials in any URL, safely handling passwords with special characters"""
    if "://" not in url or "@" not in url:
        return url
    scheme, rest = url.split("://", 1)
    if "@" in rest:
        # Split on the last '@' before host:port
        auth, host_path = rest.rsplit("@", 1)
        return f"{scheme}://***:***@{host_path}"
    return url


class CameraConfig(BaseModel):
    """Configuration for a single camera RTSP stream"""
    id: str
    url: str

    def sanitized_url(self) -> str:
        """Mask credentials in RTSP URL for safe logging"""
        return sanitize_url(self.url)


class Settings(BaseSettings):
    """Application settings with environment variable override support"""
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # General Worker Settings
    LOG_LEVEL: str = "INFO"
    WORKER_NAME: str = "gujcamera-ai-worker-01"

    # Frame Ingestion & Sampling (PoC Target: 3–5 FPS)
    SAMPLE_FPS: float = Field(default=3.0, ge=0.5, le=30.0)

    # Stream Resilience & Backoff
    BASE_RECONNECT_DELAY: float = Field(default=2.0, ge=0.5, le=10.0)
    MAX_RECONNECT_DELAY: float = Field(default=30.0, ge=5.0, le=300.0)
    DECODE_FAILURE_THRESHOLD: int = Field(default=5, ge=1, le=50)

    # Periodic Health & Metric Reporting Interval (seconds)
    METRICS_INTERVAL: float = Field(default=10.0, ge=2.0, le=60.0)

    # Camera Streams (Parsed from CAMERA_STREAMS or CAMERAS_JSON)
    # Format for CAMERA_STREAMS: "ID1=url1,ID2=url2"
    CAMERA_STREAMS: str = ""
    CAMERAS_JSON: str = ""

    # Computer Vision & Detection Pipeline (Phase 3C)
    VEHICLE_MODEL_PATH: str = "/app/models/yolov8n.pt"
    PLATE_MODEL_PATH: str = ""
    VEHICLE_CONFIDENCE_THRESHOLD: float = Field(default=0.40, ge=0.1, le=1.0)
    PLATE_CONFIDENCE_THRESHOLD: float = Field(default=0.35, ge=0.1, le=1.0)
    INFERENCE_DEVICE: str = "cpu"

    # Optical Character Recognition Pipeline (Phase 3D)
    OCR_ENABLED: bool = True
    OCR_ENGINE: str = "TESSERACT"
    OCR_MIN_CONFIDENCE: float = Field(default=0.30, ge=0.0, le=1.0)
    OCR_ACCEPT_CONFIDENCE: float = Field(default=0.60, ge=0.0, le=1.0)
    OCR_TESSERACT_CMD: str = ""

    # Multi-Frame Consensus Pipeline (Phase 3E)
    CONSENSUS_ENABLED: bool = True
    CONSENSUS_WINDOW_SIZE: int = Field(default=5, ge=5, le=8)
    CONSENSUS_MIN_OBSERVATIONS: int = Field(default=3, ge=1, le=10)
    CONSENSUS_MIN_CONFIDENCE: float = Field(default=0.60, ge=0.1, le=1.0)
    CONSENSUS_MIN_AGREEMENT_RATIO: float = Field(default=0.60, ge=0.1, le=1.0)
    CONSENSUS_MAX_WINDOW_SECONDS: float = Field(default=3.0, ge=0.5, le=30.0)

    # Evidence Snapshot & Vaulting Pipeline (Phase 3E)
    EVIDENCE_CAPTURE_ENABLED: bool = True
    EVIDENCE_JPEG_QUALITY: int = Field(default=90, ge=30, le=100)
    MINIO_ENDPOINT: str = "http://localhost:9000"
    MINIO_ROOT_USER: str = "minio_admin"
    MINIO_ROOT_PASSWORD: str = "minio_dev_secret_2026"
    MINIO_BUCKET_NAME: str = "police-evidence-vault"
    MINIO_SECURE: bool = False

    def get_camera_configs(self) -> List[CameraConfig]:
        """Resolve and parse the list of active camera streams"""
        cameras: List[CameraConfig] = []

        if self.CAMERAS_JSON.strip():
            try:
                data = json.loads(self.CAMERAS_JSON)
                for item in data:
                    cameras.append(CameraConfig(id=item["id"], url=item["url"]))
                return cameras
            except Exception as e:
                # Fallback if invalid JSON
                pass

        if self.CAMERA_STREAMS.strip():
            pairs = self.CAMERA_STREAMS.split(",")
            for pair in pairs:
                if "=" in pair:
                    cam_id, url = pair.split("=", 1)
                    cam_id = cam_id.strip()
                    url = url.strip()
                    if cam_id and url:
                        cameras.append(CameraConfig(id=cam_id, url=url))
            if cameras:
                return cameras

        # Canonical PoC default streams
        return [
            CameraConfig(
                id="CAM-AHM-01",
                url="rtsp://video-gateway:8554/cam-ahm-01"
            ),
            CameraConfig(
                id="CAM-AHM-02",
                url="rtsp://video-gateway:8554/cam-ahm-02"
            )
        ]


# Singleton settings instance
settings = Settings()
