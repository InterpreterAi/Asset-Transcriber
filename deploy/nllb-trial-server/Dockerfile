FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

ENV NLLB_MODEL_ID=facebook/nllb-200-distilled-600M
ENV NLLB_MAX_INPUT_CHARS=512
ENV NLLB_MAX_NEW_TOKENS=256
ENV NLLB_NUM_BEAMS=1

EXPOSE 5000

# Single worker — concurrency 1 (matches trial-hetzner gate + 4GB RAM budget).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "1"]
