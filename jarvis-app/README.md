# Jarvis – Gerüst

1. In Supabase: erst `supabase/schema.sql`, dann `supabase/seed.sql` im SQL Editor ausführen.
2. `.env.example` nach `.env.local` kopieren und ausfüllen. `APP_PASSWORD` ist das Passwort für die Weboberfläche; bei einem 401 fragt die Oberfläche erneut danach.
3. `npm install && npm run dev`
4. Auf Vercel deployen, dieselben Variablen eintragen. `CRON_SECRET` dort als Env-Variable setzen, Vercel schickt es automatisch als Bearer-Token.
5. Die Abend-Erinnerung läuft täglich um 19:00 UTC (21:00 Sommerzeit, 20:00 Winterzeit in Deutschland). Zeit in `vercel.json` anpassen.
6. Termine änderst du im Chat mit Claude oder direkt in Supabase (Tabellen `routines`, `events`, `breaks`). Gebetszeiten holt die App täglich automatisch (Ort in `lib/prayer.ts`).

## Agent-Version (v2)
- Zusätzlich `supabase/schema_v2.sql` ausführen (Tasks, Geld, Fitness, Gewohnheiten, Fakten).
- Aufgaben verwenden die Spalten `text`, `due`, `done` und `priority`; neue Aufgaben werden offen angelegt. Eine separate Beschreibungsspalte ist im aktuellen Schema nicht vorhanden. Priorität ist `high`, `normal` oder `low`; bestehende Aufgaben erhalten beim Anwenden der Migration den Standard `normal`.
- Das Task-Schema speichert kein Erledigungsdatum. Abfragen nach erledigten Aufgaben einer Woche beziehen sich daher auf deren Fälligkeitsdatum, nicht darauf, wann sie tatsächlich erledigt wurden.
- Vor dem Deploy dieser Task-Erweiterung die Datei `supabase/migrations/20261020_add_task_priority.sql` einmal in Supabase ausführen. Sie ist hier nur abgelegt und wurde nicht ausgeführt. Automatisierte Tests verwenden ausschließlich Mock-Daten; keine Live-Testaufgaben werden angelegt oder bereinigt.
- **Live-Schemahinweis:** Ein read-only REST-Probeaufruf meldete, dass `tasks.priority` in der verbundenen Datenbank derzeit nicht verfügbar ist. Vor Live-Aufgabenfunktionen muss die Prioritätsmigration manuell geprüft und angewendet werden; diese Anwendung führt keine Migration aus.
- Telegram-Webhook setzen (einmal im Browser, Werte einsetzen):
  `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DEINE-APP>.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>`
- Jarvis antwortet dann direkt in Telegram und nutzt dabei seine Tools (Plan, Aufgaben, Geld, Fitness, Gedächtnis).
- Tagesstart 05:00 UTC, Abendcheck 19:00 UTC (Zeiten in `vercel.json`).
- Broker: noch offen. Sobald du einen Broker mit Schnittstelle hast, wird er in `lib/tools.ts` angebunden (aktuell Platzhalter für Alpaca, optional).

## Multi-Agent-Aufträge
- Für Planung und Ergebnisbewertung wird die offizielle OpenAI-API (`OPENAI_API_KEY`) verwendet; Claude prüft den Plan über `ANTHROPIC_API_KEY`. Die offizielle OpenAI-JavaScript-Bibliothek ist als Abhängigkeit installiert.
- Agenten-Aufträge können im Dashboard, im Chat (für konkrete Repository-Aufträge) und in Telegram erstellt werden. Planung allein ändert keine Dateien. Der GitHub-Copilot-Cloud-Agent wird erst nach ausdrücklicher Freigabe im Dashboard oder mit `/approve <JOB-UUID>` in Telegram gestartet.
- Aufträge, Schritte und Statusereignisse erfordern die manuelle Migration `supabase/migrations/20261021_create_automation_jobs.sql`. Sie wurde nicht ausgeführt. Die Tabellen sind nur für den serverseitigen `service_role` freigegeben; Browser und externe Agenten erhalten keinen Supabase-Schlüssel.
- Setze `GITHUB_USER_TOKEN` als **User-to-server**-Token mit Repository-Berechtigung „Agent tasks: read and write“ und „Pull requests: read“ (für den PR-Link); Installationstokens werden von der Tasks-API nicht unterstützt. Der dokumentierte Agent-Tasks-Endpunkt ist Public Preview und erfordert laut GitHub Copilot Business oder Enterprise. `GITHUB_REPOSITORY` und optional `GITHUB_CLOUD_AGENT_BASE_REF` begrenzen das Ziel. Die konkrete Konto-/Repository-Freigabe muss vor der ersten Freigabe geprüft werden.
- Die Übergabe fordert einen neuen Branch und Pull Request an. Es gibt kein automatisches Merge oder Deployment. Unklare Netzwerkfehler beim Start werden nicht automatisch wiederholt, um Doppelstarts zu vermeiden; bitte zuerst GitHub-Aufgaben prüfen. Statusabfragen sind begrenzt wiederholbar.
- Planungsschritte haben eine persistente Sperrfrist und maximal zwei Startversuche. Nach einem Serverabbruch wird ein ausstehender oder abgelaufener Plan beim Öffnen des Auftrags einmalig wiederaufgenommen. Bekannte Planungsfehler können im Dashboard bis zum Versuchslimit manuell erneut gestartet werden. Agenten-Ergebnisse gelten nicht als CI-/Diff-Prüfung; PR und Checks bleiben manuell zu prüfen.
- Übergib keine Passwörter, Schlüssel oder Tokens im Auftragstext. Häufige Secret-Formate werden vor Speicherung zurückgewiesen; kein Muster kann beliebige Geheimnisse zuverlässig erkennen.
- Vor dem Live-Betrieb müssen beide Migrationen manuell in dieser Reihenfolge geprüft und angewendet werden: erst die Task-Priorität, dann `20261021_create_automation_jobs.sql`. Nicht in dieser App automatisiert.
