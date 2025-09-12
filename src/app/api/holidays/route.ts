import { PrismaClient } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { HolidayService } from "@/services/holiday.service";

const prisma = new PrismaClient();
const holidayService = new HolidayService();

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const year = searchParams.get("year");

    if (!year) {
      return NextResponse.json(
        { error: "Year parameter required" },
        { status: 400 },
      );
    }

    const yearNum = parseInt(year, 10);
    if (Number.isNaN(yearNum) || yearNum < 2020 || yearNum > 2030) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if holidays for this year already exist
    const existingHolidays = await prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        type: "HOLIDAY",
        date: {
          gte: new Date(`${yearNum}-01-01`),
          lte: new Date(`${yearNum}-12-31`),
        },
      },
      select: {
        id: true,
        date: true,
        description: true,
      },
    });

    return NextResponse.json({
      year: yearNum,
      exists: existingHolidays.length > 0,
      count: existingHolidays.length,
      holidays: existingHolidays,
    });
  } catch (error) {
    console.error("Error checking holidays:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("POST /api/holidays - Start");
    const session = await auth();
    console.log("Session:", session?.user?.email);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { year } = body;
    console.log("Requested year:", year);

    if (!year) {
      return NextResponse.json(
        { error: "Year parameter required" },
        { status: 400 },
      );
    }

    const yearNum = parseInt(year, 10);
    if (Number.isNaN(yearNum) || yearNum < 2020 || yearNum > 2030) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if holidays already exist
    const existingHolidays = await prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        type: "HOLIDAY",
        date: {
          gte: new Date(`${yearNum}-01-01`),
          lte: new Date(`${yearNum}-12-31`),
        },
      },
    });

    if (existingHolidays.length > 0) {
      return NextResponse.json({
        message: "Holidays already exist for this year",
        created: 0,
        skipped: existingHolidays.length,
      });
    }

    // Get user settings for weekly work hours
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    const weeklyWorkHours = userSettings?.weeklyWorkHours
      ? Number(userSettings.weeklyWorkHours)
      : 40.0;

    // Calculate daily work hours
    const dailyHours = holidayService.calculateDailyWorkHours(weeklyWorkHours);

    // Fetch holidays from API
    console.log("Fetching holidays from API for year:", yearNum);
    const holidays = await holidayService.fetchHolidaysForYear(yearNum);
    console.log("Fetched holidays:", holidays.length);

    // Create TimeEntry records for each holiday
    let created = 0;
    const errors: string[] = [];

    for (const holiday of holidays) {
      try {
        const date = new Date(holiday.date);
        const { startTime, endTime } = holidayService.generateWorkTimes(
          date,
          dailyHours,
        );

        await prisma.timeEntry.create({
          data: {
            userId: user.id,
            date,
            startTime,
            endTime,
            duration: dailyHours,
            type: "HOLIDAY",
            description: holiday.fname,
          },
        });

        created++;
        console.log(
          `Created holiday entry: ${holiday.fname} on ${holiday.date}`,
        );
      } catch (entryError) {
        const error = `Failed to create holiday entry for ${holiday.date}: ${
          entryError instanceof Error ? entryError.message : "Unknown error"
        }`;
        errors.push(error);
        console.error(error);
      }
    }

    console.log(`Import complete: ${created} holidays created`);
    return NextResponse.json({
      message: `Successfully imported ${created} holidays for ${yearNum}`,
      created,
      errors,
    });
  } catch (error) {
    console.error("Error importing holidays:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
