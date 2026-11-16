const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const {source,runtime,clock,fakeDB,fixture,engine}=require('./helpers.cjs');

test('inline scripts and both service workers parse; service workers never cache HTML',()=>{
 for(const html of [source(),source(true)]) for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
 for(const file of ['sw.js','public/sw.js']){const code=fs.readFileSync(file,'utf8');new vm.Script(code);assert.doesNotMatch(code,/caches\.|addEventListener\(["']fetch/);}
});
test('single flight shares promise, throttles, resets after rejection without unhandled rejection',async()=>{
 const r=runtime(); let calls=0,release;let now=0;
 const run=r.singleFlight(()=>{calls++;return new Promise(resolve=>{release=resolve;});},{minInterval:60000,now:()=>now});
 const a=run(),b=run();assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);release();await a;
 await run();assert.equal(calls,1);now=60000;const next=run();await Promise.resolve();release();await next;assert.equal(calls,2);
 let fail=true;const retry=r.singleFlight(async()=>{if(fail)throw Error('expected');return 42;});await assert.rejects(retry());fail=false;assert.equal(await retry(),42);
});
test('notifications: one timer, visible dashboard only, immediate resume, cleanup and errors',async()=>{
 const r=runtime(),t=clock();let visible=true,active=true,calls=0,errors=0;
 const poll=r.polling({active:()=>active,visible:()=>visible,run:async()=>{calls++;},schedule:t.schedule,cancel:t.cancel,report:()=>errors++});
 poll.start();poll.start();for(let i=0;i<10;i++) await Promise.resolve();assert.equal(calls,1);assert.equal(t.size(),1);
 await t.advance(60000);assert.equal(calls,2);visible=false;poll.visibilityChanged();await t.advance(3600000);assert.equal(calls,2);assert.equal(t.size(),0);
 visible=true;poll.visibilityChanged();for(let i=0;i<10;i++) await Promise.resolve();assert.equal(calls,3);
 active=false;await t.advance(60000);assert.equal(calls,3);assert.equal(t.size(),0);poll.stop();assert.equal(errors,0);
});
test('pagination reads more than 1000 scores, fails closed on errors',async()=>{
 const r=runtime();const data=Array.from({length:1203},(_,i)=>({id:String(i).padStart(5,'0'),manager_id:'m',matchday_id:'d',player_id:String(i)}));
 const db=fakeDB({fantasy_scores:data});const snap=await r.scoreSnapshot(db,'d');assert.equal(snap.players.size,1203);assert.equal(db.calls.length,4);
 await assert.rejects(r.rows(()=>({order(){return this;},range(){return {error:Error('offline')};}})));
});
test('full engine golden scores: captain, sixth, bench, out, winner/loser and coach unchanged',async()=>{
 const old=engine({baseline:true}),next=engine();await old.run();await next.run();assert.deepEqual(old.errors,[]);assert.deepEqual(next.errors,[]);
 const clean=rows=>rows.map(({id,...r})=>r);
 assert.deepEqual(clean(next.db.tables.fantasy_scores),clean(old.db.tables.fantasy_scores));
 assert.deepEqual(clean(next.db.tables.fantasy_coach_scores),clean(old.db.tables.fantasy_coach_scores));
 assert.deepEqual(next.db.tables.fantasy_scores.filter(r=>r.manager_id==='m0').map(r=>r.final_score),[19.5,13,6.5,0,10]);
 assert.equal(next.db.tables.fantasy_coach_scores[0].final_score,5);
 // Baseline drops leagueMatches while building contexts; fixed path restores existing total logic.
 assert.equal(old.db.calls.filter(c=>c.table==='league_matches'&&c.op==='update').length,0);
 assert.equal(next.db.tables.league_matches[0].home_score,54);
 assert.equal(next.db.tables.league_matches[0].completed,false);
});
test('unchanged second tick writes nothing; real changes update exactly affected player and totals',async()=>{
 const e=engine();await e.run();const offset=e.db.calls.length;e.advance(60000);await e.run();
 assert.equal(e.db.calls.slice(offset).filter(c=>c.op!=='select').length,0);
 e.db.tables.lineups[0].lineup_players[0].captain=false;e.advance(60000);const start=e.db.calls.length;await e.run();
 assert.equal(e.db.tables.fantasy_scores.find(r=>r.manager_id==='m0'&&r.player_id==='p0').final_score,13);
 assert.equal(e.db.calls.slice(start).filter(c=>c.op==='update').length,2);
 e.db.tables.lineups[0].lineup_players[0].captain=true;e.advance(60000);await e.run();assert.equal(e.db.tables.league_matches[0].home_score,54);
});
test('manual scores isolated by manager/day/player, including valid zero and missing player',async()=>{
 const seed=fixture();seed.fantasy_scores=[{id:'manual',manager_id:'m0',matchday_id:'d1',player_id:'p0',manual_override:true,raw_score:90,final_score:77},{id:'zero',manager_id:'m1',matchday_id:'d1',player_id:'p1',manual_override:true,final_score:0},{id:'other-day',manager_id:'m0',matchday_id:'d2',player_id:'p0',manual_override:true,final_score:999}];
 const e=engine({seed,missing:['p0']});await e.run();assert.deepEqual(e.errors,[]);
 assert.equal(e.db.tables.fantasy_scores.find(r=>r.id==='manual').final_score,77);
 assert.equal(e.db.tables.fantasy_scores.find(r=>r.id==='zero').final_score,0);
 assert.equal(e.db.tables.fantasy_scores.find(r=>r.manager_id==='m1'&&r.player_id==='p0').final_score,0);
 assert.equal(e.db.tables.fantasy_scores.find(r=>r.id==='other-day').final_score,999);
});
test('concurrent manual override after snapshot protected for update and insert',async()=>{
 const r=runtime(),seed=fixture();seed.fantasy_scores=[{id:'s',manager_id:'m0',matchday_id:'d1',player_id:'p0',manual_override:false,final_score:5}];
 const db=fakeDB(seed),snap=await r.scoreSnapshot(db,'d1');db.tables.fantasy_scores[0].manual_override=true;db.tables.fantasy_scores[0].final_score=77;
 await r.saveScore(db,snap,'players',{manager_id:'m0',matchday_id:'d1',player_id:'p0',final_score:0});assert.equal(db.tables.fantasy_scores[0].final_score,77);
 db.tables.fantasy_scores.push({manager_id:'m1',matchday_id:'d1',player_id:'p0',final_score:88,manual_override:true});
 await r.saveScore(db,snap,'players',{manager_id:'m1',matchday_id:'d1',player_id:'p0',final_score:0});assert.equal(db.tables.fantasy_scores[1].final_score,88);
});
test('future game, recovery in completed day, finished and unavailable Worker',async()=>{
 const future=fixture();future.real_games[0].scheduled_at='2026-11-17T10:00:00Z';future.real_games[0].postponed=true;
 const e=engine({seed:future});await e.run();assert.deepEqual(e.errors,[]);assert.equal(e.db.tables.fantasy_scores.length,0);assert.equal(e.db.tables.league_matches[0].completed,false);
 const recovery=fixture();recovery.league_matches.forEach(m=>m.completed=true);recovery.real_games[0].scheduled_at='2026-11-17T10:00:00Z';
 const rec=engine({seed:recovery});await rec.run();assert.equal(rec.workerCalls.includes('game'),true);assert.equal(rec.db.tables.league_matches[0].completed,false);
 const final=engine({workerStatus:'final'});await final.run();assert.equal(final.db.tables.league_matches[0].completed,true);assert.equal(final.db.tables.league_matches[0].home_points,1);
 const offline=engine({failWorker:true});await offline.run();assert.ok(offline.errors.length);assert.equal(offline.db.calls.filter(c=>c.op!=='select').length,0);
 const seed=fixture();seed.matchdays[0].lineup_deadline='2026-11-17T00:00:00Z';const notOpen=engine({seed});await notOpen.run();assert.equal(notOpen.workerCalls.length,0);
});
test('normal viewer cannot invoke live engine; calendar has no write trigger',async()=>{
 const e=engine();e.c.me.is_admin=false;await e.run();assert.equal(e.db.calls.length,0);
 const html=source(),cal=html.slice(html.indexOf('async function calendar('),html.indexOf('async function standings('));
 assert.doesNotMatch(cal,/loadLiveFantasyScores\s*\(/);assert.match(cal,/\[matchdays\[selectedDay\]\?\.id\]/);
 assert.match(html,/stopLiveUpdates\(\);\s+dashboardPolling.stop\(\);\s+calendarPolling.stop\(\);\s+await db.auth.signOut/);
});

test('incomplete box score and unavailable fantasyScore preserve existing scores',async()=>{
 const seed=fixture();seed.fantasy_scores=[{id:'existing',manager_id:'m0',matchday_id:'d1',player_id:'p0',raw_score:0,final_score:0,manual_override:false}];
 for(const options of [{emptyBox:true},{invalidScore:true}]){
  const e=engine({seed,...options});await e.run();assert.equal(e.db.tables.fantasy_scores.length,1);assert.equal(e.db.tables.fantasy_scores[0].final_score,0);
 }
});
test('actual notification updater: count, cap, read action, missing badge and hidden tab',async()=>{
 const db=fakeDB({notifications:Array.from({length:101},(_,i)=>({id:`n${i}`,manager_id:'m0',read:false}))});
 let badge={style:{},textContent:''};const c=vm.createContext({db,me:{id:'m0'},console,document:{visibilityState:'visible'},el:()=>badge,FantaRuntime:runtime()});
 const html=source(),start=html.indexOf('const updateDashboardNotification =');const end=html.indexOf('// Polling legato alla vista/sessione',start);
 vm.runInContext(html.slice(start,end)+';globalThis.updateBadge=updateDashboardNotification;',c);
 await Promise.all([c.updateBadge(),c.updateBadge()]);assert.equal(db.calls.length,1);assert.equal(badge.textContent,'99+');
 db.tables.notifications.forEach(r=>r.read=true);await c.updateBadge();assert.equal(badge.style.display,'none');
 c.document.visibilityState='hidden';await c.updateBadge();assert.equal(db.calls.length,2);
 c.document.visibilityState='visible';badge=null;await c.updateBadge();assert.equal(db.calls.length,2);
});
test('actual live engine merges concurrent invocations and caches discovery, not live statistics',async()=>{
 const e=engine();const first=e.run();assert.equal(e.run(),first);await Promise.all([first,e.run(),e.run()]);assert.equal(e.workerCalls.filter(x=>x==='discovery').length,5);
 const count=e.db.calls.length;await e.run();assert.equal(e.db.calls.length,count);
 e.advance(60000);await e.run();assert.equal(e.workerCalls.filter(x=>x==='discovery').length,5); // Discovery TTL only; game stats fetched again.
 assert.equal(e.workerCalls.filter(x=>x==='game').length,18); // 16 required fallbacks + two current game fetches.
});
test('polling reports failure and resumes, stop during a pending request leaves no timer',async()=>{
 const r=runtime(),t=clock();let errors=0,calls=0,release;
 const p=r.polling({active:()=>true,visible:()=>true,schedule:t.schedule,cancel:t.cancel,report:()=>errors++,run:async()=>{calls++;throw Error('offline');}});
 p.start();for(let i=0;i<10;i++)await Promise.resolve();assert.equal(errors,1);await t.advance(60000);assert.equal(calls,2);p.stop();assert.equal(t.size(),0);
 const q=r.polling({active:()=>true,visible:()=>true,schedule:t.schedule,cancel:t.cancel,run:()=>new Promise(resolve=>release=resolve)});q.start();q.stop();release();for(let i=0;i<10;i++)await Promise.resolve();assert.equal(t.size(),0);
});

test('valid zero is a score; negative coach score matches baseline; failed engine can run next minute',async()=>{
 const next=engine({workerScore:0});await next.run();assert.equal(next.db.tables.fantasy_scores.find(r=>r.manager_id==='m0'&&r.player_id==='p4').final_score,0);
 const seed=fixture();seed.manager_coaches[0].real_team_id='away';
 const old=engine({seed,baseline:true}),e=engine({seed});await old.run();await e.run();assert.equal(e.db.tables.fantasy_coach_scores[0].final_score,-5);assert.equal(e.db.tables.fantasy_coach_scores[0].final_score,old.db.tables.fantasy_coach_scores[0].final_score);
 const failed=engine({failWorker:true});await failed.run();const requests=failed.workerCalls.length;failed.advance(60000);await failed.run();assert.equal(failed.workerCalls.length,requests*2);assert.equal(failed.db.calls.filter(c=>c.op!=='select').length,0);
});
test('duplicate coach keys fail closed without writes',async()=>{
 const seed=fixture();seed.fantasy_coach_scores=[{id:'c1',manager_id:'m0',matchday_id:'d1',real_team_id:'a'},{id:'c2',manager_id:'m0',matchday_id:'d1',real_team_id:'b'}];const db=fakeDB(seed);await assert.rejects(runtime().scoreSnapshot(db,'d1'),/duplicate/);assert.equal(db.calls.filter(c=>c.op!=='select').length,0);
});
