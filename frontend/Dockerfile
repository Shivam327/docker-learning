# STAGE 1: Build the React app
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# STAGE 2: Serve with Nginx
FROM nginx:alpine
# We copy to a .template file so envsubst can process it safely
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# This script runs at container startup: 
# It reads the .template, fills in the variables, writes the real .conf, and starts nginx
CMD ["/bin/sh", "-c", "envsubst '\\$BACKEND_HOST \\$MINIO_HOST' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]