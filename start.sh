#!/bin/bash
# Quick Start Script for JANET Chat

echo "🚀 Starting JANET Chat Backend..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 14+ first."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "✅ Starting server on port 3000..."
echo "📍 Open browser to: http://localhost:3000"
echo ""
echo "To stop the server, press Ctrl+C"
echo ""

npm start
