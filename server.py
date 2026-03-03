"""
Lightweight dev entrypoint.
Usage:
    python server.py           # run on 127.0.0.1:5000 without debugger
    PORT=8000 python server.py # override port
    FLASK_DEBUG=1 python server.py  # reload enabled, debugger disabled (safer for sandboxed envs)
"""
import argparse
import os
import pathlib
import sys

BASE_DIR = pathlib.Path(__file__).resolve().parent
APP_DIR = BASE_DIR / "src" / "cesium-local"

# Ensure the backend package is importable
sys.path.insert(0, str(APP_DIR))

from backend import create_app  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Run Solar ROI dev server")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 5000)))
    args = parser.parse_args()

    # Keep relative paths (e.g., .env, static) consistent
    os.chdir(APP_DIR)

    debug_flag = str(os.environ.get("FLASK_DEBUG", "0")).lower() in {"1", "true", "yes"}
    reload_flag = debug_flag

    app = create_app()

    # Disable Werkzeug debugger to avoid shared-memory errors in restricted environments.
    app.run(
        host=args.host,
        port=args.port,
        debug=debug_flag,
        use_debugger=False,
        use_reloader=reload_flag,
    )


if __name__ == "__main__":
    main()
