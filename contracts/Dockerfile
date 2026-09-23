FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json hardhat.config.ts ./
COPY contracts/ ./contracts/
COPY scripts/ ./scripts/
COPY test/ ./test/

RUN npx hardhat compile

EXPOSE 8545
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0"]
