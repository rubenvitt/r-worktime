// Warten bis das DOM vollständig geladen ist
document.addEventListener("DOMContentLoaded", () => {
  const odooUrlInput = document.getElementById("odooUrl");
  const rTimeUrlInput = document.getElementById("rTimeUrl");
  const rWorktimeUrlInput = document.getElementById("rWorktimeUrl");
  const permissionElement = document.getElementById("rWorktimePermission");
  const saveButton = document.getElementById("saveButton");
  const resetButton = document.getElementById("resetButton");
  const statusElement = document.getElementById("status");

  const Schema = globalThis.RwtTimesheetSchema;

  // Standardwerte für die URLs (werden verwendet, falls noch keine gespeichert wurden)
  const DEFAULT_ODOO_URL = "https://odoo.innoq.io/innoq/users/";
  const DEFAULT_RTIME_URL = "https://r-time.rubeen.dev";

  // Zuletzt gespeicherter R-Worktime-Origin (für das Zurückgeben alter Berechtigungen)
  let savedWorktimeOrigin = null;
  let statusTimer = null;

  // Gespeicherte URLs aus dem Storage laden
  loadSavedSettings();

  // Event-Listener für den Speichern-Button
  saveButton.addEventListener("click", saveSettings);

  // Event-Listener für den Zurücksetzen-Button
  resetButton.addEventListener("click", resetSettings);

  /**
   * Lädt die gespeicherten Einstellungen aus dem Chrome Storage
   */
  function loadSavedSettings() {
    chrome.storage.sync.get(
      ["odooUrl", "rTimeUrl", "rWorktimeUrl"],
      (result) => {
        odooUrlInput.value = result.odooUrl || DEFAULT_ODOO_URL;
        rTimeUrlInput.value = result.rTimeUrl || DEFAULT_RTIME_URL;
        rWorktimeUrlInput.value = result.rWorktimeUrl || "";
        savedWorktimeOrigin = result.rWorktimeUrl
          ? Schema.appOriginFromUrl(result.rWorktimeUrl)
          : null;
        updatePermissionStatus(savedWorktimeOrigin);
      },
    );
  }

  /**
   * Speichert die Einstellungen im Chrome Storage.
   * permissions.request muss der erste Browser-Aufruf im Klick sein (vor jedem await),
   * sonst ist die Nutzergeste verbraucht.
   */
  function saveSettings() {
    const odooUrl = odooUrlInput.value.trim();
    const rTimeUrl = rTimeUrlInput.value.trim();
    const rWorktimeUrl = rWorktimeUrlInput.value.trim();

    // Einfache Validierung der URLs
    if (!odooUrl || !isValidUrl(odooUrl)) {
      showStatus("Bitte gib eine gültige Odoo URL ein.", "error");
      return;
    }

    if (!rTimeUrl || !isValidUrl(rTimeUrl)) {
      showStatus("Bitte gib eine gültige R-Time URL ein.", "error");
      return;
    }

    let worktimeOrigin = null;
    if (rWorktimeUrl) {
      worktimeOrigin = Schema.appOriginFromUrl(rWorktimeUrl);
      if (!worktimeOrigin) {
        showStatus("Bitte gib eine gültige R-Worktime URL ein.", "error");
        return;
      }
      if (
        !worktimeOrigin.startsWith("https://") &&
        !Schema.isStaticAppOrigin(worktimeOrigin)
      ) {
        showStatus(
          "R-Worktime muss über https:// erreichbar sein (Ausnahme: http://localhost:3000 und :3002).",
          "error",
        );
        return;
      }
    }

    const needsPermission =
      Boolean(worktimeOrigin) && !Schema.isStaticAppOrigin(worktimeOrigin);
    const permissionRequest = needsPermission
      ? chrome.permissions.request({ origins: [`${worktimeOrigin}/*`] })
      : Promise.resolve(true);

    permissionRequest
      .then((granted) => {
        if (!granted) {
          showStatus(
            "Ohne Berechtigung für R-Worktime kann die Extension keine Stundenzettel empfangen. Nichts gespeichert.",
            "error",
          );
          updatePermissionStatus(worktimeOrigin);
          return;
        }
        return persistSettings(
          {
            odooUrl,
            rTimeUrl,
            rWorktimeUrl: worktimeOrigin ? rWorktimeUrl : "",
          },
          worktimeOrigin,
        );
      })
      .catch((error) => {
        showStatus(`Fehler beim Speichern: ${error.message}`, "error");
      });
  }

  /**
   * Schreibt die Einstellungen und meldet die Bridge beim Service Worker (neu) an
   */
  async function persistSettings(settings, worktimeOrigin) {
    await chrome.storage.sync.set(settings);
    const previousOrigin = savedWorktimeOrigin;
    savedWorktimeOrigin = worktimeOrigin;

    const response = await chrome.runtime.sendMessage({
      action: "rwtConfigureOrigin",
      previousOrigin,
    });
    updatePermissionStatus(worktimeOrigin);

    if (!response?.ok) {
      showStatus(
        "Einstellungen gespeichert, aber die R-Worktime-Anbindung konnte nicht eingerichtet werden.",
        "error",
      );
      return;
    }
    if (worktimeOrigin && worktimeOrigin !== previousOrigin) {
      showStatus(
        "Einstellungen gespeichert! Lade offene R-Worktime-Tabs neu, damit die Extension dort aktiv wird.",
        "success",
        8000,
      );
      return;
    }
    showStatus("Einstellungen gespeichert!", "success");
  }

  /**
   * Zeigt an, ob die Berechtigung für den R-Worktime-Origin erteilt ist
   */
  function updatePermissionStatus(origin) {
    permissionElement.className = "permission-status";
    if (!origin) {
      permissionElement.textContent = "";
      return;
    }
    if (Schema.isStaticAppOrigin(origin)) {
      permissionElement.textContent =
        "Lokale Entwicklung: keine zusätzliche Berechtigung nötig.";
      permissionElement.classList.add("granted");
      return;
    }
    chrome.permissions.contains({ origins: [`${origin}/*`] }, (granted) => {
      permissionElement.textContent = granted
        ? `Berechtigung für ${origin} erteilt.`
        : `Berechtigung für ${origin} fehlt – bitte erneut speichern.`;
      permissionElement.classList.add(granted ? "granted" : "missing");
    });
  }

  /**
   * Setzt die Einstellungen auf die Standardwerte zurück
   */
  function resetSettings() {
    odooUrlInput.value = DEFAULT_ODOO_URL;
    rTimeUrlInput.value = DEFAULT_RTIME_URL;
    rWorktimeUrlInput.value = "";
    persistSettings(
      {
        odooUrl: DEFAULT_ODOO_URL,
        rTimeUrl: DEFAULT_RTIME_URL,
        rWorktimeUrl: "",
      },
      null,
    )
      .then(() => showStatus("Einstellungen zurückgesetzt!", "success"))
      .catch((error) =>
        showStatus(`Fehler beim Zurücksetzen: ${error.message}`, "error"),
      );
  }

  /**
   * Zeigt eine Statusmeldung an
   * @param {string} message - Die anzuzeigende Nachricht
   * @param {string} type - Der Typ der Nachricht (success, error)
   * @param {number} duration - Anzeigedauer in Millisekunden
   */
  function showStatus(message, type = "info", duration = 3000) {
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;

    // Status nach einiger Zeit ausblenden
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusElement.textContent = "";
      statusElement.className = "status";
    }, duration);
  }

  /**
   * Prüft, ob eine URL gültig ist
   * @param {string} url - Die zu prüfende URL
   * @returns {boolean} - True, wenn die URL gültig ist
   */
  function isValidUrl(url) {
    try {
      return Boolean(new URL(url));
    } catch (_error) {
      return false;
    }
  }
});
