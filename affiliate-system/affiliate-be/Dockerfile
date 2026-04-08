FROM node:lts-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production && npm cache clean --force
COPY . /app

CMD ["node","index.js"]

