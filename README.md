# Blackjacked — online

1v1 blackjack combat, nu online: accounts, een globaal klassement (Glicko-2 —
"Degen-rating"), vrienden, uitdagingen met meldingen, en live realtime
matches. Next.js 14 (App Router) + Supabase (Auth, Postgres, Realtime),
gebouwd om op Vercel te draaien.

## Architectuur in het kort

- **`src/lib/game/engine.ts`** — alle pure spellogica (kaarten, schade,
  classes, perks, bots, Glicko-2, ranks, achievements). Exact dezelfde
  regels als de originele lokale versie.
- **`src/lib/game/reducer.ts`** — de server-autoritaire match-reducer. Een
  client stuurt alleen *intenties* (BET/CHOOSE/...); de server bepaalt zelf
  wie er aan zet is (via de ingelogde sessie, nooit via wat de client
  beweert) en past de enige geldige uitkomst toe.
- **`src/app/api/matches/[id]/action/route.ts`** — het ene endpoint waar
  elke speelactie doorheen gaat. Bij een bot-tegenstander speelt de bot hier
  ook meteen zijn beurt.
- **`src/lib/game/finalize.ts`** — rating/tokens/achievements worden hier
  precies één keer per match bijgewerkt, met de `service_role`-key (omzeilt
  Row Level Security bewust — dit is de enige plek die dat mag).
- **`supabase/migrations/0001_init.sql`** — volledig schema + RLS-policies.
  Spelers kunnen zelf nooit hun rating/tokens/perks aanpassen: die kolommen
  zijn met een column-level `GRANT` afgeschermd voor de ingelogde rol, dus
  zelfs een lekke RLS-policy zou het niet toelaten.
- **Realtime**: de matchpagina abonneert op wijzigingen in de `matches`-rij
  (Supabase Realtime), dus beide spelers zien dezelfde stand zonder te
  hoeven verversen.

## Nieuw in deze update

- **Match opgeven** — een "Match opgeven"-knop (met bevestiging) tijdens een
  live potje tegen een vriend. Telt als verlies, niet mogelijk tegen een bot
  (daar sluit je gewoon het tabblad).
- **Idle-timeout** — als een tegenstander 45 seconden niet reageert, past de
  server automatisch een veilige standaardkeuze toe (geen inzet / staan) zodat
  een match nooit voor altijd kan vastlopen omdat iemand wegloopt.
- **Rematch-knop** — na een potje tegen een vriend meteen een nieuwe
  uitdaging sturen.
- **Auto-skip bij 0 chips** — heeft een speler (of allebei) geen chips meer
  deze ronde, dan wordt de inzet-vraag overgeslagen in plaats van een
  betekenisloze "geen inzet"-klik te vragen.
- **Bredere bot-moeilijkheidscurve** — bot 1 is merkbaar makkelijker, bot 10
  (The House) merkbaar moeilijker, alles ertussen herschaald. Voortgang
  (`campaign_pos`) stond al in de database en blijft gewoon bewaard.
- **Chat tijdens 1v1-potjes** — een chatbubbel rechtsonder tijdens een live
  match tegen een vriend, realtime, alleen zichtbaar voor jullie twee.

Alle data start leeg — er is niets te resetten, want dit is een compleet
nieuwe database.

## Wat al gedaan is

- Volledig project gebouwd en getest: `npm install`, `npx tsc --noEmit` en
  `npx next build` draaien allemaal zonder fouten (21 routes gegenereerd).
- De spellogica is 1000+ keer gesimuleerd (willekeurige PvP- en
  campaign-potjes, inclusief double/split/forfeit/auto-skip) zonder fouten:
  geen vastlopers, geen negatieve HP/chips, geen winnaar zonder 2
  rondewinsten.
- Alle code zit in deze repository, klaar om te pushen.

## Resterende handmatige stappen

Dit zijn exact de stappen die ik zelf niet kon uitvoeren (geen toegang tot
jouw accounts):

### 1. Supabase-project aanmaken
1. Ga naar **supabase.com** → **New project**.
2. Kies een naam, wachtwoord voor de database, en een regio.
3. Wacht tot het project klaar is (±2 min).

### 2. Databaseschema uitvoeren
1. In het Supabase-dashboard: **SQL Editor** (linkermenu) → **New query**.
2. Open lokaal het bestand `supabase/migrations/0001_init.sql` uit deze
   repository, kopieer de volledige inhoud, plak in de SQL Editor, klik
   **Run**. Dit maakt alle tabellen, policies en de auto-profiel-trigger aan.
3. Herhaal met een **nieuwe query** voor `supabase/migrations/0002_chat.sql`
   (de matchchat-tabel). Volgorde is belangrijk: eerst 0001, dan 0002.

### 3. E-mailbevestiging (optioneel maar aangeraden)
1. **Authentication** → **Providers** → **Email**: staat standaard aan.
2. Voor productie: **Authentication** → **URL Configuration** → zet
   **Site URL** op je latere Vercel-domein (bv. `https://blackjacked.vercel.app`)
   zodat bevestigingsmails naar de juiste plek linken. Dit kun je pas invullen
   ná stap 6, dan hier terugkomen.

### 4. API-sleutels ophalen
1. **Project Settings** → **API**.
2. Noteer:
   - **Project URL** → dit wordt `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → dit wordt `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (onder "Project API keys", klik om te onthullen)
     → dit wordt `SUPABASE_SERVICE_ROLE_KEY` (**geheim, nooit committen**)

### 5. Code naar GitHub pushen
In een terminal, in deze projectmap:
```bash
git init
git add .
git commit -m "Blackjacked online"
```
Maak daarna op **github.com** een nieuwe **lege** repository aan (geen
README/`.gitignore` aanvinken), en volg de instructies die GitHub toont om
je lokale repo te linken en te pushen, bijvoorbeeld:
```bash
git remote add origin https://github.com/JOUW-GEBRUIKERSNAAM/blackjacked.git
git branch -M main
git push -u origin main
```

### 6. Deployen op Vercel
1. Ga naar **vercel.com** → **Add New** → **Project**.
2. Kies **Import Git Repository** en selecteer de GitHub-repo van stap 5.
3. Bij **Environment Variables**, voeg deze drie toe (waarden uit stap 4):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Klik **Deploy**.
5. Na deployment krijg je een URL zoals `https://blackjacked-xxxx.vercel.app`.

### 7. Site-URL afronden in Supabase
1. Terug naar **Authentication** → **URL Configuration** in Supabase.
2. Zet **Site URL** op je Vercel-URL uit stap 6.
3. Voeg onder **Redirect URLs** toe: `https://JOUW-VERCEL-URL/auth/callback`.

### 8. Testen
1. Open je Vercel-URL, registreer een account, bevestig via de mail.
2. Log in, speel een campaign-potje tegen een bot.
3. Maak een tweede account (ander e-mailadres) in een incognitovenster, voeg
   elkaar toe als vriend, daag elkaar uit, en speel live tegen elkaar.

Dat is alles — vanaf hier draait de app volledig zelfstandig op Vercel +
Supabase.
