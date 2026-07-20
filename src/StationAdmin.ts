// StationAdmin v4.3.0
// 20.07.2026

// Type definitions

interface Track {
  id: number;
  title: string | null;
  artist: string | null;
  album?: string;
  type: string;
  duration: number;
  tags: string[];
  // runtime-assigned fields
  score?: number;
  penalty?: number;
  use?: boolean;
  plays?: number;
  normTitle?: string;
  groupTags?: string[];
  artistNormalized?: string;
  boundTo?: number[];
  linked?: boolean;
  position?: number;
}

interface TrackStat {
  id: number;
  artist: { name: string } | null;
  started_at: string;
  ends_at: string;
  type: string;
}

interface Artist {
  name: string;
  tracks: Track[];
  score: number;
}

interface TagWeight {
  [tag: string]: number;
}

interface TrackRule {
  active?: boolean;
  filter: string;
  filterType: 'tag' | 'artist' | 'title' | 'artist_title';
  groupName: string;
  minDistance: number;
  trackId: number;
  position: 'before' | 'after';
  lastPlay?: number;
  term?: string;
}

interface TrackRuleGroup {
  minDistance: number;
  multiMatchSelection?: 'all' | 'first' | 'any';
  lastPlay?: number;
}

interface TagSequenceRule {
  pattern: string[] | null;
  index: number;
  next?: string;
  not?: boolean;
}

interface ScheduledRule {
  tag: string;
  selection: string;
  trackType?: string;
  version?: number;
  index?: number;
  exclude?: boolean;
  interval?: number;
  minute: number;
  hour?: number;
  day?: number;
  introJingleId?: number;
  tracks?: Track[];
  trackIdxs?: number[];
  timeTracks?: Track[];
  groupName?: string;
  lastPlay?: number;
  minDistance?: number;
}

interface ScheduledElement {
  tracks?: Track[];
  trackCandidates?: Track[];
  introTracks?: Track[];
  minTime: number;
  maxTime: number;
  jingleCollision: string;
  type: string;
  newsPosition?: string;
  preBlockArtist?: string;
}

interface BoundTrackMap {
  [trackId: number]: Track & { rules?: TrackRule[] };
}

interface BoundResult {
  before: Array<{ track: Track; rule: TrackRule; replaceLast?: boolean }>;
  after: Array<{ track: Track; rule: TrackRule; skipNext?: boolean }>;
}

interface ShuffleOptions {
  duration?: number;
  blockLength?: number;
  maxTracksPerArtist?: number;
  tagWeights?: TagWeight;
  artistSeparators?: string[];
  artistAliases?: { [key: string]: string };
  wordDistribution?: string;
  preserveAllJingles?: number;
  avoidRepeat?: number;
  excludePreviousTracks?: number;
  trackNameLimit?: number;
  adPositions?: number[];
  adJingleCollisionStrategy?: string;
  trackRules?: TrackRule[];
  trackRuleGroups?: { [groupName: string]: TrackRuleGroup };
  trackRuleJingleCollisionStrategy?: string;
  trackRuleGroupCollisionStrategy?: string;
  scheduled?: ScheduledRule[];
  newsInterval?: number;
  newsMin?: number;
  newsMax?: number;
  firstJingleAfterNews?: boolean;
  tagSequences?: TagSequenceRule[];
  tagPattern?: string[];
  random?: () => number;
  debug?: boolean;
  time?: string;
  jingleOrder?: string;
  jingleInterval?: number;
  adTrigger?: number;
  adSeparator?: number;
  protectFirstJingle?: boolean;
}

// Main shuffle function

(function (tracks: Track[], opts: ShuffleOptions, trackStats: TrackStat[] | null) {
  const SONG = "song";
  const JINGLE = "jingle";
  const MODERATION = "moderation";
  const NEWS = "news";

  // Time setup
  if ('time' in opts) {
    let ts = Date.parse(opts.time!);
    Date.now = () => ts;
  }
  var executionTime: number = Date.now();
  const MIN = 60000;
  const HOUR = 3600000;
  var startTime: number = executionTime + 1000 * 120; // best guess - will try to refine with track stats
  var duration: number = (opts.duration ?? 64800) < 64800 ? opts.duration! : 64800;
  var trackNameLimit: number = opts.trackNameLimit ?? 0;
  var trackRulesEnabled: boolean = 'trackRules' in opts;
  var schedulingRulesEnabled: boolean = 'scheduled' in opts;
  var firstJingleAfterNews: boolean = opts.firstJingleAfterNews ?? true;
  var tagPattern: string[] = opts.tagPattern ?? [];

  class TrackRuleEngine {
    boundTracks: BoundTrackMap = {};
    trackRules: TrackRule[] = opts.trackRules;
    trackRuleGroups: { [groupName: string]: TrackRuleGroup } = opts.trackRuleGroups;
    trackRuleJingleCollisionStrategy: string = opts.trackRuleJingleCollisionStrategy;
    trackRuleGroupCollisionStrategy: string = opts.trackRuleGroupCollisionStrategy;
    scheduled: ScheduledRule[] | undefined = opts.scheduled;

    initialize(): void {
      if (trackRulesEnabled) {
        for (var i = 0; i < this.trackRules!.length; i++) {
          var trackId = this.trackRules![i].trackId;
          this.boundTracks[trackId] = {} as Track & { rules?: TrackRule[] };
          this.trackRules![i].lastPlay = startTime - HOUR * 24;
          if (!('rules' in this.boundTracks[trackId])) {
            this.boundTracks[trackId].rules = [];
          }
          this.boundTracks[trackId].rules!.push(this.trackRules![i]);
        }
      }
    }

    initializeSchedulingBoundTracks(): void {
      if (schedulingRulesEnabled) {
        for (var i = 0; i < this.scheduled!.length; i++) {
          if ('introJingleId' in this.scheduled![i]) {
            this.boundTracks[this.scheduled![i].introJingleId!] = {} as Track & { rules?: TrackRule[] };
          }
        }
      }
    }

    activateRules(): void {
      if (trackRulesEnabled) {
        for (var i = 0; i < this.trackRules!.length; i++) {
          this.trackRules![i].active = 'type' in this.boundTracks[this.trackRules![i].trackId];
        }
      }
    }

    processTrackStats(trackStats: TrackStat[]): void {
      if (trackRulesEnabled) {
        for (var i = 0; i < trackStats.length; i++) {
          if (trackStats[i].id in this.boundTracks && 'rules' in this.boundTracks[trackStats[i].id]) {
            for (var r = 0; r < this.boundTracks[trackStats[i].id].rules!.length; r++) {
              this.markRuleApplied(this.boundTracks[trackStats[i].id].rules![r], Date.parse(trackStats[i].started_at));
            }
          }
        }
      }
    }

    normalizeTerm(term: string): string {
      if (term) {
        term = term.toLowerCase();
        return term.replace(/\W/g, "");
      }
      else {
        return "";
      }
    }

    isBoundTo(track: Track, rule: TrackRule): boolean {
      if (rule.filterType == 'tag') {
        return track.tags.includes(rule.filter);
      }
      if (!('term' in rule)) {
        rule.term = this.normalizeTerm(rule.filter);
      }

      switch (rule.filterType) {
        case 'artist':
          return this.normalizeTerm(track.artist).includes(rule.term!);
        case 'title':
          return this.normalizeTerm(track.title).includes(rule.term!);
        case 'artist_title':
          return this.normalizeTerm((track.artist) + " " + (track.title)).includes(rule.term!);
        default:
          return false;
      }
    }

    filterApplicableRules(rules: TrackRule[]): TrackRule[] {
      var rulesByGroup: { [groupName: string]: TrackRule[] } = {};
      var groupNames: string[] = [];
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        var groupName = rule.groupName != null ? rule.groupName : "-";
        if (!(groupName in rulesByGroup)) {
          rulesByGroup[groupName] = [];
          groupNames.push(groupName);
        }
        rulesByGroup[groupName].push(rule);
      }
      if (groupNames.length > 1 && this.trackRuleGroupCollisionStrategy != 'all') {
        var idx = this.trackRuleGroupCollisionStrategy == 'first' ? 0 : Math.floor(random() * groupNames.length);
        var selectedGroupName = groupNames[idx];
        groupNames = [];
        groupNames.push(selectedGroupName);
      }

      var filtered: TrackRule[] = [];
      for (var g = 0; g < groupNames.length; g++) {
        var group = this.trackRuleGroups![groupNames[g]];
        if (group == null || group.multiMatchSelection == 'all' || rulesByGroup[groupNames[g]].length == 1) {
          filtered = filtered.concat(rulesByGroup[groupNames[g]]);
        } else if (group.multiMatchSelection == 'first') {
          filtered.push(rulesByGroup[groupNames[g]][0]);
        } else {
          var idx = Math.floor(random() * rulesByGroup[groupNames[g]].length);
          filtered.push(rulesByGroup[groupNames[g]][idx]);
        }
      }
      return filtered;
    }

    markRuleApplied(rule: TrackRule, time: number): number {
      rule.lastPlay = time;
      if (rule.groupName in this.trackRuleGroups!) {
        this.trackRuleGroups![rule.groupName].lastPlay = time;
      }
      return time + this.boundTracks[rule.trackId].duration * 1000;
    }

    getBoundTracksForSong(song: Track, currentTime: number, lastTrack: Track | null, nextTrack: Track | null): BoundResult {
      var result: BoundResult = { before: [], after: [] };
      if (!trackRulesEnabled) return result;

      if (!('boundTo' in song)) {
        song.boundTo = [];
        for (var r = 0; r < this.trackRules!.length; r++) {
          if (this.trackRules![r].active && this.isBoundTo(song, this.trackRules![r])) {
            song.boundTo.push(r);
          }
        }
      }

      if (song.boundTo!.length == 0) return result;

      var applicableRules: TrackRule[] = [];
      for (var r = 0; r < song.boundTo!.length; r++) {
        var rIdx = song.boundTo![r];
        var group = this.trackRuleGroups![this.trackRules![rIdx].groupName];
        var ruleTimeMatch = currentTime - this.trackRules![rIdx].lastPlay! > this.trackRules![rIdx].minDistance * 60000;
        var groupTimeMatch = group == null || !('lastPlay' in group) || currentTime - group.lastPlay! > group.minDistance * 60000;
        if (ruleTimeMatch && groupTimeMatch) {
          applicableRules.push(this.trackRules![rIdx]);
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
          if (rule.position == 'before') {
            if (isJingle && lastIsJingle) {
              switch (this.trackRuleJingleCollisionStrategy) {
                case 'keep_both':
                  result.before.push({ track: this.boundTracks[rule.trackId], rule: rule });
                  break;
                case 'keep_rule_jingle':
                  result.before.push({ track: this.boundTracks[rule.trackId], rule: rule, replaceLast: true });
                  break;
                case 'keep_standard_jingle':
                  break;
              }
            }
            else {
              result.before.push({ track: this.boundTracks[rule.trackId], rule: rule });
            }
          }
          else {
            if (isJingle && nextIsJingle) {
              switch (this.trackRuleJingleCollisionStrategy) {
                case 'keep_both':
                  result.after.push({ track: this.boundTracks[rule.trackId], rule: rule });
                  break;
                case 'keep_rule_jingle':
                  result.after.push({ track: this.boundTracks[rule.trackId], rule: rule, skipNext: true });
                  break;
                case 'keep_standard_jingle':
                  break;
              }
            }
            else {
              result.after.push({ track: this.boundTracks[rule.trackId], rule: rule });
            }
          }
        }
      }

      return result;
    }
  }

  class Scheduler {
    scheduledTracks: ScheduledElement[] = [];
    selectorTags: { [tag: string]: ScheduledRule[] } = {};
    newsTracks: Track[] = [];
    firstJingle: Track | undefined;
    jingles: Track[] = [];
    adTrigger: Track | undefined;
    adSeparator: Track | undefined;
    lastJinglePlay: number = -1;
    lastNewsStarted: number = 0;
    startsWithNews: boolean = false;
    lastStartedAt: { [id: number]: number } = {};
    private trackRuleEngine: TrackRuleEngine;
    jingleOrder: string = opts.jingleOrder;
    jingleInterval: number = opts.jingleInterval;
    adJingleCollisionStrategy: string = opts.adJingleCollisionStrategy ?? 'keep_both';
    adPositions: number[] = opts.adPositions != null && opts.adPositions.length > 1 ? opts.adPositions : [15, 45];
    newsInterval: number = opts.newsInterval ?? 60;
    newsMin: number = opts.newsMin ?? 59;
    newsMax: number = opts.newsMax ?? 15;

    constructor(trackRuleEngine: TrackRuleEngine) {
      this.trackRuleEngine = trackRuleEngine;
    }

    initializeSelectorTags(): void {
      if (schedulingRulesEnabled) {
        var scheduled = this.trackRuleEngine.scheduled;
        for (var i = 0; i < scheduled!.length; i++) {
          if (!(scheduled![i].tag in this.selectorTags)) {
            this.selectorTags[scheduled![i].tag] = [];
          }
          this.selectorTags[scheduled![i].tag].push(scheduled![i]);
        }
      }
    }

    processTrackStats(trackStats: TrackStat[]): void {
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

    private pushScheduledJingle(track: Track, minTime: number): void {
      this.scheduledTracks.push({
        tracks: [track],
        minTime: minTime - 30000,
        maxTime: minTime + MIN * 6,
        jingleCollision: 'skip_scheduled',
        type: JINGLE
      });
    }

    scheduleJingles(): void {
      var addFirstJingle = this.firstJingle != null && !this.startsWithNews;
      if (!addFirstJingle && this.jingles.length == 0) return;
      if (addFirstJingle && this.jingles.length == 0) {
        this.pushScheduledJingle(this.firstJingle!, startTime);
        return;
      }

      var jingleOrder = 'shuffle';
      if (this.jingleOrder !== undefined) {
        jingleOrder = this.jingleOrder;
      }
      if (jingleOrder != 'preserve') {
        shuffle(this.jingles);
      }

      var jingleIntervalMin = 0;
      if (this.jingleInterval !== undefined) {
        jingleIntervalMin = this.jingleInterval;
      }
      if (jingleIntervalMin == 0) {
        var numJingles = addFirstJingle ? this.jingles.length + 1 : this.jingles.length;
        jingleIntervalMin = Math.floor((duration / numJingles) / 60);
      }
      var jingleIntervalMs = jingleIntervalMin * 60 * 1000;

      var newsJingleTimes: number[] = [];
      for (var n = 0; n < this.scheduledTracks.length; n++) {
        if (this.scheduledTracks[n].type == NEWS && this.scheduledTracks[n].tracks) {
          var trackTime = this.scheduledTracks[n].minTime;
          for (var nt = 0; nt < this.scheduledTracks[n].tracks!.length; nt++) {
            if (this.scheduledTracks[n].tracks![nt].type == JINGLE) {
              newsJingleTimes.push(trackTime);
              log("News jingle at " + new Date(trackTime).toLocaleTimeString());
            }
            trackTime += this.scheduledTracks[n].tracks![nt].duration * 1000;
          }
        }
      }

      var jingleOffset = 0;
      var jingleIdx = 0;
      var time = startTime;

      if (addFirstJingle) {
        this.pushScheduledJingle(this.firstJingle!, startTime);
        jingleOffset = jingleIntervalMs;
        time = startTime + jingleOffset;
      }
      else {
        if (this.lastJinglePlay > -1) {
          jingleOffset = Math.max(0, jingleIntervalMin - this.lastJinglePlay) * MIN;
        }
        else {
          jingleOffset = Math.floor((random() * jingleIntervalMs));
        }
        time = startTime + jingleOffset;
      }

      if(newsJingleTimes.length > 0 && this.startsWithNews) {
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
        if (newsJingleIdx < newsJingleTimes.length
            && time >= newsJingleTimes[newsJingleIdx] - (jingleIntervalMs / 3)
            && time < newsJingleTimes[newsJingleIdx] + jingleIntervalMs) {
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
          if (jingleOrder == 'shuffle_repeat') {
            shuffle(this.jingles);
          }
        }

        jingleCnt++;
        time = startTime + jingleOffset + jingleCnt * jingleIntervalMs;
      }
    }

    private isInNewsTimeframe(minutes: number): boolean {
      if (this.newsMax > this.newsMin) {
        return minutes >= this.newsMin && minutes <= this.newsMax;
      }
      else {
        var diff = 60 - this.newsMin;
        var m = (minutes + diff) % 60;
        return m >= 0 && m <= this.newsMax + diff;
      }
    }

    scheduleNews(): void {
      var scheduledTracks: Track[] = this.newsTracks.slice();
      var jingleCollision = 'keep_both';
      if (scheduledTracks.some(t => t.type === JINGLE)) {
        jingleCollision = 'remove_jingle';
      }

      
      // Adjust length
      for (var i = 0; i < this.newsTracks.length; i++) {
        switch (this.newsTracks[i].id) {
          case 1: // Nachrichten und Wetter
            this.newsTracks[i].duration = 165;
            break;
          case 2: // Nachrichten
            this.newsTracks[i].duration = 140;
            break;
          case 3: // Wetter
            this.newsTracks[i].duration = 30;
            break;
        }
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
          var scheduledNews: ScheduledElement = {
            tracks: scheduledTracks,
            minTime: ts.getTime(),
            maxTime: ts.getTime() + MIN * diff,
            jingleCollision: jingleCollision,
            type: NEWS
          } as ScheduledElement;
          this.scheduledTracks.push(scheduledNews);
          log("schedule news: " + ts.toLocaleString() + ", max = " + new Date(scheduledNews.maxTime).toLocaleString());

          time += this.newsInterval * MIN;
          if (ts.getMinutes() != this.newsMin) time -= MIN * 15;
        }
        else {
          time += MIN;
        }
      }
    }

    private scheduleAdTriggerAt(adTracks: Track[], time: number): void {
      this.scheduledTracks.push({
        tracks: adTracks,
        minTime: time,
        maxTime: time + MIN * 25,
        jingleCollision: this.adJingleCollisionStrategy == 'move_adtrigger' ? 'move' : this.adJingleCollisionStrategy,
        type: 'adTrigger'
      });
    }

    scheduleAdTriggers(): void {
      var adTracks: Track[] = [];
      if (this.adSeparator != null) {
        adTracks.push(this.adSeparator);
      }
      adTracks.push(this.adTrigger!);

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
      var endHour = startHour + (duration / 3600);

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

    private scheduleByRule(rule: ScheduledRule): void {
      log("schedule " + rule.tag);

      var ts = new Date();
      ts.setTime(startTime);
      var startHour = ts.getHours();
      var endTime = startTime + duration * 1000;
      var endHour = startHour + (duration / 3600);
      var dayFilter = 'day' in rule ? rule.day! : -1;

      var trackIdx = 0;
      var trackIdxInc = 1;
      var boundToNews = false;
      var useLateSelection = false;

      if (rule.selection == 'rotate') {
        var maxTime = 0;
        for (var t = 0; t < rule.tracks!.length - 1; t++) {
          if (rule.tracks![t].id in this.lastStartedAt && this.lastStartedAt[rule.tracks![t].id] > maxTime) {
            trackIdx = (t + 1) % rule.tracks!.length;
            maxTime = this.lastStartedAt[rule.tracks![t].id];
          }
        }
      }
      else if (rule.selection == 'calculatedaily') {
        trackIdx = Math.floor(startTime / (HOUR * 24)) % rule.tracks!.length;
        trackIdxInc = 0;
      }
      else if (rule.selection == 'date') {
        var day = ts.getDate() < 10 ? "0" + ts.getDate() : "" + ts.getDate();
        var mon = ts.getMonth() < 10 ? "0" + (ts.getMonth() + 1) : "" + (ts.getMonth() + 1);
        var dateStr = day + "." + mon + ".";
        trackIdx = -1;
        for (var t = 0; t < rule.tracks!.length; t++) {
          if (rule.tracks![t].title!.includes(dateStr) || rule.tracks![t].album!.includes(dateStr)) {
            trackIdx = t;
            break;
          }
        }
        trackIdxInc = 0;
      }
      else if (rule.selection == 'time') {
        rule.timeTracks = [];
        var re = /\d+/g;
        for (var t = 0; t < rule.tracks!.length; t++) {
          var str = rule.tracks![t].title + " " + rule.tracks![t].album;
          var m: RegExpExecArray | null;
          while ((m = re.exec(str)) !== null) {
            var n = parseInt(m[0]);
            if (!isNaN(n) && n >= 0 && n < 24) {
              rule.timeTracks[n] = rule.tracks![t];
            }
          }
        }
        trackIdx = -2;
        trackIdxInc = 0;
      }
      else if (rule.selection == 'index') {
        trackIdx = rule.index! - 1 < rule.tracks!.length ? rule.index! - 1 : -1;
        trackIdxInc = 0;
      } else {
        shuffle(rule.tracks!);
        if (rule.tracks!.length > 1 && rule.tracks![0].type == SONG &&
            rule.tracks!.some(t => t.artistNormalized !== rule.tracks![0].artistNormalized)) {
          useLateSelection = true;
        }
      }

      if (trackIdx == -1) return;

      var hours: number[] = [];
      var minutes: number[] = [];
      minutes.push(rule.minute);
      if ('hour' in rule) {
        if (rule.hour == -2) {
          rule.hour = (startHour + Math.floor(random() * (duration / 3600))) % 24;
          rule.minute = Math.floor(random() * 60);
          minutes = [];
          minutes.push(rule.minute);
        }
        else if (rule.hour == -3 || rule.hour == -4) {
          boundToNews = true;
        }
        if (rule.hour! > -1) {
          hours.push(rule.hour!);
        }
      }
      else if ('interval' in rule) {
        var step = rule.interval! > 0 ? rule.interval! : (rule.interval! < 0 ? 1 : 99);
        for (var h = startHour; h <= endHour; h += step) {
          hours.push(h);
        }
        if (rule.interval! < -1) {
          step = -rule.interval!;
          for (var mm = rule.minute + step; mm < 60; mm += step) {
            minutes.push(mm);
          }
        }
      }

      for (var i = 0; i < hours.length; i++) {
        ts.setTime((hours[i] % 24) >= startHour ? startTime : startTime + HOUR * 24);
        ts.setHours(hours[i] % 24);
        ts.setSeconds(0);
        var acceptDay = dayFilter == -1 || dayFilter == ts.getDay() ||
          (dayFilter == -2 && ts.getDay() > 0 && ts.getDay() < 6) ||
          (dayFilter == -3 && (ts.getDay() == 0 || ts.getDay() == 6));
        if (!acceptDay) continue;

        for (var j = 0; j < minutes.length; j++) {
          ts.setMinutes(minutes[j]);
          if (ts.getTime() > executionTime && ts.getTime() < startTime + duration * 1000) {
            var scheduledElement: ScheduledElement = {
              minTime: ts.getTime(),
              maxTime: ts.getTime() + MIN * 15,
              jingleCollision: 'keep_both',
              type: 'rule'
            } as ScheduledElement;

            if (useLateSelection) {
              var candidates: Track[] = [];
              if ('introJingleId' in rule && rule.introJingleId! in this.trackRuleEngine.boundTracks && 'type' in this.trackRuleEngine.boundTracks[rule.introJingleId!]) {
                candidates.push(this.trackRuleEngine.boundTracks[rule.introJingleId!]);
              }
              scheduledElement.trackCandidates = rule.tracks!.slice();
              if (candidates.length > 0) {
                scheduledElement.introTracks = candidates;
              }
              log("schedule late selection at " + ts.toLocaleString() + ": " + rule.tracks!.length + " candidates");
            } else {
              var selTracks: Track[] = [];
              if ('introJingleId' in rule && rule.introJingleId! in this.trackRuleEngine.boundTracks && 'type' in this.trackRuleEngine.boundTracks[rule.introJingleId!]) {
                selTracks.push(this.trackRuleEngine.boundTracks[rule.introJingleId!]);
              }
              var track = trackIdx > -1 ? rule.tracks![trackIdx] : (trackIdx == -2 ? rule.timeTracks![hours[i % 24]] : null);
              if (track == null || track == undefined) continue;
              log("schedule at " + ts.toLocaleString() + ": " + trackIdx + " of " + rule.tracks!.length + " " + track.title);
              selTracks.push(track);
              this.lastStartedAt[track.id] = ts.getTime();
              trackIdx = (trackIdx + trackIdxInc) % rule.tracks!.length;
              scheduledElement.tracks = selTracks;
              if (track.type == SONG) {
                scheduledElement.preBlockArtist = 'artistNormalized' in track
                  ? track.artistNormalized!
                  : trackPool.normalizeArtist(track.artist);
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
            if (!('trackCandidates' in this.scheduledTracks[i])) {
              this.scheduledTracks[i].trackCandidates = rule.tracks!.slice();
            }
            this.scheduledTracks[i].newsPosition = rule.hour == -3 ? 'before' : 'after';
          } else {
            var track = trackIdx > -1 ? rule.tracks![trackIdx] : (trackIdx == -2 ? rule.timeTracks![hour] : null);
            if (track == null || track == undefined) continue;
            this.scheduledTracks[i].tracks = [...this.scheduledTracks[i].tracks!];
            if (rule.hour == -3) {
              this.scheduledTracks[i].tracks!.unshift(track);
            }
            else {
              this.scheduledTracks[i].tracks!.push(track);
            }
          }
        }
      }
    }

    scheduleByRules(): void {
      var scheduled = this.trackRuleEngine.scheduled;
      for (var i = 0; i < scheduled!.length; i++) {
        if ('tracks' in scheduled![i]) {
          this.scheduleByRule(scheduled![i]);
        }
      }
    }

    processScheduledElement(scheduledElement: ScheduledElement): void {
      if ('trackCandidates' in scheduledElement && (!('tracks' in scheduledElement) || scheduledElement.tracks!.length == 0)) {
        var selectedTrack = selectFromScheduledCandidates(scheduledElement.trackCandidates!);
        scheduledElement.tracks = [];
        if ('introTracks' in scheduledElement) {
          scheduledElement.tracks.push.apply(scheduledElement.tracks, scheduledElement.introTracks!);
        }
        scheduledElement.tracks.push(selectedTrack);
        log("Late selection: " + selectedTrack.title);
      }
    }
  }

  class TrackPool {
    recentArtists: { [name: string]: boolean } = {};
    lastPlays: { [id: number]: number } = {};
    trackListOffset: number = 0;
    dateTagCache: { [tag: string]: number } = {};
    preservedTracks: Track[] = [];
    hasPreservedTracks: boolean = false;
    hasLinkedTracks: boolean = false;
    tracksAfter: { [id: number]: Track } = {};
    tracksBefore: { [id: number]: Track } = {};
    private trackRuleEngine: TrackRuleEngine;
    private scheduler: Scheduler;
    artistAliases: { [key: string]: string } | null;
    artistSeparators: string[];
    tagWeights: TagWeight | null = opts.tagWeights ?? null;
    excludePreviousTracks: number = opts.excludePreviousTracks ?? 0;
    preserveAllJingles: number = opts.preserveAllJingles ?? 0;
    wordDistribution: string = opts.wordDistribution ?? 'random';
    maxTracksPerArtist: number = opts.maxTracksPerArtist != null && opts.maxTracksPerArtist < Math.floor(opts.duration / (60 * 60)) ? opts.maxTracksPerArtist : Math.floor(opts.duration / (60 * 60));
    blockLength: number = opts.blockLength ?? (opts.duration / 3600) + 1;
    avoidRepeat: number = opts.avoidRepeat ?? 2;

    constructor(trackRuleEngine: TrackRuleEngine, scheduler: Scheduler) {
      this.trackRuleEngine = trackRuleEngine;
      this.scheduler = scheduler;
      // Artist aliases - lowercase keys and values
      if ('artistAliases' in opts) {
        this.artistAliases = {};
        var self = this;
        Object.keys(opts.artistAliases!).forEach(function (property: string) {
          self.artistAliases![property.toLowerCase()] = opts.artistAliases![property].toLowerCase();
        });
      }
      else {
        this.artistAliases = null;
      }
      // Artist separators - lowercase
      this.artistSeparators = (opts.artistSeparators ?? [' feat']).map(s => s.toLowerCase());
    }

    normalizeArtist(artistName: string | null): string {
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

    normalizeTitle(name: string | null): string {
      if (name == null) {
        return "<no title>";
      }
      name = name.toLowerCase();
      var stripped = name.replace(/\W/g, "");
      return stripped.length > 3 ? stripped : name;
    }

    checkDateTag(tag: string, previousState: number): number {
      if (previousState == 1 || !tag.startsWith("@")) return previousState;

      if (this.dateTagCache[tag] !== undefined) {
        return this.dateTagCache[tag];
      }

      let parts: RegExpExecArray | null = /^@(\d{1,2})\.(\d{1,2})\.\s*-\s*(\d{1,2})\.(\d{1,2})\./.exec(tag);
      if (!parts) parts = /^@(\d{1,2})\.(\d{1,2})\./.exec(tag);
      if (!parts) {
        this.dateTagCache[tag] = 0;
        return previousState;
      }

      const fromDay = +parts[1], fromMonth = +parts[2];
      const toDay = parts[3] ? +parts[3] : fromDay;
      const toMonth = parts[4] ? +parts[4] : fromMonth;

      const now = new Date(startTime);
      const year = now.getFullYear();

      let fromDate = new Date(year, fromMonth - 1, fromDay, 0, 0, 0, 0);
      let toDate = new Date(year, toMonth - 1, toDay, 23, 59, 59, 999);
      // handle wrap into next year
      if (toDate < fromDate) {
        if (now < fromDate) {
          fromDate.setFullYear(year - 1);
        }
        else {
          toDate.setFullYear(year + 1);
        }
      }

      const inRange = now >= fromDate && now <= toDate;
      const result = inRange ? 1 : -1;
      this.dateTagCache[tag] = result;

      // console.log("result: " + tag + " " + result);

      return result;
    }

    isExcludedByDateTag(track: Track): boolean {
      var dateTagState = 0;
      if (track.tags.length > 0) {
        for (var i = 0; i < track.tags.length; i++) {
          dateTagState = this.checkDateTag(track.tags[i], dateTagState);
        }
      }
      return dateTagState == -1;
    }

    /**
     * Registers a track with any matching scheduling-rule selector tags.
     * Returns true if the track should be skipped (excluded by a rule).
     */
    checkRuleTrack(track: Track, trackIdx: number): boolean {
      if (!schedulingRulesEnabled) return false;
      var skip = false;
      for (var t = 0; t < track.tags.length; t++) {
        if (track.tags[t] in this.scheduler.selectorTags) {
          for (var r = 0; r < this.scheduler.selectorTags[track.tags[t]].length; r++) {
            var rule = this.scheduler.selectorTags[track.tags[t]][r];
            if ((rule.version ?? 0) >= 2 && 'trackType' in rule && track.type !== rule.trackType) {
              // Type mismatch on a version-2+ rule - treat as if the tag were not present
              continue;
            }
            if (!('tracks' in rule)) {
              rule.tracks = [];
              rule.trackIdxs = [];
            }
            if ('exclude' in rule) skip = true;
            if (!this.isExcludedByDateTag(track)) {
              if (track.type === SONG) {
                track.artistNormalized = this.normalizeArtist(track.artist);
              }
              rule.tracks!.push(track);
              rule.trackIdxs!.push(trackIdx);
            }
          }
        }
      }
      return skip;
    }

    assignTrackScore(track: Track): void {
      // assign random score
      track.score = 100 + Math.floor((random() * 500));
      var dateTagState = 0;
      if (this.tagWeights != null && track.tags.length > 0) {
        // increase / decrease score based on tag weights
        var minWeight = 0;
        var maxWeight = 0;
        for (var i = 0; i < track.tags.length; i++) {
          dateTagState = this.checkDateTag(track.tags[i], dateTagState);
          if (track.tags[i] in this.tagWeights) {
            var w = this.tagWeights[track.tags[i]];
            if (w > 0 && w > maxWeight) {
              maxWeight = w;
            }
            else if (w < 0 && w < minWeight) {
              minWeight = w;
            }
          }
        }
        if (minWeight < -3 || dateTagState == -1) {
          // not at all
          track.score = 999999;
          return;
        }
        var weight = maxWeight + minWeight;
        if (weight > 0) {
          // reduce score - prefer track
          var p = (4 - weight) / 4;
          track.score = track.score * p;
        }
        else if (weight < 0) {
          // increase score
          weight = Math.abs(weight);
          var p = 1 + (weight / 4);
          track.score = track.score * p;
        }
      }
      else {
        for (var i = 0; i < track.tags.length; i++) {
          dateTagState = this.checkDateTag(track.tags[i], dateTagState);
        }
        if (dateTagState == -1) {
          // not at all
          track.score = 999999;
          return;
        }
      }

      if(track.type == MODERATION) {
        track.score = track.score * 0.75;
      }

      if (track.id in this.lastPlays && this.lastPlays[track.id] < 60 * this.avoidRepeat) {
        if (this.excludePreviousTracks) {
          track.score = 999999;
        }
        else {
          var penalty = 500 - 250 * this.lastPlays[track.id] / (60 * this.avoidRepeat);
          track.score += penalty;
          track.penalty = Math.floor(penalty / 50);
        }
      }
      else {
        track.penalty = 0;
      }
    }

    initTracksAndArtists(remainingDuration: number, iteration: number): Artist[] {
      var artists: Artist[] = [];
      var artistMap: { [name: string]: Artist } = {};
      var tracksDuration = 0;

      // On the first iteration, scan the news/jingle header at the start of the tracks array,
      // register those tracks with the scheduler, and remember where the regular pool begins.
      // On subsequent iterations reuse trackListOffset — the header tracks must not be pushed
      // into scheduler.newsTracks again (that would cause duplicate news in the output).
      if (iteration == 0) {
        var protectFirstJingle = 'protectFirstJingle' in opts && opts.protectFirstJingle;

        // check for news/jingle pattern at the beginning (up to 2 news tracks, 1 jingle between them)
        if (tracks.length > 1 && ((tracks[0].type == NEWS) || (tracks[0].type == JINGLE && tracks[1] && tracks[1].type == NEWS))) {
          var newsCount = 0;
          var scanIdx = 0;

          while (scanIdx < tracks.length && newsCount < 2) {
            var scanTrack = tracks[scanIdx];
            if (scanTrack.type == NEWS) {
              this.checkRuleTrack(scanTrack, scanIdx);
              this.scheduler.newsTracks.push(scanTrack);
              newsCount++;
              scanIdx++;
              // Allow at most one jingle between two news tracks (only if another news track follows)
              if (newsCount < 2 && scanIdx < tracks.length && tracks[scanIdx].type == JINGLE) {
                var nextNewsIdx = scanIdx + 1;
                if (nextNewsIdx < tracks.length && tracks[nextNewsIdx].type == NEWS) {
                  this.scheduler.newsTracks.push(tracks[scanIdx]);
                  scanIdx++;
                } else {
                  // Jingle is not between two news tracks — stop scanning
                  break;
                }
              }
            } else if (scanTrack.type == JINGLE && newsCount == 0) {
              // Leading jingle before first news
              this.scheduler.newsTracks.push(scanTrack);
              scanIdx++;
            } else {
              break;
            }
          }

          // After the last news track, capture a trailing jingle as firstJingle if applicable
          if (scanIdx < tracks.length && tracks[scanIdx].type == JINGLE) {
            if(firstJingleAfterNews) {
              this.scheduler.newsTracks.push(tracks[scanIdx]);
            }
            if(protectFirstJingle) {
              this.scheduler.firstJingle = tracks[scanIdx];
            }
            scanIdx++;
          }

          this.trackListOffset = scanIdx;
        }
      }

      var start = this.trackListOffset;

      var excludeFollowing = false;

      var songCnt = 0;

      for (var i = start; i < tracks.length; i++) {
        if(tracks[i].type === NEWS) {
          if(this.scheduler.newsTracks.length == 0) {
            this.scheduler.newsTracks.push(tracks[i]);
          }
          this.checkRuleTrack(tracks[i], i);
          continue;
        }
        if ((tracks[i].title != null && tracks[i].title!.indexOf('START_AD_BREAK') > -1) ||
          (tracks[i].artist != null && tracks[i].artist!.indexOf('START_AD_BREAK') > -1)) {
          this.scheduler.adTrigger = tracks[i];
          continue;
        }
        if ((trackRulesEnabled || schedulingRulesEnabled) && tracks[i].id in this.trackRuleEngine.boundTracks) {
          // only inserted by track rule
          if (!this.isExcludedByDateTag(tracks[i])) {
            this.trackRuleEngine.boundTracks[tracks[i].id] = tracks[i];
          }
          continue;
        }

        if(tracks[i].type == SONG) {
          songCnt++;
        }

        // (re)set plays
        tracks[i].plays = 0;

        // initialize
        tracks[i].use = false;
        tracks[i].groupTags = [];

        if (this.checkRuleTrack(tracks[i], i)) continue;
        
        if (tracks[i].type == JINGLE) {
          if (tracks[i].id == 8664493) {
            excludeFollowing = true;
            continue;
          }
          if (iteration == 0 && !this.isExcludedByDateTag(tracks[i])) {
            if (tracks[i].id == 0 || tracks[i].id == opts.adTrigger) {
              this.scheduler.adTrigger = tracks[i];
            }
            else if (tracks[i].id == opts.adSeparator) {
              this.scheduler.adSeparator = tracks[i];
            }
            else if (this.preserveAllJingles) {
              tracks[i].position = songCnt;
              this.preservedTracks.push(tracks[i]);
              this.hasPreservedTracks = true;
            }
            else if (i == 0 && protectFirstJingle) {
              this.scheduler.firstJingle = tracks[i];
            }
            else {
              this.scheduler.jingles.push(tracks[i]);
            }
          }
          continue;
        }
        else if (tracks[i].type == MODERATION) {
          if (this.wordDistribution == 'preserve' && iteration == 0) {
            tracks[i].position = songCnt;
            this.preservedTracks.push(tracks[i]);
            this.hasPreservedTracks = true;
            continue;
          }
          else if (this.wordDistribution == 'link_next' && i < tracks.length - 1 && iteration == 0) {
            this.hasLinkedTracks = true;
            this.tracksBefore[tracks[i + 1].id] = tracks[i];
            continue;
          }
          else if (this.wordDistribution == 'link_previous' && i > 0 && iteration == 0) {
            this.hasLinkedTracks = true;
            this.tracksAfter[tracks[i - 1].id] = tracks[i];
            continue;
          }
        }

        if (excludeFollowing) continue;

        tracksDuration += tracks[i].duration;

        if (trackNameLimit > 0) {
          tracks[i].normTitle = this.normalizeTitle(tracks[i].title);
          tracks[i].groupTags = tracks[i].tags.filter((tag: string) => tag.startsWith("="));
          (tracks[i].groupTags as string[]).push(tracks[i].normTitle as string);
        }

        this.assignTrackScore(tracks[i]);
        if (tracks[i].score! > 10000) {
          // excluded
          continue;
        }

        var artistName = this.normalizeArtist(tracks[i].artist);
        tracks[i].artistNormalized = artistName;
        var artist: Artist;
        if (artistName in artistMap) {
          artist = artistMap[artistName];
          if (tracks[i].score! < artist.score) {
            artist.score = tracks[i].score!;
          }
        }
        else {
          artist = {} as Artist;
          artist.name = artistName;
          artist.tracks = [];
          artist.score = tracks[i].score!;
          artistMap[artistName] = artist;
          artists.push(artist);
        }
        artist.tracks.push(tracks[i]);
      }

      for (var i = 0; i < artists.length; i++) {
        artists[i].tracks.sort(function (a, b) { return a.score! - b.score!; });
      }
      artists.sort(function (a, b) { return a.score - b.score; });

      if (remainingDuration / (60 * 60) < this.maxTracksPerArtist) {
        this.maxTracksPerArtist = Math.max(1, Math.floor(remainingDuration / (60 * 60)));
      }

      var tracksDurationHours = Math.floor(tracksDuration / (60 * 60));
      if (tracksDurationHours < this.maxTracksPerArtist && tracksDurationHours > 0) {
        // iteration will produce shorter list that required - need to set a stricter limit
        this.maxTracksPerArtist = tracksDurationHours < 3 ? tracksDurationHours : tracksDurationHours - 1;
      }

      var candidates: Track[] = [];
      for (var i = 0; i < artists.length; i++) {
        for (var j = 0;
          j < artists[i].tracks.length
          && (j < this.maxTracksPerArtist || (tagPattern.length > 0 && artists[i].tracks[j].type == MODERATION));
          j++) {
          candidates.push(artists[i].tracks[j]);
        }
      }
      candidates.sort(function (a, b) { return a.score! - b.score!; });
      var cDuration = 0;
      var cIdx = 0;
      var usedTrackNames: Set<string> = new Set<string>();
      while ((tagPattern.length > 0 || cDuration < remainingDuration) && cIdx < candidates.length) {
        if (trackNameLimit === 9999 && candidates[cIdx].groupTags &&
            candidates[cIdx].groupTags!.some(function(tg: string) { return usedTrackNames.has(tg); })) {
          cIdx++;
          continue;
        }
        cDuration += candidates[cIdx].duration;
        candidates[cIdx].use = true;
        candidates[cIdx].plays = 0;
        if (trackNameLimit === 9999 && candidates[cIdx].groupTags) {
          candidates[cIdx].groupTags!.forEach(function(tg: string) { usedTrackNames.add(tg); });
        }
        cIdx++;
      }

      return artists;
    }

    prepareSongPool(artists: Artist[], dur: number): Track[] {
      var numSegments = this.maxTracksPerArtist * 2;

      var segments: Array<{ tracks: Track[]; duration: number }> = [];
      for (var i = 0; i < numSegments; i++) {
        segments.push({ tracks: [], duration: 0 });
      }

      for (var i = 0; i < artists.length; i++) {
        var artist = artists[i];
        var artistTracks: Track[] = [];
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

        // find least filled segment that can act as first segment for this artist
        var minSegment = !isModeration && artist.name in this.recentArtists ? 1 : 0;
        var currentSegment = minSegment;
        if(!isModeration) {
          var minDuration = segments[0].duration;
          for (var s = minSegment + 1; s < artistSegments; s++) {
            if (segments[s].duration < minDuration) {
              currentSegment = s;
              minDuration = segments[s].duration;
            }
          }
        }

        // assign tracks of artist to segments
        for (var t = 0; t < artistTracks.length; t++) {
          segments[currentSegment].tracks.push(artistTracks[t]);
          segments[currentSegment].duration += artistTracks[t].duration;
          currentSegment = (currentSegment + artistSegments) % segments.length;
        }
      }

      var playlistTracks: Track[] = [];
      var segmentTargetDuration = Math.floor(dur / segments.length);
      for (var s = 0; s < segments.length; s++) {
        var segmentTracks = segments[s].tracks;
        if (tagPattern.length == 0) {
          shuffle(segmentTracks);
        }
        else {
          var avgTrackLenth = Math.floor(segments[s].duration / segmentTracks.length);
          var numTracks = Math.floor(segmentTargetDuration / avgTrackLenth);
          partialShuffle(segmentTracks, Math.min(segmentTracks.length, numTracks));
        }
        segmentTracks.sort(function (a, b) { return (a.penalty || 0) - (b.penalty || 0); });

        playlistTracks.push.apply(playlistTracks, segmentTracks);
      }

      return playlistTracks;
    }

    hasEnoughTaggedTracks(trackList: Track[], tags: string[], n: number): boolean {
      const tagSet = new Set(tags);
      let dur = 0;

      for (const track of trackList) {
        if (track.tags.some((tag: string) => tagSet.has(tag)) || tagSet.has(track.type)) {
          dur += track.duration;
          if (dur >= n) return true; // early exit
        }
      }

      return false;
    }

    build(): (Track | null)[] {
      log("Execution time: " + new Date(executionTime) + ", start time: " + new Date(startTime));
      var sumTrackDuration = 0;
      var songPool: (Track | null)[] = [];
      var remainingDuration = duration;

      var iteration = 0;
      while (remainingDuration > 0 && iteration < 20) {
        let artists = this.initTracksAndArtists(Math.min(this.blockLength * 60 * 60, remainingDuration), iteration);
        var selectedTracks = this.prepareSongPool(artists, Math.min(this.blockLength * 60 * 60, remainingDuration));
        selectedTracks.forEach(function (t) { sumTrackDuration += t.duration; });
        songPool = songPool.concat(selectedTracks);
        remainingDuration = duration - sumTrackDuration;
        iteration++;
        if (remainingDuration > 0) {
          var addedMinutes = (Math.floor(sumTrackDuration / 60));
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
    artistBlocked: { [name: string]: number } = {};
    artistScheduled: { [name: string]: number[] } = {};
    recentTrackNames: string[][] = [];
    matchingRules: TagSequenceRule[] = [];
    artistBlockDuration: number = tagPattern.length > 0 ? HOUR : MIN * 30;
    tagSequenceRules: TagSequenceRule[] = opts.tagSequences ?? [];

    isScheduledPreBlocked(artistNormalized: string, currentTime: number): boolean {
      var times = this.artistScheduled[artistNormalized];
      if (!times) return false;
      while (times.length > 0 && currentTime >= times[0]) {
        times.shift();
      }
      return times.length > 0 && currentTime >= times[0] - this.artistBlockDuration;
    }

    isArtistPreBlocked(artistNormalized: string, currentTime: number): boolean {
      if (artistNormalized in this.artistBlocked && currentTime < this.artistBlocked[artistNormalized]) {
        return true;
      }
      return this.isScheduledPreBlocked(artistNormalized, currentTime);
    }

    checkTagSequenceRules(track: Track): TagSequenceRule[] {
      var matchingRules: TagSequenceRule[] = [];
      for (var r = 0; r < this.tagSequenceRules.length; r++) {
        var rule = this.tagSequenceRules[r];
        if (rule.pattern != null && track.tags.includes(rule.pattern[rule.index])) {
          rule.index++;
          if (rule.index == rule.pattern.length) {
            rule.index = 0;
            matchingRules.push(rule);
          }
        }
        else {
          rule.index = 0;
        }
      }
      return matchingRules;
    }

    updateSelectionState(song: Track, currentTime: number): void {
      if (song.type == SONG) {
        if ('plays' in song) {
          song.plays!++;
        }
        if (!('artistNormalized' in song)) {
          song.artistNormalized = trackPool.normalizeArtist(song.artist);
        }
        this.artistBlocked[song.artistNormalized!] = currentTime + this.artistBlockDuration;
        this.matchingRules = this.checkTagSequenceRules(song);
        if (trackNameLimit > 0) {
          this.recentTrackNames.push(song.groupTags!);
          if (this.recentTrackNames.length > trackNameLimit) {
            this.recentTrackNames.shift();
          }
        }
      }
    }

    selectFromScheduledCandidates(candidates: Track[], currentTime: number): Track {
      var bestIdx = 0;
      var bestPenalty = 9999;

      for (var cIdx = 0; cIdx < candidates.length; cIdx++) {
        var track = candidates[cIdx];
        if (track == null) continue;

        var penalty = 0;

        // Rule 1: Artist blocking
        if (track.type == SONG && 'artistNormalized' in track && this.isArtistPreBlocked(track.artistNormalized!, currentTime)) {
          penalty += 3;
        }

        // Rule 2: Track name deduplication (exclude tag sequence rules as per requirements)
        var recentNames = this.recentTrackNames;
        if (trackNameLimit > 0 && track.groupTags && track.groupTags.some(function (tg: string) { return recentNames.some(function (rn: string[]) { return rn.includes(tg); }); })) {
          penalty += 3;
        }

        // Rule 3: Track already used
        if(track.plays > 0) {
          penalty += track.plays * 5;
        }

        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestIdx = cIdx;
        }
        if (penalty == 0) break; // perfect match
      }

      return candidates[bestIdx];
    }
  }

  class SimpleTrackSelector extends TrackSelectorBase {
    songPoolIdx: number = 0;
    private lastSelectedIdx: number = -1;
    private exhausted: boolean = false;

    selectFromSongPool(songPool: (Track | null)[], currentTime: number): number {
      var bestIdx = -1;
      var bestPenalty = 9999;
      var checkedMatches = 0;

      for (var cIdx = this.songPoolIdx; cIdx < songPool.length && checkedMatches < 6; cIdx++) {
        var track = songPool[cIdx];
        if (track == null) continue;

        if(track.type != SONG) {
          // jingle or moderation - no further check required
          return cIdx;
        }

        var penalty = 0;
        checkedMatches++;

        // Rule 1: Artist blocking
        if ('artistNormalized' in track && this.isArtistPreBlocked(track.artistNormalized!, currentTime)) {
          penalty += 3;
        }

        // Rule 2: Tag sequence rules
        for (var rr = 0; rr < this.matchingRules.length; rr++) {
          var result = track.tags.includes(this.matchingRules[rr].next!);
          if ((this.matchingRules[rr].not && result) || (!this.matchingRules[rr].not && !result)) {
            penalty++;
          }
        }

        // Rule 3: Track name deduplication
        var recentNames = this.recentTrackNames;
        if (trackNameLimit > 0 && track.groupTags && track.groupTags.some(function (tg: string) { return recentNames.some(function (rn: string[]) { return rn.includes(tg); }); })) {
          penalty += 3;
        }

        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestIdx = cIdx;
        }
        if (penalty == 0) break; // perfect match
      }

      return bestIdx;
    }

    hasMore(songPool: (Track | null)[]): boolean {
      if (this.exhausted) return false;
      // Advance past consumed (null) entries
      while (this.songPoolIdx < songPool.length && songPool[this.songPoolIdx] == null) this.songPoolIdx++;
      return this.songPoolIdx < songPool.length;
    }

    selectNext(songPool: (Track | null)[], currentTime: number): Track | null {
      var selectedIdx = this.selectFromSongPool(songPool, currentTime);
      if (selectedIdx == -1) { this.exhausted = true; return null; }
      this.lastSelectedIdx = selectedIdx;
      return songPool[selectedIdx]!;
    }

    reselect(songPool: (Track | null)[], currentTime: number): Track | null {
      return this.selectNext(songPool, currentTime);
    }

    consumeTrack(songPool: (Track | null)[]): void {
      songPool[this.lastSelectedIdx] = null;
    }
  }

  class TagPatternTrackSelector extends TrackSelectorBase {
    patternIndex: { [key: string]: number[] } | null = null;
    patternIndexPtr: number = 0;
    patternFailed: number = 0;

    indexTracks(pool: (Track | null)[], start: number): number {
      var i: number;
      for (i = start; i < pool.length; i++) {
        var track = pool[i];
        if (track == null) continue;
        for (var t = 0; t < track.tags.length; t++) {
          if (track.tags[t] in patternTags) {
            this.patternIndex![track.tags[t]].push(i);
          }
        }
        this.patternIndex![track.type].push(i);
      }
      return i;
    }

    selectFromPatternIndex(songPool: (Track | null)[], currentTime: number): { candidates: number[], index: number } {
      var candidates = this.patternIndex![tagPattern[tagPatternPtr]];
      if (candidates.length == 0 && this.patternIndexPtr < songPool.length) {
        this.patternIndexPtr = this.indexTracks(songPool, this.patternIndexPtr);
        candidates = this.patternIndex![tagPattern[tagPatternPtr]];
      }

      var bestIdx = -1;
      var bestPenalty = 9999;
      var checkedMatches = 0;

      for (var cIdx = 0; cIdx < candidates.length; cIdx++) {
        var track = songPool[candidates[cIdx]];
        if (track != null) {
        // Artist blocking check (skip entirely if blocked, don't count as checked)
        var artistAccepted = !(track.type == SONG && 'artistNormalized' in track && this.isArtistPreBlocked(track.artistNormalized!, currentTime));
          if (artistAccepted) {
            var penalty = 0;
            checkedMatches++;
            if (track.type == SONG) {
              for (var rr = 0; rr < this.matchingRules.length; rr++) {
                var result = track.tags.includes(this.matchingRules[rr].next!);
                if ((this.matchingRules[rr].not && result) || (!this.matchingRules[rr].not && !result)) {
                  penalty++;
                }
              }
              var recentNames = this.recentTrackNames;
              if (track.groupTags && track.groupTags.some(function (tg: string) { return recentNames.some(function (rn: string[]) { return rn.includes(tg); }); })) {
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

    initializePatternIndex(songPool: (Track | null)[]): void {
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

    private lastSelection: { candidates: number[], index: number } = { candidates: [], index: -1 };

    hasMore(_songPool: (Track | null)[]): boolean {
      return this.patternFailed < tagPattern.length;
    }

    selectNext(songPool: (Track | null)[], currentTime: number): Track | null {
      this.patternFailed++;
      var selection = this.selectFromPatternIndex(songPool, currentTime);
      this.lastSelection = selection;
      if (selection.index > -1) {
        return songPool[selection.candidates[selection.index]]!;
      }
      tagPatternPtr = (tagPatternPtr + 1) % tagPattern.length;
      return null;
    }

    reselect(songPool: (Track | null)[], currentTime: number): Track | null {
      var selection = this.selectFromPatternIndex(songPool, currentTime);
      if (selection.index > -1) {
        this.lastSelection = selection;
        return songPool[selection.candidates[selection.index]]!;
      }
      return null;
    }

    consumeTrack(songPool: (Track | null)[]): void {
      var selection = this.lastSelection;
      var track = songPool[selection.candidates[selection.index]];
      // Re-add track at end for potential reuse
      songPool.push(track!);
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

  var activeSelector: TrackSelectorBase = selectorBase;
  var tagPatternPtr: number = 0;
  var patternTags: { [tag: string]: boolean } = {};

  // Random number generator - can be injected for testing
  var random: () => number = opts.random ?? Math.random;

  var debug: boolean = opts.debug ?? false;

  function log(msg: string): void {
    if (debug) console.log(msg);
  }

  // basic array shuffle function
  // source: http://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array-in-javascript
  function shuffle(a: Track[]): void {
    partialShuffle(a, a.length);
  }

  function partialShuffle(a: Track[], len: number): void {
    var j: number, x: Track, i: number;
    for (i = len; i; i--) {
      j = Math.floor(random() * i);
      x = a[i - 1];
      a[i - 1] = a[j];
      a[j] = x;
    }
  }







  function selectFromScheduledCandidates(candidates: Track[]): Track {
    return activeSelector.selectFromScheduledCandidates(candidates, time);
  }

  function updateSelectionState(song: Track): void {
    activeSelector.updateSelectionState(song, time);
  }

  // Helper: insert any due scheduled events into the playlist.
  // song: the next candidate song (used for jingle/news collision checks in no-pattern mode; null in pattern mode).
  // Returns { addSong } where addSong may be set to false when the next song should be skipped (no-pattern mode only).
  function insertScheduledEvents(nextIsJingle : boolean, nextIsShortTrack : boolean): { tracksAdded : boolean, skipJingle: boolean } {
    var skipJingle = false;
    var addScheduled = true;
    var tracksAdded = false;
    var skipSchduled = false;
    while (nextScheduled != null && time >= nextScheduled.minTime && addScheduled) {
      addScheduled = true;

      if (nextScheduled.jingleCollision != 'keep_both') {
        var lastIsJingle = playlistTracks.length > 0 && playlistTracks[playlistTracks.length - 1].type == JINGLE;
        if (lastIsJingle || nextIsJingle) {
          if (nextScheduled.jingleCollision == 'move') {
            if (moveCnt < 2) {
              skipSchduled = true;
              addScheduled = false;
              moveCnt++;
            }
          } else if (nextScheduled.jingleCollision == 'skip_scheduled') {
            addScheduled = false;
          } else if (nextScheduled.jingleCollision == 'remove_jingle') {
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
        // short jingle or moderation - push back
        addScheduled = false;
        moveCnt++;
      }

      if (addScheduled) {
        log(new Date(time).toLocaleString() + " for " + new Date(nextScheduled.minTime).toLocaleString() + " / " + nextScheduled.type);
        scheduler.processScheduledElement(nextScheduled);
        for (var t = 0; t < nextScheduled.tracks!.length; t++) {
          playlistTracks.push(nextScheduled.tracks![t]);
          log(nextScheduled.tracks![t].title + " " + nextScheduled.tracks![t].duration);
          updateSelectionState(nextScheduled.tracks![t]);
          time += nextScheduled.tracks![t].duration * 1000;
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

  // Helper: add a track (with its bound tracks and linked moderation tracks) to the playlist.
  // Returns the total duration (ms) of all tracks inserted.
  function addTrackToPlaylist(playlist : Track[], song: Track): number {
    var added = 0;

    // Handle bound track rules (before)
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

    // Handle linked moderation tracks (before)
    if (trackPool.hasLinkedTracks && song.id in trackPool.tracksBefore) {
      playlist.push(trackPool.tracksBefore[song.id]);
      playlist[playlist.length - 1].linked = true;
      time += trackPool.tracksBefore[song.id].duration * 1000;
      added += trackPool.tracksBefore[song.id].duration * 1000;
    }

    // Add the song itself
    playlist.push(song);
    time += song.duration * 1000;
    added += song.duration * 1000;

    if(song.type === SONG) {
      numberOfSongs++;
    }

    // Update active selection state
    updateSelectionState(song);

    if(trackPool.hasPreservedTracks) {
      while(trackPool.preservedTracks.length > 0 && trackPool.preservedTracks[0].position == numberOfSongs) {
        playlist.push(trackPool.preservedTracks[0]);
        time += trackPool.preservedTracks[0].duration;
        trackPool.preservedTracks.shift();
      }
    }

    // Handle bound track rules (after)
    if (trackRulesEnabled && 'boundTo' in song && song.boundTo!.length > 0) {
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

    // Handle linked moderation tracks (after)
    if (trackPool.hasLinkedTracks && song.id in trackPool.tracksAfter) {
      playlist[playlist.length - 1].linked = true;
      playlist.push(trackPool.tracksAfter[song.id]);
      time += trackPool.tracksAfter[song.id].duration * 1000;
      added += trackPool.tracksAfter[song.id].duration * 1000;
    }

    return added;
  }

  // Customizable functions

  function customScheduledElementCreate(_rule: ScheduledRule, _trackIdx: number, _scheduledElement: ScheduledElement): void { }

  function customInitialize(): void { }

  // Main code

  /* Initialization */
  trackRuleEngine.initialize();
  trackRuleEngine.initializeSchedulingBoundTracks();
  scheduler.initializeSelectorTags();

  if (trackStats != null) {
    var baseTime = executionTime;
    var lastTrackEnd = 0;
    for (var i = 0; i < trackStats.length; i++) {
      if (i > trackStats.length - 12 && trackStats[i].artist != null) {
        var artistName = trackPool.normalizeArtist(trackStats[i].artist!.name);
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
      if (trackRulesEnabled && trackStats[i].id in trackRuleEngine.boundTracks && 'rules' in trackRuleEngine.boundTracks[trackStats[i].id]) {
        for (var r = 0; r < trackRuleEngine.boundTracks[trackStats[i].id].rules!.length; r++) {
          trackRuleEngine.markRuleApplied(trackRuleEngine.boundTracks[trackStats[i].id].rules![r], started);
        }
      }
      if (trackStats[i].id == 1 || trackStats[i].id == 2) { // exclude wheather here as it may repeat more often in a later version
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

  tagPattern.forEach(t => (patternTags[t] = true));

  customInitialize();

  /* Execution - Phase 1: Build song candidate pool */
  var songPool: (Track | null)[] = trackPool.build();

  /* Execution - Phase 2: Pre-compute all scheduled events */
  var tagPatternContainsJingles = false;
  if (tagPattern.length > 0) {
    // Check if any jingle track has a tag referenced by the tag pattern.
    // If not, jingles need to be scheduled separately.
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

  if (scheduler.newsTracks.length > 0) {
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

  // Activate track rules
  trackRuleEngine.activateRules();

  /* Execution - Phase 3: Unified single-pass assembly with active song selection */
  scheduler.scheduledTracks.sort(function (a, b) { return a.minTime - b.minTime; });

  // Reset tag sequence rule indices for the assembly phase
  selectorBase.tagSequenceRules.forEach(r => (r.index = 0));

  var playlistTracks: Track[] = [];
  var time = startTime;
  var sIdx = 0;
  var nextScheduled: ScheduledElement | null = sIdx < scheduler.scheduledTracks.length ? scheduler.scheduledTracks[sIdx++] : null;
  var moveCnt = 0;
  var numberOfSongs = 0; // songs in playlistTracks

  // Song selection: either from songPool (no pattern) or patternIndex (with pattern)
  var usePatternIndex = tagPattern.length > 0;
  var selector: SimpleTrackSelector | TagPatternTrackSelector;

  if (usePatternIndex) {
    activeSelector = tagPatternSelector;
    selector = tagPatternSelector;

    // Build pattern index for tag pattern mode
    // Merge jingles into songPool for pattern-based selection
    shuffle(scheduler.jingles);
    songPool = songPool.concat(scheduler.jingles);

    tagPatternSelector.initializePatternIndex(songPool);
  } else {
    selector = selectorBase;
  }

  // Populate artist pre-block schedule from non-late-selection scheduled songs.
  // scheduledTracks is already sorted by minTime (above), so arrays are in ascending order.
  if (schedulingRulesEnabled) {
    for (var i = 0; i < scheduler.scheduledTracks.length; i++) {
      var se = scheduler.scheduledTracks[i];
      if ('preBlockArtist' in se) {
        var preBlockArtist = se.preBlockArtist!;
        if (!(preBlockArtist in activeSelector.artistScheduled)) {
          activeSelector.artistScheduled[preBlockArtist] = [];
        }
        activeSelector.artistScheduled[preBlockArtist].push(se.minTime);
      }
    }
  }

  // Unified assembly loop
  var playlistLen = 0;
  while (playlistLen < duration * 1000 && selector.hasMore(songPool)) {
    var track = selector.selectNext(songPool, time);
    if (track == null) {
      if (!selector.hasMore(songPool)) break;
      continue;
    }

    var nextIsJingle = track.type === JINGLE;
    var nextIsShortTrack = track.type != SONG && track.duration < 60 && !('linked' in track);

    // Check if any scheduled events are due
    var lastIsLinked = playlistTracks.length > 0 && 'linked' in playlistTracks[playlistTracks.length - 1];

    var result;
    if(!lastIsLinked) {
      result = insertScheduledEvents(nextIsJingle, nextIsShortTrack);
    }
    else {
      result = { tracksAdded: false, skipJingle : false};
    }

    // In pattern mode, recalculate playlistLen from time after scheduled insertions
    if (usePatternIndex) {
      playlistLen = time - startTime;
    }

    if(!result.skipJingle && result.tracksAdded) {
      // other song may have been added - re-evaluate next song
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
        addTrackToPlaylist(playlistTracks, track!);
      }
    }

    // Consume the selected track
    selector.consumeTrack(songPool);
  }

  return playlistTracks;
})