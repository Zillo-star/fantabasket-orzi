/* Helpers shared by the inline app and offline regression tests. */
(function(root){
  "use strict";
  function singleFlight(run, {minInterval = 0, now = () => Date.now()} = {}){
    let pending = null;
    let lastStarted = -Infinity;
    return function(...args){
      if(pending) return pending;
      if(now() - lastStarted < minInterval) return Promise.resolve();
      lastStarted = now();
      pending = Promise.resolve().then(() => run.apply(this, args)).finally(() => { pending = null; });
      return pending;
    };
  }

  function polling({active, run, interval = 60000, visible = () => document.visibilityState !== "hidden",
    schedule = setTimeout, cancel = clearTimeout, report = error => console.error("Aggiornamento non riuscito:", error)}){
    let timer = null;
    let enabled = false;
    let pending = false;
    function clear(){ if(timer !== null) cancel(timer); timer = null; }
    function arm(){
      clear();
      if(enabled && active() && visible()) timer = schedule(tick, interval);
    }
    async function tick(){
      clear();
      if(!enabled || !active()){ stop(); return; }
      if(!visible() || pending) return;
      pending = true;
      try { await run(); } catch(error){ report(error); }
      finally {
        pending = false;
        if(enabled) arm();
      }
    }
    function stop(){ enabled = false; clear(); }
    return {
      start(immediate = true){
        // Re-rendering the same view never duplicates an existing timer/run.
        if(enabled && (timer !== null || pending)) return;
        enabled = true;
        if(immediate) void tick(); else arm();
      },
      stop,
      visibilityChanged(){
        clear();
        if(enabled && visible()) void tick();
      }
    };
  }

  // Stable ordering and pages smaller than PostgREST's default 1000-row cap.
  async function rows(query, key = "id"){
    const output = [];
    const size = 500;
    for(let offset = 0; ; offset += size){
      const result = await query().order(key).range(offset, offset + size - 1);
      if(result.error) throw result.error;
      const data = result.data || [];
      output.push(...data);
      if(data.length < size) return output;
    }
  }
  const playerKey = row => `${row.manager_id}|${row.matchday_id}|${row.player_id}`;
  const coachKey = row => `${row.manager_id}|${row.matchday_id}`;
  function sameFields(existing, proposed){
    if(!existing) return false;
    return Object.entries(proposed).every(([key, value]) => {
      if(existing[key] == null || value == null) return existing[key] === value;
      return typeof value === "number" ? Number(existing[key]) === value : existing[key] === value;
    });
  }
  async function scoreSnapshot(db, day){
    const players = await rows(() => db.from("fantasy_scores")
      .select("id,manager_id,matchday_id,player_id,raw_score,lineup_multiplier,captain_multiplier,final_score,manual_override")
      .eq("matchday_id", day));
    const coaches = await rows(() => db.from("fantasy_coach_scores")
      .select("id,manager_id,matchday_id,real_team_id,raw_score,final_score")
      .eq("matchday_id", day));
    const snapshot = { players: new Map(players.map(row => [playerKey(row), row])),
      coaches: new Map(coaches.map(row => [coachKey(row), row])) };
    if(snapshot.players.size !== players.length || snapshot.coaches.size !== coaches.length){
      throw new Error("Chiavi punteggi duplicate: aggiornamento sospeso, verificare i vincoli in staging");
    }
    return snapshot;
  }
  async function saveScore(db, snapshot, kind, proposed){
    const player = kind === "players";
    const key = (player ? playerKey : coachKey)(proposed);
    const existing = snapshot[kind].get(key);
    if((player && existing?.manual_override === true) || sameFields(existing, proposed)) return {error:null, skipped:true};
    const table = player ? "fantasy_scores" : "fantasy_coach_scores";
    let query;
    if(existing){
      query = db.from(table).update(proposed)
        .eq("manager_id", proposed.manager_id).eq("matchday_id", proposed.matchday_id);
      if(player){
        // The DB predicate also protects an override created AFTER the snapshot.
        query = query.eq("player_id", proposed.player_id)
          .or("manual_override.is.null,manual_override.eq.false");
      }
    }else{
      // Concurrent inserts (including manual overrides) must never be overwritten.
      query = db.from(table).upsert(proposed, {
        onConflict: player ? "manager_id,matchday_id,player_id" : "manager_id,matchday_id",
        ignoreDuplicates:true
      });
    }
    const result = await query;
    if(result.error) throw result.error; // Stop this run before publishing incomplete totals.
    if(existing) snapshot[kind].set(key, {...existing, ...proposed});
    return result;
  }

  root.FantaRuntime = {singleFlight, polling, rows, sameFields, scoreSnapshot, saveScore};
})(typeof window !== "undefined" ? window : globalThis);
