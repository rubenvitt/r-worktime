// Demo-Seed für r-worktime (synthetische Daten, nur lokal).
// Aufruf: TIMING_TOKEN_ENCRYPTION_KEY=… pnpm seed:demo   (DATABASE_URL optional, sonst lokale Dev-DB)
// Legt demo@example.test neu an (löscht vorher einen vorhandenen Demo-User samt Daten).

import { createCipheriv, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "..", "package.json"));
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const bcrypt = require("bcryptjs");

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://worktime_user:worktime_dev_password@localhost:6201/worktime";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL)) {
  console.error("Demo-Seed läuft nur gegen eine lokale DB (localhost).");
  process.exit(1);
}
const KEY_B64 = process.env.TIMING_TOKEN_ENCRYPTION_KEY;
if (!KEY_B64) {
  console.error("TIMING_TOKEN_ENCRYPTION_KEY fehlt (32 Byte, base64).");
  process.exit(1);
}

const EMAIL = "demo@example.test";
const PASSWORD = "demo-demo-1234";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL }),
});

// ---------- Hilfen ----------
let seed = 20260803;
function rand() {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

function encryptSecret(plaintext) {
  const key = Buffer.from(KEY_B64, "base64");
  if (key.length !== 32) throw new Error("Key muss 32 Byte sein");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

// Aug–Okt 2026 = Sommerzeit (UTC+2) bis 25.10.
const BERLIN_OFFSET_H = 2;
function berlinToUtc(dateKey, minutesOfDay) {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCMinutes(minutesOfDay - BERLIN_OFFSET_H * 60);
  return d;
}
function addDays(key, n) {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (key) => new Date(`${key}T00:00:00.000Z`).getUTCDay();

// ---------- Domäne ----------
const P = {
  dev: "Work ▸ Firma ▸ Kundenprojekte ▸ Kunde A ▸ Entwicklung",
  meet: "Work ▸ Firma ▸ Kundenprojekte ▸ Kunde A ▸ Besprechungen",
  orga: "Work ▸ Firma ▸ Intern ▸ Organisation",
  travel: "Work ▸ Firma ▸ Reisezeit",
  vacation: "Work ▸ Firma ▸ Urlaub",
  sick: "Work ▸ Firma ▸ Krankheit",
  training: "Work ▸ Firma ▸ Intern ▸ Weiterbildung",
};
const DEV_TITLES = [
  "Alpha | 101: Backend",
  "Alpha | 102: Frontend",
  "Alpha | 117: API-Anbindung",
  "Alpha | 130: Bugfixes",
  "Beta | 204: Datenmodell",
];
const DEV_NOTES = [
  "Endpunkte für den Export umgesetzt",
  "Tests ergänzt",
  "Code-Review",
  "Validierung refaktoriert",
  "Pairing mit Team",
  "Fehleranalyse Staging",
  "Migration vorbereitet",
  "Abnahmekriterien geklärt",
];
const ORGA = [
  ["Orga | E-Mails", ["Postfach aufgeräumt", "Rückfragen beantwortet", null]],
  ["Orga | Zeiterfassung", [null, "Woche nachgetragen"]],
  ["Orga | Teamrunde", ["Quartalsplanung", null]],
];

const START = "2026-08-03"; // Mo, KW 32
const END = "2026-10-09"; // Fr, heute
const VACATION_DAYS = new Set(["2026-08-21"]);
const SICK_DAYS = new Set(["2026-09-15"]);
const PRESENCE_DAYS = new Set(["2026-09-09", "2026-10-07"]);
const MISSING_DAYS = new Set(["2026-09-25", "2026-10-02"]); // Lücken → Probleme
const WEEKEND_WORK = new Set(["2026-09-19"]);
const SHORT_DAYS = new Set([
  "2026-08-28",
  "2026-09-04",
  "2026-09-22",
  "2026-09-30",
  "2026-10-06",
]);
const LONG_DAYS = new Set([
  "2026-08-12",
  "2026-08-26",
  "2026-09-02",
  "2026-09-17",
  "2026-09-29",
  "2026-10-01",
]);

let extCounter = 9_000_100;
const nextExternalId = () => `/time-entries/${extCounter++}`;

function entryRow(
  userId,
  dateKey,
  startMin,
  minutes,
  { title, notes, projectPath, type = "WORK", source = "TIMING_SYNC" },
) {
  const startTime = berlinToUtc(dateKey, startMin);
  const endTime = berlinToUtc(dateKey, startMin + minutes);
  return {
    userId,
    date: new Date(`${dateKey}T00:00:00.000Z`),
    startTime,
    endTime,
    duration: Number((minutes / 60).toFixed(2)),
    type,
    title,
    notes: notes ?? null,
    description: [title, notes].filter(Boolean).join(" - ") || null,
    projectPath,
    source,
    externalId: source === "TIMING_SYNC" ? nextExternalId() : null,
    billingStatus: source === "TIMING_SYNC" ? "unbilled" : null,
  };
}

/** Baut die Segmente eines normalen Arbeitstags mit Zielminuten. */
function workdaySegments(dateKey, targetMin) {
  const wd = weekday(dateKey);
  const segs = [];
  const presence = PRESENCE_DAYS.has(dateKey);
  if (presence)
    segs.push({
      title: "Anreise Kunde A",
      notes: "Präsenztag",
      projectPath: P.travel,
      min: 75,
    });
  segs.push({
    title: "Meetings(Daily)",
    notes: null,
    projectPath: P.meet,
    min: 15,
  });
  if (wd === 1)
    segs.push({
      title: "Meetings(Planning)",
      notes: null,
      projectPath: P.meet,
      min: 45,
    });
  if (wd === 5 && chance(0.5))
    segs.push({
      title: "Meetings(Retro)",
      notes: null,
      projectPath: P.meet,
      min: 60,
    });
  if (presence)
    segs.push({
      title: "Workshop Kunde A",
      notes: "Präsenztag vor Ort, Anforderungen abgestimmt",
      projectPath: P.meet,
      min: 120,
    });
  const devCount = presence ? 1 : 1 + Math.floor(rand() * 2);
  for (let i = 0; i < devCount; i++) {
    const title = pick(DEV_TITLES);
    // ~20 % ohne Notiz, damit Stundenzettel/Probleme etwas zu melden haben
    const notes = chance(0.2) ? null : pick(DEV_NOTES);
    segs.push({ title, notes, projectPath: P.dev, min: 0, flex: true });
  }
  if (chance(0.6)) {
    const [title, notes] = pick(ORGA);
    segs.push({
      title,
      notes: pick(notes),
      projectPath: P.orga,
      min: 20 + Math.floor(rand() * 3) * 10,
    });
  }
  if (presence)
    segs.push({
      title: "Rückreise Kunde A",
      notes: null,
      projectPath: P.travel,
      min: 75,
    });

  const fixed = segs.reduce((s, x) => s + x.min, 0);
  const flex = segs.filter((x) => x.flex);
  let rest = Math.max(60, targetMin - fixed);
  flex.forEach((seg, i) => {
    const share =
      i === flex.length - 1
        ? rest
        : Math.round((rest * (0.4 + rand() * 0.3)) / 5) * 5;
    seg.min = share;
    rest -= share;
  });
  return segs.slice(0, 6);
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    await prisma.user.delete({ where: { id: existing.id } });
    console.log("Vorhandenen Demo-User gelöscht");
  }

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Demo Nutzer",
      password: await bcrypt.hash(PASSWORD, 10),
      settings: {
        create: {
          weeklyWorkHours: 40,
          annualVacationDays: 30,
        },
      },
    },
  });

  const rows = [];

  // Anfangs-Saldo (Sonntag vor dem ersten Tag)
  rows.push({
    userId: user.id,
    date: new Date("2026-08-02T00:00:00.000Z"),
    startTime: new Date("2026-08-02T00:00:00.000Z"),
    endTime: new Date("2026-08-02T00:00:00.000Z"),
    duration: 12.5,
    type: "OVERTIME",
    description: "Anfangs-Überstunden-Saldo",
    source: "ADJUSTMENT",
  });

  for (let key = START; key <= END; key = addDays(key, 1)) {
    const wd = weekday(key);
    const isWeekend = wd === 0 || wd === 6;

    if (WEEKEND_WORK.has(key)) {
      rows.push(
        entryRow(user.id, key, 10 * 60, 120, {
          title: "Alpha | 130: Bugfixes",
          notes: "Hotfix Release",
          projectPath: P.dev,
        }),
      );
      continue;
    }
    if (isWeekend || MISSING_DAYS.has(key)) continue;

    if (VACATION_DAYS.has(key)) {
      rows.push(
        entryRow(user.id, key, 9 * 60, 480, {
          title: "Urlaub",
          projectPath: P.vacation,
          type: "VACATION",
        }),
      );
      continue;
    }
    if (SICK_DAYS.has(key)) {
      rows.push(
        entryRow(user.id, key, 9 * 60, 480, {
          title: "Krankheit",
          projectPath: P.sick,
          type: "SICK",
        }),
      );
      continue;
    }

    let target = 480 + Math.round((rand() * 40 - 20) / 5) * 5; // 7:40–8:20
    if (SHORT_DAYS.has(key)) target = 300 + Math.floor(rand() * 7) * 10; // 5:00–6:00
    if (LONG_DAYS.has(key)) target = 560 + Math.floor(rand() * 7) * 10; // 9:20–10:20
    if (key === END) target = 210; // heute: läuft noch

    const segs = workdaySegments(key, target);
    let cursor =
      (PRESENCE_DAYS.has(key) ? 7 * 60 + 15 : 8 * 60 + 30) +
      Math.floor(rand() * 4) * 10;
    let worked = 0;
    let lunchDone = false;
    for (const seg of segs) {
      if (!lunchDone && worked >= 210) {
        cursor += 30 + Math.floor(rand() * 2) * 15; // Mittagspause
        lunchDone = true;
      }
      // lange Blöcke in zwei Einträge teilen (Mittag dazwischen)
      if (!lunchDone && worked + seg.min > 270 && seg.min > 120) {
        const first = 240 - worked > 30 ? 240 - worked : 60;
        rows.push(entryRow(user.id, key, cursor, first, seg));
        cursor += first + 30 + Math.floor(rand() * 2) * 15;
        lunchDone = true;
        rows.push(entryRow(user.id, key, cursor, seg.min - first, seg));
        cursor += seg.min - first;
        worked += seg.min;
        continue;
      }
      rows.push(entryRow(user.id, key, cursor, seg.min, seg));
      cursor += seg.min;
      worked += seg.min;
    }
  }

  // Manuelle Einträge
  const manual = [
    [
      "2026-08-14",
      16 * 60 + 30,
      60,
      {
        title: "Nachtrag: Abstimmung Kunde A",
        notes: "Telefonat, in Timing vergessen",
        projectPath: P.meet,
      },
    ],
    [
      "2026-09-11",
      15 * 60,
      90,
      {
        title: "Weiterbildung Security",
        notes: "Online-Kurs Modul 3",
        projectPath: P.training,
      },
    ],
    [
      "2026-09-30",
      13 * 60,
      120,
      { title: "Alpha | 102: Frontend", notes: null, projectPath: null },
    ],
    [
      "2026-10-05",
      17 * 60,
      45,
      {
        title: "Orga | Reisekosten",
        notes: "Abrechnung Präsenztag",
        projectPath: P.orga,
      },
    ],
  ];
  for (const [key, start, min, data] of manual) {
    rows.push(
      entryRow(user.id, key, start, min, { ...data, source: "MANUAL" }),
    );
  }

  await prisma.timeEntry.createMany({ data: rows });

  // Alte Datei-Importe für die Upload-Historie
  await prisma.importLog.create({
    data: {
      userId: user.id,
      fileName: "timing-export-juli.json",
      fileHash: "demo-hash-0001",
      importDate: new Date("2026-08-01T08:00:00.000Z"),
      rowCount: 96,
      status: "SUCCESS",
      metadata: { imported: 96, duplicates: 0 },
    },
  });

  await seedAbsences(user.id);

  const syncAt = new Date("2026-10-09T06:00:00.000Z");
  await prisma.timingIntegration.create({
    data: {
      userId: user.id,
      apiTokenEnc: encryptSecret("demo-timing-token-0000-abcd"),
      projectRoots: ["Work"],
      syncEnabled: true,
      syncIntervalMinutes: 60,
      syncWindowDays: 35,
      lastSyncAt: syncAt,
      lastSyncStatus: "SUCCESS",
      lastSyncError: null,
      lastSyncStats: {
        from: "2026-09-04",
        to: "2026-10-09",
        trigger: "scheduler",
        fetched: 142,
        kept: 128,
        skipped: { running: 1, noProject: 3, outsideRoots: 10, invalid: 0 },
        created: 4,
        updated: 2,
        unchanged: 122,
        deleted: 0,
        replacedFileImports: 0,
        conflicts: 0,
        durationMs: 1840,
      },
    },
  });

  const counts = await prisma.timeEntry.groupBy({
    by: ["source", "type"],
    where: { userId: user.id },
    _count: true,
  });
  console.log(
    `Demo-User ${EMAIL} (${user.id}) angelegt, ${rows.length} Einträge`,
  );
  console.table(
    counts.map((c) => ({ source: c.source, type: c.type, n: c._count })),
  );
}

// ---------- Abwesenheiten (Timewarp und Dialog) ----------
// Berliner Uhrzeit mit der richtigen Zeitzone: Sommerzeit endet am 25.10.2026
function berlinWallClock(dateKey, minutesOfDay) {
  const offsetH = dateKey >= "2026-10-25" && dateKey < "2027-03-28" ? 1 : 2;
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCMinutes(minutesOfDay - offsetH * 60);
  return d;
}

const ABSENCE_TITLES = {
  VACATION: "Urlaub",
  RESIDUAL_VACATION: "Resturlaub",
  SPECIAL_LEAVE: "Sonderurlaub",
  OVERTIME_REDUCTION: "Überstundenabbau",
};
const ENTRY_TYPE_OF_KIND = {
  VACATION: "VACATION",
  RESIDUAL_VACATION: "VACATION",
  SPECIAL_LEAVE: "VACATION",
  OVERTIME_REDUCTION: "OVERTIME_REDUCTION",
};

let timingEntryCounter = 0;
/** Tage einer Abwesenheit wie der Abgleich: 08:00, ganzer/halber Tag, Mo–Fr */
function absenceDayRows(userId, absence, { source, withTimingId, note }) {
  const rows = [];
  const minutes = absence.halfDay ? 240 : 480;
  for (let key = absence.from; key <= absence.to; key = addDays(key, 1)) {
    const wd = weekday(key);
    if (wd === 0 || wd === 6) continue;
    const title = ABSENCE_TITLES[absence.kind];
    rows.push({
      userId,
      date: new Date(`${key}T00:00:00.000Z`),
      startTime: berlinWallClock(key, 8 * 60),
      endTime: berlinWallClock(key, 8 * 60 + minutes),
      duration: minutes / 60,
      type: ENTRY_TYPE_OF_KIND[absence.kind],
      title,
      notes: note ?? null,
      description: note ? `${title} - ${note}` : title,
      projectPath: withTimingId ? P.vacation : null,
      source,
      externalId: withTimingId
        ? `/time-entries/demo-timewarp-${++timingEntryCounter}`
        : null,
      billingStatus: withTimingId ? "not_billable" : null,
    });
  }
  return rows;
}

async function seedAbsences(userId) {
  const day = (key) => new Date(`${key}T00:00:00.000Z`);
  const seenAt = new Date("2026-10-09T06:00:00.000Z");
  const timewarp = (uid, kind, rawType, from, to, extra = {}) => ({
    userId,
    source: "TIMEWARP",
    externalUid: `${uid}@timewarp.demo`,
    kind,
    rawType,
    startDate: day(from),
    endDate: day(to),
    halfDay: false,
    status: "ACTIVE",
    sequence: 0,
    lastSeenAt: seenAt,
    ...extra,
  });

  // 1. Vergangener Urlaub aus Timewarp, verknüpft mit dem Timing-Eintrag
  const past = await prisma.absence.create({
    data: timewarp("tw-1", "VACATION", "URLAUB", "2026-08-21", "2026-08-21"),
  });
  await prisma.timeEntry.updateMany({
    where: { userId, date: day("2026-08-21"), type: "VACATION" },
    data: { absenceId: past.id },
  });

  // 2.–5. Geplant aus Timewarp: Überstundenabbau, Sonderurlaub, Herbsturlaub,
  // halber Tag Resturlaub
  const planned = [
    {
      data: timewarp(
        "tw-2",
        "OVERTIME_REDUCTION",
        "ÜBERSTUNDENABBAU",
        "2026-10-16",
        "2026-10-16",
      ),
      withTimingId: false,
    },
    {
      data: timewarp(
        "tw-3",
        "SPECIAL_LEAVE",
        "SONDERURLAUB",
        "2026-10-23",
        "2026-10-23",
      ),
      withTimingId: true,
    },
    {
      data: timewarp("tw-4", "VACATION", "URLAUB", "2026-11-02", "2026-11-06", {
        sequence: 1,
      }),
      withTimingId: true,
    },
    {
      data: timewarp(
        "tw-5",
        "RESIDUAL_VACATION",
        "RESTURLAUB",
        "2026-12-23",
        "2026-12-23",
        { halfDay: true },
      ),
      withTimingId: true,
    },
  ];
  const rows = [];
  for (const { data, withTimingId } of planned) {
    const absence = await prisma.absence.create({ data });
    rows.push(
      ...absenceDayRows(
        userId,
        {
          kind: data.kind,
          from: data.startDate.toISOString().slice(0, 10),
          to: data.endDate.toISOString().slice(0, 10),
          halfDay: data.halfDay,
        },
        { source: "TIMEWARP", withTimingId, note: "Aus Timewarp" },
      ).map((row) => ({ ...row, absenceId: absence.id })),
    );
  }

  // 6. In Timewarp storniert: Abwesenheit bleibt, ohne Einträge
  await prisma.absence.create({
    data: timewarp("tw-6", "VACATION", "URLAUB", "2026-11-20", "2026-11-20", {
      status: "CANCELLED",
      sequence: 2,
    }),
  });

  // 7. Über den Dialog eingetragen (manuell, ohne Timing)
  const manual = await prisma.absence.create({
    data: {
      userId,
      source: "MANUAL",
      kind: "VACATION",
      startDate: day("2026-12-28"),
      endDate: day("2026-12-30"),
      status: "ACTIVE",
    },
  });
  rows.push(
    ...absenceDayRows(
      userId,
      {
        kind: "VACATION",
        from: "2026-12-28",
        to: "2026-12-30",
        halfDay: false,
      },
      { source: "MANUAL", withTimingId: false, note: "Zwischen den Jahren" },
    ).map((row) => ({ ...row, absenceId: manual.id })),
  );

  await prisma.timeEntry.createMany({ data: rows });

  // Kalender-Integration mit Demo-Feed und einem Abgleichsprotokoll
  await prisma.calendarIntegration.create({
    data: {
      userId,
      feedUrlEnc: encryptSecret(
        "https://timewarp.innoq.io/export/demo-token-0000/calendar.ics",
      ),
      syncEnabled: true,
      writeToTiming: true,
      timingProjectId: "/projects/demo-urlaub",
      lastSyncAt: seenAt,
      lastSyncStatus: "SUCCESS",
      lastSyncError: null,
      lastSyncStats: { absences: 6, events: 21, unknownTypes: 0 },
    },
  });
  await prisma.absenceSyncLog.create({
    data: {
      userId,
      startedAt: seenAt,
      finishedAt: new Date(seenAt.getTime() + 2300),
      status: "SUCCESS",
      actions: [
        {
          date: "2026-08-21",
          kind: "VACATION",
          action: "linked",
          detail: null,
        },
        {
          date: "2026-10-16",
          kind: "OVERTIME_REDUCTION",
          action: "created",
          detail: null,
        },
        {
          date: "2026-10-23",
          kind: "SPECIAL_LEAVE",
          action: "timingCreated",
          detail: null,
        },
        {
          date: "2026-11-20",
          kind: "VACATION",
          action: "deleted",
          detail: "In Timewarp storniert",
        },
      ],
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
