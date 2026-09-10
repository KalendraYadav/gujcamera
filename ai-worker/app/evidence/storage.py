"""
MinIO Evidence Storage Vault (Phase 3E)
Unified CCTV Intelligence Platform — Gujarat Police Innovation Challenge 2026
Source of Truth: master_architecture.md Section 11.2 & Section 19.1

Integrates with local S3-compatible MinIO object storage for secure evidence persistence.
Provides resilient exception isolation to ensure storage downtime never crashes the AI worker.
"""

from datetime import datetime, timezone
import io
import logging
import time
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from app.evidence.contract import (
    EvidenceArtifact,
    EvidenceStorageErrorCode,
    EvidenceStorageResult,
)

logger = logging.getLogger("ai_worker.storage")

# Optional import of minio SDK; graceful fallback if not installed
try:
    from minio import Minio
    from minio.error import S3Error
    MINIO_SDK_AVAILABLE = True
except ImportError:
    MINIO_SDK_AVAILABLE = False
    Minio = None
    S3Error = Exception


class MinioEvidenceVault:
    """
    S3-compatible evidence storage client connecting to MinIO.
    Stores JPEG snapshots and metadata under deterministic, privacy-safe object keys.
    """

    def __init__(
        self,
        endpoint: str = "localhost:9000",
        access_key: str = "minio_admin",
        secret_key: str = "minio_dev_secret_2026",
        bucket_name: str = "police-evidence-vault",
        secure: bool = False,
    ):
        self.raw_endpoint = endpoint
        self.access_key = access_key
        self.secret_key = secret_key
        self.bucket_name = bucket_name
        self.secure = secure

        # Clean endpoint to host:port required by MinIO SDK
        self.clean_endpoint = self._clean_endpoint(endpoint)

        self._client: Optional[Any] = None
        self._bucket_verified: bool = False
        self._init_client()

    def _clean_endpoint(self, ep: str) -> str:
        """Strip http:// or https:// scheme for MinIO Python SDK"""
        if not ep:
            return "localhost:9000"
        if "://" in ep:
            parsed = urlparse(ep)
            return parsed.netloc or parsed.path
        return ep

    def _init_client(self) -> None:
        """Initialize the underlying Minio client if the SDK is available"""
        if not MINIO_SDK_AVAILABLE:
            logger.warning("MinIO Python SDK ('minio') is not installed. Storage operations will degrade gracefully.")
            return

        try:
            self._client = Minio(
                endpoint=self.clean_endpoint,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=self.secure,
            )
            logger.info(
                "MinIO Evidence Vault client initialized -> %s (bucket: %s)",
                self.clean_endpoint,
                self.bucket_name,
            )
        except Exception as e:
            logger.warning("Failed to initialize MinIO client (%s). Offline mode active.", str(e))
            self._client = None

    def ensure_bucket_exists(self) -> bool:
        """
        Verify that the evidence vault bucket exists, attempting creation if absent.
        Returns True on success, False if MinIO is unreachable.
        """
        if self._client is None:
            return False

        try:
            found = self._client.bucket_exists(self.bucket_name)
            if not found:
                logger.info("Bucket '%s' not found. Creating bucket in MinIO...", self.bucket_name)
                self._client.make_bucket(self.bucket_name)
            self._bucket_verified = True
            return True
        except Exception as ex:
            logger.warning("MinIO bucket verification failed for '%s': %s", self.bucket_name, str(ex))
            return False

    def generate_object_key(
        self,
        camera_id: str,
        artifact_id: str,
        timestamp: float,
    ) -> str:
        """
        Produce deterministic, temporally partitioned S3 object key.
        Hierarchy: evidence/{YYYY}/{MM}/{DD}/{camera_id}/sighting_{artifact_id}.jpg
        """
        dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        safe_cam = camera_id.replace("/", "_").replace("\\", "_")
        return (
            f"evidence/{dt.year}/{dt.month:02d}/{dt.day:02d}/"
            f"{safe_cam}/sighting_{artifact_id}.jpg"
        )

    def store_artifact(self, artifact: EvidenceArtifact) -> EvidenceStorageResult:
        """
        Upload an EvidenceArtifact to MinIO with SHA-256 metadata headers.

        Args:
            artifact: Validated EvidenceArtifact containing JPEG bytes and SHA-256 hash.

        Returns:
            EvidenceStorageResult documenting storage outcome and S3 reference.
        """
        t0 = time.perf_counter()

        if artifact is None or not artifact.image_bytes:
            return EvidenceStorageResult(
                success=False,
                bucket=self.bucket_name,
                object_key="",
                sha256_hash="",
                error_code=EvidenceStorageErrorCode.INVALID_BYTES.value,
                error_message="Evidence artifact contains empty or null image bytes",
            )

        object_key = self.generate_object_key(
            camera_id=artifact.camera_id,
            artifact_id=artifact.artifact_id,
            timestamp=artifact.captured_at,
        )

        if self._client is None:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            logger.warning(
                "[%s] MinIO client unavailable. Artifact #%s not uploaded.",
                artifact.camera_id,
                artifact.artifact_id[:8],
            )
            return EvidenceStorageResult(
                success=False,
                bucket=self.bucket_name,
                object_key=object_key,
                storage_ref=None,
                sha256_hash=artifact.sha256_hash,
                upload_latency_ms=elapsed_ms,
                error_code=EvidenceStorageErrorCode.MINIO_UNAVAILABLE.value,
                error_message="MinIO client is not initialized or offline",
            )

        storage_ref = f"s3://{self.bucket_name}/{object_key}"

        try:
            # Ensure target bucket exists once per session
            if not self._bucket_verified:
                if not self.ensure_bucket_exists():
                    elapsed_ms = (time.perf_counter() - t0) * 1000.0
                    return EvidenceStorageResult(
                        success=False,
                        bucket=self.bucket_name,
                        object_key=object_key,
                        storage_ref=None,
                        sha256_hash=artifact.sha256_hash,
                        upload_latency_ms=elapsed_ms,
                        error_code=EvidenceStorageErrorCode.BUCKET_NOT_FOUND.value,
                        error_message=f"Target bucket '{self.bucket_name}' could not be verified or created",
                    )

            # Metadata attached directly to S3 object headers for forensic traceability.
            # Plaintext plate is deliberately omitted to preserve investigative privacy.
            metadata = {
                "x-amz-meta-sha256": artifact.sha256_hash,
                "x-amz-meta-camera-id": artifact.camera_id,
                "x-amz-meta-frame-seq": str(artifact.frame_sequence),
                "x-amz-meta-captured-at": str(artifact.captured_at),
            }

            data_stream = io.BytesIO(artifact.image_bytes)
            self._client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_key,
                data=data_stream,
                length=artifact.size_bytes,
                content_type=artifact.mime_type,
                metadata=metadata,
            )

            elapsed_ms = (time.perf_counter() - t0) * 1000.0

            logger.info(
                "[%s] Successfully stored evidence artifact in MinIO: %s in %.1fms",
                artifact.camera_id,
                storage_ref,
                elapsed_ms,
            )

            return EvidenceStorageResult(
                success=True,
                bucket=self.bucket_name,
                object_key=object_key,
                storage_ref=storage_ref,
                sha256_hash=artifact.sha256_hash,
                upload_latency_ms=elapsed_ms,
            )

        except Exception as ex:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            err_msg = str(ex)
            err_code = EvidenceStorageErrorCode.STORAGE_EXCEPTION.value
            if "NoSuchBucket" in err_msg or "InvalidBucketName" in err_msg:
                err_code = EvidenceStorageErrorCode.BUCKET_NOT_FOUND.value
            logger.warning(
                "[%s] Failed to upload evidence to MinIO (%s): %s (%.1fms)",
                artifact.camera_id,
                storage_ref,
                err_msg,
                elapsed_ms,
            )
            return EvidenceStorageResult(
                success=False,
                bucket=self.bucket_name,
                object_key=object_key,
                storage_ref=None,
                sha256_hash=artifact.sha256_hash,
                upload_latency_ms=elapsed_ms,
                error_code=err_code,
                error_message=f"MinIO storage error: {err_msg}",
            )

    def retrieve_artifact_bytes(self, object_key: str) -> Optional[bytes]:
        """
        Fetch stored evidence artifact bytes from MinIO for integrity re-verification.
        Returns raw bytes if found, or None if client unavailable or object does not exist.
        """
        if self._client is None or not object_key:
            return None

        try:
            response = self._client.get_object(self.bucket_name, object_key)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        except Exception as ex:
            logger.warning("Failed to retrieve artifact '%s' from MinIO: %s", object_key, str(ex))
            return None
