FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY requirements.txt requirements-saas.txt ./
RUN pip install -r requirements.txt -r requirements-saas.txt \
    && useradd --system --uid 10001 --home /app studyai

# --chown on COPY instead of `chown -R` afterwards, which would duplicate the code in a second layer.
COPY --chown=studyai:studyai . .
# /app itself too: self_hosted keeps its default SQLite file (studyai.db) next to the code.
RUN mkdir -p storage/uploads storage/chroma && chown studyai:studyai . storage storage/uploads storage/chroma
USER studyai

EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=4).status == 200 else 1)"

# En saas el esquema es de Alembic: `upgrade head` (idempotente) antes de arrancar; init_db solo siembra datos.
CMD ["sh", "-c", "if [ \"$DEPLOYMENT_MODE\" = \"saas\" ]; then alembic upgrade head; fi && exec uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1 --proxy-headers"]
