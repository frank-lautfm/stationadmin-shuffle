# Resume Algorithm Documentation

**Source:** [`src/Resume.js`](../src/Resume.js)

## Overview

Resume is a continuation algorithm for laut.fm radio stations. Given a fixed, pre-ordered playlist, it finds the position where the station last left off (based on recent play history) and returns the playlist starting from that point, wrapping around to the beginning. This ensures the station always continues from where it stopped rather than restarting from the top.

## Function Signature

```javascript
(function(tracks, opts, trackStats) { ... })(tracks, opts, trackStats)
```

**Returns:** `Array<Track>` — the full `tracks` array rotated so that playback resumes after the last known position. If no matching position is found in the history, the playlist starts from the beginning (`index 0`).

---

## Input Parameters

### 1. `tracks` (Array)

The complete, ordered playlist. The algorithm does not reorder or filter tracks; it only determines the starting position.

### 2. `opts` (Object)

Not used. The algorithm accepts the parameter for interface compatibility but ignores all options.

### 3. `trackStats` (Array)

Recent play history. Each entry must have at least:

```javascript
{
  id: Number   // Track ID (entries with id <= 0 are ignored)
}
```

The algorithm uses the last entries in `trackStats` to identify the most recent position in the playlist.

---

## How It Works

### Phase 1 — Build Entry Point Index

For every position `i` in `tracks`, the algorithm computes a 3-track hash:

```
hash = tracks[i].id XOR tracks[i+1].id XOR tracks[i+2].id
```

(indices wrap around using modulo). This hash maps to the **resume position**: `(i + 3) % length` — i.e., the track that should play *after* those three tracks.

All `(hash → resumeIndex)` pairs are stored in a lookup map.

### Phase 2 — Find Last Position in History

The IDs from `trackStats` are collected (skipping entries with `id ≤ 0`). The algorithm then scans backwards through the stats list, computing the same 3-track XOR hash for each consecutive triple:

```
hash = statsIds[i-2] XOR statsIds[i-1] XOR statsIds[i]
```

The first hash that matches an entry in the index determines the resume position. The most recent match wins (scanning from newest to oldest).

### Phase 3 — Rotate Playlist

The playlist is assembled by appending tracks from `startIdx` to the end, then from `0` to `startIdx - 1`:

```
[tracks[startIdx], ..., tracks[n-1], tracks[0], ..., tracks[startIdx-1]]
```

If no match was found in the history, `startIdx` remains `0` and the full playlist is returned in its original order.

---

## Usage Example

```javascript
// tracks: fixed ordered playlist (e.g. a curated 24h programme)
// trackStats: recent play history from the laut.fm API
const playlist = resumeFunction(tracks, {}, trackStats);
// playlist starts from the track after the last known position
```

---

## Notes

- The algorithm is stateless and deterministic given the same `tracks` and `trackStats`.
- It works best when the playlist is long enough that the 3-track XOR hash is unique across all positions. Hash collisions are unlikely but possible with very short or repetitive playlists.
- If the station has been playing a different playlist (different track IDs), no match will be found and playback starts from the beginning.
- `opts` is accepted but ignored; pass `{}` or `null`.

---

## Related Files

- [`src/BlockSelect_v1.js`](../src/BlockSelect_v1.js) — Block selection algorithm
