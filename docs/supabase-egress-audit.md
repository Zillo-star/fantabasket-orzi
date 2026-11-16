# Audit Supabase e aggiornamenti live

Data: 16 novembre 2026. Repository: `Zillo-star/fantabasket-orzi`.
Baseline verificata con `git fetch origin main`: **1496ef5b92ad0b419c6de4bb6cc34ef8c5382372**, 12/11/2026 13:45:22 UTC (14:45:22 Europe/Rome).
Branch: `fix/supabase-egress-live-safeguards`.

## Perimetro e fonti

Letto integralmente `CONTESTO_CODEX_FANTABASKET_SUPABASE.md`, esaminati codice corrente, cronologia locale completa, diff giornaliero e commit indicati. Nessuna richiesta al database Supabase o al Worker reale, nessun intervento a schema, dati, policy o hosting di produzione. Il documento già in staging e `.idea/` preesistente sono esclusi dai commit del lavoro.

App HTML/JS monolitica, SDK Supabase v2 da CDN, build Vite; nessun backend, SQL, test o workflow CI nella baseline. Il Worker WebPont sorgente e `Markdown incollato.md` non sono nel workspace. Il frontend chiama `fantabasket-webpont.davzil2005.workers.dev`; non è il Worker `fantabasket-orzi`.

Gli stati GitHub dei commit confermano un'integrazione **Vercel**: per la baseline, stato `success`, descrizione `Deployment has completed`, 12/11 13:45:37 UTC ([API status](https://api.github.com/repos/Zillo-star/fantabasket-orzi/commits/1496ef5b92ad0b419c6de4bb6cc34ef8c5382372/status)). Non è stata ispezionata la dashboard Vercel né verificato il dominio di produzione. `vercel.json` disabilita i deploy automatici esclusivamente per questo branch, già nel primo push, secondo la [configurazione ufficiale](https://vercel.com/docs/project-configuration/git-configuration). Nessun comando di deploy viene eseguito.

## Fatti confermati e correzioni

| Priorità | Evidenza sulla baseline | Correzione |
|---|---|---|
| P0 | `calendar()` chiama il motore con timeout 100 ms a ogni render, per qualsiasi utente | Calendario in sola lettura; nessun ricalcolo al render. Procedura admin esplicita e polling di lettura della vista |
| P0 | Nessun single-flight, possibile concorrenza e ripetizioni ravvicinate | Stessa Promise per chiamate concorrenti, reset in `finally`, minimo 60 s tra avvii |
| P0 | Mappa manuale per `player_id`; upsert normale e `saveZero` scrivono anche gli override | Snapshot per giornata; chiavi manager+giornata+giocatore, skip override, update condizionale anche lato PostgREST, insert con `ignoreDuplicates` |
| P0 | Le partite vengono preparate in `daysToProcess[].leagueMatches` ma perse in `dayContexts`; `ctx.leagueMatches || []` è vuoto | Propagato il riferimento esistente. Ripristinati i totali delle partite e le regole di completamento già scritte; golden test separa punteggi invariati e questo difetto funzionale |
| P1 | Notifiche ogni 5 s; query precedente al controllo badge | Polling 60 s, query solo con dashboard montata e pagina visibile, single-flight e cleanup |
| P1 | `loadNotificationCount` cerca un badge di navigazione assente dopo la query | Riutilizzato updater del badge realmente presente; niente query per badge assente |
| P1 | Calendario legge formazioni, giocatori e punteggi dell'intera stagione per mostrare un giorno | Dettagli limitati al giorno selezionato, conservati tutti i manager e i metadati stagionali |
| P1 | Punteggi identici riscritti a ogni giro | Confronto campi prima di scrivere giocatori, coach e partite; nessuna scrittura su tick invariato |
| P1 | Tabellino assente/score non disponibile può produrre zero artificiale | Saltato tabellino assente/vuoto/invalido e `fantasyScore` null/non finito; zero numerico valido conservato |
| P2 | Cinque discovery + fallback ripetuti a ogni ricalcolo | TTL 5 minuti dei soli abbinamenti in memoria; statistiche gara rilette a ogni tick |

Nessuna modifica a CSS, formule sportive, moltiplicatori, soglia 117, attribuzione dei punti in classifica o criterio delle deadline. Due differenze intenzionali rispetto alla baseline: rispetto effettivo dell'override e ripristino dell'aggiornamento di `league_matches`, che prima non avveniva nel motore.

`refreshLeagueMatchScoresLive` era un secondo writer senza filtri stagionali e richiamava il calendario (quindi il motore). Non ha caller attivi dopo il 12/11: ora delega al motore autorizzato e protetto, evitando un secondo giro di letture e update. `loadAllFantasyScores` è una vecchia importazione massiva senza caller nel codice, con chiave coach diversa e persistenza non protetta dagli override: sospesa esplicitamente con errore prima di qualsiasi query, fino a verifica in staging. Non è una funzione da usare per il live.

Il solo guard frontend non è un controllo di sicurezza: la publishable key è pubblica per definizione, e un client modificato può chiamare direttamente PostgREST. **Non è dimostrato che un utente normale sia bloccato dal database**: RLS e grant devono essere verificati in staging. Nessuna service-role key aggiunta o trovata nel client esaminato. Aggiunto anche il controllo admin all’ingresso della finalizzazione manuale; la verifica dei permessi della relativa RPC resta obbligatoria.

## Procedura operativa live nella PR

1. L'amministratore apre **Admin → Avvia aggiornamenti live (60 s)** in una sola scheda e la lascia aperta e visibile durante le partite.
2. Primo tentativo immediato, poi un unico timeout dopo ciascun ciclo. Nessun ricalcolo pubblico all'apertura del calendario. Se il giro dura a lungo non viene sovrapposto: intervallo effettivo 60 s più durata del giro.
3. Il calendario visibile rilegge i dati ogni 60 s, conservando giorno e filtro partita. Non viene sostituito mentre è aperto un popup di formazione/statistiche. Un render ormai superato non può sovrascrivere una vista successiva.
4. Notifiche: primo refresh immediato, poi 60 s; pausa in background, refresh al ritorno, stop all'uscita dalla dashboard/logout/pagehide. Anche il writer è sospeso in background e fermato a logout/pagehide; le richieste già avviate non vengono annullate.
5. Web Locks + timestamp condiviso in `localStorage` evitano tentativi sovrapposti/ravvicinati tra schede dello stesso browser compatibile. Browser senza Web Locks: rimane solo il single-flight per scheda; usare una sola scheda. Non è un lock fra dispositivi e non sostituisce RLS.

**Limite operativo:** senza la scheda admin attiva i client leggono gli ultimi punteggi salvati, non inventano aggiornamenti. La baseline aveva già perso il live periodico: le rimozioni del 12/11 lasciavano solo il trigger all'apertura del calendario. La PR fornisce una procedura esplicita compatibile, non un servizio unattended. I test verificano la cadenza di 60 s con risposte immediate; latenza Worker, durata del calcolo, scheduling browser e due polling indipendenti impediscono di promettere un SLA end-to-end rigido di 60 s. Per averlo senza dipendenza dal browser serve il job backend dell'ADR.

## Inventario richieste e opportunità residue

L'[inventario completo](query-inventory.md) elenca **127 callsite `.from`** della baseline, tabella, operazione, proiezione, filtri e contesto. È un inventario statico, non un conteggio di traffico effettivo. I nomi di funzione vicini sono euristici per le funzioni annidate. A questi si aggiungono le RPC `accept_trade`, `reject_trade`, `finalize_fantasy_matchday`, `add_credits`, `subtract_credits`: implementazioni SQL e permessi non disponibili.

Cardinalità seguenti: attese dal codice, non misurate sul DB.

| Flusso / tabelle | Trigger e cadenza | Loop / volume atteso | Cache e impatto |
|---|---|---|---|
| `boot`: managers, push_subscriptions | Login/ripristino sessione, azioni push | Una identità, iscrizione per endpoint | Dati account; nessuna nuova cache |
| `home`: fantasy_scores, fantasy_coach_scores, matchdays, league_matches, managers, real_games, lineups | Apertura dashboard | Totali personali + stagione; query globale `fantasy_scores.select(matchday_id)` senza paginazione | Residuo: può troncare conteggi oltre limite API. Non cambiarne avanzamento senza test dataset di stagione |
| `notifications` HEAD/count | Prima ogni 5 s anche fuori vista; ora 60 s nella dashboard visibile | Corpo vuoto, header count; costo frequenza/log | Nessuna cache persistente; refresh dopo azioni rilevanti e rientro |
| `notifications` select/update | Apertura lista (limit 30), lettura singola/tutte, scambi | Massimo 30 messaggi per visualizzazione | Dati mutabili/personali, nessuna cache condivisa |
| Calendario: league_matches/managers/manager_coaches/matchdays | Apertura, navigazione e ora refresh visibile 60 s | Intera stagione di partite e metadati manager | Necessari per navigazione; fase successiva endpoint di metadati compatto |
| Calendario: fantasy_scores HEAD/count | Una query per ogni matchday a ogni render | **N+1 ancora presente**, soglia esatta 117 | Da sostituire con RPC aggregata autorizzata; scaricare tutte le righe per contare può aumentare egress ed essere troncato |
| Calendario: lineups/lineup_players/players/fantasy_scores/fantasy_coach_scores | Render giorno | Prima tutte le giornate, ora solo giorno selezionato, tutti i manager | Cache archivio rinviata: override/recuperi/rose possono cambiare |
| Motore: matchdays/league_matches/real_games/players | Prima ogni apertura calendario per utente; ora sessione admin esplicita | Letture globali iniziali, scelta giorni scaduti/aperti e recuperi | Ulteriore narrowing richiede conferma schema; non eliminati i recuperi |
| Motore: lineups/manager_coaches/webpont_game_links | Ogni giro autorizzato | Formazioni dei giorni da elaborare, coach attivi e collegamenti | Giorni chiusi normalmente saltati, mantenuti quelli con gare oggi/future |
| Motore: snapshot fantasy_scores/fantasy_coach_scores | Una lettura paginata per tabella/giorno (500 righe/pagina) | Campi necessari per override/idempotenza, nessun payload personale | Snapshot valido solo per quel giro; duplicati chiave sospendono la scrittura |
| Motore: update/insert punteggi | Per giocatore/coach realmente cambiato | Insert ignore-duplicates; update condizionali, nessuna `.select()` sulle scritture | Batch rinviato: un upsert collettivo può schiacciare un override concorrente |
| Motore: totali fantasy_scores/fantasy_coach_scores e update league_matches | Fine di ogni giornata elaborata | Rilettura finale per includere override concorrenti; update solo differenziali | Logica completamento/bonus invariata; transazione atomica assente, richiede backend |
| Listone/rose/formazioni: players, real_teams, rosters, matchdays, lineups, lineup_players, real_games | Azioni utente, cambi filtri/giornata, timeout di render | Alcune query in callback/loop; nessun nuovo polling Supabase | Roster mutabile; non ottimizzato senza fixture specifiche |
| Scambi: trades, rosters, players, managers, notifications + RPC | Azioni utente | Letture per proposta e scritture esplicite | Non toccato |
| Admin: managers/rosters/players/real_teams/manager_coaches/real_games/webpont_game_links + RPC | Apertura schermate e azioni esplicite | Discovery in `loadAdminWebPontLinks`, autosalvataggio link mancanti | Worker distinto; RLS/grant RPC indispensabili |
| Popup statistiche: players/real_games/webpont_game_links/fantasy_scores + Worker | Click giocatore | Lettura puntuale; cache sessione player+giornata | Non avvia il motore globale, cache popup indipendente |

Tabelle inventariate: `fantasy_coach_scores`, `fantasy_scores`, `league_matches`, `lineup_players`, `lineups`, `manager_coaches`, `managers`, `matchdays`, `notifications`, `players`, `push_subscriptions`, `real_games`, `real_teams`, `rosters`, `trades`, `webpont_game_links`.

## Timer, eventi e PWA

- Baseline: un interval notifiche da 5 s in `home`; un interval countdown formazione da 1 s, che aggiorna DOM/blocco locale e non fa query; nessun altro interval live dopo il 12/11.
- Timeout di password recovery e salvataggio nome (1200 ms), render slot/caricamento partite/formazione e selettori; il timeout calendario da 100 ms era l'unico trigger attivo di `loadLiveFantasyScores`.
- Ricerca completa caller: definizione del motore, verifica di disponibilità nel popup (non una chiamata), chiamata nel timeout calendario. `refreshLeagueMatchScoresLive` aveva solo la definizione. `loadAllFantasyScores` aveva solo la definizione. Nessun focus/visibility listener live nella baseline.
- Listener input/cambio filtri del listone, chiusura popup su click, handler inline `onclick`/`onchange` per navigazione; ora aggiunti visibilitychange, pagehide, signed-out e MutationObserver limitato ai figli diretti di `#content`.
- Nuova utilità `polling`: un timeout massimo per controller, nessun interval annidato, stop senza riarmo quando una richiesta pendente termina dopo l'uscita.
- `sw.js` e `public/sw.js`: solo push e notificationclick; nessun handler fetch e nessuna Cache API. La build usa `public/sw.js`. Non ci sono asset HTML/JS precache da invalidare con questo SW. La cache HTTP del dominio non è verificata; vecchie schede possono comunque tenere in memoria il vecchio JS: chiuderle/riaprirle nella verifica di rilascio. Nessun reload forzato aggiunto.

## Forense 29 ottobre: evidenze e limiti

Date raggruppate in **Europe/Rome**, non per sola data UTC:

| Giorno | Commit a index.html | Ultimo SHA del giorno | Stato GitHub Vercel success (UTC) |
|---|---:|---|---|
| 28/10 | 9 | `6d933ef8485c64c79c6e71b6d4f9a49474aee5c2` | 28/10 11:15:53 |
| 29/10 | 42 | `e7d6a7dd120e88c70712d37578733fd4050273f2` | 29/10 20:51:12 |
| 30/10 | 7 | `4bc9a101729dd277a09a2db2829b7cfcca47126c` | 30/10 11:33:11 |
| 31/10 | 35 | `f17b21006fd7f9d3c95d3dcea23334332789ea7c` | 31/10 19:39:27 |
| 01/11 | 1 | `b58ba9ffc18592bbc607df6bc66d715667041055` | 01/11 12:04:52 |
| 12/11 | 2 | `1496ef5b92ad0b419c6de4bb6cc34ef8c5382372` | 12/11 13:45:37 |

Stati consultati attraverso `/repos/Zillo-star/fantabasket-orzi/commits/<sha>/status`. Provano che Vercel ha riportato un deployment riuscito per quegli SHA; non identificano quale alias fosse servito agli utenti a ogni ora, né il traffico delle schede già aperte. Non ricostruiscono tutti i 42 deployment del 29.

Confermato diff ultimo 28 → ultimo 29: **577 aggiunte / 231 rimozioni**. Verificati `e652cdf` (saveZero, +32/-3), `41f75e0` (caricamento cambio giornata, +20/-18), `63add91` (discovery admin, +102/-7), `3995042` (upsert automatico link, +26), `8b81112`, `64589f5`, `0daf964` nel diff cumulativo. I cambi comprendono render/navigazione e fallback WebPont, non 42 moltiplicazioni automatiche delle richieste.

Timer annidati confermati nei sorgenti del 28/29/31: il timer esterno crea un nuovo interval ogni 20 s e ne perde gli handle. Timer calendario indipendente aggiunge motore e refresh totali. `b58ba9f` elimina il nesting il 1/11; `ae60792` e `1496ef5` eliminano i due polling residui il 12/11. Il difetto non è presente oggi.

Simulazione eseguita sul testo dei timer estratto da `e7d6a7d`, con fake clock e callback senza rete/durata, nessun calendario montato:

| Durata | Schede | Invocazioni motore | Invocazioni totali | Interval ancora attivi |
|---|---:|---:|---:|---:|
| 5 min | 1 | 137 | 16 | 17 |
| 30 min | 1 | 4.187 | 91 | 92 |
| 60 min | 1 | 16.472 | 181 | 182 |
| 60 min | 8 | 131.776 | 1.448 | 1.456 |

Non sono richieste PostgREST misurate: ogni invocazione può generare molte richieste o terminare presto, i tempi reali possono sovrapporsi, il calendario montato può aggiungere altri avvii. Non convertire questi numeri in GB.

**Confidenza alta** nell'esistenza del moltiplicatore storico e nei difetti attuali sopra. **Confidenza moderata** che timer, durata apertura schede e giorni elaborati abbiano contribuito al picco. **Non provato** il nesso causale col 29/10: lo stesso nesting era presente prima. SaveZero aumenta scritture/round-trip, ma una upsert senza select non restituisce normalmente righe ([SDK ufficiale](https://supabase.com/docs/reference/javascript/upsert)); da sola non spiega 3,191 GB di egress. Le discovery riguardano invece Cloudflare/WebPont, non sono automaticamente traffico Supabase.

I valori 5,589 GB complessivi e 3,191 GB del 29 sono forniti dal documento, non verificati nella dashboard corrente. [Supabase Pricing](https://supabase.com/pricing) indica oggi 5 GB di egress e 1 giorno di retention log API/DB per Free: il recupero per-request del 29 non è stato tentato né promesso. Non verificati ciclo/reset/restrizioni correnti. Cancellare dati non annulla l'egress già consumato.

## Misure riproducibili offline

Fixture: 10 manager, 5 slot ciascuno, 1 gara, statistiche costanti. Il benchmark invoca **il codice originale e quello corretto** in VM con fake Supabase/Worker, non una formula riscritta. JSON completo in [benchmark-results.json](benchmark-results.json).

| Scenario | Metrica | Prima | Dopo |
|---|---|---:|---:|
| Secondo giro invariato | API totali (Supabase + Worker) | 92 | 12 |
| Secondo giro invariato | PostgREST | 70 | 11 |
| Secondo giro invariato | Scritture (upsert incluse) | 60 | 0 |
| Secondo giro invariato | Byte corpo risposte PostgREST | 8.232 | **16.663** |
| 5 aperture, 1 utente | PostgREST del motore | 350 | 76 |
| 5 aperture, 1 utente | Byte risposte del motore | 41.160 | 8.234 |
| 5 aperture, 8 utenti | PostgREST del motore | 2.800 | 76 |
| 5 aperture, 8 utenti | Byte risposte del motore | 329.280 | 8.234 |
| 5 aperture, 8 utenti | Upsert | 2.400 | 60 |
| 60 min dashboard, 1 utente | HEAD notifiche (iniziale inclusa) | 721 | 61 |
| 60 min dashboard, 8 utenti | HEAD notifiche (iniziale inclusa) | 5.768 | 488 |

Cinque aperture: prima cinque processi per client; dopo zero avvii dalla vista e un processo da una sola sessione admin. **Escluso il traffico di lettura del calendario**: non rappresenta il consumo totale dell'app. Il primo giro corretto fa anche 5 update partite prima mancanti (65 scritture complessive contro 60). Il secondo giro paga lo snapshot per proteggere gli override e confrontare i campi: **+102,4% byte per quel singolo giro**, pur con -84,3% richieste e zero scritture. Nel workload otto utenti le richieste del motore scendono del 97,3%; non estendere questa percentuale al traffico reale complessivo.

Notifiche: -91,5% richieste su un'ora includendo iniziale e tick al minuto 60 (la cadenza nominale pura scende del 91,7%). HEAD ha corpo vuoto: benchmark non misura header, TLS, byte compressi, ingestione log o fatturazione. I byte sono JSON UTF-8 del fake server, non egress Supabase osservato. Il main inattivo aveva zero ricalcoli periodici: il nuovo live utile comporta traffico dove prima i risultati restavano fermi.

Strumentazione sviluppo opt-in: `scripts/dev-request-metrics.mjs`, non incluso nell'app/build. Su localhost con mock già attivo:

```js
const {installRequestMetrics} = await import('/scripts/dev-request-metrics.mjs');
const metrics = installRequestMetrics({optIn:true});
// Eseguire un flusso sul fake server; non collegare la produzione.
metrics.snapshot();
metrics.stop();
```

Conta metodo, endpoint/tabella, durata, errori e dimensione del corpo decodificato. Non conserva URL completi, query, header, token o contenuti. Il clone delle risposte è volutamente solo uno strumento locale e può alterare i tempi. Il mock Supabase del browser aggira fetch: per quel test i contatori sono in `fixtureDB.calls`, non in questo wrapper.

## Esecuzione locale

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run benchmark
npm run test:browser
```

Il benchmark legge con Git lo SHA baseline e il commit storico: serve la cronologia completa, non un clone shallow privo di questi oggetti. Il browser test usa `npx --package @playwright/cli playwright-cli` e Chromium; richiede il browser installato e permessi di avvio/server locale. Alla prima esecuzione può scaricare il solo tooling, ma tutte le richieste dell'app a servizi esterni vengono intercettate. Nessuna credenziale di staging/produzione necessaria. Ambiente verificato: Node 24.21.0, npm 11.19.0. Gli output Playwright sono ignorati da Git.

## Validazione eseguita e limiti

- Installazione: baseline senza lockfile → `npm install --ignore-scripts`; aggiunto `package-lock.json` con Vite 7.3.8 compatibile con il range originale. Poi **`npm ci --ignore-scripts`** riuscito. Primo tentativo sandbox fallito per DNS; installazione autorizzata riuscita. Audit npm all'installazione: 0 vulnerabilità riportate.
- `npm test`: **16 test passati**, engine originale/corretto, captain/sixth/bench/out, bonus vittoria/sconfitta, coach, manuali di manager/giorni diversi e zero valido, override concorrente durante update/insert, errore/stop/reset, paginazione 1.203 righe, recuperi/futuri/finali, Worker offline/dati incompleti, badge 99+ e cleanup.
- `npm run build`: riuscita; sintassi di tutti gli script inline e dei due SW verificata anche separatamente. `dist/live-runtime.js` presente.
- `node scripts/browser-smoke.cjs` / `npm run test:browser`: Chromium reale tramite Playwright CLI; server HTTP temporaneo locale, CDN SDK sostituita dal mock, tutte le altre richieste esterne intercettate. Home/badge, tick 60 s, cinque aperture calendario senza scritture, cleanup, selezione giorno conservata, classifica, controllo admin e primo giro autorizzato (65 scritture), secondo giro invariato senza nuove scritture.
- `npm run benchmark`: eseguito interamente offline; simulazione storica e contatori verificabili nel JSON.
- `git diff --check`: eseguito prima dei commit.

Non eseguiti login reale, salvataggio formazione reale, operazioni admin reali, test RLS/SQL, conflitti transazionali PostgreSQL, dati completi di stagione e rete reale WebPont. Il mock verifica i predicati emessi dal client, non dimostra la loro efficacia con RLS/configurazione reali. Il browser smoke prepara una sessione fittizia: non è un test dell'autenticazione Supabase. Schema, indici, chiavi coach e RPC restano da confermare. Test su dati sintetici non garantiscono copertura di tutti i casi di campionato.

## Verifiche richieste prima del merge

- [ ] Staging separato: fixture complete di stagione, count >=117, navigazione archivio, filtri partita, classifiche e formazioni, recuperi reali.
- [ ] Confermare UNIQUE giocatori `(manager_id,matchday_id,player_id)` e coach `(manager_id,matchday_id)`, tipi/nullability `manual_override`; chiarire la chiave tripla del vecchio import storico.
- [ ] Verificare con due account e REST diretto che utente normale non scriva punteggi globali; verificare RLS/grant anche di `finalize_fantasy_matchday`, crediti, link WebPont e notifiche. Non basta nascondere il bottone.
- [ ] Verificare che un override inserito durante il giro rimanga intatto con il vero PostgREST; misurare richieste/byte in staging per 1 e 8 utenti.
- [ ] Validare il percorso admin ogni minuto con tabellini parziali, partite interrotte e dati Worker: senza sorgente Worker non si può sapere se una lista non vuota sia completa.
- [ ] Accettare esplicitamente la dipendenza temporanea dalla scheda admin e il limite multi-dispositivo; altrimenti completare prima l'ADR backend.
- [ ] Eliminare N+1 via endpoint aggregato e correggere paginazione/conteggi di home in una PR successiva. Non usare cache immutabile per giorni con recuperi o modifiche manuali.
- [ ] Verificare cache HTTP/riapertura PWA e assenza di vecchie schede attive al futuro rilascio autorizzato.

Rollback codice: revert dei commit della PR prima di un eventuale rilascio autorizzato; nessuna migrazione o pulizia dati necessaria. Il rollback ripristina anche il vecchio trigger pubblico e la perdita del polling: non è una soluzione operativa permanente.
