"""Entry point for the PyInstaller-frozen backend (see `npm run python:build`).

app/main.py uses package-relative imports, so it can't be the frozen script
itself; this wrapper imports it as a package and starts uvicorn the same way
its __main__ block does.
"""

import argparse

import uvicorn

from app.main import app

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=58090)
    args = parser.parse_args()

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
