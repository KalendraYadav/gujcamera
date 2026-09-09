#!/bin/bash
# ==============================================================================
# Deterministic Video Fixture Generator for Gujarat Police Innovation Challenge
# Generates compact H.264 MP4 fixtures simulating CCTV junction cameras.
# ==============================================================================

set -e

FIXTURES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/fixtures" && pwd)"
mkdir -p "$FIXTURES_DIR"

echo "🎥 Generating deterministic CCTV video fixtures in $FIXTURES_DIR..."

# 1. CAM-AHM-01: SG Highway - Pakwan Crossroad Junction (Ahmedabad)
# Moving white vehicle with license plate GJ01AB1234 (stolen Creta from FIR #102/2026)
docker run --rm -v "$FIXTURES_DIR:/out" linuxserver/ffmpeg:latest -y \
  -f lavfi -i "color=c=0x1e293b:s=1280x720:d=6:r=25" \
  -vf "drawbox=y=300:h=240:w=1280:color=0x334155:t=fill,\
drawbox=y=415:h=10:w=1280:color=0xe2e8f0:t=fill,\
drawtext=text='[SIMULATED CCTV - GUJARAT POLICE PoC]':x=30:y=30:fontsize=22:fontcolor=0x94a3b8,\
drawtext=text='CAM-AHM-01 | SG Highway - Pakwan Crossroad Junction | Ahmedabad':x=30:y=60:fontsize=26:fontcolor=white,\
drawtext=text='LIVE RTSP FEED':x=1100:y=30:fontsize=20:fontcolor=0x22c55e,\
drawbox=x='(t/6)*1580 - 300':y=340:w=320:h=160:color=white:t=fill,\
drawbox=x='(t/6)*1580 - 240':y=355:w=200:h=60:color=0x0f172a:t=fill,\
drawbox=x='(t/6)*1580 - 210':y=440:w=160:h=45:color=0xfef08a:t=fill,\
drawbox=x='(t/6)*1580 - 210':y=440:w=160:h=45:color=black:t=2,\
drawtext=text='GJ01AB1234':x='(t/6)*1580 - 195':y=452:fontsize=24:fontcolor=black" \
  -c:v libx264 -pix_fmt yuv420p /out/cam-ahm-01.mp4

# 2. CAM-AHM-02: C.G. Road - Swastik Char Rasta (Ahmedabad)
# Second sighting along vehicle trajectory
docker run --rm -v "$FIXTURES_DIR:/out" linuxserver/ffmpeg:latest -y \
  -f lavfi -i "color=c=0x1e293b:s=1280x720:d=6:r=25" \
  -vf "drawbox=y=300:h=240:w=1280:color=0x334155:t=fill,\
drawbox=y=415:h=10:w=1280:color=0xe2e8f0:t=fill,\
drawtext=text='[SIMULATED CCTV - GUJARAT POLICE PoC]':x=30:y=30:fontsize=22:fontcolor=0x94a3b8,\
drawtext=text='CAM-AHM-02 | C.G. Road - Swastik Char Rasta | Ahmedabad':x=30:y=60:fontsize=26:fontcolor=white,\
drawtext=text='LIVE RTSP FEED':x=1100:y=30:fontsize=20:fontcolor=0x22c55e,\
drawbox=x='1280 - (t/6)*1580':y=340:w=320:h=160:color=white:t=fill,\
drawbox=x='1280 - (t/6)*1580 + 60':y=355:w=200:h=60:color=0x0f172a:t=fill,\
drawbox=x='1280 - (t/6)*1580 + 80':y=440:w=160:h=45:color=0xfef08a:t=fill,\
drawbox=x='1280 - (t/6)*1580 + 80':y=440:w=160:h=45:color=black:t=2,\
drawtext=text='GJ01AB1234':x='1280 - (t/6)*1580 + 95':y=452:fontsize=24:fontcolor=black" \
  -c:v libx264 -pix_fmt yuv420p /out/cam-ahm-02.mp4

echo "✅ Generated cam-ahm-01.mp4 and cam-ahm-02.mp4 in $FIXTURES_DIR"
