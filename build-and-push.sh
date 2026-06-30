#!/bin/bash

# Exit immediately if any command fails
set -e

# ==========================================
# Configuration: Update your username here!
# ==========================================
DOCKER_USERNAME="shivamthaker369"
BACKEND_IMAGE="docker-volume-backend"
FRONTEND_IMAGE="docker-volume-frontend"
TAG="latest" # Default tag

# Allow passing a custom tag as an argument (e.g., ./build-and-push.sh v1.0.0)
if [ -n "$1" ]; then
  TAG="$1"
fi

BACKEND_FULL_PATH="$DOCKER_USERNAME/$BACKEND_IMAGE:$TAG"
FRONTEND_FULL_PATH="$DOCKER_USERNAME/$FRONTEND_IMAGE:$TAG"

echo "========================================"
echo " 🚀 Preparing to build and push"
echo " 📦 Tags: $TAG"
echo "========================================"

# Step 1: Ensure you are logged in
echo "🔑 Verifying Docker Hub authentication..."
if ! docker info | grep -q "Username: $DOCKER_USERNAME"; then
    echo "You are not logged in as $DOCKER_USERNAME. Logging in now..."
    docker login -u "$DOCKER_USERNAME"
fi

# Step 2: Build the Backend (points to ./backend folder)
echo "🛠️  Building Backend..."
docker build -t "$BACKEND_FULL_PATH" ./backend

# Step 3: Build the Frontend (points to ./frontend folder)
echo "🛠️  Building Frontend..."
docker build -t "$FRONTEND_FULL_PATH" ./frontend

# Step 4: Push the Images
echo "⬆️  Pushing Backend to Docker Hub..."
docker push "$BACKEND_FULL_PATH"

echo "⬆️  Pushing Frontend to Docker Hub..."
docker push "$FRONTEND_FULL_PATH"

echo "========================================"
echo "✅ Success! Both images pushed:"
echo "👉 $BACKEND_FULL_PATH"
echo "👉 $FRONTEND_FULL_PATH"
echo "========================================"