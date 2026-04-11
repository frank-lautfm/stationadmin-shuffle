# Station Admin Shuffle – Benutzerhandbuch

**Version:** 4.1.0  
**Sprache:** Deutsch  
**Zielgruppe:** Radiobetreiber ohne Programmierkenntnisse

---

## Was macht der Station Admin Shuffle?

Der Station Admin Shuffle ist das Herzstück der automatischen Playlist-Erstellung für deinen Radiosender auf laut.fm. Das Programm nimmt alle Titel, die du hochgeladen hast, und erstellt daraus automatisch eine fertige Sendeliste – intelligent, abwechslungsreich und nach deinen Wünschen gestaltet.

Du konfigurierst das Verhalten über die **Station Admin**-Software, in der du die Optionen des Shuffle-Algorithmus einstellst. Den Rest erledigt der Station Admin Shuffle automatisch.

---

## Grundprinzip: Wie entsteht eine Playlist?

```
Deine Titel  →  Bewertung & Auswahl  →  Zeitplanung  →  Zusammenbau  →  Fertige Sendeliste
```

Der Station Admin Shuffle arbeitet in vier Schritten:

---

### Schritt 1 – Bewertung und Auswahl der Titel

Bevor die eigentliche Playlist entsteht, bewertet der Station Admin Shuffle jeden Titel mit einem **Score** (Punktzahl). Je niedriger der Score, desto wahrscheinlicher wird der Titel gespielt.

Der Score setzt sich zusammen aus:

- **Zufallsanteil:** Jeder Titel bekommt zunächst einen zufälligen Basiswert. Das sorgt dafür, dass die Playlist bei jedem Durchlauf anders klingt.
- **Tag-Gewichtungen:** Titel mit bevorzugten Tags bekommen einen niedrigeren Score (werden häufiger gespielt), Titel mit unerwünschten Tags einen höheren (werden seltener gespielt). Titel mit einem Ausschluss-Tag (`-4` oder weniger) werden komplett ignoriert.
- **Datums-Tags:** Titel, deren Datums-Tag nicht zum aktuellen Datum passt, werden ausgeschlossen.
- **Wiederholungsstrafe:** Titel, die in den letzten Stunden bereits gespielt wurden, bekommen einen höheren Score – sie werden also nach hinten verdrängt. Wie lange dieser Schutz gilt, bestimmst du mit `avoidRepeat` (Standard: 2 Stunden). Mit `excludePreviousTracks` kannst du solche Titel auch komplett ausschließen.

Anschließend werden die Titel nach Künstlern gruppiert. Pro Künstler werden nur so viele Titel ausgewählt, wie in die gewünschte Sendedauer passen (`maxTracksPerArtist`). Das verhindert, dass ein einzelner Künstler die Playlist dominiert.

---

### Schritt 2 – Gleichmäßige Verteilung der Künstler (Segmentierung)

Damit Künstler nicht in Blöcken auftauchen, teilt der Station Admin Shuffle die Playlist in gleichgroße **Segmente** auf. Jeder Künstler wird so auf die Segmente verteilt, dass seine Titel möglichst weit auseinanderliegen.

**Beispiel:** Hat ein Künstler drei Titel und die Playlist hat sechs Segmente, landen seine Titel in Segment 1, 3 und 5 – also gleichmäßig verteilt.

Künstler, die laut Wiedergabe-Historie (`trackStats`) gerade erst gespielt wurden, starten erst ab Segment 2 – so wird ein direkter Anschluss an die vorherige Playlist vermieden.

Innerhalb jedes Segments werden die Titel anschließend zufällig gemischt. Titel mit einer Wiederholungsstrafe werden dabei ans Ende des Segments geschoben.

---

### Schritt 3 – Zeitplanung der festen Elemente

Bevor die Playlist zusammengebaut wird, berechnet der Station Admin Shuffle, wann welche festen Elemente eingeplant werden:

- **Nachrichten** werden zu den konfigurierten Uhrzeiten eingeplant (z. B. zur vollen Stunde).
- **Jingles** werden gleichmäßig über die gesamte Sendezeit verteilt. Der Abstand richtet sich nach der Anzahl der Jingles und der Sendedauer.
- **Werbepausen** werden zu den konfigurierten Minuten-Positionen jeder Stunde eingeplant (z. B. :15 und :45 Uhr).
- **Zeitgesteuerte Beiträge** (Scheduling-Regeln) werden zu ihren festgelegten Uhrzeiten eingeplant.

Alle diese Elemente haben ein **Zeitfenster**: Sie müssen nicht auf die Sekunde genau eingefügt werden, sondern können innerhalb eines Toleranzbereichs platziert werden (typisch: ±15 Minuten). Das gibt dem Algorithmus Spielraum, um Kollisionen zu vermeiden – z. B. wenn ein Jingle und eine Nachricht zur gleichen Zeit fällig wären.

---

### Schritt 4 – Zusammenbau der Sendeliste

Der Station Admin Shuffle kennt zwei **Auswahlmodi**, die bestimmen, wie Titel aus dem Pool gezogen werden:

#### Modus 1: Simple (Standard)

Der Standard-Modus wird verwendet, wenn **kein `tagPattern`** konfiguriert ist. Der Algorithmus geht den vorbereiteten Titelpool der Reihe nach durch und prüft jeweils bis zu 6 aufeinanderfolgende Kandidaten. Der Kandidat mit der geringsten Strafe wird ausgewählt. Jeder verwendete Titel wird aus dem Pool entfernt.

#### Modus 2: Tag Pattern

Wenn ein `tagPattern` konfiguriert ist (z. B. `['song', 'song', 'jingle']`), arbeitet der Algorithmus anders: Er folgt strikt dem vorgegebenen Muster und sucht für jede Position gezielt nach einem Titel mit dem passenden Tag oder Typ. Gefundene Titel werden nach der Verwendung wieder ans Ende des Pools angehängt – sie können also mehrfach vorkommen. Der Modus endet, wenn das Muster so oft scheitert, wie es Positionen hat.

---

Unabhängig vom Modus läuft der Zusammenbau nach demselben Grundprinzip:

1. **Nächsten Titel aus dem Pool holen:** Im Simple-Modus wird der nächste Kandidat sequenziell geprüft (bis zu 6 Stück). Im Tag-Pattern-Modus wird gezielt nach dem passenden Tag/Typ gesucht. Gewählt wird jeweils der Kandidat mit der geringsten Strafe.

2. **Künstler-Sperre prüfen:** Wurde der Künstler dieses Titels in den letzten ~30 Minuten bereits gespielt (im Tag-Pattern-Modus: 60 Minuten)? Wenn ja, bekommt der Titel eine Strafe und ein anderer Kandidat wird bevorzugt.

3. **Ähnliche Titel prüfen:** Wenn `trackNameLimit` aktiviert ist, wird geprüft, ob ein ähnlicher Titel (gleicher normalisierter Name oder gleicher Gruppen-Tag) in den letzten N Titeln bereits vorkam. Wenn ja, wird dieser Titel ebenfalls mit einer Strafe belegt.

4. **Geplante Elemente einfügen:** Bevor der ausgewählte Titel in die Liste kommt, prüft der Algorithmus, ob ein geplantes Element (Jingle, Nachricht, Werbung, Scheduling-Beitrag) fällig ist. Wenn ja, wird es zuerst eingefügt.

5. **Gebundene Titel einfügen (Track Rules):** Wenn für den ausgewählten Song eine Track Rule gilt, wird der zugehörige Titel (z. B. ein Intro-Jingle) direkt davor oder danach eingefügt.

6. **Titel zur Playlist hinzufügen** und zum nächsten Schritt übergehen.

Dieser Prozess wiederholt sich, bis die gewünschte Sendedauer erreicht ist oder keine weiteren Titel mehr verfügbar sind.

#### Kollisionen zwischen geplanten Elementen

Manchmal treffen zwei geplante Elemente aufeinander – z. B. ein Jingle und eine Nachricht zur gleichen Zeit. Der Station Admin Shuffle löst solche Kollisionen automatisch nach konfigurierbaren Strategien:

- **Beide behalten** (`keep_both`): Beide Elemente werden eingefügt.
- **Jingle entfernen** (`remove_jingle`): Der reguläre Jingle wird weggelassen, das andere Element hat Vorrang.
- **Element verschieben** (`move`): Das Element wird um einen Titel nach hinten verschoben (bis zu zweimal).
- **Geplantes Element überspringen** (`skip_scheduled`): Das geplante Element wird ausgelassen, wenn es zu einem Konflikt kommt.

---

## Titeltypen

Jeder Titel in deiner Bibliothek hat einen **Typ**. Der Station Admin Shuffle behandelt jeden Typ anders:

| Typ | Bedeutung |
|-----|-----------|
| **Song** | Normale Musiktitel – der Hauptinhalt deines Senders |
| **Jingle** | Kurze Stationskenner, Werbehinweise, Sounds |
| **Moderation** | Gesprochene Beiträge, Ansagen, Wortbeiträge |
| **News** | Nachrichtensendungen |

---

## Tags – Titel kategorisieren und steuern

Tags sind Schlagwörter, die du deinen Titeln in der Station Admin zuweist. Sie sind das wichtigste Werkzeug, um das Verhalten des Station Admin Shuffle zu steuern.

### Normale Tags

Einfache Bezeichnungen wie `rock`, `pop`, `slow`, `upbeat`. Du kannst ihnen Gewichtungen geben (siehe unten), um bestimmte Titel häufiger oder seltener zu spielen.

### Datums-Tags – Saisonale Titel

Mit Datums-Tags kannst du Titel auf bestimmte Zeiträume beschränken. Das ist ideal für Weihnachtsmusik, Geburtstagssongs oder saisonale Aktionen.

**Format:** `@TT.MM.` oder `@TT.MM. - TT.MM.`

**Beispiele:**

| Tag | Bedeutung |
|-----|-----------|
| `@24.12.` | Nur am 24. Dezember |
| `@01.12. - 24.12.` | Vom 1. bis 24. Dezember |
| `@15.11. - 15.01.` | Vom 15. November bis 15. Januar (über den Jahreswechsel) |

Titel mit einem Datums-Tag, der **nicht** dem aktuellen Datum entspricht, werden automatisch aus der Playlist ausgeschlossen.

### Gruppen-Tags – Ähnliche Titel trennen

Tags, die mit `=` beginnen (z. B. `=weihnachten`, `=ballade`), markieren Titel als „ähnlich". Mit der Einstellung `trackNameLimit` kannst du verhindern, dass zwei ähnliche Titel zu nah beieinander gespielt werden.

---

## Die wichtigsten Einstellungen

### Grundeinstellungen

| Einstellung | Was sie bewirkt | Standard |
|-------------|-----------------|---------|
| `duration` | Wie lang die Playlist sein soll (in Sekunden, max. 18 Stunden = 64800) | 64800 |
| `avoidRepeat` | Wie viele Stunden ein Titel nicht wiederholt werden soll | 2 |
| `excludePreviousTracks` | Wenn aktiviert: Titel aus den letzten `avoidRepeat` Stunden werden komplett ausgeschlossen | aus |
| `maxTracksPerArtist` | Wie viele Titel eines Künstlers pro Stunde maximal gespielt werden | automatisch |
| `trackNameLimit` | Wie viele Titel zwischen zwei ähnlichen Titeln liegen müssen (0 = aus) | 0 |

### Tag-Gewichtungen – Häufigkeit steuern

Mit `tagWeights` kannst du bestimmten Tags eine Priorität geben:

| Gewichtung | Wirkung |
|------------|---------|
| `+1` bis `+3` | Titel wird **bevorzugt** gespielt |
| `-1` bis `-3` | Titel wird **seltener** gespielt |
| `-4` oder weniger | Titel wird **nie** gespielt |

**Beispiel:**
```
tagWeights: { 'rock': 2, 'slow': -1, 'explicit': -4 }
```
→ Rock-Titel kommen häufiger, langsame Titel seltener, explizite Titel gar nicht.

---

## Künstler-Trennung

Der Station Admin Shuffle sorgt automatisch dafür, dass nicht zwei Songs desselben Künstlers zu nah beieinander gespielt werden (mindestens ~30 Minuten Abstand).

### Künstler-Aliase

Wenn ein Künstler unter verschiedenen Namen in deiner Bibliothek vorkommt, kannst du sie zusammenführen:

```
artistAliases: { 'p!nk': 'pink', 'the beatles': 'beatles' }
```

### Künstler-Trennzeichen

Bei Titeln wie „Artist feat. Gast" wird standardmäßig nur „Artist" als Künstlername gewertet. Du kannst weitere Trennzeichen angeben:

```
artistSeparators: [' feat', ' ft.', ' vs.']
```

---

## Jingles

Jingles werden automatisch gleichmäßig über die gesamte Sendezeit verteilt.

| Einstellung | Was sie bewirkt | Standard |
|-------------|-----------------|---------|
| `jingleInterval` | Abstand zwischen Jingles in Minuten (0 = automatisch gleichmäßig verteilen) | 0 |
| `jingleOrder` | Reihenfolge der Jingles: `shuffle` (zufällig), `shuffle_repeat` (nach jedem Durchlauf neu mischen), `preserve` (Originalreihenfolge) | shuffle |
| `preserveAllJingles` | Wenn aktiviert: Jingles bleiben an ihrer ursprünglichen Position | aus |
| `protectFirstJingle` | Der erste Jingle in der Liste wird immer als Eröffnungs-Jingle reserviert | aus |
| `firstJingleAfterNews` | Nach jeder Nachrichtensendung wird der Eröffnungs-Jingle gespielt | an |

---

## Nachrichten

Wenn du einen Nachrichtentitel (Typ `news`) in deiner Bibliothek hast, plant der Station Admin Shuffle die Nachrichten automatisch zu den richtigen Zeiten ein.

| Einstellung | Was sie bewirkt | Standard |
|-------------|-----------------|---------|
| `newsInterval` | Abstand zwischen Nachrichtensendungen in Minuten | 60 |
| `newsMin` | Ab welcher Minute einer Stunde die Nachrichten starten dürfen (z. B. `59` = ab :59 Uhr) | 59 |
| `newsMax` | Bis zu welcher Minute die Nachrichten spätestens starten müssen (z. B. `15` = bis :15 Uhr) | 15 |

**Beispiel mit Standardwerten:** Die Nachrichten starten irgendwann zwischen :59 und :15 Uhr der nächsten Stunde – also rund um die volle Stunde.

Zwischen zwei Nachrichtensendungen liegen immer mindestens 45 Minuten. In den letzten 15 Minuten der Playlist werden keine Nachrichten mehr eingeplant.

---

## Werbung (Ad Trigger)

Wenn dein Sender Werbepausen hat, kannst du einen speziellen „Ad Trigger"-Titel verwenden. Dieser Titel signalisiert dem System, dass jetzt eine Werbepause beginnt.

| Einstellung | Was sie bewirkt | Standard |
|-------------|-----------------|---------|
| `adTrigger` | ID des Ad-Trigger-Titels | – |
| `adSeparator` | ID eines Trenntitels, der direkt vor dem Ad Trigger gespielt wird | – |
| `adPositions` | Zwei Minuten-Positionen pro Stunde, zu denen Werbung eingeplant wird | [15, 45] |

**Beispiel:** `adPositions: [15, 45]` → Werbung immer um :15 Uhr und :45 Uhr jeder Stunde.

Die beiden Positionen müssen 20–40 Minuten auseinanderliegen. Wenn nicht, passt der Station Admin Shuffle sie automatisch an.

---

## Moderationen (Wortbeiträge)

Gesprochene Beiträge (Typ `moderation`) können auf verschiedene Arten in die Playlist eingebaut werden:

| Modus | Verhalten |
|-------|-----------|
| `random` | Moderationen werden wie normale Songs zufällig eingemischt (werden leicht bevorzugt) |
| `preserve` | Moderationen bleiben an ihrer ursprünglichen Position (relativ zur Songanzahl) |
| `link_next` | Eine Moderation wird immer direkt **vor** dem Song gespielt, der in der Originalliste nach ihr kommt |
| `link_previous` | Eine Moderation wird immer direkt **nach** dem Song gespielt, der in der Originalliste vor ihr steht |

**Einstellung:** `wordDistribution: 'random'` (Standard)

---

## Zeitgesteuerte Beiträge (Scheduling)

Mit der `scheduled`-Einstellung kannst du bestimmte Titel zu festen Uhrzeiten einplanen – zum Beispiel ein tägliches Programm-Highlight, eine stündliche Ansage oder ein wöchentliches Special.

### Wie es funktioniert

1. Du gibst einem oder mehreren Titeln in der Station Admin einen bestimmten Tag (z. B. `promo`).
2. Du erstellst eine Scheduling-Regel, die sagt: „Spiele jeden Tag um :30 Uhr einen Titel mit dem Tag `promo`."
3. Der Station Admin Shuffle fügt diesen Titel automatisch zur richtigen Zeit in die Playlist ein.

### Auswahlmodi

Wenn mehrere Titel für einen Zeitslot in Frage kommen, entscheidet der **Auswahlmodus**:

| Modus | Verhalten |
|-------|-----------|
| `random` | Zufällige Auswahl (bei Songs: intelligente Auswahl zum Einbauzeitpunkt) |
| `rotate` | Reihum – jedes Mal der nächste Titel in der Liste |
| `calculatedaily` | Jeden Tag derselbe Titel, täglich wechselnd |
| `date` | Der Titel, dessen Name oder Album das heutige Datum enthält (Format: `TT.MM.`) |
| `time` | Der Titel, dessen Name oder Album die aktuelle Stunde als Zahl enthält |
| `index` | Immer der Titel an einer bestimmten Position in der Liste |

### Zeitsteuerung

| Einstellung | Bedeutung |
|-------------|-----------|
| `minute: 30` | Einplanung zur Minute :30 jeder Stunde |
| `hour: 8` | Nur um 8 Uhr |
| `hour: -1` | Jede Stunde |
| `hour: -2` | Einmal zu einer zufälligen Stunde |
| `hour: -3` | Direkt **vor** jeder Nachrichtensendung |
| `hour: -4` | Direkt **nach** jeder Nachrichtensendung |
| `interval: 2` | Alle 2 Stunden |
| `day: -1` | Jeden Tag |
| `day: -2` | Nur Montag–Freitag |
| `day: -3` | Nur Samstag und Sonntag |
| `day: 1` | Nur montags (0=Sonntag, 1=Montag, … 6=Samstag) |

---

## Track Rules – Titel automatisch verknüpfen

Mit Track Rules kannst du festlegen, dass ein bestimmter Titel (z. B. ein Jingle oder eine Ansage) immer dann gespielt wird, wenn ein bestimmter Song läuft.

**Beispiel:** Immer wenn ein Song von „Taylor Swift" gespielt wird, soll vorher ein bestimmter Intro-Jingle eingespielt werden.

### Wie es funktioniert

1. Du gibst dem Intro-Jingle eine ID.
2. Du erstellst eine Track Rule: „Spiele Titel mit ID 999 immer **vor** Songs von Taylor Swift."
3. Der Station Admin Shuffle fügt den Jingle automatisch ein – aber höchstens einmal pro Stunde (einstellbar über `minDistance`).

### Filter-Typen

| Typ | Bedeutung |
|-----|-----------|
| `tag` | Alle Titel mit einem bestimmten Tag |
| `artist` | Alle Titel eines bestimmten Künstlers |
| `title` | Alle Titel, deren Name einen bestimmten Begriff enthält |
| `artist_title` | Suche in Künstlername und Titel zusammen |

### Mindestabstand

Mit `minDistance` (in Minuten) kannst du verhindern, dass ein gebundener Titel zu oft gespielt wird. Wenn der Jingle z. B. vor 60 Minuten zuletzt gespielt wurde und `minDistance: 60` gesetzt ist, wird er beim nächsten passenden Song wieder eingespielt.

---

## Tag-Muster (tagPattern) – Strukturierte Playlists

Mit `tagPattern` kannst du eine feste Abfolge von Titeltypen oder Tags vorgeben, die sich immer wiederholt.

**Beispiel:**
```
tagPattern: ['song', 'song', 'jingle']
```
→ Die Playlist folgt immer dem Muster: Song – Song – Jingle – Song – Song – Jingle – …

Das ist nützlich, wenn du eine sehr gleichmäßige Struktur möchtest. Der Station Admin Shuffle wählt dabei immer den besten verfügbaren Titel für die jeweilige Position aus.

---

## Tag-Sequenzen (tagSequences) – Übergänge steuern

Mit Tag-Sequenzen kannst du steuern, welcher Titel nach einer bestimmten Abfolge von Titeln kommen soll.

**Beispiel:** Nach zwei aufeinanderfolgenden „upbeat"-Songs soll ein „slow"-Song folgen.

```
tagSequences: [{ pattern: ['upbeat', 'upbeat'], next: 'slow' }]
```

Der Station Admin Shuffle bevorzugt dann nach zwei schnellen Songs einen ruhigeren Titel.

---

## Häufige Fragen

### Warum wird ein Titel nicht gespielt?

Mögliche Gründe:
- Der Titel hat einen **Datums-Tag**, der nicht dem aktuellen Datum entspricht.
- Der Titel hat ein **Tag-Gewicht von -4 oder weniger** und ist damit ausgeschlossen.
- Der Titel wurde **kürzlich gespielt** und `excludePreviousTracks` ist aktiviert.
- Der Titel ist als **gebundener Titel** (Track Rule) registriert und wird nur bei passenden Songs eingespielt.
- Der Titel hat einen **Selector-Tag** (für Scheduling-Regeln) und wird nur zu bestimmten Zeiten gespielt.

### Warum kommen manche Künstler zu selten vor?

Der Station Admin Shuffle begrenzt automatisch, wie viele Songs eines Künstlers pro Stunde gespielt werden (`maxTracksPerArtist`). Außerdem werden Künstler, die gerade gespielt wurden, für ~30 Minuten zurückgestellt.

### Warum ist die Playlist etwas länger als geplant?

Geplante Elemente (Nachrichten, Jingles, Werbung) werden zusätzlich zu den Songs eingefügt. Die tatsächliche Länge kann daher etwas über dem eingestellten `duration`-Wert liegen.

### Kann ich die Reihenfolge der Jingles festlegen?

Ja, mit `jingleOrder: 'preserve'` werden die Jingles in der Reihenfolge gespielt, in der sie in deiner Bibliothek stehen. Mit `preserveAllJingles` bleiben sie sogar an ihrer ursprünglichen Position relativ zu den Songs.

---

## Zusammenfassung: Was der Station Admin Shuffle für dich tut

```
✔  Mischt Songs zufällig, aber intelligent
✔  Trennt Künstler automatisch (kein Künstler zweimal hintereinander)
✔  Verteilt Jingles gleichmäßig über die Sendezeit
✔  Plant Nachrichten zur richtigen Uhrzeit ein
✔  Schaltet Werbepausen zu festen Zeiten
✔  Spielt saisonale Titel nur im richtigen Zeitraum
✔  Bevorzugt oder vermeidet Titel nach deinen Tag-Gewichtungen
✔  Fügt Moderationen und Ansagen an der richtigen Stelle ein
✔  Plant besondere Beiträge zu festen Uhrzeiten oder Wochentagen
✔  Verknüpft Jingles automatisch mit bestimmten Songs oder Künstlern
```

---

*Technische Referenz für Entwickler: [`doc/StationAdmin.md`](../StationAdmin.md)*
