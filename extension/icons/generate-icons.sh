#!/bin/bash
# Generate PNG icons from SVG sources
# Requires: rsvg-convert (brew install librsvg)

cd "$(dirname "$0")"

# Default state icons
rsvg-convert icon-16.svg -w 16 -h 16 -o icon-16.png
rsvg-convert icon-48.svg -w 32 -h 32 -o icon-32.png
rsvg-convert icon-48.svg -w 48 -h 48 -o icon-48.png
rsvg-convert icon-48.svg -w 96 -h 96 -o icon-96.png

# Connected state icons
rsvg-convert icon-connected-16.svg -w 16 -h 16 -o icon-connected-16.png
rsvg-convert icon-connected-48.svg -w 32 -h 32 -o icon-connected-32.png
rsvg-convert icon-connected-48.svg -w 48 -h 48 -o icon-connected-48.png
rsvg-convert icon-connected-48.svg -w 96 -h 96 -o icon-connected-96.png

echo "Icons generated successfully!"
