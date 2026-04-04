#!/usr/bin/env node

/**
 * Script to shuffle a playlist using the StationAdmin.js shuffle algorithm
 * 
 * Usage: node shuffleplaylist.js <token> <stationid> <playlistid> <duration>
 * 
 * Example: node shuffleplaylist.js mytoken123 mystation 456 7200
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 4) {
    console.error('Usage: node shuffleplaylist.js <token> <stationid> <playlistid> <duration>');
    console.error('Example: node shuffleplaylist.js mytoken123 mystation 456 7200');
    console.error('  duration: playlist duration in seconds');
    process.exit(1);
}

const [token, stationId, playlistId, durationStr, time, statsfile] = args;
const duration = parseInt(durationStr, 10);

if (isNaN(duration) || duration <= 0) {
    console.error('Error: duration must be a positive number (in seconds)');
    process.exit(1);
}

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
 * Load and execute the StationAdmin.js shuffle function
 * @param {Array} tracks - Playlist tracks
 * @param {Object} opts - Shuffle options
 * @param {Array} trackStats - Track statistics from last 24 hours
 * @returns {Array} - Shuffled tracks
 */
function executeShuffleFunction(tracks, opts, trackStats) {
    // Load the StationAdmin.js file
    const shuffleFunctionPath = path.join(__dirname, '..', 'src', 'StationAdmin.js');
    const shuffleFunctionCode = fs.readFileSync(shuffleFunctionPath, 'utf8');
    
    // The StationAdmin.js file contains an IIFE (Immediately Invoked Function Expression)
    // We need to extract the function and call it with our parameters
    // The file format is: ( function( tracks, opts, trackStats ){ ... })
    // We'll evaluate it and call it

    // Use vm.runInThisContext with filename option to enable debugging
    // This allows the debugger to map breakpoints to the actual source file
    const shuffleFunction = vm.runInThisContext(shuffleFunctionCode, {
        filename: shuffleFunctionPath,
        lineOffset: 0,
        columnOffset: 0
    });
    
    return shuffleFunction(tracks, opts, trackStats);
}

/**
 * Main execution
 */
async function main() {
    console.log('laut.fm Playlist Shuffler');
    console.log('=========================');
    console.log(`Station: ${stationId}, Playlist: ${playlistId}, Duration: ${duration}s (${Math.floor(duration/3600)}h ${Math.floor((duration%3600)/60)}m)\n`);

    try {
        // Fetch playlist tracks (1st parameter)
        console.log('Fetching playlist tracks...');
        const tracksPath = `/stations/${stationId}/playlists/${playlistId}/tracks`;
        let tracks = await makeApiRequest(tracksPath);
        
        // Handle different response formats
        if (tracks && tracks.tracks && Array.isArray(tracks.tracks)) {
            tracks = tracks.tracks;
        } else if (!Array.isArray(tracks)) {
            throw new Error('Unexpected tracks response format');
        }
        console.log(`✓ Loaded ${tracks.length} tracks\n`);

        // Fetch playlist details to get shuffle_opts (2nd parameter)
        console.log('Fetching playlist configuration...');
        const playlistPath = `/stations/${stationId}/playlists/${playlistId}`;
        const playlistData = await makeApiRequest(playlistPath);
        
        let opts = playlistData.shuffle_opts || {};
        
        // Add the duration to opts as numeric value
        opts.duration = duration;
        if(time) {
            opts.time = time;
            opts.debug = true;
        }
        
        console.log(`✓ Loaded shuffle options:`, JSON.stringify(opts, null, 2));
        console.log();

        var trackStats = [];

        if(statsfile) {
            var fileContent = fs.readFileSync(statsfile, 'utf8');
            trackStats = JSON.parse(fileContent);
        }
        else {
            // Fetch track stats from last 24 hours (3rd parameter)
            console.log('Fetching track statistics (24h)...');
            const statsPath = `/stations/${stationId}/tracks/stats/24h`;
            trackStats = await makeApiRequest(statsPath);
            
            if (!Array.isArray(trackStats)) {
                throw new Error('Unexpected trackStats response format');
            }
            console.log(`✓ Loaded ${trackStats.length} track statistics\n`);
        }

        // Execute the shuffle function
        console.log('Executing shuffle algorithm...');
        const shuffledTracks = executeShuffleFunction(tracks, opts, trackStats);
        console.log(`✓ Shuffle complete: ${shuffledTracks.length} tracks in result\n`);

        // Print the results
        console.log('=== SHUFFLED PLAYLIST ===\n');
        
        let totalDuration = 0;
        shuffledTracks.forEach((track, index) => {
            const artist = track.artist || 'Unknown Artist';
            const title = track.title || 'Unknown Title';
            const tags = track.tags && track.tags.length > 0 ? track.tags.join(', ') : '(no tags)';
            const type = track.type || 'song';
            const durationMin = Math.floor(track.duration / 60);
            const durationSec = track.duration % 60;
            
            console.log(`${(index + 1).toString().padStart(3)}. [${type.padEnd(10)}] ${artist} - ${title}`);
            console.log(`     Duration: ${durationMin}:${durationSec.toString().padStart(2, '0')} | Tags: ${tags}`);
            
            totalDuration += track.duration;
        });
        
        const totalHours = Math.floor(totalDuration / 3600);
        const totalMinutes = Math.floor((totalDuration % 3600) / 60);
        const totalSeconds = totalDuration % 60;
        
        console.log(`\n=== SUMMARY ===`);
        console.log(`Total tracks: ${shuffledTracks.length}`);
        console.log(`Total duration: ${totalHours}h ${totalMinutes}m ${totalSeconds}s (${totalDuration}s)`);
        console.log(`Target duration: ${Math.floor(duration/3600)}h ${Math.floor((duration%3600)/60)}m ${duration%60}s (${duration}s)`);
        
        console.log('\nDone.');

    } catch (error) {
        console.error(`\nError: ${error.message}`);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run the script
main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
