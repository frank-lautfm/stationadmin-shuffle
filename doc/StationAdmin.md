# StationAdmin Shuffle Algorithm Documentation

**Version:** 4.1.0  
**Source:** [`src/StationAdmin.ts`](../src/StationAdmin.ts)

## Overview

The StationAdmin shuffle algorithm is a sophisticated playlist generation system designed for radio station automation on laut.fm. It creates intelligent playlists by considering artist separation, tag weights, scheduling rules, jingle insertion, news breaks, ad triggers, track rules, and various other broadcasting requirements.

The algorithm is deployed server-side as a laut.fm automation script. It is an IIFE (Immediately Invoked Function Expression) that receives the station's track library, a configuration object, and recent play history, and returns an ordered playlist array.

## Function Signature

```javascript
(function(tracks, opts, trackStats) { ... })(tracks, opts, trackStats)
```

**Returns:** `Array<Track>` — the generated playlist in playback order.

---

## Input Parameters

### 1. `tracks` (Array)

The full track library available for playlist generation. The algorithm classifies each track by type and tag, extracts special tracks (news, ad triggers, jingles, bound tracks), and builds a scored candidate pool from the remainder.

#### Track Object Structure

```javascript
{
  id: Number,              // Unique track identifier
  type: String,            // 'song' | 'jingle' | 'moderation' | 'news'
  title: String | null,    // Track title
  artist: String | null,   // Artist name (null for non-music tracks)
  album: String,           // Album name (optional)
  duration: Number,        // Track duration in seconds

  tags: Array<String>,     // Categorization tags (see Tag System below)

  // Runtime-assigned fields (added by the algorithm, not required on input)
  score: Number,           // Selection priority score (lower = preferred)
  penalty: Number,         // Penalty tier for recent plays
  use: Boolean,            // Whether track was selected for the candidate pool
  plays: Number,           // Times track appears in the output playlist
  normTitle: String,       // Normalized title (set when trackNameLimit > 0)
  groupTags: Array<String>,// Tags starting with "=" plus normTitle
  artistNormalized: String,// Normalized artist name
  boundTo: Array<Number>,  // Indices of applicable track rules
  linked: Boolean,         // Set on tracks linked to an adjacent track
  position: Number         // Song count at which to re-insert preserved tracks
}
```

#### Track Types

| Type | Description |
|------|-------------|
| `song` | Regular music tracks — the primary content |
| `jingle` | Station IDs, promotional clips, station sounds |
| `moderation` | Voice tracks, announcements, spoken word |
| `news` | News bulletins |

#### Special Track Identifiers

| Condition | Role |
|-----------|------|
| `id === 1` or `type === 'news'` | News track — scheduled at news time windows |
| `title` or `artist` contains `'START_AD_BREAK'`, or `id === 0`, or `id === opts.adTrigger` | Ad trigger track |
| `id === opts.adSeparator` | Ad separator — played immediately before the ad trigger |
| `id === 8664493` | Exclude-following marker — all tracks after this one in the input array are ignored |
| `id` listed in a `trackRules` entry | Bound track — inserted by track rules, not shuffled |
| Track has a tag listed in a `scheduled` rule | Scheduling candidate — collected for time-based insertion |

#### Tag System

Tags are plain strings attached to tracks. Several naming conventions carry special meaning:

**Date Tags** — format `@DD.MM.` or `@DD.MM. - DD.MM.`

Restrict a track to a specific date or date range. Tracks outside the current date receive score `999999` and are excluded.

```
@24.12.           → only on December 24th
@01.12. - 24.12.  → December 1st through 24th
@15.11. - 15.01.  → November 15th through January 15th (wraps year boundary)
```

Multiple date tags on one track: if any tag actively excludes the track (state = -1), the track is excluded. A date tag that matches (state = 1) overrides a neutral state (0) but not an exclusion.

**Group Tags** — start with `=` (e.g., `=ballad`, `=christmas`)

Used with `trackNameLimit` to prevent similar tracks from playing too close together. The normalized title is also added to `groupTags` automatically.

**Pattern Tags** — any tag referenced in `opts.tagPattern`

Used to build structured playlists where the sequence of track types/tags follows a repeating pattern.

**Selector Tags** — tags referenced in `opts.scheduled` rules

Tracks carrying a selector tag are collected into the scheduling rule's candidate pool and (unless `exclude: true`) removed from the regular shuffle pool.

---

### 2. `opts` (Object)

Configuration object controlling all aspects of the shuffle algorithm.

#### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `duration` | Number | `64800` | Target playlist duration in seconds (max 64800 = 18 h) |
| `blockLength` | Number | `(duration/3600)+1` | Hours per iteration block |
| `maxTracksPerArtist` | Number | `floor(duration/3600)` | Max tracks per artist per block |
| `avoidRepeat` | Number | `2` | Hours within which a track is penalized for repeat play |
| `excludePreviousTracks` | Number | `0` | If non-zero, completely exclude tracks played within `avoidRepeat` hours |
| `trackNameLimit` | Number | `0` | Sliding window size for similar-title deduplication (0 = disabled). Special value `9999` deduplicates during pool building. |
| `debug` | Boolean | `false` | Enable `console.log` output for scheduling decisions |
| `time` | String | *(current time)* | ISO 8601 timestamp — overrides `Date.now()` for deterministic testing |
| `random` | Function | `Math.random` | Custom RNG — inject a seeded function for deterministic testing |

#### Tag & Weight Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tagWeights` | Object | `null` | Map of tag → weight for track scoring |
| `tagPattern` | Array\<String\> | `[]` | Repeating sequence of tags/types for structured playlists |
| `tagSequences` | Array\<Object\> | `[]` | Rules enforcing tag sequences between consecutive songs |

**Tag Weights:**

Each tag maps to a numeric weight. The algorithm takes the maximum positive weight and minimum negative weight across all of a track's tags, then combines them:

| Weight range | Effect |
|---|---|
| `+1` to `+3` | Prefer track (score reduced by up to 75%) |
| `-1` to `-3` | Avoid track (score increased) |
| `≤ -4` or date tag excluded | Exclude track completely (score = 999999) |

**Tag Sequences:**

```javascript
{
  pattern: Array<String>,  // Sequence of tags that must match consecutively
  next: String,            // Tag that should (or should not) follow the pattern
  not: Boolean,            // If true, 'next' tag must NOT be present
  index: Number            // Runtime: current position in pattern matching
}
```

When the full `pattern` sequence is matched, the next song selected must satisfy the `next`/`not` constraint. A penalty of +1 is applied per violated rule.

#### Artist Handling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `artistSeparators` | Array\<String\> | `[' feat']` | Substrings that split a compound artist name; only the part before the separator is used |
| `artistAliases` | Object | `null` | Map of artist name → canonical name (case-insensitive, applied before and after separator splitting) |

**Artist normalization steps:**
1. Convert to lowercase
2. Apply aliases
3. Split on each separator; keep only the part before the first match
4. Apply aliases again (in case the separator revealed an alias)

#### Jingle Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `jingleOrder` | String | `'shuffle'` | `'shuffle'` — shuffle once; `'shuffle_repeat'` — re-shuffle after each full cycle; `'preserve'` — keep original order |
| `jingleInterval` | Number | `0` | Minutes between jingles (0 = auto: evenly distribute across duration) |
| `preserveAllJingles` | Number | `0` | If non-zero, keep all jingles at their original positions (relative to song count) |
| `protectFirstJingle` | Boolean | `false` | If true, the first jingle in the input array is reserved as `firstJingle` and never removed |
| `firstJingleAfterNews` | Boolean | `true` | If true, the `firstJingle` is appended after each news block |

#### Moderation / Word Track Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wordDistribution` | String | `'random'` | How moderation tracks are handled |

**Word Distribution Modes:**

| Mode | Behavior |
|------|----------|
| `'random'` | Moderation tracks are shuffled into the song pool like songs (with a 0.75 score multiplier, making them slightly preferred) |
| `'preserve'` | Moderation tracks are removed from the pool and re-inserted at their original position (relative to song count) |
| `'link_next'` | Moderation track is linked to the song that follows it in the input; it is inserted immediately before that song in the output |
| `'link_previous'` | Moderation track is linked to the song that precedes it in the input; it is inserted immediately after that song in the output |

#### News Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `newsInterval` | Number | `60` | Minutes between news breaks |
| `newsMin` | Number | `59` | Start minute of the news time window |
| `newsMax` | Number | `15` | End minute of the news time window |
| `firstJingleAfterNews` | Boolean | `true` | Insert `firstJingle` after each news block |

**News Time Window:**

The news window defines the minutes-past-the-hour range in which a news break may start.

- If `newsMax > newsMin`: window is `[newsMin, newsMax]` (e.g., `30`–`45`)
- If `newsMax < newsMin`: window wraps the hour boundary (e.g., `newsMin=59`, `newsMax=15` means `:59` through `:15` of the next hour)

A news break is only scheduled if at least 45 minutes have elapsed since the last news. News is not scheduled in the last 15 minutes of the playlist.

If the playlist starts within the news window, the first element is a news block (`startsWithNews = true`), and `firstJingle` is not prepended at the very beginning.

#### Ad Trigger Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `adTrigger` | Number | `null` | Track ID of the ad trigger track |
| `adSeparator` | Number | `null` | Track ID of the ad separator (played immediately before the trigger) |
| `adPositions` | Array\<Number\> | `[15, 45]` | Two minutes-past-the-hour positions for ad breaks each hour |
| `adJingleCollisionStrategy` | String | `'keep_both'` | How to handle a collision between an ad trigger and a scheduled jingle |

**Ad Position Validation:**

The two positions must be 20–40 minutes apart. If they are not, the algorithm adjusts them: if `position1 > 30` it is clamped to 30, then `position2` is set to `position1 + 20` (too close) or `position1 + 40` (too far).

**Ad Jingle Collision Strategies:**

| Strategy | Behavior |
|----------|----------|
| `'keep_both'` | Insert both the ad trigger and the jingle |
| `'move_adtrigger'` | Skip the ad trigger insertion up to 2 times, allowing it to shift later |
| `'remove_jingle'` | Remove the conflicting jingle |

#### Track Rules Options

Track rules bind a specific track (typically a jingle or moderation clip) to songs that match a filter. When a matching song is placed in the playlist, the bound track is automatically inserted before or after it.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `trackRules` | Array\<Object\> | *(disabled)* | Array of track rule definitions |
| `trackRuleGroups` | Object | `{}` | Named groups for coordinating related rules |
| `trackRuleJingleCollisionStrategy` | String | `undefined` | How to handle a collision between a rule-bound jingle and a regular jingle |
| `trackRuleGroupCollisionStrategy` | String | `undefined` | How to select among multiple matching rule groups |

**Track Rule Object:**

```javascript
{
  trackId: Number,         // ID of the track to insert (must be in the input tracks array)
  filterType: String,      // 'tag' | 'artist' | 'title' | 'artist_title'
  filter: String,          // Tag name, or search term (matched as substring, case-insensitive)
  position: String,        // 'before' | 'after'
  minDistance: Number,     // Minimum minutes between applications of this rule
  groupName: String,       // Group name (must match a key in trackRuleGroups)

  // Runtime fields
  active: Boolean,         // True if the bound track was found in the input array
  lastPlay: Number,        // Timestamp of last application (initialized to startTime - 24h)
  term: String             // Normalized filter term (cached at first use)
}
```

**Track Rule Groups:**

```javascript
{
  "groupName": {
    minDistance: Number,          // Minimum minutes between any rule in this group
    multiMatchSelection: String,  // 'all' | 'first' | 'any' — how to pick when multiple rules match
    lastPlay: Number              // Runtime: timestamp of last group application
  }
}
```

**Track Rule Jingle Collision Strategies** (`trackRuleJingleCollisionStrategy`):

| Strategy | Behavior |
|----------|----------|
| `'keep_both'` | Insert both the rule-bound jingle and the regular jingle |
| `'keep_rule_jingle'` | Replace the regular jingle with the rule-bound jingle |
| `'keep_standard_jingle'` | Skip the rule-bound jingle |

**Track Rule Group Collision Strategies** (`trackRuleGroupCollisionStrategy`):

| Strategy | Behavior |
|----------|----------|
| `'all'` | Apply rules from all matching groups |
| `'first'` | Apply only the first matching group |
| `'any'` | Apply one randomly selected matching group |

#### Scheduling Rules Options

Scheduling rules insert specific tracks at defined times within the playlist.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scheduled` | Array\<Object\> | *(disabled)* | Array of scheduling rule definitions |

**Scheduling Rule Object:**

```javascript
{
  tag: String,             // Selector tag — tracks carrying this tag are the candidates
  selection: String,       // Selection mode (see below)
  minute: Number,          // Minute of the hour at which to schedule
  hour: Number,            // (optional) Specific hour, or special value (see below)
  interval: Number,        // (optional) Hour interval, or negative for minute interval
  day: Number,             // (optional) Day-of-week filter (see below)
  index: Number,           // (optional) 1-based track index for 'index' mode
  exclude: Boolean,        // If true, matching tracks are excluded from the regular pool
  introJingleId: Number,   // (optional) ID of a jingle to play before the scheduled track
  trackType: String,       // (optional) Expected track type (informational)
  groupName: String,       // (optional) Group name for coordination
  minDistance: Number,     // (optional) Minimum minutes between applications
  lastPlay: Number,        // Runtime: timestamp of last application

  // Runtime fields
  tracks: Array<Track>,    // Tracks matching the tag (populated during initialization)
  trackIdxs: Array<Number>,// Original indices of matching tracks
  timeTracks: Array<Track> // For 'time' selection mode: hour → track map
}
```

**Selection Modes:**

| Mode | Behavior |
|------|----------|
| `'random'` | Shuffle candidates; if they are songs, use **late selection** (track chosen at assembly time based on artist blocking and recent plays) |
| `'rotate'` | Cycle through candidates in order, advancing past the one played most recently |
| `'calculatedaily'` | Select by `floor(startTime / 24h) % trackCount` — same track all day, advances each day |
| `'date'` | Match the track whose `title` or `album` contains today's date as `DD.MM.` |
| `'time'` | Match the track whose `title` or `album` contains the current hour as a number (0–23) |
| `'index'` | Use the track at the given 1-based `index` |

**Late Selection** (`selection: 'random'` with song-type candidates): Instead of choosing a track at scheduling time, the full candidate list is stored. At assembly time, when the scheduled slot is reached, [`selectFromScheduledCandidates()`](../src/StationAdmin.ts:1404) picks the best candidate based on artist blocking, recent track names, and play count.

**Special `hour` Values:**

| Value | Meaning |
|-------|---------|
| ≥ 0 | Specific hour of the day |
| `-1` | Every hour (use with `interval`) |
| `-2` | One randomly chosen hour within the playlist duration |
| `-3` | Bound to news — insert **before** each news block |
| `-4` | Bound to news — insert **after** each news block |

**Special `day` Values:**

| Value | Meaning |
|-------|---------|
| `-1` | Every day (default) |
| `-2` | Weekdays (Monday–Friday) |
| `-3` | Weekend (Saturday–Sunday) |
| `0`–`6` | Specific day (0 = Sunday, 6 = Saturday) |

**`interval` Behavior:**

| Value | Meaning |
|-------|---------|
| Positive integer | Schedule every N hours |
| `0` | Schedule every hour |
| `-1` | Schedule once per hour at `minute` |
| `< -1` | Schedule multiple times per hour: at `minute`, `minute + |interval|`, `minute + 2×|interval|`, … |

**`introJingleId`:**

If set, the referenced jingle (which must appear in the input `tracks` array and be registered as a bound track) is inserted immediately before the scheduled track. The jingle is looked up in the track rule engine's `boundTracks` map.

---

### 3. `trackStats` (Array or null)

Recent play history for the station, used to refine the playlist start time and apply repeat-avoidance logic.

#### TrackStat Object Structure

```javascript
{
  id: Number,              // Track ID
  started_at: String,      // ISO 8601 timestamp when the track started
  ends_at: String,         // ISO 8601 timestamp when the track ends
  type: String,            // Track type
  artist: {                // Artist object (null for non-music tracks)
    name: String
  }
}
```

#### How `trackStats` Is Used

| Purpose | Detail |
|---------|--------|
| **Start time refinement** | The maximum `ends_at` across all stats entries becomes the playlist start time (instead of the default `executionTime + 2 min`) |
| **Recent artist tracking** | The last 12 entries with a non-null artist are marked as recent; their artists start from segment 1 in pool building |
| **Repeat avoidance** | Tracks played within `avoidRepeat` hours receive a score penalty (or are excluded if `excludePreviousTracks` is set) |
| **Jingle timing** | The most recent jingle's age (in minutes) is used to offset the first jingle in the new playlist |
| **News timing** | The last news start time is recorded to enforce the 45-minute minimum gap |
| **Track rule history** | `lastPlay` is updated for any bound track found in the stats |
| **Scheduling rotation** | `lastStartedAt` is populated for all tracks, used by `'rotate'` selection mode |

---

## Output

**Type:** `Array<Track>`

An ordered array of track objects representing the generated playlist. Each element is a reference to one of the input track objects (with runtime fields added). In tag pattern mode, a track may appear more than once (it is appended to the pool for reuse).

**Playlist characteristics:**

- **Duration**: Approximately matches `opts.duration`; may be slightly longer due to scheduled insertions
- **Artist separation**: No two songs by the same artist within ~30 minutes (1 hour in tag pattern mode)
- **Jingles**: Distributed at regular intervals; ordering controlled by `jingleOrder`
- **News**: Inserted at the configured time window; surrounded by jingles if configured
- **Ad triggers**: Inserted at the two configured minute positions each hour
- **Scheduled tracks**: Inserted at their target times within a ±15-minute window
- **Track rules**: Bound tracks inserted immediately before/after matching songs
- **Linked tracks**: Moderation tracks inserted adjacent to their linked song
- **Preserved tracks**: Jingles or moderation tracks re-inserted at their original song-count position

---

## How It Works

### Phase 1 — Initialization

1. **Options parsing**: All options are read with their defaults. If `opts.time` is provided, `Date.now` is overridden for deterministic execution.
2. **Start time estimate**: Default is `executionTime + 2 minutes`. Refined later from `trackStats`.
3. **Track rule engine setup**: Each `trackRules` entry registers its `trackId` in `boundTracks`. `lastPlay` is initialized to `startTime − 24 h`.
4. **Scheduling setup**: Selector tags from `scheduled` rules are indexed. `introJingleId` values are registered in `boundTracks`.
5. **Track stats processing**:
   - Recent artists (last 12 with artist) → `recentArtists`
   - Recent plays within `avoidRepeat` hours → `lastPlays`
   - Last jingle play age → `lastJinglePlay`
   - Last news start → `lastNewsStarted`
   - Track rule `lastPlay` updated for any bound track in stats
   - Start time refined: `max(ends_at)` across all stats entries
6. **Tag pattern validation**: If `tagPattern` is set but there are not enough tagged tracks to fill 1 hour, the pattern is discarded.

### Phase 2 — Candidate Pool Building

The `TrackPool.build()` method iterates up to 20 times, each time filling one block of `blockLength` hours, until the total candidate duration meets `opts.duration`.

**Per iteration — `initTracksAndArtists()`:**

Each track in the input array is classified:

| Track | Action |
|-------|--------|
| `id === 1` / `type === 'news'` | Assigned to `scheduler.newsTrack` |
| Ad trigger / separator | Assigned to `scheduler.adTrigger` / `adSeparator` |
| In `boundTracks` | Stored for track rule use; skipped from pool |
| Has a selector tag | Added to the scheduling rule's candidate list; skipped if `exclude: true` |
| `type === 'jingle'` | Added to `scheduler.jingles` (or `firstJingle` / `adTrigger` / preserved list) |
| `type === 'moderation'` with `wordDistribution !== 'random'` | Preserved or linked; skipped from pool |
| `id === 8664493` | Sets `excludeFollowing = true`; all subsequent tracks are ignored |
| Everything else | Scored and added to the artist map |

**Scoring** (`assignTrackScore()`):

1. Base score: random value in `[100, 600)`
2. Tag weight adjustment: combined weight applied as a score multiplier
3. Date tag exclusion: score set to `999999` if outside date range
4. Moderation type bonus: score multiplied by `0.75` (preferred over songs)
5. Recent play penalty: `+0` to `+500` based on time since last play; or score `999999` if `excludePreviousTracks` is set

Tracks with score > 10 000 are excluded from the pool.

**Artist grouping and segment building** (`prepareSongPool()`):

- Artists are sorted by their best track score
- Up to `maxTracksPerArtist` tracks per artist are selected
- The pool is divided into `maxTracksPerArtist × 2` segments
- Each artist's tracks are spread across segments with maximum separation
- Recent artists (from `trackStats`) start from segment 1, not 0
- Each segment is shuffled; segments are concatenated into the song pool

**Special case — `trackNameLimit === 9999`:**

During pool building, tracks are deduplicated by group tags: if a track's `normTitle` or any `=`-prefixed tag has already been used, the track is skipped entirely. This ensures no two tracks with the same title or group tag appear in the pool.

**Multi-iteration:**

After each iteration, `lastPlays` is updated with the minutes-since-play for each selected track, and `recentArtists` is set to the last 12 artists in the selected pool. The next iteration avoids repeating those artists in the first segment.

### Phase 3 — Scheduled Event Pre-computation

Before assembly, all time-based events are computed and sorted:

1. **News scheduling** (`scheduleNews()`): For each news window occurrence within the playlist duration, a `ScheduledElement` is created containing `[preNewsJingle?, newsTrack, firstJingle?]`. The `jingleCollision` strategy is set to `'remove_jingle'` if jingles are present.

2. **Jingle scheduling** (`scheduleJingles()`): Jingles are distributed at `jingleInterval`-minute intervals. The first offset is determined by `lastJinglePlay` (from stats) or randomized. When a news jingle falls within one interval of a regular jingle slot, the regular jingle's base is reset to align with the news jingle, keeping the spacing even. In tag pattern mode, jingles are only scheduled separately if no jingle track has a tag referenced by the pattern.

3. **Ad trigger scheduling** (`scheduleAdTriggers()`): Ad triggers are placed at the two `adPositions` minutes past each hour within the playlist duration.

4. **Rule-based scheduling** (`scheduleByRules()`): Each `scheduled` rule with a resolved track list is processed. Hours and minutes are computed from `hour`/`interval`/`minute`. For `hour: -3/-4`, the scheduled element is attached to the corresponding news block. For `selection: 'random'` with song candidates, a late-selection element is created.

All scheduled elements are sorted by `minTime`.

### Phase 4 — Unified Single-Pass Assembly

The assembly loop runs until the playlist duration is met or the song pool is exhausted.

**Two selector modes:**

- **Simple mode** (no `tagPattern`): `SimpleTrackSelector` iterates the song pool sequentially, checking up to 6 candidates for artist blocking, tag sequence rules, and track name similarity. The best candidate (lowest penalty) is selected.

- **Tag pattern mode** (`tagPattern` set): `TagPatternTrackSelector` maintains an index of pool positions by tag/type. At each step, it looks up candidates for the current pattern position, applies artist blocking and track name checks, and selects the best. After consuming a track, it re-appends it to the pool for potential reuse. The pattern pointer advances cyclically. The loop ends when the pattern fails to find any candidate `tagPattern.length` times in a row.

**Per-iteration steps:**

1. **Check scheduled events** (`insertScheduledEvents()`): If the current time has reached a scheduled element's `minTime`, it is inserted. Jingle collision strategies are applied. If the element cannot be inserted (collision, short track pushback), it may be skipped or delayed up to `maxTime`. After insertion, the selector may reselect a better next song.

2. **Add track to playlist** (`addTrackToPlaylist()`):
   - **Bound tracks (before)**: Track rules are evaluated; matching bound tracks are inserted before the song. Jingle collision strategies are applied.
   - **Linked moderation (before)**: If `wordDistribution: 'link_next'`, the linked moderation track is inserted.
   - **The song itself** is appended.
   - **Preserved tracks**: Any preserved jingle or moderation track whose `position` matches the current song count is re-inserted.
   - **Bound tracks (after)**: Track rules for `position: 'after'` are applied.
   - **Linked moderation (after)**: If `wordDistribution: 'link_previous'`, the linked moderation track is inserted.

3. **Consume track**: The selected pool slot is set to `null` (simple mode) or removed from the pattern index (pattern mode).

---

## Configuration Reference Summary

```javascript
{
  // Core
  duration: 64800,              // seconds, max 64800
  blockLength: 19,              // hours per iteration
  maxTracksPerArtist: 18,       // per block
  avoidRepeat: 2,               // hours
  excludePreviousTracks: 0,     // non-zero = hard exclude
  trackNameLimit: 0,            // 0=off, N=window size, 9999=pool dedup

  // Testing
  time: '2026-04-04T10:00:00Z',// override Date.now()
  random: myRng,                // custom RNG function
  debug: false,

  // Tags
  tagWeights: { 'rock': 2, 'slow': -1, 'explicit': -4 },
  tagPattern: ['song', 'song', 'jingle'],
  tagSequences: [{ pattern: ['upbeat', 'upbeat'], next: 'slow', not: false, index: 0 }],

  // Artists
  artistSeparators: [' feat', ' ft.'],
  artistAliases: { 'p!nk': 'pink' },

  // Jingles
  jingleOrder: 'shuffle',       // 'shuffle' | 'shuffle_repeat' | 'preserve'
  jingleInterval: 0,            // 0 = auto
  preserveAllJingles: 0,        // non-zero = preserve positions
  protectFirstJingle: false,
  firstJingleAfterNews: true,

  // Moderation
  wordDistribution: 'random',   // 'random' | 'preserve' | 'link_next' | 'link_previous'

  // News
  newsInterval: 60,
  newsMin: 59,
  newsMax: 15,

  // Ads
  adTrigger: 10001,             // track ID
  adSeparator: 10002,           // track ID
  adPositions: [15, 45],
  adJingleCollisionStrategy: 'keep_both', // 'keep_both' | 'move_adtrigger' | 'remove_jingle'

  // Track Rules
  trackRules: [
    {
      trackId: 999,
      filterType: 'artist',     // 'tag' | 'artist' | 'title' | 'artist_title'
      filter: 'Taylor Swift',
      position: 'before',       // 'before' | 'after'
      minDistance: 60,
      groupName: 'intros'
    }
  ],
  trackRuleGroups: {
    intros: { minDistance: 30, multiMatchSelection: 'first' }
  },
  trackRuleJingleCollisionStrategy: 'keep_both',
  trackRuleGroupCollisionStrategy: 'all',

  // Scheduling
  scheduled: [
    {
      tag: 'promo',
      selection: 'rotate',      // 'random'|'rotate'|'calculatedaily'|'date'|'time'|'index'
      minute: 30,
      interval: 1,              // every hour; negative = multiple times per hour
      day: -1,                  // -1=every day, -2=weekdays, -3=weekend, 0-6=specific day
      hour: -1,                 // -1=every hour, -2=random, -3=before news, -4=after news
      exclude: false,
      introJingleId: 888
    }
  ]
}
```

---

## Customization Hooks

Two stub functions are provided for extending the algorithm without modifying core logic:

```javascript
function customScheduledElementCreate(rule, trackIdx, scheduledElement) {}
function customInitialize() {}
```

- **`customScheduledElementCreate`** — called after each scheduled element is created by a scheduling rule. Can be used to modify the element (e.g., change `jingleCollision`, add extra tracks).
- **`customInitialize`** — called after all initialization is complete but before pool building begins.

---

## Debugging

Set `opts.debug = true` to enable `console.log` output. Debug messages include:

- Execution time and estimated start time
- Each scheduled news block with its time window
- Each scheduled jingle with its target time
- Each rule-based scheduled element with track title and index
- Each scheduled element inserted during assembly, with actual vs. target time

For deterministic/reproducible runs (e.g., in tests), inject `opts.random` with a seeded RNG and `opts.time` with a fixed ISO 8601 timestamp.

---

## Testing

Tests are in [`test/StationAdminTests.js`](../test/StationAdminTests.js) and run with Node.js 18+ (`node test/StationAdminTests.js`). The compiled [`src/StationAdmin.js`](../src/StationAdmin.js) is loaded via `vm.runInThisContext()` and re-evaluated fresh for each test call, preventing state leakage between tests.

**Determinism** is achieved by injecting two options:
- `opts.random` — an [Alea](https://github.com/coverslide/node-alea) seeded PRNG for reproducible shuffle order
- `opts.time` — a fixed ISO 8601 timestamp to freeze `Date.now()` so all scheduling calculations are stable

**Multiple seeds:** Each test scenario is registered 5 times via `testWithMultipleSeeds()`, each with a different seed string. This guards against constraints being satisfied by chance and catches edge cases that only appear with certain random orderings.

Each test loads a fixture from `test/resources/`, configures `opts`, runs the algorithm, and asserts invariants: output duration (±10%), jingle spacing, artist separation (≥30 min), news placement, ad trigger positions, bound jingle presence, scheduled item timing, late selection correctness, and moderation track positioning. Every feature is tested in both simple mode and tag pattern mode.

---

## Related Files

- [`src/StationAdmin.ts`](../src/StationAdmin.ts) — TypeScript source (compiled to `src/StationAdmin.js` for deployment)
- [`src/StationAdmin.js`](../src/StationAdmin.js) — Compiled JavaScript deployed to laut.fm
- [`test/StationAdminTests.js`](../test/StationAdminTests.js) — Unit tests
