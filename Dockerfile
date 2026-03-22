FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src/ ./src/

EXPOSE 8080

CMD ["node", "src/server.js"]