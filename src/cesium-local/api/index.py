import sys
import os

# Make the cesium-local directory importable so `from backend import create_app` works
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend import create_app

app = create_app()
