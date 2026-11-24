#!/usr/bin/env bash
# One-time setup for Jarvis on macOS / Linux (run from the JARVIS folder)
set -e
cd backend
rm -rf venv
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cd ../frontend
npm install
echo "Setup finished. Start backend:  cd backend && source venv/bin/activate && uvicorn main:app --reload"
echo "Start frontend:                 cd frontend && npm run dev"
