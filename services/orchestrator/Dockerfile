FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/
COPY migrations/ ./migrations/

RUN npm run build

EXPOSE 3001
CMD ["node", "dist/index.js"]
