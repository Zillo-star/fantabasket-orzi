const fs = require('node:fs');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const BASE = '1496ef5b92ad0b419c6de4bb6cc34ef8c5382372';
function source(baseline=false){return baseline ? execFileSync('git',['show',`${BASE}:index.html`],{encoding:'utf8'}) : fs.readFileSync('index.html','utf8');}
function runtime(){ const c=vm.createContext({console, setTimeout,clearTimeout}); vm.runInContext(fs.readFileSync('public/live-runtime.js','utf8'),c); return c.FantaRuntime; }
function clock(){
 let now=0, id=0; const timers=new Map();
 return {now:()=>now, schedule:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},cancel:id=>timers.delete(id),size:()=>timers.size,
 async advance(ms){const end=now+ms; for(;;){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next || next[1].at>end)break;now=next[1].at;timers.delete(next[0]);await next[1].fn();} now=end;}};
}
function fakeDB(seed={}){
 const tables=structuredClone(seed), calls=[]; let serial=0;
 const db={tables,calls,from(table){
  let op='select', values, options={}, columns='*', filters=[], sort=[],from=0,to=999, condition=false;
  const q={
   select(c='*',o={}){columns=c;options=o;return q;},
   eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,vs){filters.push(r=>vs.includes(r[k]));return q;},
   or(){condition=true;return q;},order(k){sort.push(k);return q;},range(a,b){from=a;to=b;return q;},
   upsert(v,o){op='upsert';values=v;options=o;return q;},update(v){op='update';values=v;return q;},
   then(resolve,reject){return Promise.resolve().then(()=>{
    tables[table] ||= [];let selected=tables[table].filter(r=>filters.every(fn=>fn(r)));
    let result={error:null,data:null};
    if(op==='select'){
     const count=selected.length;
     selected.sort((a,b)=>{for(const k of sort){if(a[k]<b[k])return -1;if(a[k]>b[k])return 1;}return 0;});
     selected=selected.slice(from,to+1);
     // Nested selections retain joined fixture objects; flat projections model actual response bytes.
     if(columns!=='*' && !columns.includes('(')) selected=selected.map(r=>Object.fromEntries(columns.split(',').map(x=>x.trim()).filter(Boolean).map(k=>[k,r[k]])));
     result={error:null,data:options.head?null:structuredClone(selected),count:options.count?count:undefined};
    }else if(op==='update'){
     for(const row of selected){if(!condition || row.manual_override!==true)Object.assign(row,values);}
    }else{
     const keys=options.onConflict.split(',');
     for(const v of Array.isArray(values)?values:[values]){
      const row=tables[table].find(r=>keys.every(k=>r[k]===v[k]));
      if(row){if(!options.ignoreDuplicates)Object.assign(row,v);}else tables[table].push({id:`new-${++serial}`,...structuredClone(v)});
     }
    }
    calls.push({table,op,bytes:Buffer.byteLength(result.data ? JSON.stringify(result.data):''),values:structuredClone(values)});
    return result;
   }).then(resolve,reject);}
  };return q;
 }};return db;
}
function fixture(){
 const day='d1';
 const managers=Array.from({length:10},(_,i)=>`m${i}`);
 const players=Array.from({length:5},(_,i)=>({id:`p${i}`,name:`Player${i}`,surname:'Fixture',webpont_id:i+1,real_team_id:i===4?'away':'home',active:true}));
 return {matchdays:[{id:day,number:1,lineup_deadline:'2026-11-15T00:00:00Z'}],
 league_matches:Array.from({length:5},(_,i)=>({id:`lm${i}`,matchday_number:1,home_manager_id:managers[i*2],away_manager_id:managers[i*2+1],home_score:null,away_score:null,home_points:null,away_points:null,completed:false})),
 real_games:[{id:'r1',matchday_id:day,home_team_id:'home',away_team_id:'away',home:{name:'Fixture Home'},away:{name:'Fixture Away'},scheduled_at:'2026-11-16T10:00:00Z',postponed:false,cancelled:false}],
 players,lineups:managers.map((m,i)=>({id:`l${i}`,manager_id:m,matchday_id:day,lineup_players:players.map((p,j)=>({player_id:p.id,role:['starter','sixth','bench','out','starter'][j],captain:j===0}))})),
 manager_coaches:managers.map(m=>({manager_id:m,real_team_id:'home',active:true,real_teams:{name:'Fixture Home',coach:'Fixture Coach'}})),fantasy_scores:[],fantasy_coach_scores:[],webpont_game_links:[]};
}
function engine({baseline=false,seed=fixture(),workerStatus='live',missing=[],failWorker=false,emptyBox=false,invalidScore=false,workerScore=10}={}){
 const db=fakeDB(seed), errors=[], workerCalls=[];let time=Date.parse('2026-11-16T11:00:00Z');
 class FakeDate extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
 const c=vm.createContext({db,me:{id:'m0',is_admin:true},Date:FakeDate,console:{log(){},warn(){},table(){},error(...args){errors.push(args);}},document:{querySelector:()=>null},setTimeout,clearTimeout,
 async fetch(url){workerCalls.push(url.includes('discover=')?'discovery':'game');if(failWorker)throw Error('offline');const u=new URL(url);let data;
 if(u.searchParams.has('discover')) data={ok:true,games:[{game:'fixture_game',home:'Fixture Home',away:'Fixture Away',date:'2026-11-16'}]};
 else data={ok:true,game:u.searchParams.get('game'),info:{home:'Fixture Home',away:'Fixture Away',homeScore:80,awayScore:70,date:'2026-11-16',status:workerStatus},players:(emptyBox?[]:seed.players).filter(p=>!missing.includes(p.id)).map(p=>({webpont_id:p.webpont_id,name:p.name,surname:p.surname,minutes:20,fantasyScore:invalidScore?null:workerScore}))};
 return {ok:true,json:async()=>data};}});
 c.window=c;vm.runInContext(fs.readFileSync('public/live-runtime.js','utf8'),c);
 const html=source(baseline);let code=html.slice(html.indexOf('window.loadLiveFantasyScores ='),html.indexOf('window.loadAllFantasyScores ='));
 vm.runInContext(code,c);
 return {db,c,errors,workerCalls,advance:ms=>{time+=ms;},run:()=>c.loadLiveFantasyScores()};
}
module.exports={source,runtime,clock,fakeDB,fixture,engine};
