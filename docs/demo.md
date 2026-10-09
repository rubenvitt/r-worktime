# Demo mit synthetischen Daten

`pnpm seed:demo` legt in der lokalen Dev-DB einen Demo-Nutzer mit synthetischen Daten an:
207 Einträge vom 03.08. bis 09.10.2026 (Urlaubs- und Krankheitstag, Lücken, Unter- und
Überstunden, manuelle Einträge, Anfangs-Saldo) und eine Timing-Verbindung mit Dummy-API-Key.
Das Skript läuft nur gegen `localhost` und ist wiederholbar: Es löscht den Demo-Nutzer samt
Daten und legt ihn neu an.

- **Login:** `demo@example.test` / `demo-demo-1234`
- Die Daten sind auf den 09.10.2026 zugeschnitten. An anderen Tagen verschieben sich „heute“,
  die laufende Woche und der Monatsabschluss.

## Starten

```sh
docker compose up -d postgres
export TIMING_TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"   # Seed und Server brauchen denselben Key
pnpm seed:demo
pnpm build
PORT=47900 NEXTAUTH_URL=http://localhost:47900 TIMING_SYNC_SCHEDULER=off pnpm start
```

`TIMING_SYNC_SCHEDULER=off` ist wichtig: Sonst versucht der Scheduler, den Dummy-Key gegen die
echte Timing-API zu synchronisieren, und der Sync-Status springt auf Fehler.

## Entfernen

```sh
docker exec r-worktime-db psql -U worktime_user -d worktime \
  -c "delete from users where email='demo@example.test'"
```

Die übrigen Daten des Nutzers (Einträge, Einstellungen, Timing-Verbindung) löscht die DB per Cascade mit.
