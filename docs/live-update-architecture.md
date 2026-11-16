# ADR proposta: un solo aggiornamento live autorizzato

Stato: **proposta, non implementata né pubblicata**. 16/11/2026.
Collegata all'[audit](supabase-egress-audit.md). Nessuna migrazione SQL in questa PR.

## Problema e obiettivo

L'algoritmo scrive punteggi di tutti i manager dal browser. La mitigazione attuale richiede una sessione admin esplicita e limita la concorrenza per scheda/browser. Non garantisce esecuzione a browser chiuso, coordinamento fra dispositivi, autorizzazione API o pubblicazione atomica dei risultati. Il codice Worker WebPont e lo schema/RLS reali non sono disponibili per un porting affidabile.

Obiettivo: un job unico ogni minuto durante le partite rilevanti, indipendente dal numero di spettatori. Client ordinari leggono soltanto risultati autorizzati e metadati aggiornamento. Nessuna formula fantasy cambia. Il passaggio richiede una PR separata, staging e autorizzazione esplicita di migrazione/deploy.

## Alternative e vincoli verificati nella documentazione

Fonti consultate il 16/11/2026; le quote effettive dei singoli account restano da verificare.

| Opzione | Compatibilità minuto | Vantaggi | Vincoli / costo da verificare |
|---|---|---|---|
| Worker dedicato + Cloudflare Cron Trigger | Espressione ogni minuto, handler `scheduled` | Separato dal frontend, vicino all'integrazione WebPont | Il limite CPU Free per Cron è molto stretto (10 ms nella documentazione consultata): parsing centinaia di HTML può non rientrare. Misurare CPU/subrequest, piano, timeout e invocazioni. Non incollare il monolite né alterare il Worker esistente |
| Supabase Cron (`pg_cron`) + `pg_net` → Edge Function | Scheduling disponibile; verificare estensioni attive e piano | Lock, dati e aggregazioni nello stesso DB; segreti in Vault | Servono funzioni/ruoli/grant verificati. Edge Free documenta 150 s wall time, insufficiente come target se si vuole evitare sovrapposizione ogni minuto. Invocazioni ogni minuto tutto il mese ~43.200/30 giorni, oltre al resto del progetto; considerare compute, egress e log, non solo invocation quota |
| Vercel Cron + funzione server | Hosting identificato dagli stati GitHub | Un solo provider per UI e job | Hobby limita a esecuzione giornaliera, quindi non soddisfa il requisito minuto. Valutare piano abilitato, funzione server oggi assente e relativi costi prima di scegliere; Pro/Enterprise consentono frequenze maggiori secondo documentazione |

Fonti: [Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Cloudflare limiti](https://developers.cloudflare.com/workers/platform/limits/), [Supabase Cron](https://supabase.com/docs/guides/cron), [scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [limiti Edge](https://supabase.com/docs/guides/functions/limits), [Vercel Cron pricing/limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Scelta proposta: prima misurare un prototipo standalone su staging. Supabase Cron + Edge è candidato per vicinanza ai dati, Cloudflare job dedicato per l'integrazione sportiva; nessuna scelta definitiva finché non sono noti piano, CPU reale, schema e latenza. Vercel Hobby è escluso per il minuto. Non assumere gratuità di alcuna soluzione.

## Contratto del job

- Scheduler UTC ogni 60 s, finestre partita configurabili, includendo recuperi e gare interrotte. Deadline/semantica giornata mantenute come nel motore golden; nessun salto di giorni solo perché vecchi.
- Run ID, revisione algoritmo, timestamp tentativo/successo e contatori sintetici. Nessun roster, nome, payload sportivo intero, token o URL credenziato nei log. Retention breve e configurabile, alert su >2 tick senza successo e su crescita egress/errori.
- Timeout obiettivo 40–45 s; se discovery o parsing non rientrano, separarli in un job meno frequente/queue e riutilizzare gli abbinamenti. Nessun timeout artificiale che liberi un lock mentre il processo continua a scrivere.
- Una sola esecuzione produttiva. Lock PostgreSQL atomico acquisito tramite funzione privilegiata strettamente limitata; una chiamata REST per acquisire advisory lock di sessione e una seconda per rilasciarlo **non sono affidabili** con pool/connessioni differenti.
- Per fetch HTTP lungo: lease persistente con owner/run ID, `expires_at` basato sull'orologio DB, acquisizione condizionale atomica e fencing token monotono. Ogni pubblicazione verifica owner+fencing+scadenza nello stesso commit. Un worker vecchio non può pubblicare dopo aver perso il lease. In alternativa mantenere tutto dentro una vera singola sessione server con advisory lock, dopo verifica del pooling.
- Release in `finally` solo da owner corretto; lease scaduto recuperabile dopo crash. Timeout lato client non equivale ad annullamento DB. Se il DB è indisponibile, nessuna scrittura e risultati precedenti mantenuti con stato stale.

## Dati, idempotenza e correttezza

1. Leggere solo giornate da elaborare e gare attive/recuperi; controllare le chiavi uniche reali. Paginazione stabile anche su snapshot e join, non affidarsi al cap default PostgREST.
2. Discovery conservativa separata dagli score: usare prima `webpont_game_links`, cache condivisa di metadati 5–15 minuti con invalidazione su modifiche admin e miss; rate limit dei miss. Statistiche live TTL 30–60 s; archivio TTL più lungo ma invalidabile su correzione/posticipo/override. Non archiviare per sempre solo in base a `completed`.
3. Fetch WebPont con concorrenza ridotta (es. 2–4, da profilare), timeout per richiesta, limite di richieste per minuto, gestione 429 e `Retry-After`. Circuit breaker durante indisponibilità; niente discovery di centinaia di ID a ogni tick.
4. Validare score, lista giocatori, stato gara e timestamp. Assenza tabellino non è zero; un giocatore assente può essere zero solo con tabellino ritenuto completo dal contratto del provider. Worker attuale da acquisire e analizzare prima di definire questa regola.
5. Engine puro estratto e confrontato con golden fixture: capitano, ruoli, bonus/malus, coach, manuali manager+giorno+player, gare future/concluse/annullate/interrotte, recuperi e finalizzazione. Non unificare chiavi coach diverse senza migrazione approvata.
6. Persistenza differenziale; batch moderati, hash/revisione degli input per giorno e run. Rispettare `manual_override` nel predicato DB al momento della scrittura, non solo nel JSON letto prima.
7. Pubblicazione di punteggi e totali della stessa giornata in transazione o snapshot versionato, mantenendo la versione precedente visibile fino a completamento. RPC transazionale separata con RLS/grant verificati; non tenere transazioni aperte mentre si interroga WebPont.
8. Override admin invalida totali e revisione cache. Nessuna gara può diventare chiusa perché il job non ha ricevuto il tabellino. Aggregati count/savedDays esatti, soglia 117 e regole di avanzamento conservate.

Retry: exponential backoff con jitter, pochi tentativi (es. 2 s/5 s/10 s entro il budget), nessuna seconda run sovrapposta; errori di autenticazione/schema non vengono ripetuti ogni secondo. Dopo timeout o lease perso, abbandonare la pubblicazione e attendere il successivo tick. Metriche: durata, giorni/gare elaborati, righe cambiate, request/response bytes separati per Supabase e provider, lock contend, errori e ultimo successo.

## Autorizzazione e lettura client

Credenziali server in secret store del provider o Vault, mai nel JS pubblico. Preferire ruolo minimo/RPC chiusa rispetto a service-role generale. Endpoint del job autenticato server-to-server, nessun avvio arbitrario dal client. RLS deve impedire a utente normale scritture su `fantasy_scores`, `fantasy_coach_scores`, `league_matches`, link globali e RPC di finalizzazione/crediti; notifiche accessibili solo al destinatario. Verificare anche SELECT policy e permessi funzione. [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

Client: leggere versione + aggiornamento/stato in una query compatta ogni minuto solo sulla vista visibile; ricaricare dettagli del giorno solo se cambia la versione. Aggregare `savedDays` in un endpoint/RPC read-only con corretta visibilità RLS; niente N HEAD per render. Per SLA sport→schermo vicino al minuto, valutare segnale Realtime di sola invalidazione dopo commit o polling compatto più frequente, misurando costo connessioni/egress. Otto utenti non devono generare otto ricalcoli globali.

## Migrazione, criteri e rollback

1. Ottenere schema/indici/policy e Worker sorgente in ambiente autorizzato; verificare estensioni e quote. Non interrogare produzione senza consenso.
2. Creare staging, account admin/utente, dati sintetici e copie anonimizzate autorizzate; definire dataset golden di stagione e tabellini parziali.
3. PR backend/schema separata: engine puro, lease/fencing, publish transazionale, stato aggiornamento, aggregati lettura, policy e privilegi. Revisione SQL prima di eseguirla.
4. Shadow run solo in staging, nessuna doppia scrittura in produzione. Testare crash prima/durante publish, race override, lease scaduto, doppio scheduler e recuperi oltre giornata corrente.
5. Misurare 1/8 client e ora lunga, percentili di latenza, CPU, egress e volume log. Budget costi e alert prima dell'attivazione.
6. Rilascio coordinato autorizzato: fermare sessione admin client, attivare un solo scheduler, verificare ultimo successo e risultati, poi client con lettura versionata. Non rendere i punteggi non aggiornabili tra una fase e l'altra.
7. Rollback: fermare scheduler, preservare dati/override e ultima versione coerente; ripristinare procedura admin esplicita se il ruolo ha ancora i permessi necessari. Tenere una procedura di emergenza server autorizzata se RLS ha già revocato le scritture client. Mai riattivare timer pubblici annidati o ricalcoli per spettatore. Rollback DB separato e approvato, senza cancellazione punteggi.
