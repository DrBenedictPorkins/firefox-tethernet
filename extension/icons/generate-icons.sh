#!/bin/bash
# Generate PNG icons from SVG sources

cd "$(dirname "$0")"

# Generate normal icons
rsvg-convert icon.svg -w 16 -h 16 -o icon-16.png
rsvg-convert icon.svg -w 32 -h 32 -o icon-32.png
rsvg-convert icon.svg -w 48 -h 48 -o icon-48.png
rsvg-convert icon.svg -w 96 -h 96 -o icon-96.png

# Generate connected state icons
rsvg-convert icon-connected.svg -w 16 -h 16 -o icon-connected-16.png
rsvg-convert icon-connected.svg -w 32 -h 32 -o icon-connected-32.png
rsvg-convert icon-connected.svg -w 48 -h 48 -o icon-connected-48.png
rsvg-convert icon-connected.svg -w 96 -h 96 -o icon-connected-96.png

echo "Icons generated successfully!"
