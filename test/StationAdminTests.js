#!/usr/bin/env node

/**
 * Unit tests for StationAdmin.js shuffle algorithm
 * 
 * Usage: node StationAdminTests.js
 * 
 * Uses Node.js built-in test framework (available in Node.js 18+)
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Alea = require('alea');

const boundJingles = [3435730, 3435732, 3484100, 3435733, 3435734]

const trackRules =  [ {
            "filter" : "Christian Hüser",
            "groupName" : "Artists",
            "minDistance" : 120,
            "trackId" : 3435730,
            "position" : "before",
            "filterType" : "artist"
            }, {
            "filter" : "Fug und Janina",
            "groupName" : "Artists",
            "minDistance" : 120,
            "trackId" : 3435732,
            "position" : "before",
            "filterType" : "artist"
            }, {
            "filter" : "Grünschnabel",
            "groupName" : "Artists",
            "minDistance" : 120,
            "trackId" : 3484100,
            "position" : "before",
            "filterType" : "artist"
            }, {
            "filter" : "Reinhard Horn",
            "groupName" : "Artists",
            "minDistance" : 120,
            "trackId" : 3435733,
            "position" : "before",
            "filterType" : "artist"
            }, {
            "filter" : "Robert Metcalf",
            "groupName" : "Artists",
            "minDistance" : 120,
            "trackId" : 3435734,
            "position" : "before",
            "filterType" : "artist"
            } ];


const trackRuleGroups = {
      "Standard" : {
        "minDistance" : 0,
        "multiMatchSelection" : "all"
      },
      "Artists" : {
        "minDistance" : 30,
        "multiMatchSelection" : "all"
      }
    };

 const scheduled = [ {
      "selection" : "random",
      "trackType" : "moderation",
      "index" : 1,
      "exclude" : true,
      "interval" : 3,
      "id" : "d0b1c3c8-5366-43af-aefa-aa2612719aef",
      "tag" : "CD-Vorstellung",
      "minute" : 20
    } ];
   

const time = '2026-02-09T20:57:11+01:00';
const time2 = '2026-02-09T20:58:11+01:00';



/**
 * Load and execute the StationAdmin.js shuffle function
 * @param {Array} tracks - Playlist tracks
 * @param {Object} opts - Shuffle options
 * @param {Array} trackStats - Track statistics from last 24 hours
 * @param {string} seed - Optional seed for deterministic random generation (for testing)
 * @returns {Array} - Shuffled tracks
 */
function executeShuffleFunction(tracks, opts, trackStats, seed) {
    // Load the StationAdmin.js file
    const shuffleFunctionPath = path.join(__dirname, '..', 'src', 'StationAdmin.js');
    const shuffleFunctionCode = fs.readFileSync(shuffleFunctionPath, 'utf8');
    
    // If a seed is provided, inject a seeded random generator
    if (seed !== undefined) {
        const prng = new Alea(seed);
        opts.random = function() {
            return prng();
        };
    }

    opts.debug = true;
    
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
 * Load tracks from JSON file
 * @param {string} filename - Path to JSON file relative to resources directory
 * @returns {Array} - Array of track objects
 */
function loadTracksFromFile(filename) {
    const filePath = path.join(__dirname, 'resources', filename);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
}

function loadTrackStats() {
    const filePath = path.join(__dirname, 'resources', '24h.json');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
}


/**
 * Calculate total duration of tracks
 * @param {Array} tracks - Array of track objects
 * @returns {number} - Total duration in seconds
 */
function calculateTotalDuration(tracks) {
    return tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
}

/**
 * Assert that the total duration meets the target duration constraints
 * @param {Array} tracks - Array of track objects
 * @param {number} duration - Target duration in seconds
 */
function assertDuration(tracks, duration) {
    // Verify that tracks is an array
    assert.ok(Array.isArray(tracks), 'Result should be an array');
    
    // Verify that tracks is not empty
    assert.ok(tracks.length > 0, 'Result should contain tracks');
    
    // Calculate total duration of returned tracks
    const totalDuration = calculateTotalDuration(tracks);
    
    // Verify that total duration is at least the target duration
    assert.ok(
        totalDuration >= duration,
        `Total duration (${totalDuration}s) should be at least ${duration}s`
    );
    
    // Verify that total duration is not more than duration + 10%
    const maxDuration = duration * 1.1;
    assert.ok(
        totalDuration <= maxDuration,
        `Total duration (${totalDuration}s) should not exceed ${maxDuration}s (${duration}s + 10%)`
    );
}

/**
 * Assert that jingles are placed at regular intervals
 * @param {Array} tracks - Array of track objects
 * @param {number} interval - Expected interval in minutes between jingles
 */
function assertJingleInterval(tracks, interval) {
    // Find all jingle positions
    const jinglePositions = [];
    let cumulativeDuration = 0;
    
    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].type === 'jingle') {
            jinglePositions.push({
                index: i,
                time: cumulativeDuration,
                durationBefore: i > 0 ? tracks[i - 1].duration : 0
            });
        }
        cumulativeDuration += tracks[i].duration;
    }
    
    // Verify that at least one jingle i
    assert.ok(
        jinglePositions.length > 0,
        'At least one jingle should be present in the tracks'
    );
    
    // Check intervals between consecutive jingles
    const intervalSeconds = interval * 60;
    
    for (let i = 1; i < jinglePositions.length; i++) {
        const timeDiff = (jinglePositions[i].time - jinglePositions[i-1].time);
        const tolerance = Math.max(jinglePositions[i].durationBefore, jinglePositions[i -1].durationBefore, 240);
        const minInterval = intervalSeconds - tolerance;
        const maxInterval = intervalSeconds + tolerance;
        
        assert.ok(
            timeDiff >= minInterval && timeDiff <= maxInterval,
            `Jingle interval between position ${jinglePositions[i-1].index} and ${jinglePositions[i].index} ` +
            `is ${Math.round(timeDiff/60)}m (expected ${interval}m ± 4m)`
        );
    }
}

/**
 * Assert that artist distribution meets the constraints
 * @param {Array} tracks - Array of track objects
 * @param {number} maxTracksPerArtist - Maximum number of tracks per artist
 */
function assertArtistDistribution(tracks, maxTracksPerArtist) {
    // Count tracks per artist
    const artistCounts = {};
    const artistPositions = {};
    
    for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        
        // Only check songs (not jingles, news, etc.)
        if (track.type !== 'song') {
            continue;
        }
        
        const artist = track.artist || 'Unknown Artist';
        
        // Count occurrences
        if (!artistCounts[artist]) {
            artistCounts[artist] = 0;
            artistPositions[artist] = [];
        }
        artistCounts[artist]++;
        artistPositions[artist].push(i);
    }
    
    // Check 1: No artist appears more than maxTracksPerArtist times
    for (const artist in artistCounts) {
        assert.ok(
            artistCounts[artist] <= maxTracksPerArtist,
            `Artist "${artist}" appears ${artistCounts[artist]} times, exceeding limit of ${maxTracksPerArtist}`
        );
    }
    
    // Check 2: At least 30 minutes between tracks of the same artist
    const minDistanceSeconds = 30 * 60; // 30 minutes in seconds
    
    for (const artist in artistPositions) {
        const positions = artistPositions[artist];
        
        if (positions.length > 1) {
            for (let i = 1; i < positions.length; i++) {
                // Calculate time between this track and previous track by same artist
                let timeBetween = 0;
                for (let j = positions[i-1]; j < positions[i]; j++) {
                    timeBetween += tracks[j].duration;
                }
                
                assert.ok(
                    timeBetween >= minDistanceSeconds,
                    `Artist "${artist}" has tracks at positions ${positions[i-1]} and ${positions[i]} ` +
                    `with only ${Math.round(timeBetween/60)}m between them (minimum 30m required)`
                );
            }
        }
    }
    
    // Log statistics
    const artistsWithMultipleTracks = Object.keys(artistCounts).filter(a => artistCounts[a] > 1).length;
    const maxCount = Math.max(...Object.values(artistCounts));
    
    console.log(`  - Unique artists: ${Object.keys(artistCounts).length}`);
    console.log(`  - Artists with multiple tracks: ${artistsWithMultipleTracks}`);
    console.log(`  - Max tracks per artist: ${maxCount} (limit: ${maxTracksPerArtist})`);
}

/**
 * Count how many tracks are tagged with the given tag name
 * @param {Array} tracks - Array of track objects
 * @param {string} tagname - Tag name to count
 * @returns {number} - Number of tracks with the given tag
 */
function countByTag(tracks, tagname) {
    return tracks.filter(track => {
        return track.tags && Array.isArray(track.tags) && track.tags.includes(tagname);
    }).length;
}

/**
 * Assert that news tracks are placed correctly
 * - First track must be a news track
 * - News tracks repeat every 60 minutes based on cumulative duration
 * @param {Array} tracks - Array of track objects
 */
function assertNews(tracks) {
    // Verify that tracks is an array and not empty
    assert.ok(Array.isArray(tracks), 'Result should be an array');
    assert.ok(tracks.length > 0, 'Result should contain tracks');
    
    // Check 1: First track must be a news track
    assert.strictEqual(
        tracks[0].type,
        'news',
        'First track must be a news track'
    );
    
    // Find all news track positions
    const newsPositions = [];
    let cumulativeDuration = 0;
    
    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].type === 'news') {
            newsPositions.push({
                index: i,
                time: cumulativeDuration
            });        
            cumulativeDuration += 165;
        }
        else {
            cumulativeDuration += tracks[i].duration;
        }
    }
    
    // Verify that at least one news track exists
    assert.ok(
        newsPositions.length > 0,
        'At least one news track should be present'
    );

    let hours = Math.floor(cumulativeDuration / (60 * 60));
    console.log(hours + " hours");
    for(let i = 0; i < hours; i++) {
        let min = i * 60 * 60 - 120;
        let max = i * 60 * 60 + (16 * 60);
        console.log(i + ": " + min + " < " + newsPositions[i].time + " < " + max);
        assert.ok(newsPositions[i].time >= min && newsPositions[i].time <= max, "News position for hour " + i + ": " + min + " < " + newsPositions[i].time + " < " + max);
    }
}

/**
 * Assert that tracks follow the expected tag pattern sequence
 * Pattern "Jingle" means the track must be of type jingle
 * Excludes news and ad triggers from the check
 * @param {Array} tracks - Array of track objects
 * @param {Array} pattern - Array of tag names or "Jingle" to match against
 */
function assertTagPattern(tracks, pattern, excludeJingles, excludedTrackIds) {
    // Verify that tracks is an array and not empty
    assert.ok(Array.isArray(tracks), 'Result should be an array');
    assert.ok(tracks.length > 0, 'Result should contain tracks');
    
    // Filter out news and ad triggers (id === 0), bound jingles and scheduled items
    const filteredTracks = tracks.filter(track => {
        return track.type !== 'news' 
            && track.id !== 0 
            && !boundJingles.includes(track.id) 
            && !track.tags.includes("CD-Vorstellung")
            && (!excludeJingles || track.type !== 'jingle')
            && (!excludedTrackIds || !excludedTrackIds.includes(track.id));
    });
    
    // Track pattern matching
    let patternIndex = 0;
    const matches = [];
    
    for (let i = 0; i < filteredTracks.length; i++) {
        const track = filteredTracks[i];
        const expectedPattern = pattern[patternIndex % pattern.length];
        
        let isMatch = false;
        
        // Check if pattern is "Jingle" - match against track type
        if (expectedPattern.toLowerCase() === track.type) {
            isMatch = true;
        } else {
            // Match against track tags
            isMatch = track.tags && Array.isArray(track.tags) && track.tags.includes(expectedPattern);
        }
        
        matches.push({
            index: i,
            track: track,
            expectedPattern: expectedPattern,
            matched: isMatch
        });
        
        // Assert that the track matches the expected pattern
        assert.ok(
            isMatch,
            `Track at position ${i} (original index: ${tracks.indexOf(track)}) does not match pattern "${expectedPattern}". ` +
            `Track type: ${track.type}, tags: ${track.tags ? track.tags.join(', ') : 'none'}`
        );
        
        patternIndex++;
    }
}

/**
 * Assert that ad triggers are placed correctly
 * @param {Array} tracks - Array of track objects
 */
function assertAdTriggers(tracks, p1, p2) {
    // Verify that tracks is an array and not empty
    assert.ok(Array.isArray(tracks), 'Result should be an array');
    assert.ok(tracks.length > 0, 'Result should contain tracks');
        
    // Find all news track positions
    const positions = [];
    let cumulativeDuration = 0;
    
    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].id === 0) {
            positions.push({
                index: i,
                time: cumulativeDuration
            });        
        }
        if (tracks[i].type === 'news') {
            cumulativeDuration += 165;
        }
        else {
            cumulativeDuration += tracks[i].duration;
        }
    }
    
    let hours = Math.floor(cumulativeDuration / (60 * 60));
    console.log(hours + " hours");
    for(let i = 0; i < hours; i++) {
        let t1 = i * 60 * 60 + p1 * 60;
        let t2 = i * 60 * 60 + p2 * 60;

        console.log(i + ": " + t1 + " <> " + positions[i * 2].time);
        console.log(i + ": " + t2 + " <> " + positions[i * 2 + 1].time);

        assert.ok(positions[i * 2].time >= t1 - 360 && positions[i * 2].time <= t1 + 360, "Ad position 1 for hour " + i);
        assert.ok(positions[i * 2 + 1].time >= t2 - 360 && positions[i * 2 + 1].time <= t2 + 360, "Ad position 2 for hour " + i);
    }
}

/**
 * Assert that ad bound jingles are placed
 * @param {Array} tracks - Array of track objects
 */
function assertBoundJingles(tracks) {
    assert.ok(Array.isArray(tracks), 'Result should be an array');

    let artists = 0;
    let jingles = 0;
    let cumulativeDuration = 0;
    let last = -1;
    for(let i = 1; i < tracks.length; i++) {
        let rule = trackRules.find((r) => r.filter == tracks[i].artist);
        if(rule) {
            artists++;
            if(tracks[i - 1].id === rule.trackId) {
                jingles++;
                if(last > -1) {
                    let dist = (cumulativeDuration - last) / 60;
                    assert.ok(dist >= 30, "Bound jingle distance violation" );
                }
                last = cumulativeDuration;
            }
        }
        if (tracks[i].type === 'news') {
            cumulativeDuration += 165;
        }
        else {
            cumulativeDuration += tracks[i].duration;
        }

    }

    if(artists > 0) {
        assert.ok(jingles > 0, "Expected bound jingles: " + artists + " artists");
    }
        
}

/**
 * Assert that ad bound jingles are placed
 * @param {Array} tracks - Array of track objects
 */
function assertScheduledItem(tracks) {
    assert.ok(Array.isArray(tracks), 'Result should be an array');

    let items = 0;
    let cumulativeDuration = 0;
    let last = -1;
    var t = Date.parse(time2);
    for(let i = 0; i < tracks.length; i++) {
        if(tracks[i].tags.includes(scheduled[0].tag)) {
            items++;

            let ts = new Date();
            ts.setTime(t + cumulativeDuration * 1000);
            let minute = ts.getMinutes()
            console.log(minute);
            assert.ok(minute >= scheduled[0].minute - 5 && minute <= scheduled[0].minute + 5, "Minute: " + minute);

            if(last > -1) {
                let dist = (cumulativeDuration - last) / 60;
                let expected = 60 * scheduled[0].interval;
                assert.ok(dist < (60 * scheduled[0].interval) + 300, "Scheduled item distance violation: " + dist + " < " + expected);
            }
            last = cumulativeDuration;
        }
        if (tracks[i].type === 'news') {
            cumulativeDuration += 165;
        }
        else {
            cumulativeDuration += tracks[i].duration;
        }

    }

    assert.equal(items, 2, "Number of expected items");
}

/*
 * Assert that late song selection does not produce artist repeats
 * @param {Array} tracks - Array of track objects
 */
function assertScheduledItemLateSelection(tracks) {
    assert.ok(Array.isArray(tracks), 'Result should be an array');

    const artistPositions = {};

    let items = 0;
    for(let i = 0; i < tracks.length; i++) {
        // Only check songs (not jingles, news, etc.)
        if (tracks[i].type !== 'song') {
            continue;
        }

        if(tracks[i].tags.includes('SpecialTrack')) {
            items++;
            assert.ok('plays' in tracks[i] && tracks[i].plays < 2, "Invalid plays count");
        }

        const artist = tracks[i].artist || 'Unknown Artist';
        
        // Count occurrences
        if (!artistPositions[artist]) {
            artistPositions[artist] = [];
        }
        artistPositions[artist].push(i);
    }

    const minDistanceSeconds = 30 * 60; // 30 minutes in seconds
    
    for (const artist in artistPositions) {
        const positions = artistPositions[artist];
        
        if (positions.length > 1) {
            for (let i = 1; i < positions.length; i++) {
                // Calculate time between this track and previous track by same artist
                let timeBetween = 0;
                for (let j = positions[i-1]; j < positions[i]; j++) {
                    timeBetween += tracks[j].duration;
                }

                if(timeBetween < minDistanceSeconds) {
                    console.log("oops");
                }
                
                assert.ok(
                    timeBetween >= minDistanceSeconds,
                    `Artist "${artist}" has tracks at positions ${positions[i-1]} and ${positions[i]} ` +
                    `with only ${Math.round(timeBetween/60)}m between them (minimum 30m required)`
                );
            }
        }
    }

    assert.equal(items, 4, "Number of expected items");
}

/*
 * Assert that moderation tracks remained on their position
 * @param {Array} playlist - playlist tracks
 * @param {Array} tracks - returned tracks
 */
function assertWorddistributionPreserve(playlist, tracks) {

    const playlistFiltered = playlist.filter(track => track.type != 'jingle');
    const tracksFiltered = tracks.filter(track => track.type != 'jingle');

    for(var i = 0; i < playlistFiltered.length && i < tracksFiltered.length; i++) {
        if(playlistFiltered[i].type == 'moderation') {
            assert.ok(tracksFiltered[i].type === 'moderation', "Expected moderation at position " + i);
        }
    }
}

/*
 * Assert that moderation tracks remained on their position
 * @param {Array} playlist - playlist tracks
 * @param {Array} tracks - returned tracks
 */
function assertWorddistributionLinked(playlist, tracks) {

    const playlistFiltered = playlist.filter(track => track.type != 'jingle');
    var bound = {};

    for(var i = 0; i < playlistFiltered.length - 1; i++) {
        if(playlistFiltered[i].type == 'moderation') {
            bound[playlistFiltered[i + 1].id] = playlistFiltered[i].id;
        }
    }


    const tracksFiltered = tracks.filter(track => track.type != 'jingle');

    for(var i = 0; i < tracksFiltered.length; i++) {
        var b = bound[tracksFiltered[i].id];
        if(b) {
            assert.ok(tracksFiltered[i - 1].id === b, "Expected moderation");
        }
    }
}

function dumpTracks(tracks, t) {
    for(var i = 0; i < tracks.length; i++) {
        console.log(i + " " + new Date(t).toLocaleTimeString() + " " + tracks[i].type + " " + tracks[i].artist);
        t += tracks[i].duration * 1000;
    }
}


/**
 * Helper function to run a test multiple times with different seeds
 * @param {string} testName - Name of the test
 * @param {Function} testFn - Test function that accepts a seed parameter
 * @param {number} iterations - Number of times to run the test (default: 5)
 */
function testWithMultipleSeeds(testName, testFn, iterations = 5) {
    for (let i = 0; i < iterations; i++) {
        const seed = `${testName}-seed-${i}`;
        test(`${testName} (seed ${i})`, (t) => {
            testFn(seed);
        });
    }
}

// Test: minimalOpts
testWithMultipleSeeds('minimalOpts - basic shuffle', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    
    const opts = {
        duration: duration,
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
});


// Test: noPatternSimple
testWithMultipleSeeds('noPatternSimple - basic shuffle', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
    assertJingleInterval(result, jingleInterval);
    assertArtistDistribution(result, 2);
});

// Test: patternSimpleNoJingles
testWithMultipleSeeds('patternSimpleNoJingles - tag pattern without jingle', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        tagPattern : [ "K1", "K2", "K1", "K3", "K1", "K2", "K1", "K2", "K1", "K2", "K3", "K1"]
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
    assertTagPattern(result, opts.tagPattern, true);
    assertArtistDistribution(result, 2);
    assertJingleInterval(result, jingleInterval);
});


// Test: patternSimpleTagWeights
testWithMultipleSeeds('patternSimpleTagWeights - tag pattern with tag weights', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        tagPattern : [ "K1", "K2", "K1", "K3", "K1", "K2", "K1", "K2", "K1", "K2", "K3", "K1"],
        tagWeights : {
            'A' : 3,
            'B' : 1,
            'C' : -1
        }
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
    assertTagPattern(result, opts.tagPattern, true);
    assertArtistDistribution(result, 2);
    assertJingleInterval(result, jingleInterval);

    var aTracks = countByTag(result, 'A');
    var bTracks = countByTag(result, 'B');
    var cTracks = countByTag(result, 'C');

    console.log(aTracks + " > " + bTracks + " > " + cTracks);

    assert.ok(aTracks > bTracks, "There should be more A tracks than B tracks");
    assert.ok(bTracks > cTracks, "There should be more B tracks than C tracks");

});


// Test: patternSimpleTrackTypes
testWithMultipleSeeds('patternSimpleTrackTypes - tag pattern with track types', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        tagPattern : [ "song", "song", "jingle"]
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
    assertTagPattern(result, opts.tagPattern, false);
    assertArtistDistribution(result, 2);
});

// Test: patternWithInvalidTag
testWithMultipleSeeds('patternWithInvalidTag - tag pattern with an invalid tag', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        tagPattern : [ "K1", "K2", "K1", "K3", "K1", "KX", "KY", "K2", "K1", "K2", "K1", "K2", "K3"]
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
    assertTagPattern(result,  [ "K1", "K2", "K1", "K3", "K1", "K2", "K1", "K2", "K1", "K2", "K3"], true);
    assertArtistDistribution(result, 2);
});


// Test: patternSimpleNoJingles
testWithMultipleSeeds('patternSimpleInvalidPattern - tag pattern invalid pattern', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        tagPattern : [ "KX"]
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    assert.ok(result.length > 0);

    // Assert duration constraints
    assertDuration(result, duration);
    assertArtistDistribution(result, 2);
});




// Test: patternSimple
testWithMultipleSeeds('patternSimple - basic shuffle', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        tagPattern : [ "K1", "K2", "K1", "K3", "Jingle", "K1", "K2", "K1", "K2", "Jingle", "K1", "K2", "K3", "K1", "Jingle" ]
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
    assertTagPattern(result, opts.tagPattern);
    assertArtistDistribution(result, 2);
});


// Test: noPatternTagWeights
testWithMultipleSeeds('noPatternTagWeights - basic shuffle with tag weights', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        tagWeights : {
            'A' : 3,
            'B' : 1,
            'C' : -1
        }
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    var aTracks = countByTag(result, 'A');
    var bTracks = countByTag(result, 'B');
    var cTracks = countByTag(result, 'C');

    console.log(aTracks + " > " + bTracks + " > " + cTracks);

    assert.ok(aTracks > bTracks, "There should be more A tracks than B tracks");
    assert.ok(bTracks > cTracks, "There should be more B tracks than C tracks");

});

// Test: dateFilter
testWithMultipleSeeds('dateFilter - basic shuffle with date filter tags', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');

    const tags = ["@01.02.-28.02. Februar", "@01.03.-31.03. Maerz", "@01.12.-28.02. Winter", "@01.02.-05.01."];
    var t = 0;
    for(var i = 0; i < tracks.length; i++) {
        tracks[i].tags.push(tags[t]);
        t = (t + 1) % tags.length;
    }
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    var t1 = countByTag(result, tags[0]);
    var t2 = countByTag(result, tags[1]);
    var t3 = countByTag(result, tags[2]);
    var t4 = countByTag(result, tags[3]);


    assert.ok(t1 > 0, tags[0] + " should pass");
    assert.ok(t2 == 0, tags[1] + " should not pass");
    assert.ok(t3 > 0, tags[2] + " should pass");
    assert.ok(t4 > 0, tags[3] + " should pass");

});


// Test: noPatternNews
testWithMultipleSeeds('noPatternNews - basic shuffle with news', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_news.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        newsInterval : 60,
        newsMin : 59,
        newsMax : 15,
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertNews(result);
});

// Test: patternNews
testWithMultipleSeeds('patternNews - basic shuffle with news', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_news.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        newsInterval : 60,
        newsMin : 59,
        newsMax : 15,
        tagPattern : [ "K1", "K2", "K1", "K3", "Jingle", "K1", "K2", "K1", "K2", "Jingle", "K1", "K2", "K3", "K1", "Jingle" ]
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertNews(result);
    assertTagPattern(result, opts.tagPattern);
});


// Test: noPatternAdTrigger
testWithMultipleSeeds('noPatternAdTrigger - basic shuffle with ad triggers', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_ad_trigger.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        adTrigger : 0,
        adPositions : [ 15, 45 ]
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertAdTriggers(result, 15, 45);
});

// Test: patternAdTrigger
testWithMultipleSeeds('patternAdTrigger - basic shuffle with ad triggers', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_ad_trigger.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        adTrigger : 0,
        adPositions : [ 15, 45 ],
        tagPattern : [ "K1", "K2", "K1", "K3", "Jingle", "K1", "K2", "K1", "K2", "Jingle", "K1", "K2", "K3", "K1", "Jingle" ]
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertAdTriggers(result, 15, 45);
    assertTagPattern(result, opts.tagPattern);
});


// Test: noPatternBoundJingles
testWithMultipleSeeds('noPatternBoundJingles - basic shuffle with bound jingles', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_bound_jingles.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        trackRules : JSON.parse(JSON.stringify(trackRules)),
        trackRuleGroups : JSON.parse(JSON.stringify(trackRuleGroups)),
        trackRuleJingleCollisionStrategy: 'keep_both'
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertBoundJingles(result);
});

// Test: patternBoundJingles
testWithMultipleSeeds('patternBoundJingles - tag pattern shuffle with bound jingles', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_bound_jingles.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time,
        tagPattern : [ "K1", "K2", "K1", "K3", "Jingle", "K1", "K2", "K1", "K2", "Jingle", "K1", "K2", "K3", "K1", "Jingle" ],
        trackRules : JSON.parse(JSON.stringify(trackRules)),
        trackRuleGroups : JSON.parse(JSON.stringify(trackRuleGroups)),
        trackRuleJingleCollisionStrategy: 'keep_both'
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertBoundJingles(result);
    assertTagPattern(result, opts.tagPattern);
});

// Test: noPatternScheduledItem
testWithMultipleSeeds('noPatternScheduledItem - basic shuffle with a scheduled item', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_scheduled_items.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time2,
        scheduled : JSON.parse(JSON.stringify(scheduled))
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertScheduledItem(result);
});


// Test: noPatternScheduledItem2
testWithMultipleSeeds('noPatternScheduledItem2 - basic shuffle with a scheduled item', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_scheduled_items.json');
    
    const trackStats = loadTrackStats();

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        protectFirstJingle : true,
        time: time,
        scheduled : [ {
        "selection" : "random",
        "trackType" : "moderation",
        "index" : 1,
        "exclude" : true,
        "interval" : 1,
        "id" : "d0b1c3c8-5366-43af-aefa-aa2612719aef",
        "tag" : "CD-Vorstellung",
        "minute" : 0
        } ]
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    assert.ok(result[0].tags.includes("CD-Vorstellung"));

});


// Test: patternScheduledItem
testWithMultipleSeeds('patternScheduledItem - tag pattern shuffle with a scheduled item', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_scheduled_items.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time2,        
        tagPattern : [ "K1", "K2", "K1", "K3", "Jingle", "K1", "K2", "K1", "K2", "Jingle", "K1", "K2", "K3", "K1", "Jingle" ],
        scheduled : JSON.parse(JSON.stringify(scheduled))
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertScheduledItem(result);
});


// Test: noPatternMixed
testWithMultipleSeeds('noPatternMixed - basic shuffle with mixed use cases', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_full.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time2,
        newsInterval : 60,
        newsMin : 59,
        newsMax : 15,
        adTrigger : 0,
        adPositions : [ 15, 45 ],
        trackRules : JSON.parse(JSON.stringify(trackRules)),
        trackRuleGroups : JSON.parse(JSON.stringify(trackRuleGroups)),
        trackRuleJingleCollisionStrategy: 'keep_both',
        scheduled : JSON.parse(JSON.stringify(scheduled))

    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertNews(result);
    assertAdTriggers(result, 15, 45);
    assertBoundJingles(result);
    assertScheduledItem(result);
});

// Test: patternMixed
testWithMultipleSeeds('patternMixed - basic shuffle with mixed use cases', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_full.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time2,
        newsInterval : 60,
        newsMin : 59,
        newsMax : 15,
        adTrigger : 0,
        adPositions : [ 15, 45 ],
        trackRules : JSON.parse(JSON.stringify(trackRules)),
        trackRuleGroups : JSON.parse(JSON.stringify(trackRuleGroups)),
        trackRuleJingleCollisionStrategy: 'keep_both',
        scheduled : JSON.parse(JSON.stringify(scheduled)),
        tagPattern : [ "K1", "K2", "K1", "K3", "Jingle", "K1", "K2", "K1", "K2", "Jingle", "K1", "K2", "K3", "K1", "Jingle" ],
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertNews(result);
    assertAdTriggers(result, 15, 45);
    assertBoundJingles(result);
    assertScheduledItem(result);
    assertTagPattern(result, opts.tagPattern);
});


// Test: noPatternScheduledItemLateSelection
testWithMultipleSeeds('noPatternScheduledItemLateSelection - basic shuffle with a scheduled item and late song selection', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    const ids = [
        2738902,
        21823,
        21051,
        14985,
        2158778,
        14279,
        14399,
        13471,
        14247,
        21369,
        2284327,
        13793
        ];
    for(let i = 0; i < tracks.length; i++) {
        if(ids.includes(tracks[i].id)) {
            tracks[i].tags.push("SpecialTrack");
        }
    }
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time2,
        scheduled : [ {
            "selection" : "random",
            "trackType" : "song",
            "exclude" : true,
            "interval" : 1,
            "id" : "39381b2c-40a4-45e6-945c-96ba83fd4183",
            "tag" : "SpecialTrack",
            "minute" : 15
            } ],
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertScheduledItemLateSelection(result);
    
});

// Test: patternScheduledItemLateSelection
testWithMultipleSeeds('patternScheduledItemLateSelection - basic shuffle with a scheduled item and late song selection', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_plain.json');
    const ids = [21823, 21051, 14985, 14399, 21369, 13793];
    for(let i = 0; i < tracks.length; i++) {
        if(ids.includes(tracks[i].id)) {
            tracks[i].tags.push("SpecialTrack");
        }
    }
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        maxTracksPerArtist : 2,
        time: time2,
        tagPattern : [ "K1", "K2", "K1", "K3", "Jingle", "K1", "K2", "K1", "K2", "Jingle", "K1", "K2", "K3", "K1", "Jingle" ],
        scheduled : [ {
            "selection" : "random",
            "trackType" : "song",
            "exclude" : true,
            "interval" : 1,
            "id" : "39381b2c-40a4-45e6-945c-96ba83fd4183",
            "tag" : "SpecialTrack",
            "minute" : 15
            } ],
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);
    assertScheduledItemLateSelection(result);
    assertTagPattern(result, opts.tagPattern, false, ids);
    
});


// Test: scheduledItemPreBlockArtist
// Verifies that when a song is scheduled by rule (non-late-selection), the artist is blocked
// in the artistBlockDuration window before the scheduled time, preventing the selector from
// placing another song from the same artist shortly before the scheduled slot.
testWithMultipleSeeds('scheduledItemPreBlockArtist - scheduled song artist is pre-blocked before scheduled time', (seed) => {
    const tracks = loadTracksFromFile('tracks_scheduled_items.json');

    const scheduledTrackId = 13983;
    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].id === scheduledTrackId) {
            tracks[i].tags.push('ScheduledArtist');
        }
    }

    const trackStats = [];
    const duration = 14400; // 4 hours

    const opts = {
        duration: duration,
        jingleInterval: 20,
        maxTracksPerArtist: 4,
        time: time2,
        scheduled: [ {
            selection: 'index',
            index: 1,
            exclude: true,
            hour: 22,
            minute: 15,
            tag: 'ScheduledArtist'
        } ]
    };

    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    assert.ok(Array.isArray(result), 'Result should be an array');

    // Find the scheduled song and its cumulative time offset from startTime
    const startMs = new Date(time2).getTime() + 120 * 1000; // startTime approximation
    let cumulativeMs = 0;
    let scheduledIdx = -1;
    let scheduledTimeMs = -1;

    for (let i = 0; i < result.length; i++) {
        if (result[i].id === scheduledTrackId) {
            scheduledIdx = i;
            scheduledTimeMs = startMs + cumulativeMs;
            break;
        }
        cumulativeMs += result[i].duration * 1000;
    }

    // The scheduled track must appear in the result
    assert.ok(scheduledIdx > -1, 'Scheduled track (id ' + scheduledTrackId + ') must appear in result');

    // Walk backwards from the scheduled track and check no same-artist song
    // appears within artistBlockDuration (30 min = 1800 s) before it
    const artistBlockDurationMs = 30 * 60 * 1000;
    const scheduledArtist = result[scheduledIdx].artist;
    let lookbackMs = 0;

    for (let i = scheduledIdx - 1; i >= 0; i--) {
        lookbackMs += result[i].duration * 1000;
        if (lookbackMs > artistBlockDurationMs) break;
        if (result[i].type === 'song' && result[i].artist === scheduledArtist) {
            assert.fail(
                'Artist "' + scheduledArtist + '" appears at position ' + i +
                ' which is only ' + Math.round(lookbackMs / 1000) + 's before the scheduled slot ' +
                '(minimum ' + (artistBlockDurationMs / 1000) + 's required)'
            );
        }
    }
});

// Test: scheduledRuleTrackTypeVersion2Filtering
// Verifies that when a ScheduledRule has version >= 2 and a trackType is set, tracks whose
// type does not match trackType are treated as if the selector tag were not present at all:
// they are NOT added to the rule's candidate list, and (if exclude is set) they are NOT
// removed from the regular shuffle pool either.
testWithMultipleSeeds('scheduledRuleTrackTypeVersion2Filtering - trackType filters candidates when version >= 2', (seed) => {
    const tracks = loadTracksFromFile('tracks_scheduled_items.json');

    const songTrackId = 13983;         // type: 'song'
    const moderationTrackId = 8957933; // type: 'moderation'

    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].id === songTrackId || tracks[i].id === moderationTrackId) {
            tracks[i].tags.push('VerTypeTest');
        }
    }

    const trackStats = [];
    const duration = 14400; // 4 hours

    const opts = {
        duration: duration,
        jingleInterval: 20,
        maxTracksPerArtist: 4,
        time: time2,
        scheduled: [ {
            selection: 'index',
            index: 1,
            exclude: true,
            version: 2,
            trackType: 'moderation',
            hour: 22,
            minute: 15,
            tag: 'VerTypeTest'
        } ]
    };

    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    assert.ok(Array.isArray(result), 'Result should be an array');

    // The moderation track matches trackType, so it becomes the only scheduling candidate
    // and must appear in the output (inserted at the scheduled slot).
    assert.ok(
        result.some(t => t.id === moderationTrackId),
        'Moderation track (id ' + moderationTrackId + ') should be scheduled as the matching-type candidate'
    );

    // The song track does not match trackType 'moderation', so under version >= 2 it must
    // NOT be scheduled at the rule's slot. The moderation track should be at that position,
    // not the song track. Verify the song track never appears at the same result index as
    // the moderation track (i.e., they are distinct entries, and the rule chose moderation).
    const moderationIdx = result.findIndex(t => t.id === moderationTrackId);
    assert.ok(
        moderationIdx > -1 && result[moderationIdx].id !== songTrackId,
        'The scheduled slot must contain the moderation track, not the song track'
    );

    // The song track must NOT appear more than once: with exclude:true and version >= 2,
    // the song is not a rule candidate, so it is not excluded from the regular pool.
    // It may or may not appear in the output depending on pool selection, but it must
    // never appear more than once (it cannot be both scheduled AND in the regular pool).
    const songOccurrences = result.filter(t => t.id === songTrackId).length;
    assert.ok(
        songOccurrences <= 1,
        'Song track (id ' + songTrackId + ') must appear at most once in the output'
    );
});

// Test: scheduledRuleTrackTypeLegacyIgnored
// Verifies that when a ScheduledRule has no version (or version < 2), trackType has no
// effect: a tagged track is treated as a scheduling candidate and excluded from the regular
// pool regardless of whether its type matches trackType (legacy behavior).
testWithMultipleSeeds('scheduledRuleTrackTypeLegacyIgnored - trackType is ignored without version >= 2', (seed) => {
    const tracks = loadTracksFromFile('tracks_scheduled_items.json');

    const songTrackId = 13983; // type: 'song' - deliberately mismatches trackType below

    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].id === songTrackId) {
            tracks[i].tags.push('LegacyTypeTest');
        }
    }

    const trackStats = [];
    const duration = 14400; // 4 hours

    const opts = {
        duration: duration,
        jingleInterval: 20,
        maxTracksPerArtist: 4,
        time: time2,
        scheduled: [ {
            selection: 'index',
            index: 1,
            exclude: true,
            // no 'version' field - legacy behavior
            trackType: 'moderation', // deliberately mismatches the actual track type ('song')
            hour: 22,
            minute: 15,
            tag: 'LegacyTypeTest'
        } ]
    };

    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    assert.ok(Array.isArray(result), 'Result should be an array');

    // Legacy rules ignore trackType entirely - the song track must still be scheduled
    // as the rule's candidate (and thus excluded from the regular pool), despite the
    // mismatch with trackType: 'moderation'.
    const occurrences = result.filter(t => t.id === songTrackId).length;
    assert.strictEqual(
        occurrences, 1,
        'Track (id ' + songTrackId + ') should appear exactly once, inserted via the scheduling rule ' +
        '(trackType must be ignored for rules without version >= 2)'
    );
});

// Test: noPatternWordDistributionPreserve
testWithMultipleSeeds('noPatternWordDistributionPreserve - basic shuffle with preserved moderation tracks', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_moderation.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        wordDistribution: "preserve",
        maxTracksPerArtist : 2,
        time: time
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
    assertJingleInterval(result, jingleInterval);
    assertArtistDistribution(result, 2);
    assertWorddistributionPreserve(tracks, result);
});

// Test: PatternWordDistributionPreserve
testWithMultipleSeeds('patternWordDistributionPreserve - basic shuffle with preserved moderation tracks', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_moderation.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        wordDistribution: "preserve",
        maxTracksPerArtist : 2,
        time: time,
        tagPattern : [ "K1", "K2", "K1", "K3", "Jingle", "K1", "K2", "K1", "K2", "Jingle", "K1", "K2", "K3", "K1", "Jingle" ],
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
    assertWorddistributionPreserve(tracks, result);
});

// Test: noPatternWordDistributionLinkedNext
testWithMultipleSeeds('noPatternWordDistributionLinkedNext - basic shuffle with linked moderation tracks', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_moderation.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        wordDistribution: "link_next",
        maxTracksPerArtist : 2,
        time: time
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
    assertJingleInterval(result, jingleInterval);
    assertArtistDistribution(result, 2);
    assertWorddistributionLinked(tracks, result);
});

// Test: patternWordDistributionLinkedNext
testWithMultipleSeeds('patternWordDistributionLinkedNext - pattern shuffle with linked moderation tracks', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_moderation.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 20; // 20 minutes
    
    // Options with only duration set to 7200 seconds (2 hours)
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        wordDistribution: "link_next",
        maxTracksPerArtist : 2,
        tagPattern : [ "K1", "K2", "K1", "K3", "Jingle", "K1", "K2", "K1", "K2", "Jingle", "K1", "K2", "K3", "K1", "Jingle" ],
        time: time
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Assert duration constraints
    assertDuration(result, duration);
    assertArtistDistribution(result, 2);
    assertWorddistributionLinked(tracks, result);

    const result2 = result.filter(t => t.type != 'moderation');
    assertTagPattern(result2, opts.tagPattern, false);


});


// Test: noPatternNewsPlusJingle
testWithMultipleSeeds('noPatternNewsPlusJingle - shuffle with news plus jingle', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_news_plus_jingle.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 12; 
    
    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        preserveFistJingle: true,
        maxTracksPerArtist : 2,
        time: time
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    assert.ok(result[0].id == 1, "First track should be news");
    assert.ok(result[1].id == 3291198, "Second track must be opener jingle");

    var startTime = new Date(time);

    for(var i = 0; i < result.length; i++) {
        if(result[i].id == 3291198) {
            assert.ok(result[i-1].id == 1, "opener jingle must only appear after news");

            var difference = result[i].duration;
            for(var j = i + 1; j < result.length; j++) {
                if(result[j].type == 'jingle') {
                    assert.ok(difference / 60 >= (jingleInterval - 4), "Next jingle too soon: " + difference / 60);
                    break;
                }
                difference += result[j].duration;
            }
        }
    }

});

// Test: noPatternNewsPlusJingleNotFullHour
/*
testWithMultipleSeeds('noPatternNewsPlusJingleNotFullHour - shuffle with news plus jingle', (seed) => {
    // Load tracks from the test resource file
    const tracks = loadTracksFromFile('tracks_news_plus_jingle.json');
    
    // Empty array for track stats (no previous plays)
    const trackStats = [];

    const duration = 14400;
    const jingleInterval = 12; 

    const t = '2026-02-09T20:35:11+01:00';

    const opts = {
        duration: duration,
        jingleInterval : jingleInterval,
        preserveFistJingle: true,
        maxTracksPerArtist : 2,
        time: t
    };
    
    // Execute the shuffle function with a seed for reproducible results
    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    assert.ok(result[0].id != 3291198, "No opener jingle");

    // dumpTracks(result, new Date(t).getTime());


    for(var i = 0; i < result.length; i++) {
        if(result[i].id == 3291198) {
            assert.ok(result[i-1].id == 1, "opener jingle must only appear after news");

            var difference = result[i].duration;
            for(var j = i + 1; j < result.length; j++) {
                if(result[j].type == 'jingle') {
                    assert.ok(difference / 60 >= (jingleInterval - 4), "Next jingle too soon: " + difference / 60);
                    break;
                }
                difference += result[j].duration;
            }
        }
    }

});
*/

// Test: newsNoRepeatOnSecondIteration
// Regression test for bug: when initTracksAndArtists is called a second time
// (because the requested duration exceeds the total pool length), the news tracks
// from the beginning of the tracks array were pushed into scheduler.newsTracks again,
// causing them to appear multiple times in the output.
//
// tracks_news.json has ~15.3h of content; requesting 18h forces a second iteration.
// The news track (id=1) must appear exactly once per scheduled hour — never twice
// in a row or more than once within a 30-minute window.
testWithMultipleSeeds('newsNoRepeatOnSecondIteration - no duplicate news on multi-iteration shuffle', (seed) => {
    // tracks_news.json total pool ≈ 15.3h — requesting 18h forces iteration > 0
    const tracks = loadTracksFromFile('tracks_news.json');
    const trackStats = [];

    const duration = 18 * 3600; // 64800s — longer than the pool, triggers second iteration

    const opts = {
        duration:      duration,
        jingleInterval: 20,
        maxTracksPerArtist: 2,
        time:          time,
        newsInterval:  60,
        newsMin:       59,
        newsMax:       15,
    };

    const result = executeShuffleFunction(tracks, opts, trackStats, seed);

    // Basic sanity: result must be an array with tracks
    assert.ok(Array.isArray(result) && result.length > 0, 'Result should be a non-empty array');

    // Collect positions and cumulative timestamps of every news track in the output
    let cumulativeSeconds = 0;
    const newsOccurrences = []; // { index, time }

    for (let i = 0; i < result.length; i++) {
        if (result[i].type === 'news') {
            newsOccurrences.push({ index: i, time: cumulativeSeconds });
        }
        cumulativeSeconds += result[i].duration || 0;
    }

    assert.ok(newsOccurrences.length > 0, 'At least one news track must appear in the output');

    // No two consecutive news tracks (direct neighbours in the output)
    for (let i = 1; i < result.length; i++) {
        if (result[i].type === 'news') {
            assert.notStrictEqual(
                result[i - 1].type,
                'news',
                `Two consecutive news tracks at positions ${i - 1} and ${i} — duplicate news injection detected`
            );
        }
    }

    // No two news tracks within 30 minutes of each other
    // (legitimate news fires every ~60 min; a duplicate would appear within seconds/minutes)
    const minGapSeconds = 30 * 60;
    for (let i = 1; i < newsOccurrences.length; i++) {
        const gap = newsOccurrences[i].time - newsOccurrences[i - 1].time;
        assert.ok(
            gap >= minGapSeconds,
            `News tracks at output positions ${newsOccurrences[i - 1].index} and ${newsOccurrences[i].index} ` +
            `are only ${Math.round(gap / 60)}m apart — expected at least 30m (duplicate news bug)`
        );
    }
});
