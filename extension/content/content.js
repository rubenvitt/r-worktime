// Listener für Nachrichten vom Popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "fillTimesheet") {
    fillFromPopup(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Gibt an, dass wir die Antwort asynchron senden werden
  }
  if (message.action === "rwtPendingChanged") {
    refreshRwtFab();
    return false;
  }
});

/**
 * Eintragen über den Popup-Button. Mit `month` (Daten aus r-worktime) gilt
 * dieselbe Monatsprüfung wie beim schwebenden Button; der Weg über die
 * Zwischenablage (ohne Monat) bleibt unverändert.
 */
async function fillFromPopup(message) {
  if (!message.month) return fillTimesheet(message.data);
  const monthCheck = rwtCheckMonth(message.month);
  if (!monthCheck.ok) return { success: false, error: monthCheck.hint };
  const checked = RwtTimesheetSchema.validateMonthEntries(
    message.data,
    message.month,
  );
  if (!checked.ok) {
    return { success: false, error: `Daten ungültig: ${checked.message}` };
  }
  return fillTimesheet(checked.value);
}

/**
 * Füllt die Timesheet-Tabelle mit den Daten
 * @param {Array} data - Array mit Einträgen (date, hours, text)
 * @returns {Promise<Object>} - Ergebnis des Imports
 */
async function fillTimesheet(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error("Keine gültigen Daten zum Eintragen vorhanden.");
  }

  // Überprüfen, ob wir auf der richtigen Seite sind
  const table = document.querySelector("table.table-hover.table-light");
  if (!table) {
    throw new Error(
      "Timesheet-Tabelle nicht gefunden. Bist du auf der richtigen Seite?",
    );
  }

  // Import-Modal anzeigen
  const modal = createImportModal();
  document.body.appendChild(modal.element);

  try {
    // Daten gruppieren nach Datum
    const dataByDate = groupDataByDate(data);

    // Alle Datumszeilen der Tabelle finden
    const rows = Array.from(table.querySelectorAll("tbody tr"));

    // Zähler für den Import-Fortschritt
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    // Für jede Zeile in der Tabelle prüfen, ob wir Daten dafür haben
    for (const row of rows) {
      try {
        // Datum aus der Tabellenzeile extrahieren
        const dateCell = row.querySelector("td.datelabel");
        if (!dateCell) continue;

        // Extrahiere Datum aus dem Label (Format: "01 Do - Tag XYZ")
        const dateMatch = dateCell.textContent.trim().match(/^(\d{2})/);
        if (!dateMatch) continue;

        const day = dateMatch[1];

        // Datum im Format YYYY-MM-DD aus den Daten extrahieren
        // und Tag daraus isolieren, um zu vergleichen
        const entries = findEntriesForDay(dataByDate, day);

        if (entries && entries.length > 0) {
          // Einträge für diesen Tag gefunden
          await fillRowWithData(row, entries[0]);
          succeeded++;
        }

        processed++;
        updateProgress(modal, processed, rows.length, succeeded, failed);
      } catch (error) {
        console.error("Fehler beim Verarbeiten einer Zeile:", error);
        failed++;
        updateProgress(modal, processed, rows.length, succeeded, failed);
      }
    }

    // Abschließen des Imports
    if (failed > 0) {
      modal.statusElement.textContent = `Import abgeschlossen. ${succeeded} von ${processed} Einträgen erfolgreich importiert, ${failed} fehlgeschlagen.`;
      modal.statusElement.classList.add("error");
    } else {
      modal.statusElement.textContent = `Import erfolgreich! ${succeeded} von ${processed} Einträgen importiert.`;
      modal.statusElement.classList.add("success");
    }

    // Modal nach 3 Sekunden ausblenden, wenn alles erfolgreich war
    if (failed === 0) {
      setTimeout(() => {
        document.body.removeChild(modal.element);
      }, 3000);
    }

    return {
      success: true,
      total: processed,
      succeeded,
      failed,
    };
  } catch (error) {
    console.error("Fehler beim Importieren:", error);
    modal.statusElement.textContent = `Fehler: ${error.message}`;
    modal.statusElement.classList.add("error");

    setTimeout(() => {
      document.body.removeChild(modal.element);
    }, 5000);

    throw error;
  }
}

/**
 * Gruppiert die Daten nach Datum
 * @param {Array} data - Daten aus dem JSON-Import
 * @returns {Object} - Gruppierte Daten nach Datum
 */
function groupDataByDate(data) {
  return data.reduce((acc, item) => {
    if (!item.date) return acc;

    // Datum im Format YYYY-MM-DD erwarten
    // Wenn das Datum nicht im korrekten Format ist, überspringen
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return acc;

    if (!acc[item.date]) {
      acc[item.date] = [];
    }

    acc[item.date].push(item);
    return acc;
  }, {});
}

/**
 * Findet Einträge für einen bestimmten Tag
 * @param {Object} dataByDate - Gruppierte Daten nach Datum
 * @param {string} day - Tag als String (01, 02, etc.)
 * @returns {Array|null} - Gefundene Einträge oder null
 */
function findEntriesForDay(dataByDate, day) {
  // Das komplette Datum (YYYY-MM-DD) durchsuchen und prüfen, ob der Tag übereinstimmt
  for (const [date, entries] of Object.entries(dataByDate)) {
    // Tag aus dem Datum extrahieren (YYYY-MM-DD -> DD)
    const entryDay = date.split("-")[2];

    if (entryDay === day) {
      return entries;
    }
  }

  return null;
}

/**
 * Füllt eine Tabellenzeile mit den Daten
 * @param {HTMLElement} row - Tabellenzeile
 * @param {Object} data - Daten für die Zeile
 * @returns {Promise<void>}
 */
async function fillRowWithData(row, data) {
  // Wenn die Zeile eine Weekend-Klasse hat (Wochenende oder Feiertag),
  // prüfen, ob die Felder nicht readonly sind
  const isReadonly = row.classList.contains("weekend");

  // Hours und Text Input-Felder finden
  const hoursInput = row.querySelector("input.hoursinput");
  const textInput = row.querySelector("input.textinput");

  if (!hoursInput || !textInput) {
    throw new Error("Eingabefelder in der Zeile nicht gefunden.");
  }

  // Prüfen, ob die Felder schreibbar sind
  if (isReadonly && hoursInput.readOnly) {
    // Wenn die Zeile readonly ist, überspringen
    return;
  }

  // Highlight der Felder
  hoursInput.classList.add("innoq-highlight");
  textInput.classList.add("innoq-highlight");

  // Wert setzen (stündliche Notation 8:30 oder 8.5h akzeptieren)
  hoursInput.value = data.hours;

  // Wenn das Text-Feld ausgefüllt werden kann
  textInput.value = data.text;

  // Ein change-Event auslösen, damit die Seite auf die Änderungen reagiert
  hoursInput.dispatchEvent(new Event("change", { bubbles: true }));
  textInput.dispatchEvent(new Event("change", { bubbles: true }));

  // Travel-Fee-Checkbox setzen, falls für diesen Tag markiert
  if (data.travelFee === true) {
    const tfeeInput = row.querySelector("input.tfeeinput");
    if (tfeeInput && !tfeeInput.disabled) {
      if (!tfeeInput.checked) {
        tfeeInput.checked = true;
        tfeeInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      tfeeInput.classList.add("innoq-highlight");
      setTimeout(() => tfeeInput.classList.remove("innoq-highlight"), 2000);
    }
  }

  // Kurze Pause, um visuelles Feedback zu geben
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Highlighting nach einiger Zeit entfernen
  setTimeout(() => {
    hoursInput.classList.remove("innoq-highlight");
    textInput.classList.remove("innoq-highlight");
  }, 2000);
}

/**
 * Erstellt das Modal für den Import-Fortschritt
 * @returns {Object} - Modal-Elemente
 */
function createImportModal() {
  const overlay = document.createElement("div");
  overlay.className = "innoq-import-overlay";

  const modal = document.createElement("div");
  modal.className = "innoq-import-modal";

  const title = document.createElement("h2");
  title.textContent = "Timesheet-Daten werden importiert...";

  const progressContainer = document.createElement("div");
  progressContainer.className = "progress";

  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";
  progressBar.style.width = "0%";

  const status = document.createElement("div");
  status.className = "status";
  status.textContent = "Import wird vorbereitet...";

  progressContainer.appendChild(progressBar);
  modal.appendChild(title);
  modal.appendChild(progressContainer);
  modal.appendChild(status);
  overlay.appendChild(modal);

  return {
    element: overlay,
    progressBar,
    statusElement: status,
  };
}

/**
 * Aktualisiert den Fortschritt im Modal
 * @param {Object} modal - Modal-Elemente
 * @param {number} current - Aktueller Fortschritt
 * @param {number} total - Gesamtzahl
 * @param {number} succeeded - Erfolgreiche Einträge
 * @param {number} failed - Fehlgeschlagene Einträge
 */
function updateProgress(modal, current, total, succeeded, failed) {
  const percentage = Math.round((current / total) * 100);
  modal.progressBar.style.width = `${percentage}%`;
  modal.statusElement.textContent = `Import läuft... ${current} von ${total} Einträgen verarbeitet. Erfolgreich: ${succeeded}, Fehlgeschlagen: ${failed}`;
}

// --- Direktversand aus r-worktime: schwebender Button auf der Odoo-Seite ---

const RWT_FAB_ID = "innoq-rwt-fab";
const RWT_TABLE_SELECTOR = "table.table-hover.table-light";
let rwtTableObserver = null;
let rwtFilling = false;

function rwtSendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

async function rwtFetchPending() {
  const response = await rwtSendMessage({ action: "rwtGetPending" });
  if (!response?.ok) return null;
  const { entries, meta } = response;
  if (meta?.source !== "r-worktime" || meta.consumedAt || !entries) {
    return null;
  }
  return { entries, meta };
}

function rwtRemoveFab() {
  const existing = document.getElementById(RWT_FAB_ID);
  if (existing) existing.remove();
}

// Monat der Odoo-Seite gegen den Monat der Daten prüfen
function rwtCheckMonth(month) {
  const pageMonth = RwtTimesheetSchema.monthFromOdooPath(
    window.location.pathname,
  );
  if (!pageMonth) {
    return {
      ok: true,
      hint: "Monat der Odoo-Seite nicht erkennbar – bitte selbst prüfen.",
    };
  }
  if (pageMonth !== month) {
    return {
      ok: false,
      hint: `Diese Seite zeigt ${RwtTimesheetSchema.formatMonthLabel(pageMonth)}, die Daten sind für ${RwtTimesheetSchema.formatMonthLabel(month)}.`,
    };
  }
  return { ok: true, hint: "" };
}

function rwtRenderFab(pending) {
  rwtRemoveFab();
  const { entries, meta } = pending;
  const days = entries.length;
  const monthCheck = rwtCheckMonth(meta.month);

  const container = document.createElement("div");
  container.id = RWT_FAB_ID;
  container.className = "innoq-rwt-fab";

  const fillButton = document.createElement("button");
  fillButton.type = "button";
  fillButton.className = "innoq-rwt-fab-fill";
  fillButton.textContent = `r-worktime: ${RwtTimesheetSchema.formatMonthLabel(meta.month)} (${days} ${days === 1 ? "Tag" : "Tage"}) eintragen`;
  fillButton.disabled = !monthCheck.ok;

  const discardButton = document.createElement("button");
  discardButton.type = "button";
  discardButton.className = "innoq-rwt-fab-discard";
  discardButton.textContent = "Verwerfen";

  const info = document.createElement("div");
  info.className = "meta";
  const from = RwtTimesheetSchema.describeOrigin(meta.origin);
  info.textContent = [from && `Von ${from}`, monthCheck.hint]
    .filter(Boolean)
    .join(" · ");
  if (!monthCheck.ok) info.classList.add("warning");

  fillButton.addEventListener("click", () =>
    rwtFillFromPending(meta.receivedAt, fillButton, info),
  );
  discardButton.addEventListener("click", async () => {
    discardButton.disabled = true;
    await rwtSendMessage({ action: "rwtDiscard" });
    rwtRemoveFab();
  });

  container.appendChild(fillButton);
  container.appendChild(discardButton);
  container.appendChild(info);
  document.body.appendChild(container);
}

async function rwtFillFromPending(receivedAt, fillButton, info) {
  if (rwtFilling) return;
  rwtFilling = true;
  fillButton.disabled = true;
  try {
    // Frisch holen: Daten könnten inzwischen ersetzt oder verworfen worden sein.
    const pending = await rwtFetchPending();
    if (!pending || pending.meta.receivedAt !== receivedAt) {
      await refreshRwtFab();
      return;
    }
    const monthCheck = rwtCheckMonth(pending.meta.month);
    if (!monthCheck.ok) {
      info.textContent = monthCheck.hint;
      info.classList.add("warning");
      return;
    }
    const checked = RwtTimesheetSchema.validateMonthEntries(
      pending.entries,
      pending.meta.month,
    );
    if (!checked.ok) {
      info.textContent = `Daten ungültig: ${checked.message}`;
      info.classList.add("warning");
      return;
    }
    const result = await fillTimesheet(checked.value);
    if (result?.success) {
      await rwtSendMessage({ action: "rwtMarkConsumed", receivedAt });
      rwtRemoveFab();
    }
  } catch (error) {
    info.textContent = `Fehler: ${error.message}`;
    info.classList.add("warning");
    fillButton.disabled = false;
  } finally {
    rwtFilling = false;
  }
}

async function refreshRwtFab() {
  if (rwtFilling) return;
  const pending = await rwtFetchPending();
  if (!pending) {
    rwtRemoveFab();
    return;
  }
  if (document.querySelector(RWT_TABLE_SELECTOR)) {
    rwtRenderFab(pending);
    return;
  }
  rwtRemoveFab();
  // Tabelle noch nicht da: auf sie warten (max. 30 s)
  if (rwtTableObserver) return;
  rwtTableObserver = new MutationObserver(() => {
    if (document.querySelector(RWT_TABLE_SELECTOR)) {
      rwtTableObserver.disconnect();
      rwtTableObserver = null;
      refreshRwtFab();
    }
  });
  rwtTableObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  setTimeout(() => {
    if (rwtTableObserver) {
      rwtTableObserver.disconnect();
      rwtTableObserver = null;
    }
  }, 30000);
}

refreshRwtFab();
