// Brücke zwischen der r-worktime-Seite (window.postMessage) und dem Service Worker.
// Protokoll v1, siehe README.md. Keine eigene Logik: Prüfung und Speichern macht der SW.
(() => {
  if (globalThis.__rwtBridge) return;
  globalThis.__rwtBridge = true;

  const PAGE_SOURCE = "r-worktime";
  const EXT_SOURCE = "rwt-extension";
  const PROTOCOL = 1;
  const VERSION = chrome.runtime.getManifest().version;
  const ORIGIN = window.location.origin;
  // Interne Fehler des SW sind kein Protokoll-Code: dann kein ACK, die Seite läuft in ihren Timeout.
  const ACK_ERRORS = ["VALIDATION", "TOO_LARGE", "ORIGIN"];

  function post(message) {
    window.postMessage({ source: EXT_SOURCE, ...message }, ORIGIN);
  }

  function isValidRequestId(id) {
    return (
      (typeof id === "string" && id.length > 0 && id.length <= 128) ||
      (typeof id === "number" && Number.isFinite(id))
    );
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== ORIGIN) return;
    const data = event.data;
    // Eigene Antworten (source "rwt-extension") landen auf demselben window und werden hier ignoriert.
    if (!data || typeof data !== "object" || data.source !== PAGE_SOURCE) {
      return;
    }
    if (!isValidRequestId(data.requestId)) return;

    if (data.type === "RWT_PING") {
      // PING trägt laut Protokoll kein protocol-Feld; falls doch, muss es 1 sein.
      if (data.protocol !== undefined && data.protocol !== PROTOCOL) return;
      post({
        type: "RWT_PONG",
        requestId: data.requestId,
        version: VERSION,
        protocol: PROTOCOL,
      });
      return;
    }

    if (data.type === "RWT_TIMESHEET") {
      if (data.protocol !== PROTOCOL) return;
      const requestId = data.requestId;
      chrome.runtime.sendMessage(
        { action: "rwtStoreTimesheet", payload: data.payload },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            // SW nicht erreichbar: kein ACK, die Seite läuft in ihren Timeout.
            return;
          }
          if (response.ok) {
            post({
              type: "RWT_TIMESHEET_ACK",
              requestId,
              ok: true,
              count: response.count,
            });
          } else if (ACK_ERRORS.includes(response.error)) {
            post({
              type: "RWT_TIMESHEET_ACK",
              requestId,
              ok: false,
              error: response.error,
            });
          }
        },
      );
    }
  });

  // Best effort: Seite erfährt beim Laden, dass die Extension da ist.
  post({ type: "RWT_READY", version: VERSION, protocol: PROTOCOL });
})();
