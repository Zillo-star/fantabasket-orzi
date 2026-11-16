// Offline only: actual before/after engine functions + an in-memory PostgREST double.
const {engine,clock,source,runtime,fakeDB}=require('../tests/helpers.cjs');
const fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
function metrics(e,after=0,afterWorker=0){const calls=e.db.calls.slice(after);return {apiCalls:calls.length+e.workerCalls.length-afterWorker,workerCalls:e.workerCalls.length-afterWorker,postgrestCalls:calls.length,responseBodyBytes:calls.reduce((n,c)=>n+c.bytes,0),upserts:calls.filter(c=>c.op==='upsert').length,writes:calls.filter(c=>c.op!=='select').length};}
async function workload(users,baseline){
 const all=Array.from({length:users},()=>engine({baseline}));
 // Five quick calendar openings used to launch the engine five times in every client.
 if(baseline){for(const e of all)for(let i=0;i<5;i++)await e.run();}
 else {all[0].c.me.is_admin=true;await all[0].run();}
 return Object.fromEntries(Object.keys(metrics(all[0])).map(key=>[key,all.reduce((n,e)=>n+metrics(e)[key],0)]));
}
async function notifications(baseline,tabs){
 const results=[];
 for(let i=0;i<tabs;i++){
  const db=fakeDB({notifications:[{id:'n',manager_id:'m',read:false}]}),t=clock(),badge={style:{}};
  const context=vm.createContext({db,me:{id:'m'},el:()=>badge,document:{visibilityState:'visible'},console,FantaRuntime:runtime()});
  const html=source(baseline),start=html.indexOf(baseline?'async function updateDashboardNotification(){':'const updateDashboardNotification =');
  const end=html.indexOf(baseline?'async function saveTeamName()':'// Polling legato alla vista/sessione',start);
  vm.runInContext(html.slice(start,end)+';globalThis.updateBadge=updateDashboardNotification;',context);
  const p=runtime().polling({active:()=>true,visible:()=>true,run:()=>context.updateBadge(),interval:baseline?5000:60000,schedule:t.schedule,cancel:t.cancel});
  p.start();for(let n=0;n<20;n++)await Promise.resolve();await t.advance(3600000);p.stop();
  results.push(db.calls.length);
 }
 return {tabs,minutes:60,postgrestCalls:results.reduce((a,b)=>a+b,0),responseBodyBytes:0,note:'HEAD responses: response headers and network overhead excluded'};
}
async function historical(minutes,tabs){
 const html=execFileSync('git',['show','e7d6a7d:index.html'],{encoding:'utf8'});
 const start=html.indexOf('  setTimeout(()=>{\n    loadLiveFantasyScores();');
 const end=html.indexOf('async function loadPlayerGames()',start);
 const globalStart=html.indexOf('clearInterval(\n  window.liveCalendarTotalsTimer');
 const globalEnd=html.indexOf('</script>',globalStart);
 let runs=0,totalRefreshes=0,activeTimers=0;
 for(let tab=0;tab<tabs;tab++){
  const t=clock();const intervals=new Map();let lastId=0;
  const context={console,document:{querySelectorAll:()=>[],querySelector:()=>null},loadLiveFantasyScores:async()=>{runs++;},refreshLeagueMatchScoresLive:async()=>{totalRefreshes++;},refreshDashboardFantasyTotal:async()=>{},setTimeout:t.schedule,
   clearInterval:id=>{if(intervals.has(id)){t.cancel(intervals.get(id));intervals.delete(id);}},
   setInterval(fn,ms){const id=++lastId;async function tick(){await fn();intervals.set(id,t.schedule(tick,ms));}intervals.set(id,t.schedule(tick,ms));return id;}};
  context.window=context;vm.runInNewContext(html.slice(start,end)+html.slice(globalStart,globalEnd),context);
  await t.advance(minutes*60000);activeTimers+=intervals.size;
 }
 return {minutes,tabs,liveInvocations:runs,totalsInvocations:totalRefreshes,activeIntervals:activeTimers};
}
(async()=>{
 const old=engine({baseline:true}),next=engine();await old.run();await next.run();let a=old.db.calls.length,b=next.db.calls.length,wa=old.workerCalls.length,wb=next.workerCalls.length;old.advance(60000);next.advance(60000);await old.run();await next.run();
 const result={note:'Synthetic fixture: 10 managers, 5 players each, 1 live game; bytes are JSON response bodies, not production egress. Calendar read traffic excluded from engine workloads.',steadyTick:{before:metrics(old,a,wa),after:metrics(next,b,wb)},fiveOpenings:{oneUser:{before:await workload(1,true),after:await workload(1,false)},eightUsers:{before:await workload(8,true),after:await workload(8,false)}},notificationsHour:{oneUser:{before:await notifications(true,1),after:await notifications(false,1)},eightUsers:{before:await notifications(true,8),after:await notifications(false,8)}},historical:[]};
 for(const minutes of [5,30,60])for(const tabs of [1,8])result.historical.push(await historical(minutes,tabs));
 console.log(JSON.stringify(result,null,2));
 if(process.argv.includes('--save'))fs.writeFileSync('docs/benchmark-results.json',JSON.stringify(result,null,2)+'\n');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
