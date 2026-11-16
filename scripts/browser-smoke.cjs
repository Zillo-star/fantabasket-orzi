// Optional real Chromium smoke through playwright-cli. All nonlocal traffic is intercepted.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const {fakeDB,fixture}=require('../tests/helpers.cjs');
const root=path.resolve(__dirname,'..'), session=`fanta-offline-${process.pid}`;
function cli(...args){return new Promise((resolve,reject)=>{
 const child=spawn('npx',['--yes','--package','@playwright/cli','playwright-cli',`-s=${session}`,...args],{cwd:root});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);
 child.on('error',reject);child.on('close',code=>code || out.includes('### Error') ? reject(Error(out.slice(0,3000))):resolve(out));
});}
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const file=name==='/'?path.join(root,'index.html'):path.join(root,name==='/live-runtime.js'?'public/live-runtime.js':name.slice(1));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,body)=>{if(error){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(body);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 const seed=fixture();seed.managers=Array.from({length:10},(_,i)=>({id:`m${i}`,name:`Manager ${i}`,team_name:`Team ${i}`,is_bot:false,is_admin:i===0,credits:100}));
 seed.matchdays.push({id:'d2',number:2,lineup_deadline:'2026-11-23T00:00:00Z'});
 seed.lineup_players=seed.lineups.flatMap(l=>l.lineup_players.map(p=>({...p,lineup_id:l.id})));
 seed.notifications=[{id:'n1',manager_id:'m0',read:false,title:'Test',message:'Fixture'}];
 let fake=fakeDB.toString().replace("Buffer.byteLength(result.data ? JSON.stringify(result.data):'')","new TextEncoder().encode(result.data ? JSON.stringify(result.data):'').length");
 fake=fake.replace('select(c=', 'maybeSingle(){options.single=true;return q;},limit(n){to=n-1;return q;},not(){return q;},select(c=');
 fake=fake.replace('return result;','if(options.single && Array.isArray(result.data))result.data=result.data[0]||null;return result;');
 const mock=`const fixtureDB=(${fake})(${JSON.stringify(seed)});fixtureDB.auth={getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({}),signOut:async()=>({error:null})};window.fixtureDB=fixtureDB;window.supabase={createClient:()=>fixtureDB};`;
 await cli('open','about:blank');
 await cli('run-code',`async page => {
   await page.route('**/*',route=>{
     const u=new URL(route.request().url());
     if(u.hostname==='127.0.0.1')return route.continue();
     if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'application/javascript',body:${JSON.stringify(mock)}});
     if(u.hostname.endsWith('.workers.dev')){
       const data=u.searchParams.has('discover')?{ok:true,games:[{game:'fixture_game',home:'Fixture Home',away:'Fixture Away',date:'2026-11-16'}]}:
         {ok:true,game:u.searchParams.get('game'),info:{home:'Fixture Home',away:'Fixture Away',homeScore:80,awayScore:70,date:'2026-11-16',status:'live'},players:${JSON.stringify(seed.players.map(p=>({webpont_id:p.webpont_id,name:p.name,surname:p.surname,minutes:20,fantasyScore:10})))}};
       return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
     }
     if(u.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
     return route.abort();
   });
   await page.clock.install({time:new Date('2026-11-16T11:00:00Z')});
   await page.goto(${JSON.stringify(url)});
   await page.evaluate(async()=>{me=fixtureDB.tables.managers[0];document.getElementById('app').classList.remove('hidden');nav();await home();});
 }`);
 // Capture a real snapshot before interacting with navigation.
 await cli('snapshot');
 await cli('run-code',`async page => {
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const check=(ok,message)=>{if(!ok)throw Error(message);};
   await page.waitForFunction(()=>document.getElementById('dashboardNotificationBadge')?.textContent==='1');
   const count=()=>page.evaluate(()=>fixtureDB.calls.filter(x=>x.table==='notifications').length);
   const initial=await count();await page.clock.runFor(60000);check(await count()===initial+1,'notification cadence');
   await page.getByRole('button',{name:'Calendario',exact:true}).click();
   await page.waitForFunction(()=>!!document.querySelector('#calendarDayQuickSelect'));
   await page.evaluate(async()=>{for(let i=0;i<5;i++)await calendar(1);});
   check(await page.evaluate(()=>fixtureDB.calls.every(x=>x.op==='select')),'calendar wrote scores');
   const afterCalendar=await count();await page.clock.runFor(60000);check(await count()===afterCalendar,'dashboard timer leaked after navigation');
   await page.evaluate(()=>calendar(2));
   check(await page.evaluate(()=>window.calendarSelectedDay===2),'day selection');
   await page.clock.runFor(60000);check(await page.evaluate(()=>window.calendarSelectedDay===2),'refresh lost selected day');
   await page.getByRole('button',{name:'Classifica',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#content')?.textContent.includes('Classifica'));
   await page.getByRole('button',{name:'Admin',exact:true}).click();
   await page.waitForSelector('#liveUpdateToggle');
   check(await page.locator('#liveUpdateToggle').textContent()==='Avvia aggiornamenti live (60 s)','admin procedure missing');
   await page.getByRole('button',{name:'Avvia aggiornamenti live (60 s)',exact:true}).click();
   await page.waitForFunction(()=>document.getElementById('liveUpdateStatus')?.textContent.includes('Ultimo tentativo'));
   const firstWrites=await page.evaluate(()=>fixtureDB.calls.filter(x=>x.op!=='select').length);
   check(firstWrites===65,'first authorized run: expected 50 player + 10 coach + 5 match writes');
   await page.clock.runFor(60000);
   check(await page.evaluate(()=>fixtureDB.calls.filter(x=>x.op!=='select').length)===firstWrites,'unchanged tick wrote data');
   await page.getByRole('button',{name:'Ferma aggiornamenti live',exact:true}).click();
   await page.evaluate(()=>{stopLiveUpdates();});
   check(errors.length===0,JSON.stringify(errors));
   await page.evaluate(()=>{window.__smokeResults={home:true,notificationCadence:true,calendarFiveOpeningsNoWrites:true,notificationCleanup:true,selectedDayPreserved:true,standings:true,adminControl:true,adminTickIdempotent:true,writes:fixtureDB.calls.filter(x=>x.op!=='select').length};});
 }`);
 const result=await cli('eval','window.__smokeResults');
 console.log(result.split('### Ran Playwright code')[0].trim());
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
 try{await cli('close');}catch{}
 server.close();
});
