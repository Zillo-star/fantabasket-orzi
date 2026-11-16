# Inventario statico PostgREST della baseline

Generato da `1496ef5b92ad0b419c6de4bb6cc34ef8c5382372:index.html`, senza interrogare Supabase.
Tutte le occorrenze letterali `.from("tabella")`: non equivale a conteggio richieste runtime.
Il contesto funzione è euristico (funzione precedente; le funzioni annidate possono comparire).
Filtri/colonne sono descrizioni del codice, non contenuti delle risposte. Le cadenze, loop, dimensioni attese e rischi sono descritti nell'audit principale.

| Riga baseline | Tabella | Operazioni | Contesto vicino | Filtri | Proiezione |
|---|---|---|---|---|---|
| 2907 | `push_subscriptions` | delete | `enablePushNotifications` | eq "manager_id"; eq "endpoint" | `—` |
| 2915 | `push_subscriptions` | insert | `enablePushNotifications` |  | `—` |
| 2962 | `push_subscriptions` | upsert | `syncExistingPushSubscription` |  | `—` |
| 3000 | `push_subscriptions` | delete | `disablePushNotifications` | eq "manager_id"; eq "endpoint" | `—` |
| 3036 | `push_subscriptions` | select | `getPushSubscriptionStatus` | eq "manager_id"; eq "endpoint" | `id` |
| 3198 | `managers` | select | `boot` | eq "email" | `*` |
| 3394 | `notifications` | select | `loadNotificationCount` | eq "manager_id"; eq "read" | `id` |
| 3442 | `notifications` | select | `showNotifications` | eq "manager_id"; limit 30 | `*` |
| 3624 | `notifications` | update | `markNotificationRead` | eq "id"; eq "manager_id" | `—` |
| 3647 | `notifications` | update | `markAllNotificationsRead` | eq "manager_id"; eq "read" | `—` |
| 4082 | `fantasy_scores` | select, select, select, select, select | `home` | eq "manager_id"; eq "manager_id" | `matchday_id,final_score` |
| 4086 | `fantasy_coach_scores` | select, select, select, select | `home` | eq "manager_id" | `final_score` |
| 4090 | `matchdays` | select, select, select | `home` |  | `id,number,lineup_deadline` |
| 4094 | `league_matches` | select, select | `home` |  | `id, matchday_number, home_manager_id, away_manager_id, home_score, away_score, home_points, away_points, completed` |
| 4108 | `managers` | select | `home` |  | `id,name,team_name` |
| 4178 | `fantasy_scores` | select | `home` |  | `matchday_id` |
| 4360 | `fantasy_scores` | select, select, select | `getDayStats` | eq "manager_id"; eq "matchday_id"; eq "manager_id"; eq "matchday_id"; eq "manager_id"; eq "matchday_id" | `player_id, final_score, players( name, surname, position, real_teams(name) )` |
| 4374 | `fantasy_coach_scores` | select, select | `getDayStats` | eq "manager_id"; eq "matchday_id"; eq "manager_id"; eq "matchday_id" | `final_score` |
| 4379 | `lineups` | select | `getDayStats` | eq "manager_id"; eq "matchday_id" | `id` |
| 4406 | `lineup_players` | select | `getDayStats` | eq "lineup_id"; in "role" | `player_id, role, players( name, surname, position, real_teams(name) )` |
| 4879 | `fantasy_scores` | select | `refreshDashboardFantasyTotal` | eq "manager_id" | `final_score` |
| 4896 | `fantasy_coach_scores` | select | `refreshDashboardFantasyTotal` | eq "manager_id" | `final_score` |
| 4945 | `notifications` | select | `updateDashboardNotification` | eq "manager_id"; eq "read" | `id` |
| 5017 | `managers` | update | `saveTeamName` | eq "id" | `—` |
| 5044 | `managers` | select | `saveTeamName` | eq "id" | `*` |
| 5074 | `players` | select | `players` |  | `id,name,surname,position,is_foreign,real_teams(id,name,coach)` |
| 5088 | `rosters` | select | `players` | eq "active" | `player_id,manager_id` |
| 5116 | `managers` | select | `players` | in "id" | `id,name,team_name` |
| 5204 | `real_teams` | select | `players` | not "coach" | `id,name,coach` |
| 5669 | `managers` | select | `roster` |  | `id,name,team_name,credits` |
| 5687 | `rosters` | select | `roster` | eq "active" | `id, manager_id, player_id, purchase_price, active, players( id, name, position, is_foreign, real_team_id, real_teams( name, logo_url ) )` |
| 5722 | `manager_coaches` | select | `roster` | eq "active" | `id, manager_id, purchase_price, active, real_teams( name, coach, logo_url )` |
| 7451 | `fantasy_scores` | select | `showRomaPlayerStats` | eq "matchday_id"; eq "player_id" | `manager_id, raw_score, lineup_multiplier, captain_multiplier, final_score` |
| 7549 | `matchdays` | select | `lineup` |  | `id,number,lineup_open_at,lineup_deadline,status` |
| 7570 | `rosters` | select | `lineup` | eq "manager_id"; eq "active" | `player_id, players( name, surname, position, photo_url, real_team_id, webpont_id, real_teams( name, logo_url ) )` |
| 7817 | `matchdays` | select | `loadLiveFantasyScores` |  | `id, number, lineup_deadline` |
| 7853 | `league_matches` | select | `loadLiveFantasyScores` |  | `id, matchday_number, home_manager_id, away_manager_id, home_score, away_score, home_points, away_points, completed` |
| 7902 | `real_games` | select | `loadLiveFantasyScores` |  | `id, matchday_id, home_team_id, away_team_id, scheduled_at, postponed, cancelled, home:home_team_id( id, name ), away:away_team_id( id, name )` |
| 8248 | `webpont_game_links` | select | `loadLiveFantasyScores` |  | `real_game_id, webpont_id` |
| 8872 | `players` | select | `loadLiveFantasyScores` | eq "active" | `id, name, surname, webpont_id, real_team_id, active, real_teams( name )` |
| 8957 | `lineups` | select | `loadLiveFantasyScores` | in "matchday_id" | `id, manager_id, matchday_id, lineup_players( player_id, role, captain )` |
| 8990 | `manager_coaches` | select | `loadLiveFantasyScores` | eq "active" | `manager_id, real_team_id, purchase_price, active, real_teams( name, coach, logo_url )` |
| 9541 | `fantasy_scores` | select | `loadLiveFantasyScores` | eq "matchday_id"; eq "manual_override" | `player_id, final_score` |
| 9694 | `fantasy_scores` | upsert | `loadLiveFantasyScores` |  | `—` |
| 9916 | `fantasy_scores` | upsert | `loadLiveFantasyScores` |  | `—` |
| 10252 | `fantasy_coach_scores` | upsert | `loadLiveFantasyScores` |  | `—` |
| 10355 | `fantasy_scores` | select | `loadLiveFantasyScores` | eq "matchday_id" | `manager_id, final_score` |
| 10368 | `fantasy_coach_scores` | select | `loadLiveFantasyScores` | eq "matchday_id" | `manager_id, final_score` |
| 10588 | `league_matches` | update | `loadLiveFantasyScores` | eq "id" | `—` |
| 10782 | `matchdays` | select | `loadAllFantasyScores` |  | `id,number,lineup_deadline` |
| 10799 | `lineups` | select | `loadAllFantasyScores` |  | `id, manager_id, matchday_id` |
| 10819 | `lineup_players` | select | `loadAllFantasyScores` |  | `id, lineup_id, player_id, role, captain, players( id, name, surname, real_team_id, real_teams( id, name ) )` |
| 11854 | `fantasy_scores` | upsert | `findWebPontPlayer` |  | `—` |
| 11963 | `fantasy_coach_scores` | upsert | `findWebPontPlayer` |  | `—` |
| 12033 | `real_games` | select | `loadPlayerGames` | eq "matchday_id" | `home_team_id, away_team_id, scheduled_at, postponed, cancelled, home:home_team_id(name), away:away_team_id(name)` |
| 12274 | `lineups` | select | `loadSavedLineup` | eq "manager_id"; eq "matchday_id" | `id` |
| 12338 | `lineup_players` | select | `loadSavedLineup` | eq "lineup_id" | `player_id,role,captain` |
| 13464 | `real_games` | select | `saveLineup` | eq "matchday_id" | `home_team_id, away_team_id` |
| 13511 | `lineups` | select | `saveLineup` | eq "manager_id"; eq "matchday_id" | `id` |
| 13536 | `lineups` | insert, select | `saveLineup` |  | `id` |
| 13567 | `lineup_players` | delete | `saveLineup` | eq "lineup_id" | `—` |
| 13638 | `lineup_players` | insert | `saveLineup` |  | `—` |
| 13738 | `trades` | select | `trades` |  | `*, proposer:proposer_id(name,team_name), receiver:receiver_id(name,team_name)` |
| 13748 | `managers` | select | `trades` | neq "id" | `id,name,team_name` |
| 13806 | `players` | select | `trades` | in "id" | `id, name, surname, position, is_foreign, real_teams(name)` |
| 14193 | `rosters` | select | `loadTradePlayers` | eq "manager_id"; eq "active" | `player_id, purchase_price, players( id, name, surname, position, is_foreign, real_team_id, real_teams(name) )` |
| 14221 | `rosters` | select | `loadTradePlayers` | eq "manager_id"; eq "active" | `player_id, purchase_price, players( id, name, surname, position, is_foreign, real_team_id, real_teams(name) )` |
| 14452 | `players` | select | `checkTradeRoles` | in "id" | `id, name, surname, position, is_foreign, real_team_id, real_teams(name)` |
| 14511 | `rosters` | select | `checkTradeRoles` | eq "manager_id"; eq "active" | `player_id, players( id, name, surname, position, is_foreign, real_team_id, real_teams(name) )` |
| 14551 | `rosters` | select | `checkTradeRoles` | eq "manager_id"; eq "active" | `player_id, players( id, name, surname, position, is_foreign, real_team_id, real_teams(name) )` |
| 14778 | `players` | select | `trade` | in "id" | `id, name, surname, position, is_foreign, real_team_id, real_teams(name)` |
| 14845 | `rosters` | select | `trade` | eq "manager_id"; eq "active" | `player_id, players( id, name, surname, position, is_foreign, real_team_id )` |
| 14867 | `rosters` | select | `trade` | eq "manager_id"; eq "active" | `player_id, players( id, name, surname, position, is_foreign, real_team_id )` |
| 15022 | `trades` | insert, select | `validateRoster` |  | `—` |
| 15087 | `notifications` | insert | `validateRoster` |  | `—` |
| 15199 | `league_matches` | select | `calendar` |  | `id, matchday_number, home_manager_id, away_manager_id, home_score, away_score, completed` |
| 15235 | `managers` | select | `calendar` | in "id" | `id, name, team_name, is_bot` |
| 15261 | `manager_coaches` | select | `calendar` | in "manager_id"; eq "active" | `manager_id, real_team_id, purchase_price, active, real_teams( name, coach, logo_url )` |
| 15294 | `matchdays` | select | `calendar` |  | `id, number, lineup_open_at, lineup_deadline, status` |
| 15342 | `fantasy_scores` | select | `calendar` | eq "matchday_id" | `id` |
| 15459 | `lineups` | select | `calendar` | in "manager_id"; in "matchday_id" | `id, manager_id, matchday_id` |
| 15499 | `lineup_players` | select | `calendar` | in "lineup_id" | `lineup_id, player_id, role, captain` |
| 15527 | `players` | select | `calendar` | in "id" | `id, name, surname, position, real_team_id, real_teams( name, logo_url )` |
| 15561 | `fantasy_scores` | select | `calendar` | in "matchday_id" | `manager_id, matchday_id, player_id, final_score, manual_override` |
| 15601 | `fantasy_coach_scores` | select | `calendar` | in "manager_id"; in "matchday_id" | `id, matchday_id, manager_id, real_team_id, raw_score, final_score, created_at` |
| 15907 | `players` | select | `loadSinglePlayerGameStats` | eq "id" | `id, name, surname, webpont_id, real_team_id, real_teams(name)` |
| 15926 | `real_games` | select | `loadSinglePlayerGameStats` | eq "matchday_id" | `id, matchday_id, home_team_id, away_team_id, scheduled_at, cancelled, home:home_team_id(id,name), away:away_team_id(id,name)` |
| 15986 | `webpont_game_links` | select | `loadSinglePlayerGameStats` | eq "real_game_id" | `webpont_id` |
| 16469 | `fantasy_scores` | select | `findStat` | eq "manager_id"; eq "matchday_id"; eq "player_id" | `raw_score` |
| 19053 | `league_matches` | select | `standings` |  | `*, home:home_manager_id( id, name, team_name, is_bot ), away:away_manager_id( id, name, team_name, is_bot )` |
| 19262 | `managers` | select | `admin` |  | `id,name,credits,is_admin` |
| 19268 | `rosters` | select | `admin` | eq "active" | `id,manager_id,player_id,purchase_price,active,players(name,position,is_foreign,real_teams(name))` |
| 19274 | `players` | select | `admin` |  | `id,name,position,is_foreign,real_teams(name,logo_url)` |
| 19280 | `real_teams` | select | `admin` | not "coach" | `id,name,coach` |
| 19287 | `manager_coaches` | select | `admin` | eq "active" | `id,manager_id,real_team_id,purchase_price,active,real_teams(name,coach)` |
| 19524 | `matchdays` | select | `adminWebPontLinks` |  | `id, number` |
| 19608 | `real_games` | select, select | `loadAdminWebPontLinks` | eq "matchday_id" | `id, scheduled_at, postponed, cancelled, home:home_team_id(name), away:away_team_id(name)` |
| 19620 | `webpont_game_links` | select | `loadAdminWebPontLinks` |  | `real_game_id, webpont_id` |
| 19715 | `webpont_game_links` | upsert | `loadAdminWebPontLinks` |  | `—` |
| 19821 | `webpont_game_links` | upsert | `saveAdminWebPontLink` |  | `—` |
| 19866 | `webpont_game_links` | delete | `removeAdminWebPontLink` | eq "real_game_id" | `—` |
| 19916 | `matchdays` | select | `adminRealGames` |  | `id, number` |
| 20021 | `real_games` | select | `loadAdminRealGames` | eq "matchday_id" | `id, scheduled_at, postponed, cancelled, home_team_id, away_team_id, home:home_team_id( name ), away:away_team_id( name )` |
| 20369 | `real_games` | update | `saveRealGame` | eq "id" | `—` |
| 20426 | `managers` | select | `addCoachToManager` | eq "id" | `credits` |
| 20440 | `manager_coaches` | select | `addCoachToManager` | eq "manager_id"; eq "active" | `id` |
| 20456 | `manager_coaches` | select | `addCoachToManager` | eq "real_team_id"; eq "active" | `id` |
| 20472 | `manager_coaches` | insert | `addCoachToManager` |  | `—` |
| 20515 | `managers` | select | `addPlayerToRoster` | eq "id" | `credits` |
| 20526 | `rosters` | select | `addPlayerToRoster` | eq "manager_id"; eq "active" | `player_id,players(position)` |
| 20536 | `rosters` | select | `addPlayerToRoster` | eq "player_id"; eq "active" | `id` |
| 20547 | `players` | select | `addPlayerToRoster` | eq "id" | `position,is_foreign` |
| 20570 | `rosters` | select | `addPlayerToRoster` | eq "manager_id"; eq "active" | `player_id,players(is_foreign)` |
| 20579 | `rosters` | insert | `addPlayerToRoster` |  | `—` |
| 20599 | `rosters` | select | `removePlayerFromRoster` | eq "id" | `manager_id,purchase_price` |
| 20613 | `rosters` | delete | `removePlayerFromRoster` | eq "id" | `—` |
| 20631 | `managers` | select | `addCoachToRoster` | eq "id" | `credits` |
| 20644 | `manager_coaches` | select | `addCoachToRoster` | eq "manager_id"; eq "active" | `id` |
| 20656 | `manager_coaches` | select | `addCoachToRoster` | eq "real_team_id"; eq "active" | `id` |
| 20668 | `manager_coaches` | insert | `addCoachToRoster` |  | `—` |
| 20699 | `manager_coaches` | select | `removeCoachFromRoster` | eq "id" | `manager_id,purchase_price` |
| 20718 | `manager_coaches` | delete | `removeCoachFromRoster` | eq "id" | `—` |
| 20836 | `matchdays` | select | `refreshLeagueMatchScoresLive` |  | `id, number` |
| 20867 | `league_matches` | select | `refreshLeagueMatchScoresLive` |  | `id, matchday_number, home_manager_id, away_manager_id` |
| 20892 | `fantasy_scores` | select | `refreshLeagueMatchScoresLive` |  | `manager_id, matchday_id, final_score` |
| 20916 | `fantasy_coach_scores` | select | `refreshLeagueMatchScoresLive` |  | `manager_id, matchday_id, final_score` |
| 21063 | `league_matches` | update | `addScore` | eq "id" | `—` |
