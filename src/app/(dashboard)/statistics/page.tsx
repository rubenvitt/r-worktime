"use client";

import { Calendar, TrendingUp } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function StatisticsPage() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Statistiken
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Detaillierte Analysen Ihrer Arbeitszeiten
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/statistics/weekly">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base font-medium">
                  Wochenstatistiken
                </CardTitle>
                <CardDescription>
                  Detaillierte Aufschlüsselung nach Wochentagen
                </CardDescription>
              </div>
              <Calendar className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Tägliche Arbeitszeiten, Überstunden und Trends anzeigen
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/overtime">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base font-medium">
                  Überstunden-Übersicht
                </CardTitle>
                <CardDescription>Jahres- und Monatsübersicht</CardDescription>
              </div>
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Gesamtbilanz und historische Entwicklung
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
