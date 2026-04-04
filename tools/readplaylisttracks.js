#!/usr/bin/env node

/**
 * Script to read playlist tracks and tracks played in the last 24 hours from laut.fm API
 * 
 * Usage: node readplaylisttracks.js <token> <stationid> <playlistid>
 * 
 * Example: node readplaylisttracks.js mytoken123 mystation 456
 */

const https = require('https');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
    console.error('Usage: node readplaylisttracks.js <token> <stationid> <playlistid>');
    console.error('Example: node readplaylisttracks.js mytoken123 mystation 456');
    process.exit(1);
}

const [token, stationId, playlistId] = args;

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
 * Fetch and display playlist tracks
 */
async function fetchPlaylistTracks() {
    console.log('\n=== PLAYLIST TRACKS ===');
    console.log(`Station: ${stationId}, Playlist: ${playlistId}\n`);

    try {
        const path = `/stations/${stationId}/playlists/${playlistId}/tracks`;
        const response = await makeApiRequest(path);

        // The response might be an object with entries array or direct array
        let tracks = response;
        if (response && response.tracks && Array.isArray(response.tracks)) {
            tracks = response.tracks;
        } else if (!Array.isArray(response)) {
            console.log('Unexpected response format:', JSON.stringify(response, null, 2));
            return;
        }

        if (!tracks || tracks.length === 0) {
            console.log('No tracks found in playlist.');
            return;
        }

        const playlistPath = `/stations/${stationId}/playlists/${playlistId}`;
        const playlistData = await makeApiRequest(playlistPath);

        let entries = playlistData.entries || [];


        console.log(`Found ${tracks.length} tracks:\n`);

        let sortedTracks = [];
        for(let i = 0; i < entries.length; i++) {
            let t = tracks.find(t => t.id == entries[i].track_id);
            if(t) {
                sortedTracks.push(t);
            }
        }
        tracks = sortedTracks;

        tracks.forEach((track, index) => {
            const artist = track.artist ? track.artist : 'Unknown Artist';
            const title = track.title || 'Unknown Title';
            console.log(`${index + 1}. ${artist} - ${title}`);
        });

        // Dump tracks to JSON file
        const filename = `${playlistId}.json`;
        console.log(`\nWriting tracks to ${filename}...`);
        fs.writeFileSync(filename, JSON.stringify(tracks, null, 2), 'utf8');
        console.log(`✓ Successfully wrote ${tracks.length} tracks to ${filename}`);

    } catch (error) {
        console.error(`Error fetching playlist tracks: ${error.message}`);
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('laut.fm API Track Reader');
    console.log('========================');

    // Fetch playlist tracks
    await fetchPlaylistTracks();

    // Fetch tracks from last 24 hours
    // await fetchLast24HoursTracks();

    console.log('\n\nDone.');
}

// Run the script
main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
