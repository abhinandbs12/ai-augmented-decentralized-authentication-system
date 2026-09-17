FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/

RUN npm run build

EXPOSE 3001
CMD ["node", "dist/index.js"]
