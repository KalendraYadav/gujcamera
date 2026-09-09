# ==============================================================================
# AI Vision Worker — Dockerfile (Phase 3B: Frame Ingestion & Stream Consumer)
# Gujarat Police Innovation Challenge 2026
# Base: Python 3.11 Slim (Isolated container environment)
# ==============================================================================

FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered stdout/stderr logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    OPENCV_FFMPEG_CAPTURE_OPTIONS="rtsp_transport;tcp" \
    YOLO_CONFIG_DIR=/tmp/Ultralytics

# Install minimal OS dependencies required for video decoding (FFmpeg and GLib)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libglib2.0-0 \
    libgomp1 \
    libgl1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install PyTorch CPU-only wheels first to prevent pulling heavy CUDA libraries
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install application requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create non-root system user for security and create models cache dir
RUN useradd -u 1001 -m -s /bin/bash appuser && \
    mkdir -p /app/models && \
    chown -R appuser:appuser /app

# Copy application source code, tests, and configuration
COPY --chown=appuser:appuser pytest.ini ./
COPY --chown=appuser:appuser app/ ./app/
COPY --chown=appuser:appuser tests/ ./tests/

USER appuser

CMD ["python", "-m", "app.main"]
