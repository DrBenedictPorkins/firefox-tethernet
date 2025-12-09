#!/bin/bash
# Validate FoxHole extension before loading

echo "FoxHole Extension Validation"
echo "=============================="
echo ""

# Check if we're in the right directory
if [ ! -f "manifest.json" ]; then
    echo "❌ Error: manifest.json not found"
    echo "   Please run this script from the extension/ directory"
    exit 1
fi

echo "✓ Found manifest.json"

# Check required files
echo ""
echo "Checking required files..."

FILES=(
    "background.js"
    "content.js"
    "popup/popup.html"
    "popup/popup.css"
    "popup/popup.js"
    "devtools/devtools.html"
    "devtools/devtools.js"
    "devtools/panel.html"
    "devtools/panel.css"
    "devtools/panel.js"
)

MISSING=0
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ❌ $file (missing)"
        MISSING=$((MISSING + 1))
    fi
done

# Check icon files
echo ""
echo "Checking icon files..."

ICONS=(
    "icons/icon-16.png"
    "icons/icon-32.png"
    "icons/icon-48.png"
    "icons/icon-96.png"
    "icons/icon-connected-16.png"
    "icons/icon-connected-32.png"
    "icons/icon-connected-48.png"
    "icons/icon-connected-96.png"
)

MISSING_ICONS=0
for icon in "${ICONS[@]}"; do
    if [ -f "$icon" ]; then
        echo "  ✓ $icon"
    else
        echo "  ❌ $icon (missing)"
        MISSING_ICONS=$((MISSING_ICONS + 1))
    fi
done

# Check for web-ext if available
echo ""
if command -v web-ext &> /dev/null; then
    echo "Running web-ext lint..."
    web-ext lint --source-dir=.
else
    echo "⚠ web-ext not found - skipping lint check"
    echo "  Install with: npm install -g web-ext"
fi

# Summary
echo ""
echo "=============================="
if [ $MISSING -eq 0 ] && [ $MISSING_ICONS -eq 0 ]; then
    echo "✓ All checks passed!"
    echo ""
    echo "Next steps:"
    echo "  1. Load in Firefox: about:debugging#/runtime/this-firefox"
    echo "  2. Or use web-ext: web-ext run --source-dir=."
else
    echo "❌ Validation failed"
    if [ $MISSING -gt 0 ]; then
        echo "  $MISSING required file(s) missing"
    fi
    if [ $MISSING_ICONS -gt 0 ]; then
        echo "  $MISSING_ICONS icon file(s) missing"
        echo "  Run: cd icons && ./generate-icons.sh"
    fi
fi
