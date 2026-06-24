"""
NLLB translation server (CPU) — LibreTranslate-compatible POST /translate.

Loads facebook/nllb-200-distilled-1.3B with dynamic int8 Linear quantization on CPU.

API env:
  TRIAL_HETZNER_NLLB_BASE — trial-hetzner (all segments)
  NLLB_PAID_BASE — paid machine plans, Arabic pairs only (hetzner-translate.ts)
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("nllb-mt")

MODEL_ID = os.environ.get("NLLB_MODEL_ID", "facebook/nllb-200-distilled-1.3B").strip()
MAX_INPUT_CHARS = int(os.environ.get("NLLB_MAX_INPUT_CHARS", "512"))
MAX_NEW_TOKENS = int(os.environ.get("NLLB_MAX_NEW_TOKENS", "256"))
NUM_BEAMS = int(os.environ.get("NLLB_NUM_BEAMS", "1"))

# ISO 639-1 (Libre LT_LOAD_ONLY + common workspace codes) → NLLB-200 FLORES tag
LANG_TO_NLLB: dict[str, str] = {
    "en": "eng_Latn",
    "es": "spa_Latn",
    "fr": "fra_Latn",
    "de": "deu_Latn",
    "it": "ita_Latn",
    "pt": "por_Latn",
    "ru": "rus_Cyrl",
    "ar": "arb_Arab",
    "zh": "zho_Hans",
    "hi": "hin_Deva",
    "tr": "tur_Latn",
    "pl": "pol_Latn",
    "nl": "nld_Latn",
}

# Preserve server-side glossary/number placeholders through NLLB.
PLACEHOLDER_RE = re.compile(r"\b(?:NUM|TERM|PROT)_\d+\b")

app = FastAPI(title="InterpreterAI NLLB MT", version="1.1.0")

_tokenizer: AutoTokenizer | None = None
_model: Any = None
_translate_lock = asyncio.Lock()


def normalize_lang(code: str) -> str:
    raw = (code or "").strip().lower()
    base = raw.split("-")[0]
    if base == "iw":
        return "he"
    if raw in ("zh-tw", "zh-hant"):
        return "zh"
    if raw in ("zh-cn", "zh-hans"):
        return "zh"
    return base


def to_nllb(code: str) -> str:
    base = normalize_lang(code)
    if base == "auto":
        raise HTTPException(
            status_code=400,
            detail="NLLB worker requires explicit source language (not 'auto')",
        )
    tag = LANG_TO_NLLB.get(base)
    if not tag:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {code}")
    return tag


def load_model() -> None:
    global _tokenizer, _model
    if _model is not None:
        return
    log.info("Loading NLLB model %s on CPU (this takes several minutes on first boot)", MODEL_ID)
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    _model = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    _model.eval()
    _model = torch.quantization.quantize_dynamic(
        _model,
        {torch.nn.Linear},
        dtype=torch.qint8,
    )
    log.info("NLLB model ready (CPU, dynamic int8 Linear)")


def protect_placeholders(text: str) -> tuple[str, dict[str, str]]:
    slots: dict[str, str] = {}

    def repl(m: re.Match[str]) -> str:
        key = f"__PH{len(slots)}__"
        slots[key] = m.group(0)
        return key

    return PLACEHOLDER_RE.sub(repl, text), slots


def restore_placeholders(text: str, slots: dict[str, str]) -> str:
    out = text
    for key, literal in slots.items():
        out = out.replace(key, literal)
    return out


def translate_once(text: str, src_nllb: str, tgt_nllb: str) -> str:
    assert _tokenizer is not None and _model is not None
    protected, slots = protect_placeholders(text)
    _tokenizer.src_lang = src_nllb
    inputs = _tokenizer(protected, return_tensors="pt", truncation=True, max_length=MAX_INPUT_CHARS)
    forced_bos = _tokenizer.convert_tokens_to_ids(tgt_nllb)
    with torch.inference_mode():
        out_ids = _model.generate(
            **inputs,
            forced_bos_token_id=forced_bos,
            max_new_tokens=MAX_NEW_TOKENS,
            num_beams=NUM_BEAMS,
            do_sample=False,
        )
    decoded = _tokenizer.batch_decode(out_ids, skip_special_tokens=True)[0]
    return restore_placeholders(decoded.strip(), slots)


class TranslateBody(BaseModel):
    q: str = Field(..., min_length=0)
    source: str = "en"
    target: str = "ar"
    format: str = "text"


@app.on_event("startup")
async def startup() -> None:
    load_model()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_ID}


@app.post("/translate")
async def translate(body: TranslateBody) -> dict[str, str]:
    text = (body.q or "").strip()
    if not text:
        return {"translatedText": ""}

    src_nllb = to_nllb(body.source)
    tgt_nllb = to_nllb(body.target)

    async with _translate_lock:
        try:
            out = await asyncio.to_thread(translate_once, text, src_nllb, tgt_nllb)
        except Exception as exc:
            log.exception("NLLB translate failed")
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    if not out.strip():
        raise HTTPException(status_code=503, detail="NLLB returned empty translation")
    return {"translatedText": out}


@app.get("/languages")
async def languages() -> list[dict[str, str]]:
    return [{"code": k, "name": v} for k, v in sorted(LANG_TO_NLLB.items())]
