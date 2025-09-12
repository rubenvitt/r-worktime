import type { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.TimeEntryWhereInput = {
      userId: session.user.id,
    };

    if (search) {
      where.description = {
        contains: search,
        mode: "insensitive",
      };
    }

    if (type && Object.values(EntryType).includes(type)) {
      where.type = type;
    }

    // Build orderBy clause
    const orderBy: Prisma.TimeEntryOrderByWithRelationInput = {};
    if (sortBy === "date") {
      orderBy.date = sortOrder as Prisma.SortOrder;
    } else if (sortBy === "duration") {
      orderBy.duration = sortOrder as Prisma.SortOrder;
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
