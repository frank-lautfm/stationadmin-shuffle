# BlockSelect_v1 Algorithm Documentation

**Source:** [`src/BlockSelect_v1.js`](../src/BlockSelect_v1.js)

## Overview

BlockSelect_v1 is a block-selection algorithm for laut.fm radio stations. Instead of shuffling individual tracks, it treats the playlist as a sequence of pre-arranged **blocks** (thematic segments, show episodes, etc.) and selects one block to play in full. This is useful when the station operator has manually curated distinct programme blocks and wants the automation to rotate between them.

## Function Signature

```javascript
(function(tracks, opts, trackStats) { ... })(tracks, opts, trackStats)
```

**Returns:** `Array<Track>` — the tracks of the selected block, in their original order.

---

## Input Parameters

### 1. `tracks` (Array)

The full playlist as configured in StationAdmin. The algorithm splits this flat list into blocks and then returns one of them.

### 2. `opts` (Object)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `duration` | Number | `64800` | Maximum block duration in seconds (used as split threshold when no separator track is configured) |
| `separatorId` | Number | `-1` | Track ID of the separator track that marks block boundaries. If `-1`, blocks are split automatically when cumulative duration exceeds `duration`. |
| `includeSeparatorTrack` | Boolean | `false` | If `true`, the separator track itself is included as the first track of the next block |
| `iterationStepHours` | Number | `-1` | If > 0, selects blocks deterministically by time: `floor(now / stepHours) % blockCount`. If ≤ 0, selects randomly. |

### 3. `trackStats` (Array)

Recent play history used for repeat-avoidance in random mode. Each entry must have at least `id` (Number) and `type` (String) fields.

---

## How It Works

### Phase 1 — Block Detection

The algorithm scans the `tracks` array from start to finish and splits it into blocks:

- **Separator-based splitting** (`separatorId ≥ 0`): A new block starts whenever a track with `id === separatorId` is encountered. The separator track is discarded unless `includeSeparatorTrack` is `true`, in which case it becomes the first track of the new block.
- **Duration-based splitting** (`separatorId < 0`): A new block starts automatically once the cumulative duration of the current block exceeds `opts.duration`. The track that triggered the split is included in the new block.

Each block also gets a **hash** computed from the XOR of the IDs of its first three non-jingle tracks. This hash is used for recent-play detection.

If no blocks are detected (empty playlist), the original `tracks` array is returned unchanged. If only one block is detected, that block is returned directly.

### Phase 2 — Block Selection

**Random mode** (`iterationStepHours ≤ 0`):

1. A random block index is chosen.
2. The algorithm scans `trackStats` to check whether the selected block was recently played: it looks for the first track of the block in the stats, then computes the same 3-track XOR hash from the following stats entries and compares it to the block's stored hash.
3. If the block was recently played, the next block (index + 1, wrapping) is used instead.

**Time-based mode** (`iterationStepHours > 0`):

The block index is calculated deterministically from the current wall-clock time:

```
index = floor(Date.now() / (1000 × 60 × 60 × iterationStepHours)) % blockCount
```

This causes the station to advance to the next block every `iterationStepHours` hours, cycling through all blocks in order.

---

## Usage Examples

### Separator-based blocks

```javascript
// Tracks list contains a special separator track with id=9999 between each block.
// The separator is discarded; each block starts with the track after it.
const opts = {
  separatorId: 9999,
  includeSeparatorTrack: false
};
```

### Duration-based blocks with time rotation

```javascript
// Split into ~2-hour blocks, rotate every 2 hours
const opts = {
  duration: 7200,
  iterationStepHours: 2
};
```

---

## Notes

- The algorithm does not shuffle tracks within a block; the original order is preserved.
- The recent-play check in random mode is best-effort: it only detects a repeat if the first three non-jingle track IDs match exactly.
- There is a minor bug in the fallback index calculation (`(idx + 1) & blocks.length` should be `% blocks.length`), but in practice this only affects the edge case where the randomly selected block was recently played.

---

## Related Files

- [`src/Resume.js`](../src/Resume.js) — Resume/continuation algorithm
