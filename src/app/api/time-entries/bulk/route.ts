import type { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { overtimeService } from "@/services/overtime.service";
import { EntryType } from "@/types/database";

interface BulkDeleteRequest {
  ids?: string[];
  dateRange?: {
    from: string;
    to: string;
  };
  filters?: {
    type?: EntryType;
    search?: string;
    projectName?: string;
  };
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: BulkDeleteRequest = await request.json();
    const { ids, dateRange, filters } = body;

    // Build where clause for bulk delete
    const where: Prisma.TimeEntryWhereInput = {
      userId: session.user.id,
    };

    let deleteCount = 0;

    if (ids && ids.length > 0) {
      // Delete specific entries by IDs
      if (ids.length > 1000) {
        return NextResponse.json(
          {
            error:
              "Too many entries. Maximum 1000 entries allowed per bulk operation",
          },
          { status: 400 },
        );
      }

      where.id = { in: ids };
    } else if (dateRange) {
      // Delete by date range
      where.date = {
        gte: new Date(dateRange.from),
        lte: new Date(dateRange.to),
      };

      // Apply additional filters
      if (filters?.type) {
        where.type = filters.type;
      }
      if (filters?.search) {
        where.description = {
          contains: filters.search,
          mode: "insensitive",
        };
      }
      if (filters?.projectName) {
        // For simplicity, use projectName OR search, not both
        where.description = {
          contains: filters.projectName,
          mode: "insensitive",
        };
      }
    } else {
      return NextResponse.json(
        { error: "Either 'ids' or 'dateRange' must be provided" },
        { status: 400 },
      );
    }

    // Safety check: Count entries before deleting
    const countResult = await prisma.timeEntry.count({ where });

    if (countResult === 0) {
      return NextResponse.json({
        message: "No entries found matching criteria",
        deletedCount: 0,
      });
    }

    // Safety limit
    if (countResult > 1000) {
      return NextResponse.json(
        {
          error:
            "Too many entries match criteria. Maximum 1000 entries allowed per bulk operation",
        },
        { status: 400 },
      );
    }

    // Perform the bulk delete
    const deleteResult = await prisma.timeEntry.deleteMany({ where });
    deleteCount = deleteResult.count;

    // Invalidiere Overtime Cache nach Bulk Delete
    overtimeService.invalidateCache(session.user.id);

    return NextResponse.json({
      message: `Successfully deleted ${deleteCount} time entries`,
      deletedCount: deleteCount,
    });
  } catch (error) {
    console.error("Error in bulk delete:", error);
    return NextResponse.json(
      { error: "Failed to delete entries" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const type = searchParams.get("type") as EntryType | null;
    const search = searchParams.get("search") || "";
    const projectName = searchParams.get("projectName");

    // Build where clause for preview
    const where: Prisma.TimeEntryWhereInput = {
      userId: session.user.id,
    };

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        where.date.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo);
      }
    }

    if (type && Object.values(EntryType).includes(type)) {
      where.type = type;
    }

    if (search) {
      where.description = {
        contains: search,
        mode: "insensitive",
      };
    }

    if (projectName) {
      where.description = {
        contains: projectName,
        mode: "insensitive",
      };
    }

    // Get count and preview of entries that would be deleted
    const count = await prisma.timeEntry.count({ where });
    const preview = await prisma.timeEntry.findMany({
      where,
      select: {
        id: true,
        date: true,
        duration: true,
        type: true,
        description: true,
      },
      take: 10, // Preview first 10 entries
      orderBy: { date: "desc" },
    });

    return NextResponse.json({
      count,
      preview,
      warning:
        count > 100
          ? "This operation will delete many entries. Please confirm."
          : null,
    });
  } catch (error) {
    console.error("Error in bulk delete preview:", error);
    return NextResponse.json(
      { error: "Failed to preview bulk delete" },
      { status: 500 },
    );
  }
}
