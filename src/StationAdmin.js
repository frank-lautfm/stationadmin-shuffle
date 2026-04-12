// StationAdmin v4.1.1
// 12.04.2026

(function (tracks, opts, trackStats) {
 const SONG = "song";
 const JINGLE = "jingle";
 const MODERATION = "moderation";
 const NEWS = "news";
 if ("time" in opts) {
  let ts = Date.parse(opts.time);
  Date.now = () => ts;
 }
 var executionTime = Date.now();
 const MIN = 60000;
 const HOUR = 3600000;
 var startTime = executionTime + 1000 * 120;
 var duration = (opts.duration ?? 64800) < 64800 ? opts.duration : 64800;
 var trackNameLimit = opts.trackNameLimit ?? 0;
 var trackRulesEnabled = "trackRules" in opts;
 var schedulingRulesEnabled = "scheduled" in opts;
 var firstJingleAfterNews = opts.firstJingleAfterNews ?? true;
 var tagPattern = opts.tagPattern ?? [];
 class TrackRuleEngine {
  constructor() {
   this.boundTracks = {};
   this.trackRules = opts.trackRules;
   this.trackRuleGroups = opts.trackRuleGroups;
   this.trackRuleJingleCollisionStrategy = opts.trackRuleJingleCollisionStrategy;
   this.trackRuleGroupCollisionStrategy = opts.trackRuleGroupCollisionStrategy;
   this.scheduled = opts.scheduled;
  }
  initialize() {
   if (trackRulesEnabled) {
    for (var i = 0; i < this.trackRules.length; i++) {
     var trackId = this.trackRules[i].trackId;
     this.boundTracks[trackId] = {};
     this.trackRules[i].lastPlay = startTime - HOUR * 24;
     if (!("rules" in this.boundTracks[trackId])) {
      this.boundTracks[trackId].rules = [];
     }
     this.boundTracks[trackId].rules.push(this.trackRules[i]);
    }
   }
  }
  initializeSchedulingBoundTracks() {
   if (schedulingRulesEnabled) {
    for (var i = 0; i < this.scheduled.length; i++) {
     if ("introJingleId" in this.scheduled[i]) {
      this.boundTracks[this.scheduled[i].introJingleId] = {};
     }
    }
   }
  }
  activateRules() {
   if (trackRulesEnabled) {
    for (var i = 0; i < this.trackRules.length; i++) {
     this.trackRules[i].active = "type" in this.boundTracks[this.trackRules[i].trackId];
    }
   }
  }
  processTrackStats(trackStats) {
   if (trackRulesEnabled) {
    for (var i = 0; i < trackStats.length; i++) {
     if (trackStats[i].id in this.boundTracks && "rules" in this.boundTracks[trackStats[i].id]) {
      for (var r = 0; r < this.boundTracks[trackStats[i].id].rules.length; r++) {
       this.markRuleApplied(this.boundTracks[trackStats[i].id].rules[r], Date.parse(trackStats[i].started_at));
      }
     }
    }
   }
  }
  normalizeTerm(term) {
   if (term) {
    term = term.toLowerCase();
    return term.replace(/\W/g, "");
   } else {
    return "";
   }
  }
  isBoundTo(track, rule) {
   if (rule.filterType == "tag") {
    return track.tags.includes(rule.filter);
   }
   if (!("term" in rule)) {
    rule.term = this.normalizeTerm(rule.filter);
   }
   switch (rule.filterType) {
    case "artist":
     return this.normalizeTerm(track.artist).includes(rule.term);
    case "title":
     return this.normalizeTerm(track.title).includes(rule.term);
    case "artist_title":
     return this.normalizeTerm(track.artist + " " + track.title).includes(rule.term);
    default:
     return false;
   }
  }
  filterApplicableRules(rules) {
   var rulesByGroup = {};
   var groupNames = [];
   for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    var groupName = rule.groupName != null ? rule.groupName : "-";
    if (!(groupName in rulesByGroup)) {
     rulesByGroup[groupName] = [];
     groupNames.push(groupName);
    }
    rulesByGroup[groupName].push(rule);
   }
   if (groupNames.length > 1 && this.trackRuleGroupCollisionStrategy != "all") {
    var idx = this.trackRuleGroupCollisionStrategy == "first" ? 0 : Math.floor(random() * groupNames.length);
    var selectedGroupName = groupNames[idx];
    groupNames = [];
    groupNames.push(selectedGroupName);
   }
   var filtered = [];
   for (var g = 0; g < groupNames.length; g++) {
    var group = this.trackRuleGroups[groupNames[g]];
    if (group == null || group.multiMatchSelection == "all" || rulesByGroup[groupNames[g]].length == 1) {
     filtered = filtered.concat(rulesByGroup[groupNames[g]]);
    } else if (group.multiMatchSelection == "first") {
     filtered.push(rulesByGroup[groupNames[g]][0]);
    } else {
     var idx = Math.floor(random() * rulesByGroup[groupNames[g]].length);
     filtered.push(rulesByGroup[groupNames[g]][idx]);
    }
   }
   return filtered;
  }
  markRuleApplied(rule, time) {
   rule.lastPlay = time;
   if (rule.groupName in this.trackRuleGroups) {
    this.trackRuleGroups[rule.groupName].lastPlay = time;
   }
   return time + this.boundTracks[rule.trackId].duration * 1000;
  }
  getBoundTracksForSong(song, currentTime, lastTrack, nextTrack) {
   var result = { before: [], after: [] };
   if (!trackRulesEnabled) return result;
   if (!("boundTo" in song)) {
    song.boundTo = [];
    for (var r = 0; r < this.trackRules.length; r++) {
     if (this.trackRules[r].active && this.isBoundTo(song, this.trackRules[r])) {
      song.boundTo.push(r);
     }
    }
   }
   if (song.boundTo.length == 0) return result;
   var applicableRules = [];
   for (var r = 0; r < song.boundTo.length; r++) {
    var rIdx = song.boundTo[r];
    var group = this.trackRuleGroups[this.trackRules[rIdx].groupName];
    var ruleTimeMatch = currentTime - this.trackRules[rIdx].lastPlay > this.trackRules[rIdx].minDistance * 60000;
    var groupTimeMatch =
     group == null || !("lastPlay" in group) || currentTime - group.lastPlay > group.minDistance * 60000;
    if (ruleTimeMatch && groupTimeMatch) {
     applicableRules.push(this.trackRules[rIdx]);
    }
   }
   if (applicableRules.length > 1) {
    applicableRules = this.filterApplicableRules(applicableRules);
   }
   if (applicableRules.length > 0) {
    var lastIsJingle = lastTrack != null && lastTrack.type == JINGLE;
    var nextIsJingle = nextTrack != null && nextTrack.type == JINGLE;
    for (var r = 0; r < applicableRules.length; r++) {
     var rule = applicableRules[r];
     var isJingle = this.boundTracks[rule.trackId].type == JINGLE;
     if (rule.position == "before") {
      if (isJingle && lastIsJingle) {
       switch (this.trackRuleJingleCollisionStrategy) {
        case "keep_both":
         result.before.push({ track: this.boundTracks[rule.trackId], rule: rule });
         break;
        case "keep_rule_jingle":
         result.before.push({ track: this.boundTracks[rule.trackId], rule: rule, replaceLast: true });
         break;
        case "keep_standard_jingle":
         break;
       }
      } else {
       result.before.push({ track: this.boundTracks[rule.trackId], rule: rule });
      }
     } else {
      if (isJingle && nextIsJingle) {
       switch (this.trackRuleJingleCollisionStrategy) {
        case "keep_both":
         result.after.push({ track: this.boundTracks[rule.trackId], rule: rule });
         break;
        case "keep_rule_jingle":
         result.after.push({ track: this.boundTracks[rule.trackId], rule: rule, skipNext: true });
         break;
        case "keep_standard_jingle":
         break;
       }
      } else {
       result.after.push({ track: this.boundTracks[rule.trackId], rule: rule });
      }
     }
    }
   }
   return result;
  }
 }
 class Scheduler {
  constructor(trackRuleEngine) {
   this.scheduledTracks = [];
   this.selectorTags = {};
   this.jingles = [];
   this.lastJinglePlay = -1;
   this.lastNewsStarted = 0;
   this.startsWithNews = false;
   this.lastStartedAt = {};
   this.jingleOrder = opts.jingleOrder;
   this.jingleInterval = opts.jingleInterval;
   this.adJingleCollisionStrategy = opts.adJingleCollisionStrategy ?? "keep_both";
   this.adPositions = opts.adPositions != null && opts.adPositions.length > 1 ? opts.adPositions : [15, 45];
   this.newsInterval = opts.newsInterval ?? 60;
   this.newsMin = opts.newsMin ?? 59;
   this.newsMax = opts.newsMax ?? 15;
   this.trackRuleEngine = trackRuleEngine;
  }
  initializeSelectorTags() {
   if (schedulingRulesEnabled) {
    var scheduled = this.trackRuleEngine.scheduled;
    for (var i = 0; i < scheduled.length; i++) {
     if (!(scheduled[i].tag in this.selectorTags)) {
      this.selectorTags[scheduled[i].tag] = [];
     }
     this.selectorTags[scheduled[i].tag].push(scheduled[i]);
    }
   }
  }
  processTrackStats(trackStats) {
   for (var i = 0; i < trackStats.length; i++) {
    var started = Date.parse(trackStats[i].started_at);
    this.lastStartedAt[trackStats[i].id] = started;
    if (trackStats[i].type == JINGLE) {
     var diff = Math.floor((executionTime - started) / MIN);
     this.lastJinglePlay = diff;
    }
    if (trackStats[i].id == 1) {
     this.lastNewsStarted = started;
    }
   }
  }
  receiveSpecialTracks(specialTracks) {
   this.newsTrack = specialTracks.newsTrack;
   this.preNewsJingle = specialTracks.preNewsJingle;
   this.firstJingle = specialTracks.firstJingle;
   this.jingles = specialTracks.jingles;
   this.adTrigger = specialTracks.adTrigger;
   this.adSeparator = specialTracks.adSeparator;
  }
  pushScheduledJingle(track, minTime) {
   this.scheduledTracks.push({
    tracks: [track],
    minTime: minTime - 30000,
    maxTime: minTime + MIN * 6,
    jingleCollision: "skip_scheduled",
    type: JINGLE
   });
  }
  scheduleJingles() {
   var addFirstJingle = this.firstJingle != null && !this.startsWithNews;
   if (!addFirstJingle && this.jingles.length == 0) return;
   if (addFirstJingle && this.jingles.length == 0) {
    this.pushScheduledJingle(this.firstJingle, startTime);
    return;
   }
   var jingleOrder = "shuffle";
   if (this.jingleOrder !== undefined) {
    jingleOrder = this.jingleOrder;
   }
   if (jingleOrder != "preserve") {
    shuffle(this.jingles);
   }
   var jingleIntervalMin = 0;
   if (this.jingleInterval !== undefined) {
    jingleIntervalMin = this.jingleInterval;
   }
   if (jingleIntervalMin == 0) {
    var numJingles = addFirstJingle ? this.jingles.length + 1 : this.jingles.length;
    jingleIntervalMin = Math.floor(duration / numJingles / 60);
   }
   var jingleIntervalMs = jingleIntervalMin * 60 * 1000;
   var newsJingleTimes = [];
   for (var n = 0; n < this.scheduledTracks.length; n++) {
    if (this.scheduledTracks[n].type == NEWS && this.scheduledTracks[n].tracks) {
     var trackTime = this.scheduledTracks[n].minTime;
     for (var nt = 0; nt < this.scheduledTracks[n].tracks.length; nt++) {
      if (this.scheduledTracks[n].tracks[nt].type == JINGLE) {
       newsJingleTimes.push(trackTime);
       log("News jingle at " + new Date(trackTime).toLocaleTimeString());
      }
      trackTime += this.scheduledTracks[n].tracks[nt].duration * 1000;
     }
    }
   }
   var jingleOffset = 0;
   var jingleIdx = 0;
   var time = startTime;
   if (addFirstJingle) {
    this.pushScheduledJingle(this.firstJingle, startTime);
    jingleOffset = jingleIntervalMs;
    time = startTime + jingleOffset;
   } else {
    if (this.lastJinglePlay > -1) {
     jingleOffset = Math.max(0, jingleIntervalMin - this.lastJinglePlay) * MIN;
    } else {
     jingleOffset = Math.floor(random() * jingleIntervalMs);
    }
    time = startTime + jingleOffset;
   }
   if (newsJingleTimes.length > 0 && this.startsWithNews) {
    time = newsJingleTimes[0];
   }
   var endTime = startTime + duration * 1000;
   var jingleCnt = 0;
   var newsJingleIdx = 0;
   while (time < endTime) {
    while (newsJingleIdx < newsJingleTimes.length && time >= newsJingleTimes[newsJingleIdx] + jingleIntervalMs) {
     newsJingleIdx++;
    }
    var resetBase = -1;
    if (
     newsJingleIdx < newsJingleTimes.length &&
     time >= newsJingleTimes[newsJingleIdx] - jingleIntervalMs / 3 &&
     time < newsJingleTimes[newsJingleIdx] + jingleIntervalMs
    ) {
     resetBase = newsJingleTimes[newsJingleIdx];
    }
    if (resetBase > -1) {
     jingleOffset = resetBase + jingleIntervalMs - startTime;
     jingleCnt = 0;
     time = startTime + jingleOffset;
     continue;
    }
    this.pushScheduledJingle(this.jingles[jingleIdx], time);
    log("jingle at " + new Date(time).toLocaleTimeString());
    jingleIdx++;
    if (jingleIdx == this.jingles.length) {
     jingleIdx = 0;
     if (jingleOrder == "shuffle_repeat") {
      shuffle(this.jingles);
     }
    }
    jingleCnt++;
    time = startTime + jingleOffset + jingleCnt * jingleIntervalMs;
   }
  }
  isInNewsTimeframe(minutes) {
   if (this.newsMax > this.newsMin) {
    return minutes >= this.newsMin && minutes <= this.newsMax;
   } else {
    var diff = 60 - this.newsMin;
    var m = (minutes + diff) % 60;
    return m >= 0 && m <= this.newsMax + diff;
   }
  }
  scheduleNews() {
   var newsTracks = [];
   var jingleCollision = "keep_both";
   if (this.preNewsJingle != null) {
    newsTracks.push(this.preNewsJingle);
    jingleCollision = "remove_jingle";
   }
   newsTracks.push(this.newsTrack);
   this.newsTrack.duration = 165;
   if (this.firstJingle != null && firstJingleAfterNews) {
    newsTracks.push(this.firstJingle);
    jingleCollision = "remove_jingle";
   }
   var ts = new Date();
   var time = startTime;
   var endTime = startTime + duration * 1000;
   var noNewsAfter = endTime - MIN * 15;
   while (time < noNewsAfter) {
    ts.setTime(time);
    ts.setSeconds(0);
    if (this.isInNewsTimeframe(ts.getMinutes()) && ts.getTime() - this.lastNewsStarted > 1000 * 30 * 45) {
     if (time == startTime) this.startsWithNews = true;
     var diff = ts.getMinutes() < this.newsMax ? this.newsMax - ts.getMinutes() : this.newsMax + 60 - ts.getMinutes();
     var scheduledNews = {
      tracks: newsTracks,
      minTime: ts.getTime(),
      maxTime: ts.getTime() + MIN * diff,
      jingleCollision: jingleCollision,
      type: NEWS
     };
     this.scheduledTracks.push(scheduledNews);
     log("schedule news: " + ts.toLocaleString() + ", max = " + new Date(scheduledNews.maxTime).toLocaleString());
     time += this.newsInterval * MIN;
     if (ts.getMinutes() != this.newsMin) time -= MIN * 15;
    } else {
     time += MIN;
    }
   }
  }
  scheduleAdTriggerAt(adTracks, time) {
   this.scheduledTracks.push({
    tracks: adTracks,
    minTime: time,
    maxTime: time + MIN * 25,
    jingleCollision: this.adJingleCollisionStrategy == "move_adtrigger" ? "move" : this.adJingleCollisionStrategy,
    type: "adTrigger"
   });
  }
  scheduleAdTriggers() {
   var adTracks = [];
   if (this.adSeparator != null) {
    adTracks.push(this.adSeparator);
   }
   adTracks.push(this.adTrigger);
   var position1 = this.adPositions[0];
   var position2 = this.adPositions[1];
   var diff = position2 - position1;
   if (diff < 20 || diff > 40) {
    if (position1 > 30) {
     position1 = 30;
    }
    if (diff < 20) {
     position2 = position1 + 20;
    } else if (diff > 40) {
     position2 = position1 + 40;
    }
   }
   var ts = new Date();
   ts.setTime(startTime);
   ts.setSeconds(0);
   var startHour = ts.getHours();
   var endTime = startTime + duration * 1000;
   var endHour = startHour + duration / 3600;
   ts.setSeconds(0);
   ts.setMilliseconds(0);
   for (var h = startHour; h <= endHour; h++) {
    ts.setMinutes(position1);
    if (ts.getTime() > startTime && ts.getTime() < endTime) {
     this.scheduleAdTriggerAt(adTracks, ts.getTime());
    }
    ts.setMinutes(position2);
    if (ts.getTime() > startTime && ts.getTime() < endTime) {
     this.scheduleAdTriggerAt(adTracks, ts.getTime());
    }
    ts.setMinutes(0);
    ts.setTime(ts.getTime() + 3600000);
   }
  }
  scheduleByRule(rule) {
   log("schedule " + rule.tag);
   var ts = new Date();
   ts.setTime(startTime);
   var startHour = ts.getHours();
   var endTime = startTime + duration * 1000;
   var endHour = startHour + duration / 3600;
   var dayFilter = "day" in rule ? rule.day : -1;
   var trackIdx = 0;
   var trackIdxInc = 1;
   var boundToNews = false;
   var useLateSelection = false;
   if (rule.selection == "rotate") {
    var maxTime = 0;
    for (var t = 0; t < rule.tracks.length - 1; t++) {
     if (rule.tracks[t].id in this.lastStartedAt && this.lastStartedAt[rule.tracks[t].id] > maxTime) {
      trackIdx = (t + 1) % rule.tracks.length;
      maxTime = this.lastStartedAt[rule.tracks[t].id];
     }
    }
   } else if (rule.selection == "calculatedaily") {
    trackIdx = Math.floor(startTime / (HOUR * 24)) % rule.tracks.length;
    trackIdxInc = 0;
   } else if (rule.selection == "date") {
    var day = ts.getDate() < 10 ? "0" + ts.getDate() : "" + ts.getDate();
    var mon = ts.getMonth() < 10 ? "0" + (ts.getMonth() + 1) : "" + (ts.getMonth() + 1);
    var dateStr = day + "." + mon + ".";
    trackIdx = -1;
    for (var t = 0; t < rule.tracks.length; t++) {
     if (rule.tracks[t].title.includes(dateStr) || rule.tracks[t].album.includes(dateStr)) {
      trackIdx = t;
      break;
     }
    }
    trackIdxInc = 0;
   } else if (rule.selection == "time") {
    rule.timeTracks = [];
    var re = /\d+/g;
    for (var t = 0; t < rule.tracks.length; t++) {
     var str = rule.tracks[t].title + " " + rule.tracks[t].album;
     var m;
     while ((m = re.exec(str)) !== null) {
      var n = parseInt(m[0]);
      if (!isNaN(n) && n >= 0 && n < 24) {
       rule.timeTracks[n] = rule.tracks[t];
      }
     }
    }
    trackIdx = -2;
    trackIdxInc = 0;
   } else if (rule.selection == "index") {
    trackIdx = rule.index - 1 < rule.tracks.length ? rule.index - 1 : -1;
    trackIdxInc = 0;
   } else {
    shuffle(rule.tracks);
    if (
     rule.tracks.length > 1 &&
     rule.tracks[0].type == SONG &&
     rule.tracks.some((t) => t.artistNormalized !== rule.tracks[0].artistNormalized)
    ) {
     useLateSelection = true;
    }
   }
   if (trackIdx == -1) return;
   var hours = [];
   var minutes = [];
   minutes.push(rule.minute);
   if ("hour" in rule) {
    if (rule.hour == -2) {
     rule.hour = (startHour + Math.floor(random() * (duration / 3600))) % 24;
     rule.minute = Math.floor(random() * 60);
     minutes = [];
     minutes.push(rule.minute);
    } else if (rule.hour == -3 || rule.hour == -4) {
     boundToNews = true;
    }
    if (rule.hour > -1) {
     hours.push(rule.hour);
    }
   } else if ("interval" in rule) {
    var step = rule.interval > 0 ? rule.interval : rule.interval < 0 ? 1 : 99;
    for (var h = startHour; h <= endHour; h += step) {
     hours.push(h);
    }
    if (rule.interval < -1) {
     step = -rule.interval;
     for (var mm = rule.minute + step; mm < 60; mm += step) {
      minutes.push(mm);
     }
    }
   }
   for (var i = 0; i < hours.length; i++) {
    ts.setTime(hours[i] % 24 >= startHour ? startTime : startTime + HOUR * 24);
    ts.setHours(hours[i] % 24);
    ts.setSeconds(0);
    var acceptDay =
     dayFilter == -1 ||
     dayFilter == ts.getDay() ||
     (dayFilter == -2 && ts.getDay() > 0 && ts.getDay() < 6) ||
     (dayFilter == -3 && (ts.getDay() == 0 || ts.getDay() == 6));
    if (!acceptDay) continue;
    for (var j = 0; j < minutes.length; j++) {
     ts.setMinutes(minutes[j]);
     if (ts.getTime() > executionTime && ts.getTime() < startTime + duration * 1000) {
      var scheduledElement = {
       minTime: ts.getTime(),
       maxTime: ts.getTime() + MIN * 15,
       jingleCollision: "keep_both",
       type: "rule"
      };
      if (useLateSelection) {
       var candidates = [];
       if (
        "introJingleId" in rule &&
        rule.introJingleId in this.trackRuleEngine.boundTracks &&
        "type" in this.trackRuleEngine.boundTracks[rule.introJingleId]
       ) {
        candidates.push(this.trackRuleEngine.boundTracks[rule.introJingleId]);
       }
       scheduledElement.trackCandidates = rule.tracks.slice();
       if (candidates.length > 0) {
        scheduledElement.introTracks = candidates;
       }
       log("schedule late selection at " + ts.toLocaleString() + ": " + rule.tracks.length + " candidates");
      } else {
       var selTracks = [];
       if (
        "introJingleId" in rule &&
        rule.introJingleId in this.trackRuleEngine.boundTracks &&
        "type" in this.trackRuleEngine.boundTracks[rule.introJingleId]
       ) {
        selTracks.push(this.trackRuleEngine.boundTracks[rule.introJingleId]);
       }
       var track = trackIdx > -1 ? rule.tracks[trackIdx] : trackIdx == -2 ? rule.timeTracks[hours[i % 24]] : null;
       if (track == null || track == undefined) continue;
       log("schedule at " + ts.toLocaleString() + ": " + trackIdx + " of " + rule.tracks.length + " " + track.title);
       selTracks.push(track);
       this.lastStartedAt[track.id] = ts.getTime();
       trackIdx = (trackIdx + trackIdxInc) % rule.tracks.length;
       scheduledElement.tracks = selTracks;
       if (track.type == SONG) {
        scheduledElement.preBlockArtist =
         "artistNormalized" in track ? track.artistNormalized : trackPool.normalizeArtist(track.artist);
       }
      }
      customScheduledElementCreate(rule, trackIdx, scheduledElement);
      this.scheduledTracks.push(scheduledElement);
     }
    }
   }
   if (boundToNews) {
    for (var i = 0; i < this.scheduledTracks.length; i++) {
     if (this.scheduledTracks[i].type != NEWS) continue;
     var tsNews = new Date(this.scheduledTracks[i].minTime);
     var hour = tsNews.getMinutes() < 57 ? tsNews.getHours() : (tsNews.getHours() + 1) % 24;
     if (useLateSelection) {
      if (!("trackCandidates" in this.scheduledTracks[i])) {
       this.scheduledTracks[i].trackCandidates = rule.tracks.slice();
      }
      this.scheduledTracks[i].newsPosition = rule.hour == -3 ? "before" : "after";
     } else {
      var track = trackIdx > -1 ? rule.tracks[trackIdx] : trackIdx == -2 ? rule.timeTracks[hour] : null;
      if (track == null || track == undefined) continue;
      this.scheduledTracks[i].tracks = [...this.scheduledTracks[i].tracks];
      if (rule.hour == -3) {
       this.scheduledTracks[i].tracks.unshift(track);
      } else {
       this.scheduledTracks[i].tracks.push(track);
      }
     }
    }
   }
  }
  scheduleByRules() {
   var scheduled = this.trackRuleEngine.scheduled;
   for (var i = 0; i < scheduled.length; i++) {
    if ("tracks" in scheduled[i]) {
     this.scheduleByRule(scheduled[i]);
    }
   }
  }
  processScheduledElement(scheduledElement) {
   if (
    "trackCandidates" in scheduledElement &&
    (!("tracks" in scheduledElement) || scheduledElement.tracks.length == 0)
   ) {
    var selectedTrack = selectFromScheduledCandidates(scheduledElement.trackCandidates);
    scheduledElement.tracks = [];
    if ("introTracks" in scheduledElement) {
     scheduledElement.tracks.push.apply(scheduledElement.tracks, scheduledElement.introTracks);
    }
    scheduledElement.tracks.push(selectedTrack);
    log("Late selection: " + selectedTrack.title);
   }
  }
 }
 class TrackPool {
  constructor(trackRuleEngine, scheduler) {
   this.recentArtists = {};
   this.lastPlays = {};
   this.dateTagCache = {};
   this.preservedTracks = [];
   this.hasPreservedTracks = false;
   this.hasLinkedTracks = false;
   this.tracksAfter = {};
   this.tracksBefore = {};
   this.tagWeights = opts.tagWeights ?? null;
   this.excludePreviousTracks = opts.excludePreviousTracks ?? 0;
   this.preserveAllJingles = opts.preserveAllJingles ?? 0;
   this.wordDistribution = opts.wordDistribution ?? "random";
   this.maxTracksPerArtist =
    opts.maxTracksPerArtist != null && opts.maxTracksPerArtist < Math.floor(opts.duration / (60 * 60))
     ? opts.maxTracksPerArtist
     : Math.floor(opts.duration / (60 * 60));
   this.blockLength = opts.blockLength ?? opts.duration / 3600 + 1;
   this.avoidRepeat = opts.avoidRepeat ?? 2;
   this.trackRuleEngine = trackRuleEngine;
   this.scheduler = scheduler;
   if ("artistAliases" in opts) {
    this.artistAliases = {};
    var self = this;
    Object.keys(opts.artistAliases).forEach(function (property) {
     self.artistAliases[property.toLowerCase()] = opts.artistAliases[property].toLowerCase();
    });
   } else {
    this.artistAliases = null;
   }
   this.artistSeparators = (opts.artistSeparators ?? [" feat"]).map((s) => s.toLowerCase());
  }
  normalizeArtist(artistName) {
   if (artistName == null) {
    return "<no artist>";
   }
   artistName = artistName.toLowerCase();
   if (this.artistAliases != null && artistName in this.artistAliases) {
    artistName = this.artistAliases[artistName];
   }
   for (var i = 0; i < this.artistSeparators.length; i++) {
    var pos = artistName.indexOf(this.artistSeparators[i]);
    if (pos > 1) {
     artistName = artistName.substring(0, pos).trim();
    }
   }
   if (this.artistAliases != null && artistName in this.artistAliases) {
    artistName = this.artistAliases[artistName];
   }
   return artistName;
  }
  normalizeTitle(name) {
   if (name == null) {
    return "<no title>";
   }
   name = name.toLowerCase();
   var stripped = name.replace(/\W/g, "");
   return stripped.length > 3 ? stripped : name;
  }
  checkDateTag(tag, previousState) {
   if (previousState == 1 || !tag.startsWith("@")) return previousState;
   if (this.dateTagCache[tag] !== undefined) {
    return this.dateTagCache[tag];
   }
   let parts = /^@(\d{1,2})\.(\d{1,2})\.\s*-\s*(\d{1,2})\.(\d{1,2})\./.exec(tag);
   if (!parts) parts = /^@(\d{1,2})\.(\d{1,2})\./.exec(tag);
   if (!parts) {
    this.dateTagCache[tag] = 0;
    return previousState;
   }
   const fromDay = +parts[1],
    fromMonth = +parts[2];
   const toDay = parts[3] ? +parts[3] : fromDay;
   const toMonth = parts[4] ? +parts[4] : fromMonth;
   const now = new Date(startTime);
   const year = now.getFullYear();
   let fromDate = new Date(year, fromMonth - 1, fromDay, 0, 0, 0, 0);
   let toDate = new Date(year, toMonth - 1, toDay, 23, 59, 59, 999);
   if (toDate < fromDate) {
    if (now < fromDate) {
     fromDate.setFullYear(year - 1);
    } else {
     toDate.setFullYear(year + 1);
    }
   }
   const inRange = now >= fromDate && now <= toDate;
   const result = inRange ? 1 : -1;
   this.dateTagCache[tag] = result;
   return result;
  }
  isExcludedByDateTag(track) {
   var dateTagState = 0;
   if (track.tags.length > 0) {
    for (var i = 0; i < track.tags.length; i++) {
     dateTagState = this.checkDateTag(track.tags[i], dateTagState);
    }
   }
   return dateTagState == -1;
  }
  assignTrackScore(track) {
   track.score = 100 + Math.floor(random() * 500);
   var dateTagState = 0;
   if (this.tagWeights != null && track.tags.length > 0) {
    var minWeight = 0;
    var maxWeight = 0;
    for (var i = 0; i < track.tags.length; i++) {
     dateTagState = this.checkDateTag(track.tags[i], dateTagState);
     if (track.tags[i] in this.tagWeights) {
      var w = this.tagWeights[track.tags[i]];
      if (w > 0 && w > maxWeight) {
       maxWeight = w;
      } else if (w < 0 && w < minWeight) {
       minWeight = w;
      }
     }
    }
    if (minWeight < -3 || dateTagState == -1) {
     track.score = 999999;
     return;
    }
    var weight = maxWeight + minWeight;
    if (weight > 0) {
     var p = (4 - weight) / 4;
     track.score = track.score * p;
    } else if (weight < 0) {
     weight = Math.abs(weight);
     var p = 1 + weight / 4;
     track.score = track.score * p;
    }
   } else {
    for (var i = 0; i < track.tags.length; i++) {
     dateTagState = this.checkDateTag(track.tags[i], dateTagState);
    }
    if (dateTagState == -1) {
     track.score = 999999;
     return;
    }
   }
   if (track.type == MODERATION) {
    track.score = track.score * 0.75;
   }
   if (track.id in this.lastPlays && this.lastPlays[track.id] < 60 * this.avoidRepeat) {
    if (this.excludePreviousTracks) {
     track.score = 999999;
    } else {
     var penalty = 500 - (250 * this.lastPlays[track.id]) / (60 * this.avoidRepeat);
     track.score += penalty;
     track.penalty = Math.floor(penalty / 50);
    }
   } else {
    track.penalty = 0;
   }
  }
  initTracksAndArtists(remainingDuration, iteration) {
   var artists = [];
   var artistMap = {};
   var tracksDuration = 0;
   var start = 0;
   if ((tracks.length > 2 && tracks[0].type == NEWS) || (tracks[0].type == JINGLE && tracks[1].type == NEWS)) {
    if (tracks[0].type == JINGLE) {
     this.scheduler.preNewsJingle = tracks[0];
     start++;
    }
    this.scheduler.newsTrack = tracks[start];
    start++;
    if (firstJingleAfterNews && tracks[start].type == JINGLE) {
     this.scheduler.firstJingle = tracks[start];
     start++;
    }
   }
   var excludeFollowing = false;
   var songCnt = 0;
   for (var i = start; i < tracks.length; i++) {
    if (tracks[i].id == 1) {
     this.scheduler.newsTrack = tracks[i];
     continue;
    }
    if (
     (tracks[i].title != null && tracks[i].title.indexOf("START_AD_BREAK") > -1) ||
     (tracks[i].artist != null && tracks[i].artist.indexOf("START_AD_BREAK") > -1)
    ) {
     this.scheduler.adTrigger = tracks[i];
     continue;
    }
    if ((trackRulesEnabled || schedulingRulesEnabled) && tracks[i].id in this.trackRuleEngine.boundTracks) {
     if (!this.isExcludedByDateTag(tracks[i])) {
      this.trackRuleEngine.boundTracks[tracks[i].id] = tracks[i];
     }
     continue;
    }
    if (tracks[i].type == SONG) {
     songCnt++;
    }
    tracks[i].plays = 0;
    tracks[i].use = false;
    tracks[i].groupTags = [];
    if (schedulingRulesEnabled) {
     var skip = false;
     for (var t = 0; t < tracks[i].tags.length; t++) {
      if (tracks[i].tags[t] in this.scheduler.selectorTags) {
       for (var r = 0; r < this.scheduler.selectorTags[tracks[i].tags[t]].length; r++) {
        var rule = this.scheduler.selectorTags[tracks[i].tags[t]][r];
        if (!("tracks" in rule)) {
         rule.tracks = [];
         rule.trackIdxs = [];
        }
        if ("exclude" in rule) skip = true;
        if (!this.isExcludedByDateTag(tracks[i])) {
         if (tracks[i].type === SONG) {
          tracks[i].artistNormalized = this.normalizeArtist(tracks[i].artist);
         }
         rule.tracks.push(tracks[i]);
         rule.trackIdxs.push(i);
        }
       }
      }
     }
     if (skip) continue;
    }
    if (tracks[i].type == JINGLE) {
     if (tracks[i].id == 8664493) {
      excludeFollowing = true;
      continue;
     }
     if (iteration == 0 && !this.isExcludedByDateTag(tracks[i])) {
      if (tracks[i].id == 0 || tracks[i].id == opts.adTrigger) {
       this.scheduler.adTrigger = tracks[i];
      } else if (tracks[i].id == opts.adSeparator) {
       this.scheduler.adSeparator = tracks[i];
      } else if (this.preserveAllJingles) {
       tracks[i].position = songCnt;
       this.preservedTracks.push(tracks[i]);
       this.hasPreservedTracks = true;
      } else if ((i == 0 || (i == 1 && tracks[0].id == 1)) && "protectFirstJingle" in opts && opts.protectFirstJingle) {
       this.scheduler.firstJingle = tracks[i];
      } else {
       this.scheduler.jingles.push(tracks[i]);
      }
     }
     continue;
    } else if (tracks[i].type == MODERATION) {
     if (this.wordDistribution == "preserve" && iteration == 0) {
      tracks[i].position = songCnt;
      this.preservedTracks.push(tracks[i]);
      this.hasPreservedTracks = true;
      continue;
     } else if (this.wordDistribution == "link_next" && i < tracks.length - 1 && iteration == 0) {
      this.hasLinkedTracks = true;
      this.tracksBefore[tracks[i + 1].id] = tracks[i];
      continue;
     } else if (this.wordDistribution == "link_previous" && i > 0 && iteration == 0) {
      this.hasLinkedTracks = true;
      this.tracksAfter[tracks[i - 1].id] = tracks[i];
      continue;
     }
    }
    if (excludeFollowing) continue;
    tracksDuration += tracks[i].duration;
    if (trackNameLimit > 0) {
     tracks[i].normTitle = this.normalizeTitle(tracks[i].title);
     tracks[i].groupTags = tracks[i].tags.filter((tag) => tag.startsWith("="));
     tracks[i].groupTags.push(tracks[i].normTitle);
    }
    this.assignTrackScore(tracks[i]);
    if (tracks[i].score > 10000) {
     continue;
    }
    var artistName = this.normalizeArtist(tracks[i].artist);
    tracks[i].artistNormalized = artistName;
    var artist;
    if (artistName in artistMap) {
     artist = artistMap[artistName];
     if (tracks[i].score < artist.score) {
      artist.score = tracks[i].score;
     }
    } else {
     artist = {};
     artist.name = artistName;
     artist.tracks = [];
     artist.score = tracks[i].score;
     artistMap[artistName] = artist;
     artists.push(artist);
    }
    artist.tracks.push(tracks[i]);
   }
   for (var i = 0; i < artists.length; i++) {
    artists[i].tracks.sort(function (a, b) {
     return a.score - b.score;
    });
   }
   artists.sort(function (a, b) {
    return a.score - b.score;
   });
   if (remainingDuration / (60 * 60) < this.maxTracksPerArtist) {
    this.maxTracksPerArtist = Math.max(1, Math.floor(remainingDuration / (60 * 60)));
   }
   var tracksDurationHours = Math.floor(tracksDuration / (60 * 60));
   if (tracksDurationHours < this.maxTracksPerArtist && tracksDurationHours > 0) {
    this.maxTracksPerArtist = tracksDurationHours < 3 ? tracksDurationHours : tracksDurationHours - 1;
   }
   var candidates = [];
   for (var i = 0; i < artists.length; i++) {
    for (
     var j = 0;
     j < artists[i].tracks.length &&
     (j < this.maxTracksPerArtist || (tagPattern.length > 0 && artists[i].tracks[j].type == MODERATION));
     j++
    ) {
     candidates.push(artists[i].tracks[j]);
    }
   }
   candidates.sort(function (a, b) {
    return a.score - b.score;
   });
   var cDuration = 0;
   var cIdx = 0;
   var usedTrackNames = new Set();
   while ((tagPattern.length > 0 || cDuration < remainingDuration) && cIdx < candidates.length) {
    if (
     trackNameLimit === 9999 &&
     candidates[cIdx].groupTags &&
     candidates[cIdx].groupTags.some(function (tg) {
      return usedTrackNames.has(tg);
     })
    ) {
     cIdx++;
     continue;
    }
    cDuration += candidates[cIdx].duration;
    candidates[cIdx].use = true;
    candidates[cIdx].plays = 0;
    if (trackNameLimit === 9999 && candidates[cIdx].groupTags) {
     candidates[cIdx].groupTags.forEach(function (tg) {
      usedTrackNames.add(tg);
     });
    }
    cIdx++;
   }
   return artists;
  }
  prepareSongPool(artists, dur) {
   var numSegments = this.maxTracksPerArtist * 2;
   var segments = [];
   for (var i = 0; i < numSegments; i++) {
    segments.push({ tracks: [], duration: 0 });
   }
   for (var i = 0; i < artists.length; i++) {
    var artist = artists[i];
    var artistTracks = [];
    for (var j = 0; j < artist.tracks.length; j++) {
     if (artist.tracks[j].use) {
      artistTracks.push(artist.tracks[j]);
     }
    }
    if (artistTracks.length == 0) {
     continue;
    }
    var artistSegments = Math.max(1, Math.floor(numSegments / artistTracks.length));
    var isModeration = artist.tracks[0].type == MODERATION;
    var minSegment = !isModeration && artist.name in this.recentArtists ? 1 : 0;
    var currentSegment = minSegment;
    if (!isModeration) {
     var minDuration = segments[0].duration;
     for (var s = minSegment + 1; s < artistSegments; s++) {
      if (segments[s].duration < minDuration) {
       currentSegment = s;
       minDuration = segments[s].duration;
      }
     }
    }
    for (var t = 0; t < artistTracks.length; t++) {
     segments[currentSegment].tracks.push(artistTracks[t]);
     segments[currentSegment].duration += artistTracks[t].duration;
     currentSegment = (currentSegment + artistSegments) % segments.length;
    }
   }
   var playlistTracks = [];
   var segmentTargetDuration = Math.floor(dur / segments.length);
   for (var s = 0; s < segments.length; s++) {
    var segmentTracks = segments[s].tracks;
    if (tagPattern.length == 0) {
     shuffle(segmentTracks);
    } else {
     var avgTrackLenth = Math.floor(segments[s].duration / segmentTracks.length);
     var numTracks = Math.floor(segmentTargetDuration / avgTrackLenth);
     partialShuffle(segmentTracks, Math.min(segmentTracks.length, numTracks));
    }
    segmentTracks.sort(function (a, b) {
     return (a.penalty || 0) - (b.penalty || 0);
    });
    playlistTracks.push.apply(playlistTracks, segmentTracks);
   }
   return playlistTracks;
  }
  hasEnoughTaggedTracks(trackList, tags, n) {
   const tagSet = new Set(tags);
   let dur = 0;
   for (const track of trackList) {
    if (track.tags.some((tag) => tagSet.has(tag)) || tagSet.has(track.type)) {
     dur += track.duration;
     if (dur >= n) return true;
    }
   }
   return false;
  }
  build() {
   log("Execution time: " + new Date(executionTime) + ", start time: " + new Date(startTime));
   var sumTrackDuration = 0;
   var songPool = [];
   var remainingDuration = duration;
   var iteration = 0;
   while (remainingDuration > 0 && iteration < 20) {
    let artists = this.initTracksAndArtists(Math.min(this.blockLength * 60 * 60, remainingDuration), iteration);
    var selectedTracks = this.prepareSongPool(artists, Math.min(this.blockLength * 60 * 60, remainingDuration));
    selectedTracks.forEach(function (t) {
     sumTrackDuration += t.duration;
    });
    songPool = songPool.concat(selectedTracks);
    remainingDuration = duration - sumTrackDuration;
    iteration++;
    if (remainingDuration > 0) {
     var addedMinutes = Math.floor(sumTrackDuration / 60);
     this.recentArtists = {};
     for (var id in this.lastPlays) {
      this.lastPlays[id] += addedMinutes;
     }
     var tmpDuration = 0;
     for (var i = 0; i < selectedTracks.length; i++) {
      tmpDuration += selectedTracks[i].duration;
      this.lastPlays[selectedTracks[i].id] = Math.floor((sumTrackDuration - tmpDuration) / 60);
      if (i >= selectedTracks.length - 12) {
       this.recentArtists[this.normalizeArtist(selectedTracks[i].artist)] = true;
      }
     }
    }
   }
   return songPool;
  }
 }
 class TrackSelectorBase {
  constructor() {
   this.artistBlocked = {};
   this.artistScheduled = {};
   this.recentTrackNames = [];
   this.matchingRules = [];
   this.artistBlockDuration = tagPattern.length > 0 ? HOUR : MIN * 30;
   this.tagSequenceRules = opts.tagSequences ?? [];
  }
  isScheduledPreBlocked(artistNormalized, currentTime) {
   var times = this.artistScheduled[artistNormalized];
   if (!times) return false;
   while (times.length > 0 && currentTime >= times[0]) {
    times.shift();
   }
   return times.length > 0 && currentTime >= times[0] - this.artistBlockDuration;
  }
  isArtistPreBlocked(artistNormalized, currentTime) {
   if (artistNormalized in this.artistBlocked && currentTime < this.artistBlocked[artistNormalized]) {
    return true;
   }
   return this.isScheduledPreBlocked(artistNormalized, currentTime);
  }
  checkTagSequenceRules(track) {
   var matchingRules = [];
   for (var r = 0; r < this.tagSequenceRules.length; r++) {
    var rule = this.tagSequenceRules[r];
    if (rule.pattern != null && track.tags.includes(rule.pattern[rule.index])) {
     rule.index++;
     if (rule.index == rule.pattern.length) {
      rule.index = 0;
      matchingRules.push(rule);
     }
    } else {
     rule.index = 0;
    }
   }
   return matchingRules;
  }
  updateSelectionState(song, currentTime) {
   if (song.type == SONG) {
    if ("plays" in song) {
     song.plays++;
    }
    if (!("artistNormalized" in song)) {
     song.artistNormalized = trackPool.normalizeArtist(song.artist);
    }
    this.artistBlocked[song.artistNormalized] = currentTime + this.artistBlockDuration;
    this.matchingRules = this.checkTagSequenceRules(song);
    if (trackNameLimit > 0) {
     this.recentTrackNames.push(song.groupTags);
     if (this.recentTrackNames.length > trackNameLimit) {
      this.recentTrackNames.shift();
     }
    }
   }
  }
  selectFromScheduledCandidates(candidates, currentTime) {
   var bestIdx = 0;
   var bestPenalty = 9999;
   for (var cIdx = 0; cIdx < candidates.length; cIdx++) {
    var track = candidates[cIdx];
    if (track == null) continue;
    var penalty = 0;
    if (
     track.type == SONG &&
     "artistNormalized" in track &&
     this.isArtistPreBlocked(track.artistNormalized, currentTime)
    ) {
     penalty += 3;
    }
    var recentNames = this.recentTrackNames;
    if (
     trackNameLimit > 0 &&
     track.groupTags &&
     track.groupTags.some(function (tg) {
      return recentNames.some(function (rn) {
       return rn.includes(tg);
      });
     })
    ) {
     penalty += 3;
    }
    if (track.plays > 0) {
     penalty += track.plays * 5;
    }
    if (penalty < bestPenalty) {
     bestPenalty = penalty;
     bestIdx = cIdx;
    }
    if (penalty == 0) break;
   }
   return candidates[bestIdx];
  }
 }
 class SimpleTrackSelector extends TrackSelectorBase {
  constructor() {
   super(...arguments);
   this.songPoolIdx = 0;
   this.lastSelectedIdx = -1;
   this.exhausted = false;
  }
  selectFromSongPool(songPool, currentTime) {
   var bestIdx = -1;
   var bestPenalty = 9999;
   var checkedMatches = 0;
   for (var cIdx = this.songPoolIdx; cIdx < songPool.length && checkedMatches < 6; cIdx++) {
    var track = songPool[cIdx];
    if (track == null) continue;
    if (track.type != SONG) {
     return cIdx;
    }
    var penalty = 0;
    checkedMatches++;
    if ("artistNormalized" in track && this.isArtistPreBlocked(track.artistNormalized, currentTime)) {
     penalty += 3;
    }
    for (var rr = 0; rr < this.matchingRules.length; rr++) {
     var result = track.tags.includes(this.matchingRules[rr].next);
     if ((this.matchingRules[rr].not && result) || (!this.matchingRules[rr].not && !result)) {
      penalty++;
     }
    }
    var recentNames = this.recentTrackNames;
    if (
     trackNameLimit > 0 &&
     track.groupTags &&
     track.groupTags.some(function (tg) {
      return recentNames.some(function (rn) {
       return rn.includes(tg);
      });
     })
    ) {
     penalty += 3;
    }
    if (penalty < bestPenalty) {
     bestPenalty = penalty;
     bestIdx = cIdx;
    }
    if (penalty == 0) break;
   }
   return bestIdx;
  }
  hasMore(songPool) {
   if (this.exhausted) return false;
   while (this.songPoolIdx < songPool.length && songPool[this.songPoolIdx] == null) this.songPoolIdx++;
   return this.songPoolIdx < songPool.length;
  }
  selectNext(songPool, currentTime) {
   var selectedIdx = this.selectFromSongPool(songPool, currentTime);
   if (selectedIdx == -1) {
    this.exhausted = true;
    return null;
   }
   this.lastSelectedIdx = selectedIdx;
   return songPool[selectedIdx];
  }
  reselect(songPool, currentTime) {
   return this.selectNext(songPool, currentTime);
  }
  consumeTrack(songPool) {
   songPool[this.lastSelectedIdx] = null;
  }
 }
 class TagPatternTrackSelector extends TrackSelectorBase {
  constructor() {
   super(...arguments);
   this.patternIndex = null;
   this.patternIndexPtr = 0;
   this.patternFailed = 0;
   this.lastSelection = { candidates: [], index: -1 };
  }
  indexTracks(pool, start) {
   var i;
   for (i = start; i < pool.length; i++) {
    var track = pool[i];
    if (track == null) continue;
    for (var t = 0; t < track.tags.length; t++) {
     if (track.tags[t] in patternTags) {
      this.patternIndex[track.tags[t]].push(i);
     }
    }
    this.patternIndex[track.type].push(i);
   }
   return i;
  }
  selectFromPatternIndex(songPool, currentTime) {
   var candidates = this.patternIndex[tagPattern[tagPatternPtr]];
   if (candidates.length == 0 && this.patternIndexPtr < songPool.length) {
    this.patternIndexPtr = this.indexTracks(songPool, this.patternIndexPtr);
    candidates = this.patternIndex[tagPattern[tagPatternPtr]];
   }
   var bestIdx = -1;
   var bestPenalty = 9999;
   var checkedMatches = 0;
   for (var cIdx = 0; cIdx < candidates.length; cIdx++) {
    var track = songPool[candidates[cIdx]];
    if (track != null) {
     var artistAccepted = !(
      track.type == SONG &&
      "artistNormalized" in track &&
      this.isArtistPreBlocked(track.artistNormalized, currentTime)
     );
     if (artistAccepted) {
      var penalty = 0;
      checkedMatches++;
      if (track.type == SONG) {
       for (var rr = 0; rr < this.matchingRules.length; rr++) {
        var result = track.tags.includes(this.matchingRules[rr].next);
        if ((this.matchingRules[rr].not && result) || (!this.matchingRules[rr].not && !result)) {
         penalty++;
        }
       }
       var recentNames = this.recentTrackNames;
       if (
        track.groupTags &&
        track.groupTags.some(function (tg) {
         return recentNames.some(function (rn) {
          return rn.includes(tg);
         });
        })
       ) {
        penalty += 3;
       }
      }
      if (penalty < bestPenalty) {
       bestPenalty = penalty;
       bestIdx = cIdx;
      }
      if (penalty == 0 || checkedMatches == 5) {
       break;
      }
     }
    }
    if (cIdx == candidates.length - 1 && this.patternIndexPtr < songPool.length) {
     this.patternIndexPtr = this.indexTracks(songPool, this.patternIndexPtr);
    }
   }
   return { candidates: candidates, index: bestIdx };
  }
  initializePatternIndex(songPool) {
   this.patternIndex = {};
   this.patternIndex[SONG] = [];
   this.patternIndex[JINGLE] = [];
   this.patternIndex[MODERATION] = [];
   this.patternIndex["news"] = [];
   for (var i = 0; i < tagPattern.length; i++) {
    if (!(tagPattern[i] in this.patternIndex)) {
     this.patternIndex[tagPattern[i]] = [];
    }
   }
   this.patternIndexPtr = this.indexTracks(songPool, 0);
  }
  hasMore(_songPool) {
   return this.patternFailed < tagPattern.length;
  }
  selectNext(songPool, currentTime) {
   this.patternFailed++;
   var selection = this.selectFromPatternIndex(songPool, currentTime);
   this.lastSelection = selection;
   if (selection.index > -1) {
    return songPool[selection.candidates[selection.index]];
   }
   tagPatternPtr = (tagPatternPtr + 1) % tagPattern.length;
   return null;
  }
  reselect(songPool, currentTime) {
   var selection = this.selectFromPatternIndex(songPool, currentTime);
   if (selection.index > -1) {
    this.lastSelection = selection;
    return songPool[selection.candidates[selection.index]];
   }
   return null;
  }
  consumeTrack(songPool) {
   var selection = this.lastSelection;
   var track = songPool[selection.candidates[selection.index]];
   songPool.push(track);
   songPool[selection.candidates[selection.index]] = null;
   selection.candidates.splice(selection.index, 1);
   this.patternFailed = 0;
   tagPatternPtr = (tagPatternPtr + 1) % tagPattern.length;
  }
 }
 var trackRuleEngine = new TrackRuleEngine();
 var scheduler = new Scheduler(trackRuleEngine);
 var trackPool = new TrackPool(trackRuleEngine, scheduler);
 var selectorBase = new SimpleTrackSelector();
 var tagPatternSelector = new TagPatternTrackSelector();
 var activeSelector = selectorBase;
 var tagPatternPtr = 0;
 var patternTags = {};
 var random = opts.random ?? Math.random;
 var debug = opts.debug ?? false;
 function log(msg) {
  if (debug) console.log(msg);
 }
 function shuffle(a) {
  partialShuffle(a, a.length);
 }
 function partialShuffle(a, len) {
  var j, x, i;
  for (i = len; i; i--) {
   j = Math.floor(random() * i);
   x = a[i - 1];
   a[i - 1] = a[j];
   a[j] = x;
  }
 }
 function selectFromScheduledCandidates(candidates) {
  return activeSelector.selectFromScheduledCandidates(candidates, time);
 }
 function updateSelectionState(song) {
  activeSelector.updateSelectionState(song, time);
 }
 function insertScheduledEvents(nextIsJingle, nextIsShortTrack) {
  var skipJingle = false;
  var addScheduled = true;
  var tracksAdded = false;
  var skipSchduled = false;
  while (nextScheduled != null && time >= nextScheduled.minTime && addScheduled) {
   addScheduled = true;
   if (nextScheduled.jingleCollision != "keep_both") {
    var lastIsJingle = playlistTracks.length > 0 && playlistTracks[playlistTracks.length - 1].type == JINGLE;
    if (lastIsJingle || nextIsJingle) {
     if (nextScheduled.jingleCollision == "move") {
      if (moveCnt < 2) {
       skipSchduled = true;
       addScheduled = false;
       moveCnt++;
      }
     } else if (nextScheduled.jingleCollision == "skip_scheduled") {
      addScheduled = false;
     } else if (nextScheduled.jingleCollision == "remove_jingle") {
      if (lastIsJingle) {
       time -= playlistTracks[playlistTracks.length - 1].duration * 1000;
       playlistTracks.splice(playlistTracks.length - 1, 1);
      }
      if (nextIsJingle) {
       skipJingle = true;
      }
     }
    }
   } else if (nextIsShortTrack && playlistTracks.length > 0 && nextScheduled.type == NEWS && moveCnt == 0) {
    addScheduled = false;
    moveCnt++;
   }
   if (addScheduled) {
    log(
     new Date(time).toLocaleString() +
      " for " +
      new Date(nextScheduled.minTime).toLocaleString() +
      " / " +
      nextScheduled.type
    );
    scheduler.processScheduledElement(nextScheduled);
    for (var t = 0; t < nextScheduled.tracks.length; t++) {
     playlistTracks.push(nextScheduled.tracks[t]);
     log(nextScheduled.tracks[t].title + " " + nextScheduled.tracks[t].duration);
     updateSelectionState(nextScheduled.tracks[t]);
     time += nextScheduled.tracks[t].duration * 1000;
    }
    tracksAdded = true;
    nextScheduled = sIdx < scheduler.scheduledTracks.length ? scheduler.scheduledTracks[sIdx++] : null;
    moveCnt = 0;
   } else if (time > nextScheduled.maxTime || skipSchduled) {
    nextScheduled = sIdx < scheduler.scheduledTracks.length ? scheduler.scheduledTracks[sIdx++] : null;
    moveCnt = 0;
   }
  }
  return { tracksAdded: tracksAdded, skipJingle: skipJingle };
 }
 function addTrackToPlaylist(playlist, song) {
  var added = 0;
  if (trackRulesEnabled && song.type == SONG) {
   var lastTrack = playlistTracks.length > 0 ? playlist[playlist.length - 1] : null;
   var boundResult = trackRuleEngine.getBoundTracksForSong(song, time, lastTrack, null);
   for (var b = 0; b < boundResult.before.length; b++) {
    var entry = boundResult.before[b];
    if (entry.replaceLast && playlist.length > 1 && (!opts.protectFirstJingle || playlist.length > 1)) {
     playlist.splice(playlist.length - 1, 1);
    }
    playlist.push(entry.track);
    playlist[playlist.length - 1].linked = true;
    time = trackRuleEngine.markRuleApplied(entry.rule, time);
    added += entry.track.duration * 1000;
   }
  }
  if (trackPool.hasLinkedTracks && song.id in trackPool.tracksBefore) {
   playlist.push(trackPool.tracksBefore[song.id]);
   playlist[playlist.length - 1].linked = true;
   time += trackPool.tracksBefore[song.id].duration * 1000;
   added += trackPool.tracksBefore[song.id].duration * 1000;
  }
  playlist.push(song);
  time += song.duration * 1000;
  added += song.duration * 1000;
  if (song.type === SONG) {
   numberOfSongs++;
  }
  updateSelectionState(song);
  if (trackPool.hasPreservedTracks) {
   while (trackPool.preservedTracks.length > 0 && trackPool.preservedTracks[0].position == numberOfSongs) {
    playlist.push(trackPool.preservedTracks[0]);
    time += trackPool.preservedTracks[0].duration;
    trackPool.preservedTracks.shift();
   }
  }
  if (trackRulesEnabled && "boundTo" in song && song.boundTo.length > 0) {
   var lastTrack2 = song;
   var boundResult2 = trackRuleEngine.getBoundTracksForSong(song, time, lastTrack2, null);
   for (var b2 = 0; b2 < boundResult2.after.length; b2++) {
    var entryAfter = boundResult2.after[b2];
    playlist[playlist.length - 1].linked = true;
    playlist.push(entryAfter.track);
    time += entryAfter.track.duration * 1000;
    added += entryAfter.track.duration * 1000;
    trackRuleEngine.markRuleApplied(entryAfter.rule, time - entryAfter.track.duration * 1000);
   }
  }
  if (trackPool.hasLinkedTracks && song.id in trackPool.tracksAfter) {
   playlist[playlist.length - 1].linked = true;
   playlist.push(trackPool.tracksAfter[song.id]);
   time += trackPool.tracksAfter[song.id].duration * 1000;
   added += trackPool.tracksAfter[song.id].duration * 1000;
  }
  return added;
 }
 function customScheduledElementCreate(_rule, _trackIdx, _scheduledElement) {}
 function customInitialize() {}
 trackRuleEngine.initialize();
 trackRuleEngine.initializeSchedulingBoundTracks();
 scheduler.initializeSelectorTags();
 if (trackStats != null) {
  var baseTime = executionTime;
  var lastTrackEnd = 0;
  for (var i = 0; i < trackStats.length; i++) {
   if (i > trackStats.length - 12 && trackStats[i].artist != null) {
    var artistName = trackPool.normalizeArtist(trackStats[i].artist.name);
    trackPool.recentArtists[artistName] = true;
   }
   var started = Date.parse(trackStats[i].started_at);
   scheduler.lastStartedAt[trackStats[i].id] = started;
   var endsAt = Date.parse(trackStats[i].ends_at);
   lastTrackEnd = Math.max(lastTrackEnd, endsAt);
   var diff = Math.floor((baseTime - started) / MIN);
   if (diff < trackPool.avoidRepeat * 60) {
    if (trackPool.lastPlays[trackStats[i].id] == null) {
     trackPool.lastPlays[trackStats[i].id] = diff;
    }
   }
   if (trackStats[i].type == JINGLE) {
    scheduler.lastJinglePlay = diff;
   }
   if (
    trackRulesEnabled &&
    trackStats[i].id in trackRuleEngine.boundTracks &&
    "rules" in trackRuleEngine.boundTracks[trackStats[i].id]
   ) {
    for (var r = 0; r < trackRuleEngine.boundTracks[trackStats[i].id].rules.length; r++) {
     trackRuleEngine.markRuleApplied(trackRuleEngine.boundTracks[trackStats[i].id].rules[r], started);
    }
   }
   if (trackStats[i].id == 1) {
    scheduler.lastNewsStarted = started;
   }
  }
  if (lastTrackEnd > baseTime) {
   startTime = lastTrackEnd;
  }
 }
 if (tagPattern.length > 0 && !trackPool.hasEnoughTaggedTracks(tracks, tagPattern, 60 * 60)) {
  log("Discarding tag pattern - not enough tracks");
  tagPattern = [];
 }
 tagPattern.forEach((t) => (patternTags[t] = true));
 customInitialize();
 var songPool = trackPool.build();
 var tagPatternContainsJingles = false;
 if (tagPattern.length > 0) {
  if (JINGLE in patternTags) {
   tagPatternContainsJingles = true;
  }
  for (var i = 0; i < tracks.length && !tagPatternContainsJingles; i++) {
   if (tracks[i].type == JINGLE) {
    for (var t = 0; t < tracks[i].tags.length; t++) {
     if (tracks[i].tags[t] in patternTags) {
      tagPatternContainsJingles = true;
      break;
     }
    }
   }
  }
 }
 if (scheduler.newsTrack != null) {
  scheduler.scheduleNews();
 }
 if (tagPattern.length == 0 || !tagPatternContainsJingles) {
  scheduler.scheduleJingles();
 }
 if (scheduler.adTrigger != null) {
  scheduler.scheduleAdTriggers();
 }
 if (schedulingRulesEnabled) {
  scheduler.scheduleByRules();
 }
 trackRuleEngine.activateRules();
 scheduler.scheduledTracks.sort(function (a, b) {
  return a.minTime - b.minTime;
 });
 selectorBase.tagSequenceRules.forEach((r) => (r.index = 0));
 var playlistTracks = [];
 var time = startTime;
 var sIdx = 0;
 var nextScheduled = sIdx < scheduler.scheduledTracks.length ? scheduler.scheduledTracks[sIdx++] : null;
 var moveCnt = 0;
 var numberOfSongs = 0;
 var usePatternIndex = tagPattern.length > 0;
 var selector;
 if (usePatternIndex) {
  activeSelector = tagPatternSelector;
  selector = tagPatternSelector;
  shuffle(scheduler.jingles);
  songPool = songPool.concat(scheduler.jingles);
  tagPatternSelector.initializePatternIndex(songPool);
 } else {
  selector = selectorBase;
 }
 if (schedulingRulesEnabled) {
  for (var i = 0; i < scheduler.scheduledTracks.length; i++) {
   var se = scheduler.scheduledTracks[i];
   if ("preBlockArtist" in se) {
    var preBlockArtist = se.preBlockArtist;
    if (!(preBlockArtist in activeSelector.artistScheduled)) {
     activeSelector.artistScheduled[preBlockArtist] = [];
    }
    activeSelector.artistScheduled[preBlockArtist].push(se.minTime);
   }
  }
 }
 var playlistLen = 0;
 while (playlistLen < duration * 1000 && selector.hasMore(songPool)) {
  var track = selector.selectNext(songPool, time);
  if (track == null) {
   if (!selector.hasMore(songPool)) break;
   continue;
  }
  var nextIsJingle = track.type === JINGLE;
  var nextIsShortTrack = track.type != SONG && track.duration < 60 && !("linked" in track);
  var lastIsLinked = playlistTracks.length > 0 && "linked" in playlistTracks[playlistTracks.length - 1];
  var result;
  if (!lastIsLinked) {
   result = insertScheduledEvents(nextIsJingle, nextIsShortTrack);
  } else {
   result = { tracksAdded: false, skipJingle: false };
  }
  if (usePatternIndex) {
   playlistLen = time - startTime;
  }
  if (!result.skipJingle && result.tracksAdded) {
   var reselected = selector.reselect(songPool, time);
   if (reselected != null) {
    track = reselected;
   } else if (!usePatternIndex) {
    break;
   }
  }
  if (!result.skipJingle) {
   if (usePatternIndex) {
    playlistLen += addTrackToPlaylist(playlistTracks, track);
   } else {
    addTrackToPlaylist(playlistTracks, track);
   }
  }
  selector.consumeTrack(songPool);
 }
 return playlistTracks;
});
