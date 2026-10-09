document.addEventListener("DOMContentLoaded", () => {
  const importButton = document.getElementById("importButton");
  const fillTableButton = document.getElementById("fillTableButton");
  const discardButton = document.getElementById("discardButton");
  const openRTimeButton = document.getElementById("openRTimeButton");
  const statusEl = document.getElementById("status");
  const originEl = document.getElementById("origin");
  const dataPreviewEl = document.getElementById("data-preview");
  const openSettingsLink = document.getElementById("openSettingsLink");

  let importedData = null;
  let importedMeta = null;
  let isOnOdooPage = false;

  // Daten aus dem Storage und aktiven Tab gemeinsam laden, erst danach den Button freigeben
  Promise.all([
    new Promise((resolve) =>
      chrome.storage.local.get(["timesheetData", "timesheetMeta"], resolve),
    ),
    new Promise((resolve) =>
      chrome.tabs.query({ active: true, currentWindow: true }, resolve),
    ),
  ]).then(([result, tabs]) => {
    if (tabs.length > 0) {
      const currentTab = tabs[0];
      isOnOdooPage = Boolean(currentTab.url?.includes("odoo.innoq.io"));
    }

    // Abgelaufene r-worktime-Daten (TTL 14 Tage) nicht mehr anbieten
    const expired = RwtTimesheetSchema.isPendingExpired(result.timesheetMeta);
    if (result.timesheetData && !expired) {
      importedData = result.timesheetData;
      importedMeta = result.timesheetMeta || null;
      updateUI("Daten geladen", importedData, isOnOdooPage);
    }

    // Wenn wir nicht auf der Odoo-Seite sind, zeigen wir einen Button an, um dorthin zu gelangen
    if (tabs.length > 0 && !isOnOdooPage) {
      const openOdooButton = document.createElement("button");
      openOdooButton.textContent = "Zu Odoo wechseln";
      openOdooButton.className = "button primary";
      openOdooButton.style.marginTop = "10px";
      openOdooButton.addEventListener("click", openOdooPage);

      // Button vor fillTableButton einfügen
      fillTableButton.parentElement.insertBefore(
        openOdooButton,
        fillTableButton,
      );

      // Status aktualisieren
      statusEl.textContent = "Du bist nicht auf der Odoo-Seite.";
      statusEl.className = "status";
      fillTableButton.disabled = true;
    }
  });

  // Einstellungen öffnen
  openSettingsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Zu Odoo wechseln
  function openOdooPage() {
    chrome.runtime.sendMessage({ action: "openOdooPage" }, () => {
      if (chrome.runtime.lastError) {
        console.error(
          "Fehler beim Öffnen der Odoo-Seite:",
          chrome.runtime.lastError,
        );
        return;
      }

      // Wir könnten das Popup schließen, aber das passiert automatisch, wenn der Benutzer klickt
    });
  }

  // R-Time App öffnen
  openRTimeButton.addEventListener("click", openRTimePage);

  function openRTimePage() {
    console.log("Öffne R-Time App...");

    chrome.runtime.sendMessage({ action: "openRTimePage" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Fehler beim Öffnen der R-Time App:",
          chrome.runtime.lastError.message,
        );
        statusEl.textContent = "Fehler beim Öffnen der R-Time App";
        statusEl.className = "status error";
        return;
      }

      console.log("R-Time App Antwort:", response);
      // Popup schließt automatisch beim Klick
    });
  }

  // Aus Zwischenablage importieren
  importButton.addEventListener("click", async () => {
    try {
      statusEl.textContent = "Lese Zwischenablage...";
      statusEl.className = "status";

      // Inhalt der Zwischenablage lesen
      const text = await navigator.clipboard.readText();

      if (!text) {
        throw new Error("Keine Daten in der Zwischenablage gefunden.");
      }

      // JSON parsen
      try {
        const data = JSON.parse(text);

        // Prüfen, ob es ein Array ist
        if (!Array.isArray(data)) {
          throw new Error(
            "Das Format der Daten ist ungültig. Bitte ein JSON-Array kopieren.",
          );
        }

        // Prüfen, ob die erforderlichen Felder vorhanden sind
        if (!validateTimeData(data)) {
          throw new Error(
            "Die Datenstruktur ist ungültig. Bitte überprüfe das Format (date, hours, text).",
          );
        }

        // Daten speichern (Popup ist ein vertrauenswürdiger Kontext und darf direkt schreiben)
        importedData = data;
        importedMeta = {
          source: "clipboard",
          receivedAt: new Date().toISOString(),
          consumedAt: null,
        };
        chrome.storage.local.set({
          timesheetData: data,
          timesheetMeta: importedMeta,
        });

        // UI aktualisieren
        updateUI("Daten erfolgreich importiert!", importedData, isOnOdooPage);
      } catch (e) {
        throw new Error(`Fehler beim Parsen der JSON-Daten: ${e.message}`);
      }
    } catch (error) {
      statusEl.textContent = error.message;
      statusEl.className = "status error";
      fillTableButton.disabled = true;
      dataPreviewEl.textContent = "";
    }
  });

  // Daten in die Tabelle eintragen
  fillTableButton.addEventListener("click", async () => {
    // Den aktuellen Tab abfragen
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        statusEl.textContent = "Kein aktiver Tab gefunden.";
        statusEl.className = "status error";
        return;
      }

      const tab = tabs[0];

      // Prüfen, ob wir auf der richtigen Seite sind
      if (!tab.url.includes("odoo.innoq.io")) {
        statusEl.textContent = "Bitte öffne die INNOQ Odoo-Seite.";
        statusEl.className = "status error";
        return;
      }

      // Daten an Content-Script senden. Bei Daten aus r-worktime den Monat
      // mitschicken, damit das Content-Script ihn gegen die Odoo-Seite prüft.
      const message = { action: "fillTimesheet", data: importedData };
      if (importedMeta?.source === "r-worktime") {
        message.month = importedMeta.month;
      }
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          statusEl.textContent = `Fehler: ${chrome.runtime.lastError.message}`;
          statusEl.className = "status error";
          return;
        }

        if (response?.success) {
          statusEl.textContent = "Daten erfolgreich eingetragen!";
          statusEl.className = "status success";
          markConsumed();
        } else {
          statusEl.textContent =
            response?.error || "Fehler beim Eintragen der Daten.";
          statusEl.className = "status error";
        }
      });
    });
  });

  // Gespeicherte Daten verwerfen
  discardButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "rwtDiscard" }, () => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = "Daten konnten nicht verworfen werden.";
        statusEl.className = "status error";
        return;
      }
      importedData = null;
      importedMeta = null;
      updateUI("Daten verworfen", null, false);
    });
  });

  // Nach dem Eintragen merken, dass die r-worktime-Daten verbraucht sind
  function markConsumed() {
    if (importedMeta?.source !== "r-worktime") return;
    chrome.runtime.sendMessage(
      { action: "rwtMarkConsumed", receivedAt: importedMeta.receivedAt },
      () => {
        if (chrome.runtime.lastError) return;
        importedMeta = {
          ...importedMeta,
          consumedAt: new Date().toISOString(),
        };
        renderOrigin();
      },
    );
  }

  // Hilfsfunktion zum Validieren der Daten (gemeinsame Prüfung aus lib/)
  function validateTimeData(data) {
    return RwtTimesheetSchema.validateEntries(data).ok;
  }

  // Herkunft der gespeicherten Daten anzeigen
  function renderOrigin() {
    if (!importedData || !importedMeta) {
      originEl.textContent = "";
      return;
    }
    if (importedMeta.source === "r-worktime") {
      let text = `Von R-Worktime empfangen am ${formatDateTime(importedMeta.receivedAt)} (${importedMeta.month})`;
      const from = RwtTimesheetSchema.describeOrigin(importedMeta.origin);
      if (from) text += ` · von ${from}`;
      if (importedMeta.consumedAt) {
        text += ` · eingetragen am ${formatDateTime(importedMeta.consumedAt)}`;
      }
      originEl.textContent = text;
      return;
    }
    originEl.textContent = "Aus Zwischenablage";
  }

  function formatDateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "?";
    const day = date.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
    });
    const time = date.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${day}, ${time}`;
  }

  // Hilfsfunktion zum Aktualisieren der UI
  function updateUI(statusText, data, enableButton) {
    statusEl.textContent = statusText;
    statusEl.className = enableButton ? "status success" : "status";
    fillTableButton.disabled = !enableButton;
    discardButton.hidden = !data;
    renderOrigin();

    if (data) {
      // Vorschau für bis zu 3 Einträge erstellen
      const previewData = data
        .slice(0, 3)
        .map((item) => {
          return `${item.date}: ${item.hours} - ${truncateText(item.text, 50)}`;
        })
        .join("\n");

      dataPreviewEl.textContent = `${previewData}${data.length > 3 ? "\n..." : ""}`;
    } else {
      dataPreviewEl.textContent = "";
    }
  }

  // Text kürzen
  function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}...`;
  }
});
