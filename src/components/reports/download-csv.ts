// Lädt einen CSV-Text im Browser als Datei herunter.

export function downloadCsv(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Erst nach dem Klick freigeben, sonst bricht der Download in Safari ab
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
