#!/usr/bin/env node

/**
 * Script to generate a test playlist from a local playlist JSON file.
 *
 * The JSON file must contain both `shuffle_opts` and `tracks` fields,
 * as exported from the laut.fm StationAdmin (e.g. "Midnight Vibes.json").
 *
 * Usage: node testplaylist.js <path-to-json> [hours] [HH:mm]
 *
 * Example: node testplaylist.js "Midnight Vibes.json"
 * Example: node testplaylist.js "Midnight Vibes.json" 6
 * Example: node testplaylist.js "Midnight Vibes.json" 6 22:00
 *
 *   hours : playlist length in hours (default: 18)
 *   HH:mm : reference start time for scheduling (default: current time)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.length < 1) {
    console.error('Usage: node testplaylist.js <path-to-json> [hours] [HH:mm]');
    console.error('Example: node testplaylist.js "Midnight Vibes.json"');
    console.error('Example: node testplaylist.js "Midnight Vibes.json" 6');
    console.error('Example: node testplaylist.js "Midnight Vibes.json" 6 22:00');
    console.error('');
    console.error('  path-to-json : playlist JSON file containing shuffle_opts and tracks');
    console.error('  hours        : playlist length in hours (default: 18)');
    console.error('  HH:mm        : reference start time for scheduling (default: current time)');
    process.exit(1);
}

const [jsonFilePath, hoursArg, startTimeArg] = args;
const hours = hoursArg !== undefined ? parseFloat(hoursArg) : 18;

if (isNaN(hours) || hours <= 0) {
    console.error('Error: hours must be a positive number');
    process.exit(1);
}

// Parse optional HH:mm start time argument
let referenceDate;
if (startTimeArg !== undefined) {
    const match = startTimeArg.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        console.error(`Error: start time must be in HH:mm format, got: ${startTimeArg}`);
        process.exit(1);
    }
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (hh > 23 || mm > 59) {
        console.error(`Error: invalid start time: ${startTimeArg}`);
        process.exit(1);
    }
    referenceDate = new Date();
    referenceDate.setHours(hh, mm, 0, 0);
} else {
    referenceDate = new Date();
}

const duration = Math.round(hours * 3600);

// ---------------------------------------------------------------------------
// Load playlist JSON
// ---------------------------------------------------------------------------

const resolvedPath = path.resolve(jsonFilePath);

if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: file not found: ${resolvedPath}`);
    process.exit(1);
}

let playlistData;
try {
    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    playlistData = JSON.parse(fileContent);
} catch (err) {
    console.error(`Error reading/parsing JSON file: ${err.message}`);
    process.exit(1);
}

if (!Array.isArray(playlistData.tracks)) {
    console.error('Error: JSON file does not contain a "tracks" array');
    process.exit(1);
}

if (!playlistData.shuffle_opts || typeof playlistData.shuffle_opts !== 'object') {
    console.error('Error: JSON file does not contain a "shuffle_opts" object');
    process.exit(1);
}

const tracks     = playlistData.tracks;
const opts       = Object.assign({}, playlistData.shuffle_opts);
const trackStats = [];   // no 24h history available locally

// Set duration and reference time for the algorithm
opts.duration = duration;
opts.time     = referenceDate.toISOString();

// ---------------------------------------------------------------------------
// Execute the shuffle algorithm
// ---------------------------------------------------------------------------

/**
 * Load and run StationAdmin.js via vm so it can be debugged against the
 * actual source file (same pattern used in shuffleplaylist.js and tests).
 */
function executeShuffleFunction(tracks, opts, trackStats) {
    const shuffleFunctionPath = path.join(__dirname, '..', 'src', 'StationAdmin.js');
    const shuffleFunctionCode = fs.readFileSync(shuffleFunctionPath, 'utf8');

    const shuffleFunction = vm.runInThisContext(shuffleFunctionCode, {
        filename:     shuffleFunctionPath,
        lineOffset:   0,
        columnOffset: 0
    });

    return shuffleFunction(tracks, opts, trackStats);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date object as HH:MM:SS (local time).
 */
function formatTime(date) {
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

/**
 * Format a duration in seconds as M:SS or H:MM:SS.
 */
function formatDuration(seconds) {
    const s = seconds % 60;
    const m = Math.floor(seconds / 60) % 60;
    const h = Math.floor(seconds / 3600);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const playlistName = playlistData.id
    ? `Playlist #${playlistData.id}`
    : path.basename(resolvedPath, '.json');

console.log('laut.fm Playlist Test Generator');
console.log('================================');
const refTimeStr = `${referenceDate.getHours().toString().padStart(2,'0')}:${referenceDate.getMinutes().toString().padStart(2,'0')}`;
console.log(`File    : ${resolvedPath}`);
console.log(`Playlist: ${playlistName}`);
console.log(`Tracks  : ${tracks.length} in pool`);
console.log(`Target  : ${hours}h (${duration}s)`);
console.log(`Ref time: ${refTimeStr}\n`);

let shuffledTracks;
try {
    shuffledTracks = executeShuffleFunction(tracks, opts, trackStats);
} catch (err) {
    console.error(`Error running shuffle algorithm: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
}

// StationAdmin starts the playlist 2 minutes after execution time.
// We mirror that here so start times match what the server would produce.
const startMs  = referenceDate.getTime() + 2 * 60 * 1000;
let   cursorMs = startMs;

console.log('=== GENERATED PLAYLIST ===\n');

const TYPE_WIDTH   = 10;
const INDEX_WIDTH  = shuffledTracks.length.toString().length;

let totalDuration = 0;

shuffledTracks.forEach((track, index) => {
    const artist   = (track.artist || 'Unknown Artist').trim();
    const title    = (track.title  || 'Unknown Title').trim();
    const type     = (track.type   || 'song').padEnd(TYPE_WIDTH);
    const dur      = track.duration || 0;
    const startStr = formatTime(new Date(cursorMs));
    const durStr   = formatDuration(dur);

    const num = (index + 1).toString().padStart(INDEX_WIDTH);
    console.log(`${num}. ${startStr}  [${type}]  ${artist} - ${title}  (${durStr})`);

    cursorMs      += dur * 1000;
    totalDuration += dur;
});

const endTime = new Date(cursorMs);

console.log('\n=== SUMMARY ===');
console.log(`Total tracks   : ${shuffledTracks.length}`);
console.log(`Total duration : ${formatDuration(totalDuration)}`);
console.log(`Target duration: ${formatDuration(duration)}`);
console.log(`Start time     : ${formatTime(new Date(startMs))}`);
console.log(`End time       : ${formatTime(endTime)}`);
console.log('\nDone.');
