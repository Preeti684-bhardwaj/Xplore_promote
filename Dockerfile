FROM node:lts-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --production

COPY . .

EXPOSE 9190

CMD ["node", "server.js"]
