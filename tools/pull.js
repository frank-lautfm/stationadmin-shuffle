#!/usr/bin/env node

/**
 * Pull (download) a shuffle script from the laut.fm automation algorithm API
 * and save it to the local archive directory.
 *
 * Reads credentials from a .env file in the repo root (see .env.example).
 *
 * Usage: node tools/pull.js [alias|algorithmName]
 *
 * Aliases:
 *   release  →  stationadmin_shuffle   (default)
 *   beta     →  stationadmin_beta
 *   prev     →  stationadmin_previous
 *   dev      →  stationadmin_develop
 *
 * Any unrecognised argument is used as a literal algorithm name.
 *
 * The downloaded script is written to:
 *   <LAUTFM_ARCHIVE_DIR>/<algorithmName>.js
 *
 * Examples:
 *   node tools/pull.js
 *   node tools/pull.js beta
 *   node tools/pull.js resume
 */

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ---------------------------------------------------------------------------
// Load .env from repo root
// ---------------------------------------------------------------------------

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ---------------------------------------------------------------------------
// Alias map (must match push.js)
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

const aliasOrName   = args[0] || 'release';
const algorithmName = ALIASES[aliasOrName] || aliasOrName;

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
// API call — GET /automation_algorithms/:name
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
 * Fetch the automation algorithm body from the laut.fm API.
 * @param {string} name   - Algorithm name (unencoded)
 * @param {string} token  - Bearer token
 * @returns {Promise<string>} - Script body content
 */
function getAutomationAlgorithm(name, token) {
    return new Promise((resolve, reject) => {
        const encodedName = encodeAlgorithmName(name);

        const options = {
            hostname: 'api.radioadmin.laut.fm',
            port:     443,
            path:     `/automation_algorithms/${encodedName}`,
            method:   'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'ORIGIN':        'StationAdmin',
                'Accept':        'application/json',
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const parsed = JSON.parse(data);
                        if (typeof parsed.body !== 'string') {
                            reject(new Error(`API response has no "body" field. Raw: ${data}`));
                        } else {
                            resolve(parsed.body);
                        }
                    } catch (err) {
                        reject(new Error(`Failed to parse API response: ${err.message}\nRaw: ${data}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('laut.fm Shuffle Script Pull');
    console.log('===========================');
    console.log(`Algorithm : ${algorithmName}${ALIASES[aliasOrName] ? ` (alias: ${aliasOrName})` : ''}`);
    console.log(`Archive   : ${archiveDir}`);
    console.log('');

    console.log('Fetching from API...');
    let body;
    try {
        body = await getAutomationAlgorithm(algorithmName, token);
    } catch (err) {
        console.error(`Error: API call failed — ${err.message}`);
        process.exit(1);
    }
    console.log(`✓ Received ${body.length} chars`);

    // Ensure archive directory exists
    try {
        fs.mkdirSync(archiveDir, { recursive: true });
    } catch (err) {
        console.error(`Error: could not create archive directory — ${err.message}`);
        process.exit(1);
    }

    const outPath = path.join(archiveDir, `${algorithmName}.js`);
    try {
        fs.writeFileSync(outPath, body, 'utf8');
    } catch (err) {
        console.error(`Error: could not write file — ${err.message}`);
        process.exit(1);
    }

    console.log(`✓ Written to: ${outPath}`);
    console.log('\nDone.');
}

main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
