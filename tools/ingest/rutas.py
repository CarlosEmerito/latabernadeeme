"""Rutas compartidas del proceso de extracción.

Los PDF y los flujos intermedios viven en `.cache/srd/`, fuera de git: no tiene
sentido versionar 16 MB de PDF cuando el texto ya está convertido en `data/`.
Se puede cambiar con la variable de entorno `SRD_CACHE`.
"""
from __future__ import annotations

import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ.get("SRD_CACHE", RAIZ / ".cache" / "srd")).expanduser()
WORK = CACHE / "work"
DATOS = RAIZ / "data"

SRD = {
    "5.1": {
        "pdf": "https://media.dndbeyond.com/compendium-images/srd/5.1/SRD_CC_v5.1_ES.pdf",
        "fichero": "srd-5.1-es.pdf",
        "flujo": "e51.jsonl",
    },
    "5.2.1": {
        "pdf": "https://media.dndbeyond.com/compendium-images/srd/5.2/SP_SRD_CC_v5.2.1.pdf",
        "fichero": "srd-5.2.1-es.pdf",
        "flujo": "e52.jsonl",
    },
}
