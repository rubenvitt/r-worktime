// Gemeinsame Prüfung der Stundenzettel-Daten (Service Worker, Popup, Content Scripts).
// Keine Build-Toolchain: klassisches Script, hängt die API an globalThis.RwtTimesheetSchema
// und exportiert sie zusätzlich per CommonJS (für Node-Tests).
(() => {
  if (globalThis.RwtTimesheetSchema) {
    if (typeof module === "object" && module.exports) {
      module.exports = globalThis.RwtTimesheetSchema;
    }
    return;
  }

  const PROTOCOL_VERSION = 1;
  const MAX_PAYLOAD_CHARS = 64 * 1024;
  const MAX_ENTRIES = 31;
  const MAX_TEXT_LENGTH = 500;
  const MAX_GENERATED_AT_LENGTH = 64;
  const PENDING_TTL_MS = 14 * 24 * 60 * 60 * 1000;
  const STATIC_APP_ORIGINS = Object.freeze([
    "http://localhost:3000",
    "http://localhost:3002",
  ]);

  const MONTH_RE = /^(\d{4})-(\d{2})$/;
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const HOURS_RE = /^\d{1,2}([:.,]\d{1,2})?$/;

  function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function isValidMonth(month) {
    if (typeof month !== "string") return false;
    const match = MONTH_RE.exec(month);
    if (!match) return false;
    const m = Number(match[2]);
    return m >= 1 && m <= 12;
  }

  function isValidDate(date) {
    if (typeof date !== "string") return false;
    const match = DATE_RE.exec(date);
    if (!match) return false;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    if (m < 1 || m > 12 || d < 1) return false;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return d <= daysInMonth;
  }

  function isValidHours(hours) {
    if (typeof hours !== "string" || !HOURS_RE.test(hours)) return false;
    // Bei "H:MM" müssen die Minuten unter 60 liegen.
    const colon = hours.indexOf(":");
    return colon === -1 || Number(hours.slice(colon + 1)) < 60;
  }

  function fail(error, message) {
    return { ok: false, error, message };
  }

  /**
   * Strikte Prüfung der Tageseinträge eines Monats.
   * Gibt nur bekannte Felder zurück, travelFee wird zu boolean normalisiert.
   */
  function validateMonthEntries(entries, month) {
    if (!isValidMonth(month)) {
      return fail("VALIDATION", "Ungültiger Monat (erwartet YYYY-MM).");
    }
    if (!Array.isArray(entries)) {
      return fail("VALIDATION", "entries ist kein Array.");
    }
    if (entries.length < 1 || entries.length > MAX_ENTRIES) {
      return fail(
        "VALIDATION",
        `entries muss 1 bis ${MAX_ENTRIES} Einträge enthalten.`,
      );
    }

    const seen = new Set();
    const value = [];
    for (let i = 0; i < entries.length; i++) {
      const item = entries[i];
      const where = `Eintrag ${i + 1}`;
      if (!isPlainObject(item)) {
        return fail("VALIDATION", `${where}: kein Objekt.`);
      }
      if (!isValidDate(item.date)) {
        return fail("VALIDATION", `${where}: ungültiges Datum.`);
      }
      if (!item.date.startsWith(`${month}-`)) {
        return fail(
          "VALIDATION",
          `${where}: Datum liegt nicht im Monat ${month}.`,
        );
      }
      if (seen.has(item.date)) {
        return fail(
          "VALIDATION",
          `${where}: Datum ${item.date} kommt mehrfach vor.`,
        );
      }
      seen.add(item.date);
      if (!isValidHours(item.hours)) {
        return fail("VALIDATION", `${where}: ungültige Stunden.`);
      }
      if (typeof item.text !== "string" || item.text.length > MAX_TEXT_LENGTH) {
        return fail(
          "VALIDATION",
          `${where}: Text fehlt oder ist länger als ${MAX_TEXT_LENGTH} Zeichen.`,
        );
      }
      if (item.travelFee !== undefined && typeof item.travelFee !== "boolean") {
        return fail("VALIDATION", `${where}: travelFee ist kein Boolean.`);
      }
      value.push({
        date: item.date,
        hours: item.hours,
        text: item.text,
        travelFee: item.travelFee === true,
      });
    }
    return { ok: true, value };
  }

  /**
   * Prüft den Payload einer RWT_TIMESHEET-Nachricht (Protokoll v1).
   * Ergebnis: {ok:true, value:{month, generatedAt, entries}} oder {ok:false, error:"VALIDATION"|"TOO_LARGE", message}.
   */
  function validateTimesheetPayload(payload) {
    let serialized;
    try {
      serialized = JSON.stringify(payload);
    } catch (_error) {
      return fail("VALIDATION", "Payload ist nicht serialisierbar.");
    }
    if (typeof serialized !== "string") {
      return fail("VALIDATION", "Payload fehlt.");
    }
    if (serialized.length > MAX_PAYLOAD_CHARS) {
      return fail("TOO_LARGE", "Payload ist größer als 64 KB.");
    }
    if (!isPlainObject(payload)) {
      return fail("VALIDATION", "Payload ist kein Objekt.");
    }

    let generatedAt = null;
    if (payload.generatedAt !== undefined) {
      if (
        typeof payload.generatedAt !== "string" ||
        payload.generatedAt.length > MAX_GENERATED_AT_LENGTH ||
        Number.isNaN(Date.parse(payload.generatedAt))
      ) {
        return fail("VALIDATION", "generatedAt ist kein gültiger Zeitstempel.");
      }
      generatedAt = payload.generatedAt;
    }

    const entries = validateMonthEntries(payload.entries, payload.month);
    if (!entries.ok) return entries;

    return {
      ok: true,
      value: { month: payload.month, generatedAt, entries: entries.value },
    };
  }

  /**
   * Prüfung für den Weg über die Zwischenablage – bewusst so locker wie bisher
   * (nicht leeres Array, jedes Element ein Objekt mit date, hours und text).
   */
  function validateEntries(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return fail("VALIDATION", "Keine Einträge gefunden.");
    }
    const ok = data.every(
      (item) =>
        item &&
        typeof item === "object" &&
        "date" in item &&
        "hours" in item &&
        "text" in item,
    );
    return ok
      ? { ok: true, value: data }
      : fail("VALIDATION", "Jeder Eintrag braucht date, hours und text.");
  }

  /** "2026-09" → "September 2026" */
  function formatMonthLabel(month) {
    if (!isValidMonth(month)) return String(month);
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  /** Monat aus einer Odoo-Timesheet-URL (…/timesheets/YYYYMM/…) als "YYYY-MM" oder null. */
  function monthFromOdooPath(pathname) {
    const match = /timesheets\/(\d{4})(\d{2})(?:\/|$)/.exec(
      String(pathname || ""),
    );
    if (!match) return null;
    const month = `${match[1]}-${match[2]}`;
    return isValidMonth(month) ? month : null;
  }

  function isOdooUrl(url) {
    try {
      const { protocol, hostname } = new URL(url);
      return (
        (protocol === "https:" || protocol === "http:") &&
        (hostname === "odoo.innoq.io" || hostname.endsWith(".odoo.innoq.io"))
      );
    } catch (_error) {
      return false;
    }
  }

  /** Normalisiert eine eingegebene App-URL auf ihren Origin oder liefert null. */
  function appOriginFromUrl(url) {
    try {
      const parsed = new URL(String(url).trim());
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return null;
      }
      return parsed.origin;
    } catch (_error) {
      return null;
    }
  }

  function isStaticAppOrigin(origin) {
    return STATIC_APP_ORIGINS.includes(origin);
  }

  /**
   * Lesbare Herkunft für Popup und Button, z. B. "http://localhost:3000
   * (lokale Entwicklungsinstanz)". Leer, wenn kein Origin bekannt ist.
   */
  function describeOrigin(origin) {
    if (typeof origin !== "string" || origin === "") return "";
    let hostname;
    try {
      hostname = new URL(origin).hostname;
    } catch (_error) {
      return "";
    }
    const local =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost");
    return local ? `${origin} (lokale Entwicklungsinstanz)` : origin;
  }

  function isPendingExpired(meta, now = Date.now()) {
    if (meta?.source !== "r-worktime") return false;
    const received = Date.parse(meta.receivedAt);
    return Number.isNaN(received) || now - received > PENDING_TTL_MS;
  }

  const api = Object.freeze({
    PROTOCOL_VERSION,
    MAX_PAYLOAD_CHARS,
    STATIC_APP_ORIGINS,
    PENDING_TTL_MS,
    validateTimesheetPayload,
    validateMonthEntries,
    validateEntries,
    formatMonthLabel,
    monthFromOdooPath,
    isOdooUrl,
    appOriginFromUrl,
    isStaticAppOrigin,
    describeOrigin,
    isPendingExpired,
  });

  globalThis.RwtTimesheetSchema = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})();
