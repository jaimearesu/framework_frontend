FROM node:20-alpine
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

# Kopiert Server-Code und den public Ordner
COPY . .

EXPOSE 3001
CMD ["npm", "run", "dev"]