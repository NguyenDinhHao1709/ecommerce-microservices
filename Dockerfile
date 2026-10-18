FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE 8080 5001 5002 5003 5004 5005

CMD ["node", "start-all.js"]
