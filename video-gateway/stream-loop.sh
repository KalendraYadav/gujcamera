#!/bin/sh
# ==============================================================================
# FFmpeg RTSP Continuous Stream Loop — Gujarat Police Innovation Challenge
# Loops deterministic MP4 fixtures to MediaMTX streaming gateway over RTSP
# ==============================================================================

set -e

GATEWAY_HOST="${GATEWAY_HOST:-video-gateway}"
GATEWAY_PORT="${GATEWAY_PORT:-8554}"
RETRY_INTERVAL="${RETRY_INTERVAL:-3}"
FIXTURES_DIR="${FIXTURES_DIR:-/fixtures}"

echo "=============================================================================="
echo "🎥 CCTV Stream Simulator Service Starting"
echo "Target Gateway: rtsp://${GATEWAY_HOST}:${GATEWAY_PORT}"
echo "Fixtures Dir:   ${FIXTURES_DIR}"
echo "=============================================================================="

# Wait for MediaMTX gateway RTSP port to be receptive
wait_for_gateway() {
  echo "⏳ Waiting for MediaMTX gateway at ${GATEWAY_HOST}:${GATEWAY_PORT}..."
  while ! nc -z "${GATEWAY_HOST}" "${GATEWAY_PORT}" 2>/dev/null; do
    sleep 1
  done
  echo "✅ MediaMTX gateway is reachable!"
}

stream_channel() {
  STREAM_PATH="$1"
  FIXTURE_FILE="$2"
  TARGET_URL="rtsp://${GATEWAY_HOST}:${GATEWAY_PORT}/${STREAM_PATH}"

  while true; do
    if [ ! -f "${FIXTURE_FILE}" ]; then
      echo "❌ Fixture file not found: ${FIXTURE_FILE}. Waiting 5s..."
      sleep 5
      continue
    fi

    echo "▶️ Publishing stream: ${STREAM_PATH} (Source: ${FIXTURE_FILE})"
    # -re: read at native frame rate
    # -stream_loop -1: loop continuously forever
    # -c:v copy: zero re-encoding, pure RTP/RTSP packetization
    # -rtsp_transport tcp: reliable TCP transport for Docker network
    ffmpeg -hide_banner -loglevel warning \
      -re -stream_loop -1 \
      -i "${FIXTURE_FILE}" \
      -c:v copy \
      -f rtsp -rtsp_transport tcp "${TARGET_URL}" || true

    echo "⚠️ Stream disconnected: ${STREAM_PATH}. Reconnecting in ${RETRY_INTERVAL}s..."
    sleep "${RETRY_INTERVAL}"
  done
}

wait_for_gateway

# Launch background streaming loops for primary and alias endpoints
stream_channel "cam-ahm-01" "${FIXTURES_DIR}/cam-ahm-01.mp4" &
stream_channel "cam-ahm-02" "${FIXTURES_DIR}/cam-ahm-02.mp4" &
stream_channel "live/cam-ahm-01" "${FIXTURES_DIR}/cam-ahm-01.mp4" &
stream_channel "live/cam-ahm-02" "${FIXTURES_DIR}/cam-ahm-02.mp4" &
stream_channel "cam-gnd-02" "${FIXTURES_DIR}/cam-ahm-02.mp4" &
stream_channel "live/cam-gnd-02" "${FIXTURES_DIR}/cam-ahm-02.mp4" &
stream_channel "cam-ahm-03" "${FIXTURES_DIR}/cam-ahm-01.mp4" &
stream_channel "live/cam-ahm-03" "${FIXTURES_DIR}/cam-ahm-01.mp4" &

# Keep foreground container alive
wait
