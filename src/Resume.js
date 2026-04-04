// key: Resume
( function( tracks, opts, trackStats ) {
	
	var startIdx = 0;
	
	var entrypoints = {};
	var len = tracks.length;
	for(var i = 0; i < len; i++) {
		var hash = tracks[i].id ^ tracks[(i + 1) % len].id ^ tracks[(i + 2) % len].id;
		entrypoints[hash] = (i + 3) % len;
	}
	
	var trackStatsIds = [];
	for(var i = 0; i < trackStats.length; i++) {
		if(trackStats[i].id > 0) {
			trackStatsIds.push(trackStats[i].id);
		}
	}
	for(var i = trackStatsIds.length - 1; i >= 3; i--) {
		var hash = trackStatsIds[i - 2] ^ trackStatsIds[i - 1] ^ trackStatsIds[i];
		if(hash in entrypoints) {
			startIdx = entrypoints[hash];
			break;
		}
	}
	
	var playlist = [];
	for(var i = startIdx; i < tracks.length; i++) {
		playlist.push(tracks[i]);
	}
	for(var i = 0; i < startIdx && i < tracks.length; i++) {
		playlist.push(tracks[i]);
	}
	
	return playlist;
	
})
