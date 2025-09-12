import { type NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import {
  getUserSettings,
  resetUserSettings,
  updateUserSettings,
} from "@/services/settings.service";
import { userSettingsUpdateSchema } from "@/types/settings";

/**
 * GET /api/settings
 * Get current user's settings
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Nicht authentifiziert" },
        { status: 401 },
      );
    }

    const settings = await getUserSettings(session.user.id);

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching user settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Fehler beim Abrufen der Einstellungen",
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/settings
 * Update current user's settings
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Nicht authentifiziert" },
        { status: 401 },
      );
    }

    const body = await request.json();

    // Validate the input
    const validatedData = userSettingsUpdateSchema.parse(body);

    const updatedSettings = await updateUserSettings(
      session.user.id,
      validatedData,
    );

    return NextResponse.json({
      success: true,
      data: updatedSettings,
    });
  } catch (error) {
    console.error("Error updating user settings:", error);

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validierungsfehler",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Fehler beim Aktualisieren der Einstellungen",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/settings
 * Reset user settings to defaults
 */
export async function DELETE() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Nicht authentifiziert" },
        { status: 401 },
      );
    }

    const resetSettings = await resetUserSettings(session.user.id);

    return NextResponse.json({
      success: true,
      data: resetSettings,
      message: "Einstellungen wurden auf Standardwerte zurückgesetzt",
    });
  } catch (error) {
    console.error("Error resetting user settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Fehler beim Zurücksetzen der Einstellungen",
      },
      { status: 500 },
    );
  }
}
