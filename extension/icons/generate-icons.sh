#!/bin/bash
# Generate PNG icons from SVG sources
# Requires: rsvg-convert (brew install librsvg)

cd "$(dirname "$0")"

# Generate size variants (using size-specific SVGs for better detail)
rsvg-convert icon-16.svg -w 16 -h 16 -o icon-16.png
rsvg-convert icon-48.svg -w 32 -h 32 -o icon-32.png
rsvg-convert icon-48.svg -w 48 -h 48 -o icon-48.png
rsvg-convert icon-96.svg -w 96 -h 96 -o icon-96.png

# Generate toolbar state icons (16x16)
rsvg-convert icon-16-connected.svg -w 16 -h 16 -o icon-16-connected.png
rsvg-convert icon-16-disconnected.svg -w 16 -h 16 -o icon-16-disconnected.png
rsvg-convert icon-16-error.svg -w 16 -h 16 -o icon-16-error.png

echo "Icons generated successfully!"
