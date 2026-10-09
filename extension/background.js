// Background script für die INNOQ Timesheet Import Extension
// Chrome lädt das Schema per importScripts (klassischer SW), Firefox über background.scripts.
if (typeof importScripts === "function" && !globalThis.RwtTimesheetSchema) {
  importScripts("lib/timesheet-schema.js");
}
console.log("Background script geladen");

const Schema = globalThis.RwtTimesheetSchema;

// Standardwerte für die URLs
const DEFAULT_ODOO_URL = "https://odoo.innoq.io/innoq/users/";
const DEFAULT_RTIME_URL = "https://r-time.rubeen.dev";

const BRIDGE_SCRIPT_ID = "rwt-bridge";
const BRIDGE_SCRIPT_FILES = [
  "lib/timesheet-schema.js",
  "content/rwt-bridge.js",
];
const ODOO_TAB_PATTERNS = ["*://*.odoo.innoq.io/*"];

// Content Scripts dürfen storage nicht direkt lesen/schreiben – der SW ist der einzige Schreiber.
function restrictStorageAccess() {
  for (const area of [chrome.storage.local, chrome.storage.sync]) {
    if (area && typeof area.setAccessLevel === "function") {
      try {
        const result = area.setAccessLevel({
          accessLevel: "TRUSTED_CONTEXTS",
        });
        if (result && typeof result.catch === "function") {
          result.catch(() => {});
        }
      } catch (_error) {
        // Nicht unterstützt (z. B. ältere Browser) – ignorieren.
      }
    }
  }
}
restrictStorageAccess();

function isExtensionPage(sender) {
  return (
    typeof sender.url === "string" &&
    sender.url.startsWith(chrome.runtime.getURL(""))
  );
}

function senderOrigin(sender) {
  if (typeof sender.origin === "string" && sender.origin !== "null") {
    return sender.origin;
  }
  try {
    return new URL(sender.url).origin;
  } catch (_error) {
    return null;
  }
}

async function getConfiguredAppOrigin() {
  const { rWorktimeUrl } = await chrome.storage.sync.get(["rWorktimeUrl"]);
  return rWorktimeUrl ? Schema.appOriginFromUrl(rWorktimeUrl) : null;
}

async function isTrustedAppSender(sender) {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0) return false;
  const origin = senderOrigin(sender);
  if (!origin) return false;
  if (Schema.isStaticAppOrigin(origin)) return true;
  return origin === (await getConfiguredAppOrigin());
}

// Odoo-Content-Script oder eigene Extension-Seiten (Popup, Optionen)
function isOdooOrExtensionSender(sender) {
  if (sender.id !== chrome.runtime.id) return false;
  if (isExtensionPage(sender)) return true;
  return Boolean(sender.tab) && Schema.isOdooUrl(sender.url);
}

async function storeTimesheet(payload, sender) {
  if (!(await isTrustedAppSender(sender))) {
    return { ok: false, error: "ORIGIN" };
  }
  const result = Schema.validateTimesheetPayload(payload);
  if (!result.ok) {
    console.warn("Stundenzettel abgelehnt:", result.error, result.message);
    return { ok: false, error: result.error };
  }
  const { month, generatedAt, entries } = result.value;
  await chrome.storage.local.set({
    timesheetData: entries,
    timesheetMeta: {
      source: "r-worktime",
      month,
      generatedAt,
      receivedAt: new Date().toISOString(),
      origin: senderOrigin(sender),
      consumedAt: null,
    },
  });
  return { ok: true, count: entries.length };
}

async function getPending() {
  const { timesheetData, timesheetMeta } = await chrome.storage.local.get([
    "timesheetData",
    "timesheetMeta",
  ]);
  // TTL nur für Daten aus r-worktime; Zwischenablage-Daten bleiben wie bisher liegen.
  if (Schema.isPendingExpired(timesheetMeta)) {
    await chrome.storage.local.remove(["timesheetData", "timesheetMeta"]);
    return { ok: true, entries: null, meta: null };
  }
  return {
    ok: true,
    entries: timesheetData || null,
    meta: timesheetMeta || null,
  };
}

async function markConsumed(receivedAt) {
  const { timesheetMeta } = await chrome.storage.local.get(["timesheetMeta"]);
  if (!timesheetMeta) return { ok: false };
  if (receivedAt && timesheetMeta.receivedAt !== receivedAt) {
    return { ok: false };
  }
  await chrome.storage.local.set({
    timesheetMeta: { ...timesheetMeta, consumedAt: new Date().toISOString() },
  });
  return { ok: true };
}

async function discardPending() {
  await chrome.storage.local.remove(["timesheetData", "timesheetMeta"]);
  return { ok: true };
}

// --- Bridge-Registrierung für den konfigurierten r-worktime-Origin ---

async function unregisterBridge() {
  try {
    await chrome.scripting.unregisterContentScripts({
      ids: [BRIDGE_SCRIPT_ID],
    });
  } catch (_error) {
    // War nicht registriert.
  }
}

async function registerBridge(origin) {
  const script = {
    id: BRIDGE_SCRIPT_ID,
    matches: [`${origin}/*`],
    js: BRIDGE_SCRIPT_FILES,
    runAt: "document_start",
    persistAcrossSessions: true,
  };
  try {
    await chrome.scripting.registerContentScripts([script]);
  } catch (error) {
    // Fallback ohne persistAcrossSessions; der Abgleich beim Start registriert ohnehin neu.
    const { persistAcrossSessions: _ignored, ...fallback } = script;
    try {
      await chrome.scripting.registerContentScripts([fallback]);
    } catch (_fallbackError) {
      throw error;
    }
  }
}

async function originHasPermission(origin) {
  try {
    return await chrome.permissions.contains({ origins: [`${origin}/*`] });
  } catch (_error) {
    return false;
  }
}

// Registriert die Bridge passend zum gespeicherten Origin (idempotent).
async function reconcileBridge() {
  const origin = await getConfiguredAppOrigin();
  await unregisterBridge();
  if (!origin || Schema.isStaticAppOrigin(origin)) {
    return { ok: true, registered: false, origin };
  }
  if (!(await originHasPermission(origin))) {
    console.warn("Keine Berechtigung für", origin);
    return { ok: true, registered: false, origin, missingPermission: true };
  }
  await registerBridge(origin);
  return { ok: true, registered: true, origin };
}

async function configureOrigin(previousOrigin) {
  const result = await reconcileBridge();
  if (
    previousOrigin &&
    previousOrigin !== result.origin &&
    !Schema.isStaticAppOrigin(previousOrigin)
  ) {
    try {
      await chrome.permissions.remove({ origins: [`${previousOrigin}/*`] });
    } catch (_error) {
      // Berechtigung war schon weg.
    }
  }
  return result;
}

// --- Badge + Benachrichtigung offener Odoo-Tabs ---

async function refreshPendingIndicators() {
  const { timesheetMeta } = await chrome.storage.local.get(["timesheetMeta"]);
  const pending =
    timesheetMeta?.source === "r-worktime" &&
    !timesheetMeta.consumedAt &&
    !Schema.isPendingExpired(timesheetMeta);
  await chrome.action.setBadgeText({ text: pending ? "1" : "" });

  const tabs = await chrome.tabs.query({ url: ODOO_TAB_PATTERNS });
  for (const tab of tabs) {
    chrome.tabs
      .sendMessage(tab.id, { action: "rwtPendingChanged" })
      .catch(() => {});
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    (changes.timesheetMeta || changes.timesheetData)
  ) {
    refreshPendingIndicators().catch((error) =>
      console.error("Badge konnte nicht aktualisiert werden:", error),
    );
  }
});

function respondAsync(promise, sendResponse) {
  promise.then(sendResponse).catch((error) => {
    console.error("Fehler im Service Worker:", error);
    // Kein Protokoll-Fehlercode: die Bridge schickt dafür kein ACK.
    sendResponse({ ok: false, error: "INTERNAL" });
  });
  return true;
}

// Listener für Chrome-Runtime-Nachrichten
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Nachricht empfangen:", message?.action);

  if (message.action === "openOdooPage") {
    console.log("Öffne Odoo-Seite");
    // Öffne die konfigurierte Odoo-URL in einem neuen Tab
    chrome.storage.sync.get(["odooUrl"], (result) => {
      const url = result.odooUrl || DEFAULT_ODOO_URL;
      console.log("Öffne URL:", url);
      chrome.tabs.create({ url: url }, (tab) => {
        console.log("Tab erstellt:", tab);
        sendResponse({ success: true, tabId: tab.id });
      });
    });
    return true; // Notwendig für asynchrone Antwort
  }

  if (message.action === "openRTimePage") {
    console.log("Öffne R-Time App");
    // Öffne die konfigurierte R-Time-URL in einem neuen Tab
    try {
      chrome.storage.sync.get(["rTimeUrl"], (result) => {
        const url = result.rTimeUrl || DEFAULT_RTIME_URL;
        console.log("Öffne R-Time URL:", url);
        chrome.tabs.create({ url: url }, (tab) => {
          console.log("R-Time Tab erstellt:", tab);
          sendResponse({ success: true, tabId: tab.id });
        });
      });
      return true; // Notwendig für asynchrone Antwort
    } catch (error) {
      console.error("Fehler beim Öffnen der R-Time App:", error);
      sendResponse({ success: false, error: error.message });
      return true;
    }
  }

  if (message.action === "rwtStoreTimesheet") {
    return respondAsync(storeTimesheet(message.payload, sender), sendResponse);
  }

  if (
    message.action === "rwtGetPending" ||
    message.action === "rwtMarkConsumed" ||
    message.action === "rwtDiscard"
  ) {
    if (!isOdooOrExtensionSender(sender)) {
      sendResponse({ ok: false, error: "ORIGIN" });
      return false;
    }
    if (message.action === "rwtGetPending") {
      return respondAsync(getPending(), sendResponse);
    }
    if (message.action === "rwtMarkConsumed") {
      return respondAsync(markConsumed(message.receivedAt), sendResponse);
    }
    return respondAsync(discardPending(), sendResponse);
  }

  if (message.action === "rwtConfigureOrigin") {
    if (sender.id !== chrome.runtime.id || !isExtensionPage(sender)) {
      sendResponse({ ok: false, error: "ORIGIN" });
      return false;
    }
    return respondAsync(
      configureOrigin(message.previousOrigin || null),
      sendResponse,
    );
  }

  // Wenn keine passende Aktion gefunden wurde
  console.warn("Unbekannte Aktion:", message.action);
  return false;
});

function onBrowserReady() {
  restrictStorageAccess();
  reconcileBridge().catch((error) =>
    console.error("Bridge-Abgleich fehlgeschlagen:", error),
  );
  refreshPendingIndicators().catch(() => {});
}

// Event Listener bei Installation der Extension
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installiert oder aktualisiert:", details.reason);

  // Bei Neuinstallation die Standard-URLs setzen, falls noch nicht vorhanden
  if (details.reason === "install") {
    chrome.storage.sync.get(["odooUrl", "rTimeUrl"], (result) => {
      const newSettings = {};

      if (!result.odooUrl) {
        newSettings.odooUrl = DEFAULT_ODOO_URL;
      }

      if (!result.rTimeUrl) {
        newSettings.rTimeUrl = DEFAULT_RTIME_URL;
      }

      if (Object.keys(newSettings).length > 0) {
        console.log("Standardeinstellungen gesetzt:", newSettings);
        chrome.storage.sync.set(newSettings);
      }
    });
  }

  onBrowserReady();
});

chrome.runtime.onStartup.addListener(onBrowserReady);

// Entzieht der Nutzer die Berechtigung, wird die Bridge abgemeldet.
chrome.permissions.onRemoved.addListener(() => {
  reconcileBridge().catch(() => {});
});
