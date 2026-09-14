FROM node:20-alpine

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend ./
COPY frontend ../frontend

ENV PORT=3100
ENV NODE_ENV=production
VOLUME ["/app/data"]
EXPOSE 3100

# Supervisor passes these automatically when building a Home Assistant Add-on
# locally from this Dockerfile; harmless (unset) for a plain `docker build`.
ARG BUILD_VERSION
ARG BUILD_ARCH
LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

CMD ["node", "src/server.js"]
