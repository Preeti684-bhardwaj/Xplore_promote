FROM node:lts-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --production

COPY . .

EXPOSE 9191

CMD ["node", "server.js"]
