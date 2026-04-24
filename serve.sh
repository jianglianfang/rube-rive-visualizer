#!/bin/bash
# Start a local HTTP server for the RUBE-Rive Visualizer web mode.
# Usage: bash web/serve.sh

PORT=${1:-8000}
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting RUBE-Rive Visualizer at http://localhost:$PORT"
echo "Press Ctrl+C to stop."
echo ""

python3 -m http.server "$PORT" --directory "$DIR"
