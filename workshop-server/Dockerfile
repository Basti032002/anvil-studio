FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
ENV DATA_DIR=/data PORT=8787
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "src/server.js"]
