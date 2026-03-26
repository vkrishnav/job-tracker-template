#!/bin/bash
#
# Job Tracker Setup Script
#

set -e

echo "💼 Job Tracker Setup"
echo "===================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.8+"
    exit 1
fi
echo "✅ Python 3 found"

# Check pdflatex
if command -v pdflatex &> /dev/null; then
    echo "✅ pdflatex found"
else
    echo "⚠️  pdflatex not found (optional, for PDF compilation)"
    echo "   Install with: brew install --cask mactex"
fi

# Create directories
mkdir -p data tailored-resumes logs
echo "✅ Created directories"

# Config
if [ ! -f "config.json" ]; then
    if [ -f "config.example.json" ]; then
        cp config.example.json config.json
        echo "✅ Created config.json from template"
        echo ""
        echo "📝 NEXT STEPS:"
        echo "   1. Edit config.json with your info"
        echo "   2. Set 'master_resume' to your LaTeX resume path"
        echo "   3. Run: python3 scripts/daily_monitor.py"
    else
        echo "❌ config.example.json not found"
        exit 1
    fi
else
    echo "✅ config.json exists"
fi

# Make scripts executable
chmod +x scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.py 2>/dev/null || true

echo ""
echo "🚀 Setup complete!"
echo ""
echo "Run the tracker:"
echo "  python3 scripts/daily_monitor.py"
echo ""
echo "Start the dashboard:"
echo "  python3 -m http.server 8080"
echo "  Open: http://localhost:8080"
