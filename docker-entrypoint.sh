#!/bin/sh
set -e

echo "Starting database migrations..."

# Run Prisma migrations
prisma migrate deploy

echo "Migrations completed successfully"

# Start the application
exec node server.js