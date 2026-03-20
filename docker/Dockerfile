FROM node:20-slim

# Install ffmpeg and yt-dlp dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV YT_DLP_BIN=/usr/local/bin/yt-dlp
ENV FFMPEG_BIN=/usr/bin/ffmpeg
ENV WEB_PORT=3000
# 대기열 상태, 로그 등 영구 데이터 저장 경로
# 호스트 바인드 마운트 예시: -v /호스트/경로:/root/.nambi
VOLUME ["/root/.nambi"]

EXPOSE 3000

RUN date -u '+%Y-%m-%d %H:%M UTC' > /app/.image-tag
RUN chmod +x /app/docker/entrypoint.sh

ENTRYPOINT ["/app/docker/entrypoint.sh"]
