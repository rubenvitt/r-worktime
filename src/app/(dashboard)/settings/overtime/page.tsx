"use client";

import { CalendarPlus, Info } from "lucide-react";
import { useState } from "react";
import { BulkFillDialog } from "@/components/settings/bulk-fill-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function OvertimeSettingsPage() {
  const [bulkFillOpen, setBulkFillOpen] = useState(false);

  return (
    <div className="container max-w-2xl py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Überstunden-Einstellungen</h1>
        <p className="text-muted-foreground">
          Verwalte deine Arbeitszeiten und Überstunden
        </p>
      </div>

      {/* Bulk-Fill Funktion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" />
            Arbeitstage automatisch befüllen
          </CardTitle>
          <CardDescription>
            Fülle alle Arbeitstage in einem Zeitraum mit Standard-Arbeitszeiten.
            Perfekt zum Nachtragen historischer Arbeitszeiten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Tipp:</strong> Nutze diese Funktion, um schnell
              historische Arbeitszeiten nachzutragen. Du kannst z.B. alle
              Arbeitstage vom 1. Januar bis zu deinem ersten Timing-Import mit
              Standard-Arbeitszeiten befüllen. Wochenenden und Feiertage werden
              automatisch übersprungen.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="prose prose-sm text-muted-foreground">
              <h3 className="text-base font-semibold text-foreground">
                Anwendungsfälle:
              </h3>
              <ul className="mt-2 space-y-1">
                <li>
                  <strong>Jahresanfang nachholen:</strong> Du hast erst im März
                  mit der Zeiterfassung begonnen? Fülle Januar und Februar
                  automatisch mit deinen Standard-Arbeitszeiten.
                </li>
                <li>
                  <strong>Vergessene Wochen:</strong> Du warst im Urlaub und
                  hast vergessen, die Wochen davor einzutragen? Kein Problem -
                  fülle sie schnell nach.
                </li>
                <li>
                  <strong>Initiale Überstunden:</strong> Kombiniere diese
                  Funktion mit manuellen Anpassungen, um deinen korrekten
                  Überstunden-Stand zu erreichen.
                </li>
              </ul>
            </div>

            <Button
              onClick={() => setBulkFillOpen(true)}
              size="lg"
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              <CalendarPlus className="h-5 w-5" />
              Arbeitstage bulk-füllen
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t">
            <h3 className="font-semibold mb-3">So funktioniert's:</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Wähle den Zeitraum aus (max. 1 Jahr)</li>
              <li>
                Gib deine Standard-Arbeitszeiten ein (z.B. 8 Stunden,
                9:00-17:00)
              </li>
              <li>Lass dir eine Vorschau anzeigen</li>
              <li>Bestätige und die Einträge werden automatisch erstellt</li>
            </ol>

            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <strong className="text-foreground">
                  Automatisch übersprungen werden:
                </strong>
              </p>
              <ul className="text-sm mt-1 space-y-1 list-disc list-inside ml-2">
                <li>Wochenenden (Samstag & Sonntag)</li>
                <li>Bereits eingetragene Feiertage</li>
                <li>Existierende Einträge (optional)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weitere Einstellungen können hier hinzugefügt werden */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Weitere Überstunden-Funktionen</CardTitle>
          <CardDescription>
            Zusätzliche Optionen zur Verwaltung deiner Überstunden
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Weitere Funktionen zur Überstunden-Verwaltung werden in Kürze
            hinzugefügt:
          </p>
          <ul className="mt-3 text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Überstunden-Abbau planen</li>
            <li>Monatliche Überstunden-Limits setzen</li>
            <li>Benachrichtigungen bei Überstunden-Schwellwerten</li>
            <li>Export von Überstunden-Berichten</li>
          </ul>
        </CardContent>
      </Card>

      {/* Bulk-Fill Dialog */}
      <BulkFillDialog
        open={bulkFillOpen}
        onOpenChange={setBulkFillOpen}
        weeklyWorkHours={40} // TODO: Get from user settings
      />
    </div>
  );
}
