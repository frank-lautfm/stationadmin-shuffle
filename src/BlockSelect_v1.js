// key: BlockSelect_v1
( function( tracks, opts, trackStats ){
	
	var duration = 'duration' in opts && opts.duration < 64800 ? opts.duration : 64800;
	var separatorTrackId = 'separatorId' in opts ? opts.separatorId : -1;
	var includeSeparatorTrack = 'includeSeparatorTrack' in opts ? opts.includeSeparatorTrack : false;
	var iterationStepHours = 'iterationStepHours' in opts ? opts.iterationStepHours : -1;
	
	var blocks = [];
	var blockHashs = [];
	
	// block detection
	var currentBlock = [];
	var currentBlockHash = 0;
	var currentBlockHashCnt = 0;
	var currentBlockDuration = 0;
	for(var i = 0; i < tracks.length; i++) {
		
		if(tracks[i].id == separatorTrackId || (separatorTrackId < 0 && currentBlockDuration > duration)) {
			// console.log("split at " + tracks[i].artist + " " + tracks[i].title + " | " + currentBlockDuration);
			if(currentBlock.length > 0) {
				blocks.push(currentBlock);
				blockHashs.push(currentBlockHash);
			}
			currentBlock = [];
			currentBlockHash = 0;
			currentBlockHashCnt = 0;
			currentBlockDuration = 0;
			if(includeSeparatorTrack || separatorTrackId < 0) {
				currentBlock.push(tracks[i]);
				currentBlockDuration += tracks[i].duration;
			}
		}
		else {
			currentBlock.push(tracks[i]);
			currentBlockDuration += tracks[i].duration;
			if(currentBlockHashCnt < 3 && tracks[i].type != 'jingle') {
				currentBlockHash = currentBlockHash ^ tracks[i].id;
				currentBlockHashCnt++;
			}
		}
	}
	if(currentBlock.length > (includeSeparatorTrack ? 1 : 0) && separatorTrackId > -1) {
		blocks.push(currentBlock);
		blockHashs.push(currentBlockHash);
	}
	// console.log("detected " + blocks.length + " blocks");
	
	if(blocks.length == 0) {
		return tracks;
	}
	else if(blocks.length == 1) {
		// not good - return what we have
		return blocks[0];
	}
	
	// select block
	var idx = 0;
	if(iterationStepHours <= 0) {
		// random selection
		idx = Math.floor( Math.random() * blocks.length );

		// check history for recent plays
		var recentlyPlayed = false;
		for(var i = 0; i < trackStats.length - blocks[idx].length; i++) {
			if(trackStats[i].id == blocks[idx][0].id) {
				var hash = trackStats[i].id;
				var hashCnt = 1;
				for(var j = i +1; j < trackStats.length && hashCnt < 3; j++) {
					if(trackStats[j].type != 'jingle') {
						hash = hash ^ trackStats[j].id;
						hashCnt++;
					}
				}
				console.log("hash compare: " + blockHashs[idx] + " <=> " + hash);
				if(blockHashs[idx] == hash) {
					recentlyPlayed = true;
					break;
				}
			}
		}

		if(recentlyPlayed) {
			// just take next one
			idx = (idx + 1) & blocks.length;
		}

	}
	else {
		// calculate index
		var date = new Date();
		var time = date.getTime();
		idx = Math.floor(time / (1000 * 60 * 60 * iterationStepHours)) % blocks.length;
	}
	console.log("selected " + idx);
	return blocks[idx];
	
})
