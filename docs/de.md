# Flowise

[Flowise](https://flowiseai.com) baut KI-Chatflows und Agenten, indem es Bausteine verbindet: ein
Modell (OpenAI, Mistral, Ollama…), ein Gedächtnis, Dokumente, Tools. Mit dieser Integration
schicken deine Gladys-Szenen eine Frage an einen dieser Flows, mit Informationen der Szene in der
Frage, und nutzen seine Antwort in den nächsten Aktionen: als Nachricht senden, vorlesen lassen,
in einer Bedingung prüfen.

Außerdem überwacht sie den Server (online oder nicht, Anzahl der Flows), behält die letzte Antwort
auf einem Gerät und bietet ein Dashboard-Widget und zwei Szenen-Auslöser.

## Voraussetzungen

- Gladys 5.1 oder neuer.
- Ein Flowise-Server in deinem Netzwerk (standardmäßig Port 3000) mit mindestens einem Chatflow
  oder Agentflow.
- Ein Flowise-API-Schlüssel, optional, aber empfohlen: Erstelle ihn in Flowise, Menü **API
  Keys**. Damit werden deine Flows aufgelistet (eine Szene kann dann einen Flow beim Namen
  nennen) und die mit einem Schlüssel geschützten Flows nutzbar.

## Einrichtung

1. Öffne in Gladys **Integrationen**, suche **Flowise** und installiere es.
2. Fülle unter **Konfiguration** aus:
   - **Adresse**: die IP-Adresse oder der Name des Servers, z. B. `192.168.1.20` (Port 3000
     wird ergänzt), `192.168.1.20:8080` oder die vollständige URL eines Reverse-Proxys; eine aus
     dem Browser kopierte Adresse geht auch;
   - **API-Schlüssel (optional)**: der in Flowise erstellte Schlüssel;
   - **Standard-Flow**: der Flow, der verwendet wird, wenn eine Szenen-Aktion keinen nennt;
   - **Längste Wartezeit auf eine Antwort**: 30 bis 110 Sekunden (standardmäßig 60);
   - **Aktualisierungsintervall**: wie oft der Zustand des Servers gelesen wird (standardmäßig
     eine Minute);
   - **Sprache der Funktionsnamen**: die Namen der Funktionen und die Texte der
     Szenen-Ereignisse und Fehler.
3. Speichere und drücke dann **Verbindung testen**: Es zeigt die Flowise-Version und, mit
   Schlüssel, die Liste deiner Flows.
4. Füge im Tab **Entdecken** das Gerät **Flowise** zu Gladys hinzu.

Ein Flow wird über seine ID angegeben (die Folge aus Ziffern und Buchstaben am Ende der Adresse
des Flows in Flowise, z. B. `b4aa0269-51dd-45e4-8121-569626ad0539`), über die vollständige, aus
dem Browser kopierte Adresse oder über seinen Namen, wenn ein API-Schlüssel eingetragen ist.

## Das Gerät Flowise

| Funktion         | Bedeutung                                                             |
| ---------------- | --------------------------------------------------------------------- |
| `Online`         | 1, wenn der Server antwortet, 0 nach zwei fehlgeschlagenen Abfragen   |
| `Flows`          | Anzahl der Chatflows und Agentflows (nur mit API-Schlüssel)           |
| `Letzte Antwort` | Anfang der letzten Antwort, die eine Szene erhalten hat (500 Zeichen) |

Fügst du den API-Schlüssel später hinzu, schlägt der Tab Entdecken **Aktualisieren** vor, um die
Funktion `Flows` hinzuzufügen.

## Dashboard

Das Widget **Flowise** zeigt den Server (online, Version), die Anzahl der Flows (mit Schlüssel),
Flow und Uhrzeit der letzten Antwort und den Anfang dieser Antwort. Die Einstellung **Letzte Antwort anzeigen** blendet den Text der Antwort aus.

## Szenen

### Auslöser

- **Flowise ist offline**: Der Server antwortet nicht mehr (zwei fehlgeschlagene Abfragen in
  Folge, im Abstand von 15 Sekunden). Variable: der Grund.
- **Flowise ist wieder online**: Der Server antwortet wieder. Variable: die Dauer des Ausfalls in
  Minuten.

### Aktionen

- **Flowise fragen**: schickt eine Frage an einen Flow.
  - **Frage**: Tippe `{{`, um Informationen der Szene einzufügen, z. B. die Temperatur eines
    Sensors oder einen Wert des Auslösers;
  - **Flow**: leer für den Standard-Flow; sonst seine ID, seine Adresse oder sein Name;
  - **Unterhaltung**: Derselbe Name von einer Ausführung zur nächsten (z. B. `küche`) behält das
    Gedächtnis des Flows, falls der Flow eines hat; leer ist jede Ausführung eine neue
    Unterhaltung;
  - **Längste Antwort**: in Zeichen (standardmäßig 1000, höchstens 10 000). Eine längere Antwort
    wird am Ende eines Satzes (oder Worts) gekürzt, markiert mit `…`.

  Die Ergebnisse stehen den nächsten Aktionen zur Verfügung: **Antwort**, **Verwendeter Flow**,
  **Unterhaltungs-ID**, **Antwortzeit** (Sekunden) und **Antwort gekürzt** (ja/nein). Tippe in
  einer Aktion **Nachricht senden** `{{` und wähle **Antwort**. Ein Fehlschlag (Server nicht
  erreichbar, Flow nicht gefunden, Schlüssel abgelehnt, Flow mit Fehler) erscheint rot mit seinem
  Grund.

### Szenen-Ideen

- **Morgen-Briefing**: Um 7 Uhr **Flowise fragen** „Fasse den Tag zusammen: Außentemperatur
  `{{…}}`, Kalender `{{…}}`.“ an einen Agenten, der deine Gewohnheiten kennt, dann die
  **Antwort** an dein Handy senden.
- **Küchenassistent**: Mit der Unterhaltung `küche` behält jede Frage den Faden der vorherigen.
- **Server überwachen**: Bei **Flowise ist offline** schickst du dir eine Nachricht mit dem
  Grund.

## Fehlerbehebung

- **„Flowise antwortet nicht“**: Prüfe Adresse und Port (3000) und ob der Server läuft. Mit
  Docker muss der Port veröffentlicht sein.
- **„Flow nicht gefunden“**: Kopiere die ID aus der Adresszeile von Flowise oder nutze
  **Verbindung testen**, um die genauen Namen zu sehen.
- **„Zugriff verweigert“**: Der API-Schlüssel ist falsch, oder der Flow ist mit einem anderen
  Schlüssel geschützt.
- **„der Flow ist in Flowise fehlgeschlagen“**: Ein Baustein des Flows ist fehlgeschlagen
  (Modell nicht erreichbar, fehlende Zugangsdaten…); öffne den Flow und seine **Executions** in
  Flowise.
- **„Flowise hat zu lange für die Antwort gebraucht“**: Erhöhe die Wartezeit oder vereinfache
  den Flow.
- Probleme und Ideen: [GitHub-Issues](https://github.com/guim31/gladys-flowise/issues).

## Grenzen

- Nur Text: kein Bild und keine Datei in der Frage, keine gestreamte Antwort.
- Gladys wartet höchstens zwei Minuten auf eine Aktion. Die Antwort ist auf 10 000 Zeichen
  begrenzt.
- Flowise-Variablen (`$vars`) werden nicht übertragen: Schreib die Informationen der Szene in die
  Frage.
- Langflow wird nicht unterstützt: Seine API und seine IDs sind anders.
- Fragen und Antworten landen nie in den Protokollen der Integration.
- Getestet mit einem echten Flowise 3.1.2 (ein Agentflow ohne Modell), ohne echte
  Gladys-Instanz: Rückmeldungen willkommen.
- Nicht mit FlowiseAI verbunden.
