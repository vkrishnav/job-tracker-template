#!/bin/bash
#
# Compile all LaTeX resumes to PDF
# Usage: ./scripts/compile_pdfs.sh [date]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"
DATE_DIR="${1:-$(date +%Y-%m-%d)}"
RESUME_DIR="$BASE_DIR/tailored-resumes/$DATE_DIR"

if [ ! -d "$RESUME_DIR" ]; then
    echo "No resume directory found: $RESUME_DIR"
    echo "Run the scraper first: python3 scripts/daily_monitor.py"
    exit 1
fi

# Check for pdflatex
if ! command -v pdflatex &> /dev/null; then
    echo "pdflatex not found. Install MacTeX:"
    echo "  brew install --cask mactex"
    exit 1
fi

cd "$RESUME_DIR"

echo "Compiling PDFs in $RESUME_DIR"
echo ""

count=0
for tex_file in *.tex; do
    if [ -f "$tex_file" ]; then
        echo "Compiling: $tex_file"
        pdflatex -interaction=nonstopmode "$tex_file" > /dev/null 2>&1
        pdflatex -interaction=nonstopmode "$tex_file" > /dev/null 2>&1
        
        pdf_file="${tex_file%.tex}.pdf"
        if [ -f "$pdf_file" ]; then
            echo "  ✅ $pdf_file"
            ((count++))
        else
            echo "  ❌ Failed"
        fi
    fi
done

# Cleanup
rm -f *.aux *.log *.out 2>/dev/null

echo ""
echo "Done! Compiled $count PDFs."
