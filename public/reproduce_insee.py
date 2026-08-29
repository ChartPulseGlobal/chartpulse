#!/usr/bin/env python3
"""Rebuild the exact compact official dataset used by Laboratoire INSEE."""
from __future__ import annotations
import subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts"/"prepare_official_observations.py"
if __name__=="__main__":
    raise SystemExit(subprocess.call([sys.executable,str(SCRIPT),"--force"],cwd=ROOT))
