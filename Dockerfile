FROM node:20-alpine
WORKDIR /usr/src/app

# Sagt dem Code: "Du läufst jetzt live auf dem Server."
# -> npm install überspringt Entwicklungs-Pakete wie nodemon
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install

# Kopiert Server-Code und den public Ordner
COPY . .

EXPOSE 3001

# Startbefehl für den Server: dasselbe wie "npm start", nur direkt mit node.
# Stürzt der Server ab, startet Docker ihn automatisch neu.
# (Lokal auf dem PC weiterhin "npm run dev" mit nodemon benutzen!)
CMD ["node", "server.js"]
