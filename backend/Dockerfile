FROM node:20-alpine

WORKDIR /app

# Install OpenSSL so Prisma can detect the correct
# Alpine/OpenSSL version and use the compatible query engine.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]
