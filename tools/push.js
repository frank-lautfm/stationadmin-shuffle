#!/usr/bin/env node

/**
 * Push a shuffle script to the laut.fm automation algorithm API.
 *
 * Reads credentials from a .env file in the repo root (see .env.example).
 *
 * Usage: node tools/push.js [alias|algorithmName] [sourceFile]
 *
 * Aliases:
 *   release  →  stationadmin_shuffle   (default)
 *   beta     →  stationadmin_beta
 *   prev     →  stationadmin_previous
 *   dev      →  stationadmin_develop
 *
 * Any unrecognised first argument is used as a literal algorithm name.
 *
 * Defaults:
 *   alias      : release  (→ stationadmin_shuffle)
 *   sourceFile : src/StationAdmin.js
 *
 * Examples:
 *   npm run push
 *   node tools/push.js beta
 *   node tools/push.js dev src/StationAdmin.js
 *   node tools/push.js resume src/Resume.js
 */

'use strict';

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

// ---------------------------------------------------------------------------
// Load .env from repo root
// ---------------------------------------------------------------------------

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ---------------------------------------------------------------------------
// Alias map
// ---------------------------------------------------------------------------

const ALIASES = {
    release: 'stationadmin_shuffle',
    beta:    'stationadmin_beta',
    prev:    'stationadmin_previous',
    dev:     'stationadmin_develop',
};

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const aliasOrName  = args[0] || 'release';
const algorithmName = ALIASES[aliasOrName] || aliasOrName;

const sourceFileArg = args[1] || path.join('src', 'StationAdmin.js');
const sourceFile    = path.resolve(__dirname, '..', sourceFileArg);

// ---------------------------------------------------------------------------
// Validate environment
// ---------------------------------------------------------------------------

const token = process.env.LAUTFM_TOKEN;
if (!token) {
    console.error('Error: LAUTFM_TOKEN is not set.');
    console.error('Create a .env file in the repo root (see .env.example).');
    process.exit(1);
}

const archiveDir = process.env.LAUTFM_ARCHIVE_DIR || 'C:/Scriptarchiv';

// ---------------------------------------------------------------------------
// Read source file
// ---------------------------------------------------------------------------

if (!fs.existsSync(sourceFile)) {
    console.error(`Error: source file not found: ${sourceFile}`);
    process.exit(1);
}

const scriptContent = fs.readFileSync(sourceFile, 'utf8');

// ---------------------------------------------------------------------------
// API call — PATCH /automation_algorithms/:name
// ---------------------------------------------------------------------------

/**
 * URL-encode an algorithm name, using %20 for spaces (not +).
 * @param {string} name
 * @returns {string}
 */
function encodeAlgorithmName(name) {
    return encodeURIComponent(name).replace(/\+/g, '%20');
}

/**
 * PATCH the automation algorithm body on the laut.fm API.
 * @param {string} name     - Algorithm name (unencoded)
 * @param {string} body     - Script content
 * @param {string} token    - Bearer token
 * @returns {Promise<Object>} - Parsed JSON response
 */
function patchAutomationAlgorithm(name, body, token) {
    return new Promise((resolve, reject) => {
        const encodedName = encodeAlgorithmName(name);
        const payload     = JSON.stringify({ body });

        const options = {
            hostname: 'api.radioadmin.laut.fm',
            port:     443,
            path:     `/automation_algorithms/${encodedName}`,
            method:   'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'ORIGIN':        'StationAdmin',
                'Content-Type':  'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (err) {
                        reject(new Error(`Failed to parse API response: ${err.message}\nRaw: ${data}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Archive helper
// ---------------------------------------------------------------------------

/**
 * Write a timestamped archive copy of the script.
 * Filename format: <algorithmName>-<yyyy-MM-dd HH-mm>.js
 * @param {string} dir
 * @param {string} name
 * @param {string} content
 * @returns {string} - Full path of the written file
 */
function writeArchive(dir, name, content) {
    fs.mkdirSync(dir, { recursive: true });

    const now    = new Date();
    const yyyy   = now.getFullYear();
    const MM     = String(now.getMonth() + 1).padStart(2, '0');
    const dd     = String(now.getDate()).padStart(2, '0');
    const HH     = String(now.getHours()).padStart(2, '0');
    const mm     = String(now.getMinutes()).padStart(2, '0');
    const stamp  = `${yyyy}-${MM}-${dd} ${HH}-${mm}`;

    const filename = path.join(dir, `${name}-${stamp}.js`);
    fs.writeFileSync(filename, content, 'utf8');
    return filename;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('laut.fm Shuffle Script Push');
    console.log('===========================');
    console.log(`Algorithm : ${algorithmName}${ALIASES[aliasOrName] ? ` (alias: ${aliasOrName})` : ''}`);
    console.log(`Source    : ${sourceFile}`);
    console.log(`Length    : ${scriptContent.length} chars`);
    console.log(`Archive   : ${archiveDir}`);
    console.log('');

    console.log(`Pushing to API...`);
    try {
        await patchAutomationAlgorithm(algorithmName, scriptContent, token);
    } catch (err) {
        console.error(`Error: API call failed — ${err.message}`);
        process.exit(1);
    }
    console.log('✓ API update successful');

    let archivePath;
    try {
        archivePath = writeArchive(archiveDir, algorithmName, scriptContent);
    } catch (err) {
        console.error(`Warning: could not write archive — ${err.message}`);
        // Non-fatal: the push itself succeeded
        console.log('\nDone (archive skipped).');
        return;
    }
    console.log(`✓ Archive written: ${archivePath}`);
    console.log('\nDone.');
}

main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
