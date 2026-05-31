FROM python:3.10-slim

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download TextBlob corpora during build
RUN python -m textblob.download_corpora

# Copy backend code
COPY . .

# Expose port for Flask
EXPOSE 5000

# Default command (overridden in docker-compose for celery)
CMD ["gunicorn", "-b", "0.0.0.0:5000", "--timeout", "120", "app:app"]
