# FantaBasket Orzi — contesto tecnico e piano operativo per Codex

> **Tipo di incarico:** audit mirato + correzioni incrementali al codice + test + commit dedicati su branch separato + PR in bozza.  
> **Obiettivo principale:** ridurre drasticamente il traffico e le chiamate non necessarie a Supabase, prevenire i ricalcoli live duplicati e mantenere corretti e aggiornati punteggi/classifiche.  
> **Lingua del report e delle spiegazioni:** italiano.  
> **IMPORTANTE:** non deployare, non fare merge in `main`, non modificare il database di produzione, non cancellare tabelle/dati. Per un intervento architetturale o una migrazione proporre un piano e una PR distinta.

## 0. Istruzioni iniziali per l'agente (da eseguire)

Sei Codex, agisci da senior software engineer con competenze frontend JavaScript, Supabase/PostgREST, PostgreSQL, Cloudflare Workers e debugging di traffico API.

1. Apri e analizza il repository **`Zillo-star/fantabasket-orzi`**, branch di partenza `main`: <https://github.com/Zillo-star/fantabasket-orzi>. Non lavorare su una copia ipotetica del codice: leggi realmente la versione corrente e annota SHA, data, struttura e modalità di deploy.
2. **Non modificare la produzione**. Crea un branch di lavoro, ad esempio `fix/supabase-egress-live-safeguards`, partendo dall'ultimo `main` e verifica che il working tree sia pulito. Prima di creare il branch controlla eventuali modifiche concorrenti.
3. Studia *prima* i flussi e annota i possibili effetti collaterali. Implementa **solo le correzioni a basso rischio dimostrabili**, mantenendo l'app funzionante, poi prepara test e misurazioni. Per cambiamenti importanti (spostare il calcolo live lato server, migrazioni, RLS) crea un piano tecnico separato invece di improvvisare.
4. Fai **commit focalizzati**, con messaggi descrittivi e tracciabili; apri una **draft pull request** verso `main` (se i permessi lo consentono) con analisi, modifiche, test, rischi e istruzioni di verifica. **Non fare merge né deploy.** Se non hai permessi, produci patch/diff e indica l'impedimento.
5. Nei risultati separa rigorosamente **fatti verificati**, **ipotesi sul picco del 29 ottobre**, **misure/benchmark effettivi** e **ottimizzazioni suggerite**. Non dichiarare risolta la causa storica senza prova.
6. Evita chiamate di test in massa al Supabase di produzione: il progetto ha già superato la quota Free. Testa in locale con mock, ambiente di staging o dataset fittizio; eventuali verifiche leggere di sola lettura in produzione richiedono consenso preventivo del proprietario.

## 1. Situazione reale e sintomo

L'app è un fantasy basket per il campionato di Serie B/Serie B Nazionale italiana (non fantasy NBA). Le statistiche sportive sono recuperate da WebPont/Lega Nazionale Pallacanestro tramite un Cloudflare Worker; Supabase gestisce persistenza e API del fantabasket. C'è **una persona che gestisce gli aggiornamenti**; per i risultati live l'app deve essere ragionevolmente aggiornata **circa ogni minuto**, senza aggiornamenti moltiplicati per ogni utente o scheda aperta. Ci sono circa **8 utenti attivi** nel ciclo mostrato, non decine di migliaia.

Dati letti dalle schermate Supabase (Free, periodo di utilizzo iniziato il 27/10/2026):

| Metrica | Dato mostrato | Significato corretto |
|---|---:|---|
| **Egress** | **5,589 / 5 GB (112%)** | Dati scaricati da Supabase dai client; quota già consumata, non spazio disco |
| **Egress del 29/10/2026** | **circa 3,191 GB di PostgREST Egress** | Picco giornaliero **API REST database**; non dimostra 3,191 GB di scritture |
| Log Ingestion | 2,473 / 1 GB (247%) | Log acquisiti, forse aumentati dalle richieste ripetute |
| Log Query | 45,145 / 100 GB (45%) | Metrica diversa da PostgREST Egress |
| Database Size | 0,039 / 0,5 GB (~8%) | Database di circa 39 MB, piccolo; cancellarne righe non azzera Egress |
| Storage | ~0 GB | Non sembra la causa |
| Edge Function Invocations | 18.721 / 500.000 | Non sembrano il collo di bottiglia principale |
| MAU | 8 / 50.000 | Carico utente basso |

Il giorno 29 ottobre il grafico `Egress breakdown` mostrava quasi il 100% su **PostgREST Egress** e quantità trascurabili su `Auth Egress` e `Storage Egress`. Ciò impone di indagare prima di tutto **numero/frequenza/dimensione delle risposte delle query Supabase**.

**Attenzione:** la schermata è storica, non rappresenta necessariamente il consumo di oggi. Sul Free i log per-request del 29/10 probabilmente sono scaduti: non promettere di recuperarli. Controllare la conservazione e gli analytics effettivamente disponibili. **Non eliminare dati per 'azzerare' i 5 GB:** la quota egress si rinnova con il ciclo di billing, non cancellando righe. Eventuali restrizioni/avvisi e la data di reset vanno confermati nella dashboard corrente e nella documentazione ufficiale Supabase, senza assumere che siano già attivi.

## 2. Architettura e file

- Repository: `Zillo-star/fantabasket-orzi`, branch `main`.
- La versione analizzata in precedenza è quella del **12 novembre 2026** (`1496ef5b92ad0b419c6de4bb6cc34ef8c5382372` all'epoca); **ricontrolla il `HEAD` attuale** prima di lavorare.
- Progetto prevalentemente **`../index.html` monolitico** (~21 mila righe) con JS inline e `@supabase/supabase-js@2` caricato da CDN; ci sono `manifest.webmanifest`, `../sw.js`, icone e `package.json` minimale (`vite build`, dipendenza Vite 7.x). Non assumere che esistano già test o CI.
- Supabase è usato **direttamente dal browser**, con client `db` e molte chiamate `.from(...)` verso PostgREST.
- Il worker reale WebPont, comunicato separatamente dall'utente, è **`fantabasket-webpont.davzil2005.workers.dev`**, NON il Worker `fantabasket-orzi` che restituiva soltanto `Hello world`. Non confondere i due.
- Il codice del worker WebPont è stato fornito separatamente come `Markdown incollato.md`; **non assumere che sia nel repository GitHub**. Se non disponibile nel tuo workspace, segnala questa lacuna e porta avanti comunque l'audit del frontend. Non aggiungere il worker al repo né modificarlo senza necessità e autorizzazione.
- Il Worker WebPont accetta `?discover=1&start=...&end=...`, `?game=...` e `?lnp=...`; recupera HTML/statistiche da `netcasting3.webpont.com` e/o `legapallacanestro.com`, estrae giocatori/eventi e calcola fantasy score. **Non sono state trovate chiamate dirette Supabase nel codice del Worker fornito.** Il traffico Cloudflare/WebPont non è automaticamente Egress Supabase.
- La discovery di un intervallo massimo consentito può testare fino a 602 ID (due gruppi); il frontend effettua più richieste discovery per coprire intervalli diversi. Evitare esecuzioni massive durante l'audit su ambiente live.
- Tabelle emerse dal frontend: `matchdays`, `league_matches`, `real_games`, `players`, `lineups`, `lineup_players`, `fantasy_scores`, `fantasy_coach_scores`, `manager_coaches`, `webpont_game_links`, `notifications`, oltre ad altre da inventariare. Confermare schema reale, chiavi uniche, indici e policy RLS prima di fare SQL/migrazioni.
- **Sicurezza:** mai mettere service-role key nel browser o nel repository, mai copiare segreti in log/PR. La anon/publishable key del client va distinta da credenziali privilegiate. Non esporre dati personali nei benchmark.

## 3. Cosa ha rivelato la cronologia GitHub: fatti confermati

È stata analizzata la storia attorno al picco, confrontando 28 e 29 ottobre: il 29 risultano **42 commit a `../index.html`**; diff complessivo rispetto all'ultimo commit del 28 ottobre: circa **577 righe aggiunte e 231 rimosse**. Non equiparare il numero di commit a numero di richieste API.

### 3.1 Il bug dei timer annidati (GRAVE, STORICO, GIÀ CORRETTO)

Nelle versioni storiche del **20, 28, 29 e 31 ottobre** era presente la seguente struttura (semplificata):

```js
window.liveFantasyTimer = setInterval(async () => {
  await window.loadLiveFantasyScores();
  window.liveFantasyTimer = setInterval(async () => {
    await window.loadLiveFantasyScores();
    // ... aggiornamenti calendario/dashboard ...
  }, 20000);
}, 20000);
```

Il timer **esterno** crea un **nuovo timer interno ogni 20 secondi** senza liberare i timer precedenti. Assegnare un nuovo ID a `window.liveFantasyTimer` **non cancella** quelli già creati. Possibili conseguenze: crescita del numero di timer, aumento del numero di ricalcoli, richieste e operazioni persistenti anche da una singola scheda lasciata aperta a lungo; sovrapposizione di esecuzioni se la precedente richiede più dell'intervallo di polling.

Era inoltre presente un **timer indipendente** `liveCalendarTotalsTimer` che chiamava `loadLiveFantasyScores()` e `refreshLeagueMatchScoresLive()` ogni **20 secondi**, oltre a un primo avvio immediato. Questo aggiungeva lavoro duplicato.

**Cronologia correzioni:**
- **01/11/2026, commit `b58ba9ffc18592bbc607df6bc66d715667041055`:** elimina il nesting dei timer e sostituisce con un solo interval. Diff: <https://github.com/Zillo-star/fantabasket-orzi/commit/b58ba9ffc18592bbc607df6bc66d715667041055>.
- **12/11/2026, commit `ae607927bd3ebd8bfb9435fb4b54fcf2bd72530e`:** rimuove timer automatico live rimanente. <https://github.com/Zillo-star/fantabasket-orzi/commit/ae607927bd3ebd8bfb9435fb4b54fcf2bd72530e>.
- **12/11/2026, commit `1496ef5b92ad0b419c6de4bb6cc34ef8c5382372`:** rimuove timer globale del calendario. <https://github.com/Zillo-star/fantabasket-orzi/commit/1496ef5b92ad0b419c6de4bb6cc34ef8c5382372>.

**Non reintrodurre timer automatici globali o annidati.** Nel `main` analizzato il bug del nesting **non è più presente**. NON attribuire con certezza il picco a questa causa: il difetto c'era anche nei giorni senza picco. L'ipotesi ragionevole è che il 29/10 una scheda sia rimasta aperta più a lungo o che i test del giorno abbiano amplificato le chiamate; **non è provato** dai log.

### 3.2 Modifiche specifiche del 29/10 che meritano audit

| Ora locale circa | Commit | Modifica | Pista da verificare |
|---|---|---|---|
| 11:46 | `e652cdf3e3a5f0aa43bb64298e5048723a8a0cc5` | Aggiunge `upsert` di **punteggio zero per giocatori non a referto** nel motore live | Con un motore ripetuto all'infinito, ulteriori scritture identiche e potenziali conflitti con override manuali |
| 17:52 | `41f75e0485ed86bed89661f8850f9ca4a01e7690` | Cambi nel caricamento delle partite al cambio giornata | Letture aggiuntive sulla navigazione |
| 20:36 | `63add913857bf64d7d1ddfba6b22a91230d21091` | Nuova discovery WebPont automatica nell'area amministrazione | Fetch esterni ripetuti durante test/operazioni admin |
| 20:41 | `399504237121d55b917f94e486f9782ad8c321f5` | Upsert automatico `webpont_game_links` | Scritture aggiuntive |
| 20:53–21:05 | `8b81112...`, `64589f5...`, `0daf964...` | Collegamento discovery e lettura collegamenti WebPont nel frontend | Percorso fallback e ridondanze |

Link utili:
- <https://github.com/Zillo-star/fantabasket-orzi/commit/e652cdf3e3a5f0aa43bb64298e5048723a8a0cc5>
- <https://github.com/Zillo-star/fantabasket-orzi/commit/63add913857bf64d7d1ddfba6b22a91230d21091>
- <https://github.com/Zillo-star/fantabasket-orzi/commit/399504237121d55b917f94e486f9782ad8c321f5>

Alcune operazioni sono **scritture**, ma ricordare che l'Egress PostgREST misura soprattutto **byte trasferiti al client**. Una `upsert()` senza `.select()` non restituisce normalmente tutta la riga, quindi non basta a spiegare da sola 3,191 GB. Cercare anche letture grandi, ripetitive e risposte di errori.

## 4. Difetti/fragilità nella versione corrente: verifica e risoluzione

I riferimenti di riga seguenti provengono dall'`../index.html` del 12/11/2026: **potrebbero spostarsi**. Cerca i simboli, non fare patch basate solo sui numeri di riga.

### P0 — Ridurre il numero di esecuzioni live e impedire la sovrapposizione

1. `window.loadLiveFantasyScores = async function()` (circa riga **7800**): è un motore pesante. Legge `matchdays`, `league_matches`, `real_games`, `players`, `lineups`/giocatori, collegamenti WebPont, statistiche, punteggi; può fare molte `upsert`/`update` sulle tabelle `fantasy_scores`, `fantasy_coach_scores`, `league_matches`. Può processare più giornate con deadline scaduta, non soltanto quella in vista; include il caso recuperi/posticipi.
2. `calendar()` (circa riga **15193**) termina, dopo il rendering, con un `setTimeout(...,100)` che **chiama `window.loadLiveFantasyScores()`** (circa **19036–19047**). La semplice apertura/riapertura del calendario può quindi lanciare calcoli e scritture. Non c'è lì una protezione evidente da chiamate contemporanee in altre schede.
3. Inventaria **tutti** gli altri punti di chiamata a `loadLiveFantasyScores`/`refreshLeagueMatchScoresLive`: admin, navigation, elementi DOM, script inline, timers, service worker, reload, focus/visibility, inizializzazione. Identifica quale processo mantiene *oggi* i punteggi aggiornati: dopo la rimozione dei timer del 12/11, NON dare per scontato che il live ogni minuto sia ancora implementato. Questa è una **verifica funzionale critica**.
4. In primo luogo implementa un **single-flight guard lato singola scheda** (o equivalente) per bloccare esecuzioni concorrenti e garantire reset del flag in `finally`; non introdurre race/rejection senza gestione, non nascondere errori. Valuta deduplica di chiamate ravvicinate e throttling in base a rilevanza della giornata, ma **non** mascherare un problema architetturale con un timer indiscriminato.
5. **La guard lato browser NON risolve la concorrenza tra browser/dispositivi.** Per il disegno definitivo va previsto un unico job di aggiornamento backend/autorizzato (Cloudflare Cron Triggers / Supabase scheduled jobs o alternativa verificata), con lock/lease, idempotenza e limite di frequenza. Non trasportare il motore client sul Worker incollandolo alla cieca: verificare accessi al DB, dominio dell'algoritmo, gestione di errori, backoff, costi e vincoli Cloudflare.
6. Il frontend pubblico dovrebbe idealmente **leggere** i punteggi già calcolati e non poter avviare scritture globali. Prima di eliminare il trigger di `calendar()`, realizzare/validare una fonte affidabile di aggiornamento o una procedura admin esplicita; evitare che le classifiche smettano di aggiornarsi.

### P0 — Verificare e preservare `manual_override`

Nel motore live ci sono scritture dirette `fantasy_scores.upsert(...)` anche quando un giocatore non appare nel tabellino (`saveZero` circa riga **9694**) e quando ha uno score normale (circa **9916**). Esiste `manual_override` nei punteggi: il calendario la seleziona e il motore legge i punteggi manuali.

**Testare esattamente la semantica esistente:** non sovrascrivere gli override manuali con upsert live, non sovrascrivere 0 valido con dato non disponibile, non accumulare doppioni, non perdere i moltiplicatori di capitano/ruolo. Verificare chiavi di conflitto `manager_id,matchday_id,player_id` e la diversa natura di punteggi giocatore e allenatore. Soprattutto, controllare che l'override sia per **manager+giornata+giocatore**, non accidentalmente per il solo `player_id` quando si costruiscono mappe.

Se bisogna cambiare modalità di persistenza, definire un test con fixture di punteggio manuale e uno con un giocatore non a referto, e solo poi cambiare il codice. Questo è un potenziale **bug di correttezza**, non solo di costo.

### P1 — Ridurre il polling delle notifiche

- `home()` circa righe **4831–4839**: `updateDashboardNotification()` subito, poi `setInterval(updateDashboardNotification, 5000)`.
- `updateDashboardNotification()` circa righe **4938–4988**: esegue `db.from("notifications").select("id", {count:"exact", head:true}).eq("manager_id",me.id).eq("read",false)` e **solo dopo** cerca il badge DOM. Se la dashboard non è più mostrata, alcune esecuzioni possono comunque interrogare Supabase.
- 5 secondi equivalgono a **720 chiamate/ora = 17.280 al giorno per una scheda sempre attiva**. Non sono misure di traffico reale, ma moltiplicazioni teoriche. Il payload può essere piccolo: problema di frequenza/log più che unica spiegazione dell'Egress.
- Obiettivo minimo: **60–120 secondi** mentre dashboard attiva/visibile, oppure aggiornamento su apertura/rientro. Fermare timer su cambio schermata, logout, chiusura sessione; controllare `document.visibilityState` e presenza del badge **prima** della query; evitare molteplici timer e garantire cleanup. Se conviene usare realtime/push, valutare costo e complessità prima di sostituire il polling.
- Non cambiare UX delle notifiche in modo drastico: il badge deve aggiornarsi entro un intervallo accettabile e subito dopo le azioni rilevanti (lettura/nuova notifica, login, ritorno dashboard).

### P1 — Calendario: letture dell'intera stagione e query N+1

- `calendar()` carica molte giornate, manager e partite; usa `matchdayIds` per leggere `lineups` e `fantasy_scores` di **molte giornate** (circa righe **15300–15600**).
- In particolare `fantasy_scores` è filtrata per tutte le giornate (`.in("matchday_id", matchdayIds)`), non per la sola giornata mostrata, pur visualizzandone una alla volta. Prima della modifica del 10/11 era anche filtrata per `manager_id`; verificare se la rimozione sia motivata o un regression che aumenta Egress: commit `1144c3280e7cefeac240bdbd4dcd9e05c43799ce`. Tenere presente che potrebbe servire per mostrare tutte le squadre e classifiche.
- Per ogni giorno viene eseguita una query `count` su `fantasy_scores` dentro un `Promise.all(calendarDays.map(...))` (circa riga **15342**): **N richieste per N giornate**. Evitare N+1 mediante aggregazione/endpoint/RPC appropriato o query unica più piccola, previa verifica delle policy e della correttezza di `savedDays` e della soglia `>=117`.
- La funzione `refreshLeagueMatchScoresLive` (circa riga **20827**) legge dati di punteggi di più giornate, compresa una query senza filtro a `fantasy_scores`. Valutare narrowing per giornate rilevanti.
- Proporre caching degli **archivi immutabili** e invalidazione corretta del live. Non congelare partite rinviate/recuperi, `manual_override`, variazioni di roster o punteggi dopo la chiusura della giornata.
- Ridurre `.select('*')` solo dove effettivamente superflua, verificando tutti gli utilizzi dei campi; evitare regressioni perché il file HTML è monolitico.

### P1 — Scritture idempotenti e batch

- Il motore `loadLiveFantasyScores` può fare `upsert` **giocatore per giocatore** e aggiornare punteggi già uguali. Questo aumenta numero di round-trip, log e possibilità di collisioni fra esecuzioni.
- Confrontare record nuovi con esistenti prima di scrivere; inviare solo i cambiamenti, **batch ragionevoli**, senza superare limiti PostgREST, senza perdere atomicità logica. Usare vincoli unici reali, valutare eventuale RPC transazionale **solo se necessaria e verificata**.
- Non assumere che l'assenza di una riga equivalga a 0; il caso `saveZero` richiede attenzione. Gestire rete fallita, partite non iniziate, dati sportivi incompleti, partita interrotta, posticipi e retry con backoff/limiti.
- Evitare ricalcoli di *tutte* le giornate per ogni aggiornamento. Conservare il comportamento corretto per recuperi e gare in corso.

### P1 — Verifiche RLS e permessi

Nel JS lato browser vi sono tentativi di scrivere dati che riguardano più fantallenatori. Verificare su Supabase, **in sola lettura di metadata** e con credenziali autorizzate, policy RLS per `fantasy_scores`, `fantasy_coach_scores`, `league_matches`, `webpont_game_links` e notifiche. È accettabile che la parte utente faccia query con anon key solo se RLS è corretta; non è accettabile permettere a un utente arbitrario di riscrivere punteggi di tutti tramite API.

Proporre una separazione amministratore/utente/servizio e un job backend autorizzato (se architetturalmente necessario). **Non disabilitare RLS** e non mettere chiavi privilegiate nel frontend. Nessuna modifica alle policy di produzione senza piano e approvazione.

### P2 — WebPont Worker e traffico Cloudflare

- Il Worker esterno riceve discovery, scarica molte pagine HTML, parsa eventi e restituisce JSON; il frontend fa discovery in più intervalli (`?discover=1`) e talvolta richieste `?game=...`.
- Verificare se le discovery sono ripetute in ogni aggiornamento live e se la cache `window.liveWebPontDiscovery` viene gestita correttamente; nel browser una cache di sessione NON è cache condivisa fra utenti.
- Proporre **TTL conservativo** diverso per partite live e archiviate; per live non usare `no-store`/cache perpetua indiscriminatamente, valutare il trade-off con correttezza risultati. Non interrogare centinaia di ID ogni minuto se gli abbinamenti sono già salvati.
- Misurare separatamente richieste **Cloudflare → WebPont** e **browser/Worker → Supabase**. Non attribuire Egress Supabase al Worker senza prova di richieste dal Worker a Supabase.

## 5. Indagine forense del 29 ottobre: cosa resta da verificare

Non abbiamo request log storici del 29/10. Codex deve ricostruire **il comportamento potenziale** della versione pubblicata allora, senza pretendere certezza causale.

1. Identifica esattamente i commit del **28, 29, 30, 31 ottobre, 1 novembre, 12 novembre** (fuso `Europe/Rome`, Git spesso UTC) e i relativi deployment **se** è possibile accedervi; un commit non prova che il sito fosse già deployato.
2. Confronta `git diff <ultimo-28-ott>..<ultimo-29-ott>` e i commit singoli del 29; verifica regressioni introdotte e cancellate nella stessa giornata.
3. Focalizza su: timer, eventi ripetuti, `.select('*')`, `.in(... tutte le giornate)`, query in loop, autosalvataggi, discovery, `loadLiveFantasyScores`, `refreshLeagueMatchScoresLive`, query a `fantasy_scores`/`lineup_players`/`lineups`/`league_matches`.
4. Verifica se su date con partite live o recuperi il numero di giornate elaborate aumenta (soglie e condizioni `lineup_deadline`, `completed`, `hasTodayOrFutureGame`).
5. Ricostruisci l'ordine delle chiamate quando una pagina resta aperta per 5, 30, 60 minuti e più schede sono aperte. **Usa un fake timer e un mock Supabase/Worker, non il backend reale.** Valuta quanti timer, chiamate e richieste potenziali si accumulano. Evita di spacciare la simulazione per un dato misurato.
6. Valuta il possibile contributo del salvataggio `saveZero` del 29/10: incrementa le scritture ma una upsert senza `.select()` non spiega da sola 3,19 GB di risposta API; cercare risposte più grandi o query ripetute.
7. Se è disponibile solo il dato aggregato (3,191 GB PostgREST il 29/10), riferisci un **grado di confidenza** per le cause, non una certezza. Il bug storico dei timer annidati resta un candidato forte e già corretto.

Comandi d'esempio, adattare alla cronologia reale del repo:

```bash
git status --short
git branch --show-current
git log --date=iso-local --since='2026-10-27' --until='2026-11-03' --oneline --all -- index.html
git show b58ba9ffc18592bbc607df6bc66d715667041055 -- index.html
git show e652cdf3e3a5f0aa43bb64298e5048723a8a0cc5 -- index.html
git grep -n 'loadLiveFantasyScores' -- index.html
git grep -n 'setInterval' -- index.html
```

## 6. Piano di lavoro obbligatorio, ordinato per rischio

### Fase A — Baseline/strumentazione (prima di patch invasive)

- Crea inventario di tutte le chiamate PostgREST in `../index.html`, con: tabella, operazione, filtri, trigger, cadenza, eventuale loop, payload/numero di righe atteso, possibilità di cache, impatto su punteggio.
- Crea inventario di timers, listener, debounce, navigazioni, `setTimeout`, page visibility, service worker e chiamate automatiche.
- Identifica quale funzionalità assicura **oggi** il live ogni minuto. Documenta gap funzionali introdotti dalla rimozione dei vecchi timer.
- Prepara una strumentazione **opt-in e solo in sviluppo** per contare richieste/risposte per endpoint, durata e dimensione (via mock, Performance API / DevTools HAR redatto oppure wrapper non invasivo). Non registrare token, Authorization, cookie, payload personali né URL completi con credenziali. Separare request count, response bytes, bytes/log; misurare senza colpire produzione.
- Salva un report baseline e un test riproducibile prima/dopo.

### Fase B — Correzioni immediate e conservative (implementare)

- Notifiche: riduci il polling a **60 secondi** (configurabile), cancella il timer cambiando schermata/logout, evita query se il badge non è visibile o scheda nascosta; refresh iniziale e dopo eventi rilevanti.
- Aggiungi `single flight` robusto al motore live lato browser, senza cambiare formule e senza lasciare flag bloccati dopo errori; se esistono eventi ravvicinati deduplica promesse esistenti. Documenta che è una mitigazione **per scheda**, non un lock globale.
- Se il calendario avvia il motore live, non eliminare il trigger in modo cieco: prima implementa un percorso di aggiornamento compatibile o limitalo a una vera azione autorizzata, e verifica che l'utente visualizzi ancora i risultati live entro circa **60 s**. Fai la modifica più piccola che mantenga quel requisito e riduca gli aggiornamenti duplicati.
- Non modificare formule sport/fantasy, layout, schema DB o Worker in questa PR se non strettamente necessari per la correzione.
- Preferisci diff piccoli e reversibili. Se sono necessarie API server-side non disponibili, limita l'implementazione a fix isolati, aggiungi documentazione e *non lasciare un live rotto*.

### Fase C — Ottimizzazioni dati (eventualmente in PR separata)

- Elimina query per tutte le giornate quando è richiesta una sola giornata; preserva la navigazione e il conteggio giornate archiviate.
- Elimina N+1 delle query `count` del calendario usando una strategia efficiente e verificabile.
- Limita le letture su `fantasy_scores` e altre tabelle ai soli record necessari; rispetta limiti di paginazione/risultato PostgREST.
- Batch gli upsert, confrontando dati precedenti e nuovi, e preserva `manual_override` e chiavi uniche.
- Proponi cache di dati storico/partite già concluse; gestisci recuperi/posticipi/override.
- Se aggiungi query aggregate o RPC SQL, spiega migrazione, compatibilità, permessi e piano rollback. Nessun deploy di migrazioni in automatico.

### Fase D — Soluzione strutturale (proposta tecnica distinta)

Redigi una mini-ADR per spostare l'aggiornamento periodico verso un **solo job backend** ogni minuto (orario configurabile) eseguito con credenziali sicure e permessi minimi, e mantenere i client in sola lettura. L'ADR deve confrontare almeno:

- Cloudflare Workers Cron Triggers / job dedicato;
- Supabase scheduled jobs/pg_cron/Edge Functions se effettivamente disponibili nel piano e architettura;
- eventuale soluzione di scheduling gestita dall'hosting attuale.

Definire: job lock cross-process (Postgres advisory lock o equivalente sicuro), timeout massimo, retry con exponential backoff+jitter, rate limiting WebPont, idempotenza, logging essenziale, cache di discovery, esecuzioni solo per partite attive, aggiornamenti differenziali, invalidazione e osservabilità, protezione RLS/permessi. Non adottare una soluzione solo perché nominalmente gratuita: validare quote attuali di Cloudflare e Supabase.

## 7. Test e criteri di accettazione (obbligatori)

Eseguire `npm ci` se c'è lockfile, altrimenti usare il metodo corretto del progetto, poi `npm run build`. Non aggiungere infrastruttura pesante di test se non necessaria; piccoli test Node/browser sono accettabili. `../index.html` contiene JS inline: validare sintassi, build e runtime, non soltanto formattazione.

Test minimi da progettare e realizzare con mock/fake timer:

1. **Polling notifiche:** dopo il mount nessun duplicato; un solo timer massimo; almeno una richiesta iniziale; nessuna richiesta a dashboard assente; nulla durante `visibilityState=hidden`; cleanup su uscita/logout; nuove notifiche e badge coerenti.
2. **Ricalcolo concorrente:** più chiamate quasi simultanee non provocano più processi pesanti nella stessa scheda; una chiamata fallita sblocca il motore per richieste future; le `Promise` sono gestite senza `unhandledrejection`.
3. **Separazione view/write:** aprire calendario 5 volte o cambiare giornata non deve produrre 5 scritture globali identiche; l'utente visualizza dati attendibili; l'update autorizzato resta disponibile.
4. **Live e recuperi:** giornata con partite iniziate, future, rinviate, concluse e recuperi; confronto del risultato atteso con il codice originale e SLA aggiornamento circa 60 secondi.
5. **Override manuali:** risultato manuale non cancellato da sincronizzazione live o da `saveZero`; verifica combinazione `manager_id`, `matchday_id`, `player_id`; capitano/sesto/riserva/allenatore, malus/bonus invariati.
6. **Idempotenza:** due esecuzioni con statistiche immutate => nessuna scrittura duplicata non necessaria nella versione ottimizzata; due cambi veri => aggiornamento corretto.
7. **Volume:** benchmark riproducibile prima/dopo con fake server: `API calls totali`, `PostgREST calls`, `bytes di risposte` e numero di `upsert`; misurare scenario di 1 e 8 utenti, una scheda per utente e una scheda lasciata aperta a lungo. Riportare numeri **misurati sui mock**, distinti da proiezioni reali. Non introdurre richieste di carico sul database Free.
8. **Sicurezza:** utente normale non può cambiare punteggi globali, niente service role esposta, verificare RLS con staging; nessun token nei log/test.
9. **PWA/service worker:** assicurare che dopo deploy non restino attivi vecchi asset HTML/JS con timer difettosi a causa di caching; verificare `../sw.js` e strategia di aggiornamento, senza introdurre forced reload aggressivi.
10. **Regression smoke test:** login, home, calendario, classifiche, formazioni, cambio giornata, notifiche, visualizzazione punteggi, flussi admin, nessuna modifica CSS non richiesta.

**Criterio di accettazione principale:** stesso comportamento fantasy e aggiornamento live utile, **meno richieste**/scritture superflue, nessun timer annidato, nessuna esecuzione concorrente non controllata, test riproducibili e nessun cambiamento a DB/produzione.

## 8. Deliverable richiesti a Codex

1. **`docs/supabase-egress-audit.md`** (o nome equivalente): cause note, ipotesi, tabella endpoint/query, cadenze, rischi, misure e confronto con il 29 ottobre.
2. Codice corretto, su branch dedicato, con **diff minimo e spiegazione di ogni modifica**.
3. Test/test script e istruzioni esecuzione; risultati reali di `npm run build` e test. Dichiarare chiaramente se test browser/db reali non sono stati eseguiti e perché.
4. **`docs/live-update-architecture.md`**: disegno a medio termine del job unico backend, scheduler, locking, permessi, RLS, cache, failure modes, possibili costi, piano di migrazione e rollback.
5. Almeno un **commit dedicato** (preferibilmente separare `fix` da `docs`/`test`) e una **draft PR** con checklist per il proprietario. Non modificare `main` né fare deploy.
6. Rapporto finale in italiano con: SHA di partenza, branch, commit SHA, link PR, cosa cambia, test superati/falliti, impatto misurato (se disponibile), cosa resta da fare, rischi prima del merge.

**Se una modifica rischia di interrompere il live**, non applicarla arbitrariamente: fai i fix indipendenti, documenta il blocker e proponi l'ordine corretto di migrazione. Ogni modifica al calcolo deve essere confrontata con fixture di golden output prima/dopo.

## 9. Cosa NON fare

- NON cancellare righe/tabelle/progetto Supabase per azzerare la quota Egress: non funziona.
- NON introdurre nuove scritture da frontend pubblico per ovviare al problema.
- NON riportare il timer a 20 secondi o crearne più di uno per ogni browser.
- NON fare stress test su Supabase Free o discovery WebPont in produzione.
- NON attivare o disattivare RLS senza approvazione, né salvare segreti in codice, commit, commenti o log.
- NON modificare formule fantasy, regole di campionato, soglie, punteggi manuali o struttura di stagione per fare una semplice ottimizzazione.
- NON assumere che il commit del 29 fosse subito pubblicato o che il grafico aggregato dia l'ora esatta del problema.
- NON dichiarare risolto il picco storico solo perché un bug è stato corretto dopo.
- NON fare merge/deploy automatici. Il proprietario deve verificare in staging e approvare.

## 10. Sequenza suggerita per il primo messaggio di Codex

> Ho letto l'obiettivo: individuare e mitigare le cause di Egress Supabase anomalo mantenendo i punteggi live. Controllo il `main` corrente, documento trigger/timer/query e verifico con test locali/mock le anomalie già segnalate. Eseguo solo cambi a basso rischio su branch separato, con commit e draft PR, senza deploy né modifiche al database. Nel resoconto distinguerò problemi comprovati e ipotesi relative al 29 ottobre.

**Inizia esaminando il repository e l'ultima versione reale del file, poi passa immediatamente alla mappa delle richieste Supabase e al test delle guard anti-concorrenza.**
