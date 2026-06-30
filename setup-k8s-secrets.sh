#!/bin/bash

# Ensure we have a .env file
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
fi

echo "🔑 Reading secrets from .env and creating K8s Secret..."

# We use 'set -a' to export all variables in the .env file, 
# then read them. This is a safe way to handle the file content.
export $(grep -v '^#' .env | xargs)

# Create the secret using the variables loaded into the current shell
# ... (inside your script)
kubectl create secret generic app-secrets \
  --from-literal=DB_PASSWORD=$DB_PASSWORD \
  --from-literal=DB_USER=$DB_USER \
  --from-literal=S3_ACCESS_KEY=$S3_ACCESS_KEY \
  --from-literal=S3_SECRET_KEY=$S3_SECRET_KEY \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Secrets successfully injected into the cluster."