
# Dockerized Full-Stack Application 

A production-ready, 3-tier web application architecture (React, Node.js/Express, PostgreSQL) fully containerized using Docker. 

This repository serves as an interactive learning tool to demonstrate advanced DevOps concepts, including data persistence, internal Docker networking, environment segregation, and multi-stage builds.

---

## ✨ Features

* **Frontend (React/Vite & Tailwind CSS):** A modern UI using Vite. In production, it is built into static files and served via a highly optimized **Nginx** reverse proxy.
* **Backend (Node.js/Express):** A RESTful API that handles file uploads (`multer`) and database interactions (`pg`).
* **Database (PostgreSQL):** A relational database that initializes automatically on the first boot and utilizes Docker healthchecks to prevent microservice race conditions.
* **Secure Networking:** Backend and Database ports are completely isolated from the host machine in production, routed securely through Nginx.
* **Secret Management:** Environment configurations and database credentials are injected securely via `.env` files.

---

## 🚀 Getting Started

### 1. Prerequisites
You must have [Docker](https://www.docker.com/) and Docker Compose installed on your machine.

### 2. Configure Environment Variables
Before running the application, you must configure your environment secrets. Create a file named `.env` in the root directory:

```text
# Database Credentials
DB_USER=demo_user
DB_PASSWORD=super_secret_demo_password
DB_NAME=demo_db

# Backend Variables
GREETING_TEXT="Hello from the Secure Env File!"

```

> **Security Note:** Ensure your `.env` file is added to both `.gitignore` and `.dockerignore` so credentials are never committed to version control.

---

## 💻 Running the Environments

This project includes two distinct configurations to demonstrate the difference between Developer Experience (DevEx) and Production Security.

### Option A: Development Environment

Uses bind mounts for live code-reloading, exposes all ports for local database debugging, and utilizes the Vite development server.

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

* **Frontend UI:** http://localhost:5173
* **Backend API:** http://localhost:3000/api/greeting
* **Database:** localhost:5432

### Option B: Production Environment

Mimics a real-world secure deployment. The database and backend ports are completely hidden from the host machine. **Nginx** acts as the singular entry point (Port 80) and reverse proxy.

```bash
docker compose up --build
```

* **Application Entry:** http://localhost (Port 80)
* **Backend & DB:** Hidden securely inside the internal Docker network.

---

## 🧪 Testing Data Persistence (The "Broken Link" Demo)

To understand how Docker volumes protect data, perform this experiment:

1. Start the application and navigate to the UI.
2. Upload a file. This saves the physical file to the container's hard drive and writes a record of it to the Postgres database.
3. Verify the file exists by clicking "Download".
4. In your terminal, completely destroy the containers and their ephemeral storage:
```bash
docker compose down

```


5. Rebuild and restart the containers:
```bash
docker compose up -d

```


6. Refresh the UI. You will see the database record still exists (because Postgres uses a persistent named volume: `pgdata`).
7. Click "Download" again. **It will fail.** The actual file was stored in the container's ephemeral storage, which was wiped out.

*To fix this and make file uploads survive restarts, ensure the `app_uploads:/app/uploads` volume is configured in your `docker-compose.yml`!*

---

## 📂 Directory Structure

```text
.
├── docker-compose.yml           # Development configuration
├── docker-compose.prod.yml      # Production configuration
├── .env                         # Secrets & Environment variables
├── backend/
│   ├── Dockerfile               # Node.js dev build
│   ├── Dockerfile.prod          # Node.js production build
│   ├── server.js                # Express API & Postgres logic
│   └── package.json
└── frontend/
    ├── Dockerfile               # Vite dev build
    ├── Dockerfile.prod          # Multi-stage build (Node -> Nginx)
    ├── nginx.conf               # Nginx reverse proxy routing rules
    ├── src/                     # React application code (Tailwind)
    └── package.json

```
