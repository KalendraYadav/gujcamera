#!/bin/bash
# ==============================================================================
# NETRAVA — High-Reliability Stream Publisher for Primary Demonstration Nodes
# Gujarat Police Innovation Challenge 2026
# ==============================================================================

# 1. Kill any existing ffmpeg replay loops
pkill -f "ffmpeg.*rtsp" 2>/dev/null || true
sleep 1

FIXTURES_DIR="/mnt/d/web project/gujcamera/video-gateway/fixtures"

# 2. Launch primary corridor cameras (dual endpoints for flat and live/ paths)

# CAM-AHM-01: Pakwan Crossroad Junction
nohup ffmpeg -hide_banner -loglevel warning -re -stream_loop -1 \
  -i "$FIXTURES_DIR/cam-ahm-01.mp4" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://localhost:8554/cam-ahm-01" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://localhost:8554/live/cam-ahm-01" \
  > /tmp/cam-ahm-01.log 2>&1 &

# CAM-AHM-02: Swastik Char Rasta
nohup ffmpeg -hide_banner -loglevel warning -re -stream_loop -1 \
  -i "$FIXTURES_DIR/cam-ahm-02.mp4" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://localhost:8554/cam-ahm-02" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://localhost:8554/live/cam-ahm-02" \
  > /tmp/cam-ahm-02.log 2>&1 &

# CAM-GND-02: Gandhinagar CH-0 Circle (downstream pursuit node using cam-ahm-02.mp4 per manifest)
nohup ffmpeg -hide_banner -loglevel warning -re -stream_loop -1 \
  -i "$FIXTURES_DIR/cam-ahm-02.mp4" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://localhost:8554/cam-gnd-02" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://localhost:8554/live/cam-gnd-02" \
  > /tmp/cam-gnd-02.log 2>&1 &

# CAM-DEMO-01: Expressway Highway Traffic Corridor (RESEARCH video feed)
nohup ffmpeg -hide_banner -loglevel warning -re -stream_loop -1 \
  -i "$FIXTURES_DIR/demo-traffic.mp4" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://localhost:8554/demo-traffic" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://localhost:8554/live/demo-traffic" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://localhost:8554/cam-demo-01" \
  -c copy -f rtsp -rtsp_transport tcp "rtsp://localhost:8554/live/cam-demo-01" \
  > /tmp/cam-demo-01.log 2>&1 &

sleep 2
echo "STREAM_REPLAY_ACTIVE"
