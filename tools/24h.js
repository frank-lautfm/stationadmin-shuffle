#!/usr/bin/env node

/**
 * Script to tracks played in the last 24 hours from laut.fm API
 * 
 * Usage: 24h.js <token> <stationid> 
 * 
 */

const https = require('https');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.error('Usage: node readplaylisttracks.js <token> <stationid>');
    console.error('Example: node readplaylisttracks.js mytoken123 mystation');
    process.exit(1);
}

const [token, stationId] = args;

/**
 * Make an HTTPS GET request to the laut.fm API
 * @param {string} path - API endpoint path
 * @returns {Promise<Object>} - Parsed JSON response
 */
function makeApiRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.radioadmin.laut.fm',
            port: 443,
            path: path,
            method: 'GET',
            headers: {
                'ORIGIN': 'StationAdminDev',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } catch (error) {
                        reject(new Error(`Failed to parse JSON: ${error.message}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}


/**
 * Fetch and display tracks played in the last 24 hours
 */
async function fetchLast24HoursTracks() {
    console.log('\n\n=== TRACKS PLAYED IN LAST 24 HOURS ===');
    console.log(`Station: ${stationId}\n`);

    try {
        const path = `/stations/${stationId}/tracks/stats/24h`;
        const tracks = await makeApiRequest(path);

        if (!tracks || tracks.length === 0) {
            console.log('No tracks found in last 24 hours.');
            return;
        }

        console.log(`Found ${tracks.length} tracks:\n`);

        tracks.forEach((track, index) => {
            const artist = track.artist && track.artist.name ? track.artist.name : 'Unknown Artist';
            const title = track.title || 'Unknown Title';
            const startedAt = track.started_at || '';
            const endsAt = track.ends_at || '';
            const listeners = track.listeners !== undefined ? track.listeners : 'N/A';
            
            console.log(`${index + 1}. ${artist} - ${title}`);
            if (startedAt) {
                console.log(`   Started: ${startedAt}, Ends: ${endsAt},  Listeners: ${listeners}`);
            }
        });

         const filename = `24h.json`;
        fs.writeFileSync(filename, JSON.stringify(tracks, null, 2), 'utf8');


    } catch (error) {
        console.error(`Error fetching last 24 hours tracks: ${error.message}`);
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('laut.fm API Track Reader');
    console.log('========================');

    // Fetch tracks from last 24 hours
    await fetchLast24HoursTracks();

    console.log('\n\nDone.');
}

// Run the script
main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
