"use client";

import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Plus,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProblemDay } from "@/types/problem";

interface ProblemDayCardProps {
  problem: ProblemDay;
  onMarkAsReviewed: (reason?: string) => void;
  onOpenQuickEntry: () => void;
}

export function ProblemDayCard({
  problem,
  onMarkAsReviewed,
  onOpenQuickEntry,
}: ProblemDayCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getProblemTypeInfo = () => {
    switch (problem.type) {
      case "missing":
        return {
          label: "Keine Einträge",
          color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
          icon: AlertCircle,
          description: "Für diesen Tag wurden keine Zeiteinträge gefunden.",
        };
      case "zero_hours":
        return {
          label: "0 Stunden erfasst",
          color:
            "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
          icon: Clock,
          description:
            "Es wurden Einträge gefunden, aber die Gesamtzeit beträgt 0 Stunden.",
        };
      case "incomplete":
        return {
          label: "Unvollständig",
          color:
            "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
          icon: Clock,
          description: `Nur ${problem.currentHours.toFixed(1)} von ${problem.expectedHours.toFixed(1)} Stunden erfasst.`,
        };
    }
  };

  const typeInfo = getProblemTypeInfo();
  const TypeIcon = typeInfo.icon;

  const formatDate = (date: Date) => {
    return format(new Date(date), "EEEE, d. MMMM yyyy", { locale: de });
  };

  const getSuggestionText = () => {
    switch (problem.suggestion) {
      case "review":
        return "Als überprüft markieren";
      case "add_entry":
        return "Manuellen Eintrag hinzufügen";
      case "bulk_fill":
        return "Mit Bulk-Fill ausfüllen";
      default:
        return "Aktion wählen";
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{formatDate(problem.date)}</span>
              {problem.isWeekend && (
                <Badge variant="secondary" className="text-xs">
                  Wochenende
                </Badge>
              )}
              {problem.isHoliday && (
                <Badge variant="secondary" className="text-xs">
                  Feiertag
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <TypeIcon className="h-4 w-4" />
              <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
              <span className="text-sm text-muted-foreground">
                {typeInfo.description}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onMarkAsReviewed()}
            className="gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            Als überprüft markieren
          </Button>

          {!problem.isWeekend && !problem.isHoliday && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenQuickEntry}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Manueller Eintrag
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2">
                    <Zap className="h-4 w-4" />
                    Weitere Aktionen
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => onMarkAsReviewed("Kein Arbeitstag")}
                  >
                    Als "Kein Arbeitstag" markieren
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onMarkAsReviewed("Unbezahlter Urlaub")}
                  >
                    Als "Unbezahlter Urlaub" markieren
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onMarkAsReviewed("Krankheit")}
                  >
                    Als "Krankheit" markieren
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onMarkAsReviewed("Feiertag")}
                  >
                    Als "Feiertag" markieren
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {/* Existing Entries (if any) */}
        {problem.entries.length > 0 && (
          <div className="border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-muted-foreground"
            >
              {expanded
                ? "Einträge verbergen"
                : `${problem.entries.length} Einträge anzeigen`}
            </Button>

            {expanded && (
              <div className="mt-2 space-y-2">
                {problem.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="text-sm p-2 bg-muted/50 rounded-md"
                  >
                    <div className="flex justify-between">
                      <span>{entry.description || "Kein Beschreibung"}</span>
                      <span className="font-medium">{entry.duration}h</span>
                    </div>
                    {entry.startTime && entry.endTime && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(entry.startTime), "HH:mm")} -
                        {format(new Date(entry.endTime), "HH:mm")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Suggestion */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <span className="text-sm text-muted-foreground">Empfehlung:</span>
          <Badge variant="outline" className="text-xs">
            {getSuggestionText()}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
