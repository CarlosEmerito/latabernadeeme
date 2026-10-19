#!/usr/bin/env python3
"""Descarga los SRD en español y genera los flujos de líneas.

Uso:
    python3 tools/ingest/descargar.py            # descarga y convierte
    python3 tools/ingest/descargar.py --solo-flujo

Los PDF se guardan en `.cache/srd/` y los flujos en `.cache/srd/work/`.
Nada de eso se versiona: en el repositorio solo vive el resultado (`data/`).
"""
from __future__ import annotations

import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rutas import CACHE, SRD, WORK  # noqa: E402

AQUI = Path(__file__).resolve().parent


def descargar(url: str, destino: Path) -> None:
    if destino.exists() and destino.stat().st_size > 1_000_000:
        print(f"  ya existe {destino.name} ({destino.stat().st_size / 1e6:.1f} MB)")
        return
    print(f"  descargando {url.split('/')[-1]}…")
    destino.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r, destino.open("wb") as fh:
        fh.write(r.read())
    print(f"  {destino.name}: {destino.stat().st_size / 1e6:.1f} MB")


def main() -> int:
    solo_flujo = "--solo-flujo" in sys.argv
    CACHE.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)

    for version, datos in SRD.items():
        pdf = CACHE / datos["fichero"]
        flujo = WORK / datos["flujo"]
        print(f"SRD {version}")
        if not solo_flujo:
            descargar(datos["pdf"], pdf)
        if flujo.exists() and "--forzar" not in sys.argv:
            print(f"  flujo ya generado: {flujo.name}")
            continue
        subprocess.run(
            [sys.executable, str(AQUI / "pdf_stream.py"), str(pdf), str(flujo)], check=True
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
