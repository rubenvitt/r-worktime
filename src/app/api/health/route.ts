import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Ensure Prisma runs on Node runtime and route is always dynamic
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Basic database connectivity check
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: "database_unavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
