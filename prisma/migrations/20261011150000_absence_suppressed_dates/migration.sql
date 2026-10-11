-- Von Hand gelöschte oder bearbeitete Tage einer Abwesenheit: der Abgleich legt sie nicht neu an
ALTER TABLE "absences" ADD COLUMN     "suppressedDates" TEXT[] DEFAULT ARRAY[]::TEXT[];
