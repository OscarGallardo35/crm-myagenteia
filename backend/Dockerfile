FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema (incluye curl para healthcheck)
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    libgomp1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar proyecto
COPY . .

# Colectar archivos estáticos
RUN python manage.py collectstatic --noinput 2>/dev/null || true

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--threads", "2"]
