#!/bin/sh
set -e

echo "Starting database migrations..."

# Run Prisma migrations (projekteigenes CLI, nicht global — siehe Dockerfile)
./node_modules/.bin/prisma migrate deploy

echo "Migrations completed successfully"

# Start the application
exec node server.js