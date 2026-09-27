FROM node:22-bookworm

# Xvfb provides a virtual display so Chromium can run in real (non-headless)
# mode with no actual monitor attached -- needed because this target site
# specifically detects and blocks true headless Chromium.
RUN apt-get update && apt-get install -y xvfb && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install --with-deps chromium
COPY . .

ENV DISPLAY=:99
ENV PORT=3001
EXPOSE 3001

# Start a virtual display on :99, then the server -- Chromium renders into
# the virtual display instead of needing a real GUI.
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x720x24 & sleep 1 && node src/server.js"]