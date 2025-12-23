# Mummikopp Samler

En installérbar PWA (Progressive Web App) for å registrere og holde oversikt over Mummikopp-samlingen din.

## Funksjoner
- **Oversikt**: Rutenett og listevisning av samlingen.
- **Registrering**: Legg til kopper med bilde, verdi, tilstand, etc.
- **Statistikk**: Total verdi og antall.
- **Offline-støtte**: Fungerer uten nett (lesing og registrering).
- **Deling**: Del samlingen din med en offentlig lenke.
- **PDF**: Generer samlersertifikat og lister.

## Oppsett med Supabase

Denne appen bruker Supabase som backend. Følg disse stegene for å sette opp:

1. **Opprett prosjekt**: Gå til [Supabase.com](https://supabase.com) og lag et nytt prosjekt.
2. **Database**: 
   - Gå til `SQL Editor` i Supabase.
   - Kopier innholdet fra filen `supabase_schema.sql` i dette prosjektet.
   - Kjør scriptet for å opprette tabeller og sikkerhetsregler.
3. **Lagring (Bilder)**:
   - Gå til `Storage` i Supabase.
   - Lag en ny "public" bucket med navnet `cup-images`.
   - *Viktig*: Sørg for at bucketen er satt til "Public" slik at bildene kan vises i appen.
4. **Koble til appen**:
   - Gå til `Project Settings` -> `API` i Supabase.
   - Kopier `Project URL` og `anon` (public) nøkkelen.
   - Åpne `app.js` og erstatt `SUPABASE_URL` og `SUPABASE_KEY` øverst i filen med dine verdier.

## Kjøring og Installering

### Lokal kjøring
Du kan kjøre appen ved å åpne `index.html` i en nettleser, men for at Service Worker (offline-støtte) skal fungere optimalt, bør du bruke en lokal server (f.eks. Live Server i VS Code).

### Deploy (Vercel/Netlify)
Dette prosjektet er klart for "static hosting".
- **Netlify**: Dra og slipp hele mappen inn i Netlify Drop.
- **Vercel**: Importer som et statisk prosjekt.

### Installere som app
Åpne nettsiden på mobilen (Safari på iOS eller Chrome på Android) og velg "Legg til på Hjem-skjerm" for å installere appen.
