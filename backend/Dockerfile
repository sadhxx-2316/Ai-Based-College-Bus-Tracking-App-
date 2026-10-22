# Backend Dockerfile - Production Multi-Stage Build
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies in virtualenv
COPY requirements.txt .
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# Final runtime image
FROM python:3.12-slim AS runner

WORKDIR /app

# Create non-root system user for security
RUN groupadd -g 1001 appuser && \
    useradd -u 1001 -g appuser -s /bin/bash -m appuser

# Copy virtualenv from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=8000

# Copy backend source code & initialize cache directory
COPY app ./app
RUN mkdir -p /app/model_cache

# Ensure non-root user permissions
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request, os; p = os.environ.get('PORT', '8000'); urllib.request.urlopen(f'http://localhost:{p}/api/health')" || exit 1

# Launch production server with dynamic port support (Render/Cloud $PORT with fallback to 8000)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips=*"]
