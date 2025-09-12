import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { includeSettings = true } = body;

    // Get all user data
    const [user, userSettings, timeEntries] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      }),
      includeSettings
        ? prisma.userSettings.findUnique({
            where: { userId: session.user.id },
          })
        : null,
      prisma.timeEntry.findMany({
        where: { userId: session.user.id },
        orderBy: { date: "asc" },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Calculate statistics for the backup
    const stats = {
      totalEntries: timeEntries.length,
      dateRange:
        timeEntries.length > 0
          ? {
              first: timeEntries[0].date,
              last: timeEntries[timeEntries.length - 1].date,
            }
          : null,
      entryTypes: timeEntries.reduce(
        (acc, entry) => {
          acc[entry.type] = (acc[entry.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      totalHours: timeEntries.reduce(
        (sum, entry) => sum + parseFloat(entry.duration.toString()),
        0,
      ),
    };

    // Create backup data structure
    const backup = {
      backupInfo: {
        version: "1.0",
        format: "r-worktime-backup",
        created: new Date().toISOString(),
        userId: user.id,
        statistics: stats,
      },
      userData: {
        profile: user,
        settings: userSettings,
        entries: timeEntries.map((entry) => ({
          id: entry.id,
          date: entry.date.toISOString(),
          startTime: entry.startTime.toISOString(),
          endTime: entry.endTime.toISOString(),
          duration: entry.duration.toString(),
          type: entry.type,
          description: entry.description,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        })),
      },
    };

    // Return the backup as JSON download
    const filename = `r-worktime-backup-${user.email.split("@")[0]}-${new Date().toISOString().split("T")[0]}.json`;

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Error creating backup:", error);
    return NextResponse.json(
      { error: "Failed to create backup" },
      { status: 500 },
    );
  }
}

// GET endpoint for backup info/stats
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get backup statistics
    const [entryCount, oldestEntry, newestEntry] = await Promise.all([
      prisma.timeEntry.count({ where: { userId: session.user.id } }),
      prisma.timeEntry.findFirst({
        where: { userId: session.user.id },
        orderBy: { date: "asc" },
        select: { date: true },
      }),
      prisma.timeEntry.findFirst({
        where: { userId: session.user.id },
        orderBy: { date: "desc" },
        select: { date: true },
      }),
    ]);

    const hasSettings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      stats: {
        totalEntries: entryCount,
        hasSettings: !!hasSettings,
        dateRange:
          oldestEntry && newestEntry
            ? {
                from: oldestEntry.date,
                to: newestEntry.date,
              }
            : null,
        estimatedSize: `${Math.ceil(entryCount / 100)} KB`, // Rough estimate
      },
      canBackup: true,
    });
  } catch (error) {
    console.error("Error getting backup info:", error);
    return NextResponse.json(
      { error: "Failed to get backup info" },
      { status: 500 },
    );
  }
}
