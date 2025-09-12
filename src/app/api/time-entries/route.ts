import type { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { overtimeService } from "@/services/overtime.service";
import { EntryType } from "@/types/database";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") as EntryType | null;
    const sortBy = searchParams.get("sortBy") || "date";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const projectName = searchParams.get("projectName");

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.TimeEntryWhereInput = {
      userId: session.user.id,
    };

    // Search in description
    if (search) {
      where.description = {
        contains: search,
        mode: "insensitive",
      };
    }

    // Filter by entry type
    if (type && Object.values(EntryType).includes(type)) {
      where.type = type;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        where.date.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo);
      }
    }

    // Project name filter (search in description for now)
    if (projectName) {
      where.description = {
        contains: projectName,
        mode: "insensitive",
      };
    }

    // Build orderBy clause
    const orderBy: Prisma.TimeEntryOrderByWithRelationInput = {};
    if (sortBy === "date") {
      orderBy.date = sortOrder as Prisma.SortOrder;
    } else if (sortBy === "duration") {
      orderBy.duration = sortOrder as Prisma.SortOrder;
    } else if (sortBy === "type") {
      orderBy.type = sortOrder as Prisma.SortOrder;
    } else if (sortBy === "createdAt") {
      orderBy.createdAt = sortOrder as Prisma.SortOrder;
    } else if (sortBy === "startTime") {
      orderBy.startTime = sortOrder as Prisma.SortOrder;
    } else {
      orderBy.date = "desc"; // fallback
    }

    // Get total count
    const totalCount = await prisma.timeEntry.count({ where });

    // Get entries
    const entries = await prisma.timeEntry.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        duration: true,
        type: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      entries,
      totalCount,
      page,
      limit,
      totalPages,
    });
  } catch (error) {
    console.error("Error fetching time entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch time entries" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { date, startTime, endTime, duration, type, description } = body;

    // Basic validation
    if (!date || !startTime || !endTime || !duration || !type) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: date, startTime, endTime, duration, type",
        },
        { status: 400 },
      );
    }

    // Validate type
    if (!Object.values(EntryType).includes(type)) {
      return NextResponse.json(
        {
          error: `Invalid type. Must be one of: ${Object.values(EntryType).join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Convert to proper Date objects
    const entryDate = new Date(date);
    const entryStartTime = new Date(startTime);
    const entryEndTime = new Date(endTime);

    // Validate dates
    if (
      Number.isNaN(entryDate.getTime()) ||
      Number.isNaN(entryStartTime.getTime()) ||
      Number.isNaN(entryEndTime.getTime())
    ) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 },
      );
    }

    // Validate duration is positive
    if (duration <= 0) {
      return NextResponse.json(
        { error: "Duration must be positive" },
        { status: 400 },
      );
    }

    // Check for duplicate entries (same user, date, startTime)
    const existingEntry = await prisma.timeEntry.findFirst({
      where: {
        userId: session.user.id,
        date: entryDate,
        startTime: entryStartTime,
      },
    });

    if (existingEntry) {
      return NextResponse.json(
        { error: "Entry with same date and start time already exists" },
        { status: 409 },
      );
    }

    // Create the time entry
    const newEntry = await prisma.timeEntry.create({
      data: {
        userId: session.user.id,
        date: entryDate,
        startTime: entryStartTime,
        endTime: entryEndTime,
        duration: duration,
        type: type as EntryType,
        description: description || null,
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        duration: true,
        type: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Invalidiere Overtime Cache nach neuer Time Entry
    overtimeService.invalidateCache(session.user.id);

    return NextResponse.json(newEntry, { status: 201 });
  } catch (error) {
    console.error("Error creating time entry:", error);
    return NextResponse.json(
      { error: "Failed to create time entry" },
      { status: 500 },
    );
  }
}
