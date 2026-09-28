# Overenie vydania 1.1.0 — 28. 9. 2026

- Cloudflare Worker je nasadený na `https://faktury-app.freetransfer-online.workers.dev`.
- Skutočné Apple prihlásenie vo webe vytvorilo overený účet vlastníka. Až následne dostal rolu správcu a obe základné šablóny.
- Skutočné spustenie dennej zálohy v administrácii úspešne zapísalo súkromné R2 snapshoty a stav `complete` pre 1 účet.
- Neprihlásené volania `/api/me`, `/api/invoices` a `/api/admin/users` vracajú 401. Produkčný `/__preview/login` vracia 404.
- TypeScript kontrola a 32 webových testov prešli. Test obnovy skutočne načítal R2 snapshot do vyprázdnenej testovacej databázy a porovnal obsah; naplnenú databázu odmietol.
- 60 natívnych XCTest testov prešlo. Samostatné PDF overenie potvrdilo jedno- aj viacstranové PDF, SK/CZ QR, diakritiku, sumy a uloženie/načítanie databázy.
- Npm audit pri vydaní: 0 zraniteľností.
- Mac archív má Developer ID podpis, úspešnú notarizáciu, priložený notársky lístok a úspešné posúdenie Gatekeeper. SHA-256 súboru stiahnutého z verejnej download cesty sa zhodoval s lokálnym notarizovaným ZIP.
- Aktualizovaná bola iba `~/Applications/Faktúry.app`. V jej UI je dostupných pôvodných 25 faktúr aj prepnutie do živého cloudového webu. Kontrolné súčty všetkých 4 pôvodných JSON súborov zostali po inštalácii a UI kontrole totožné.
- UI overenie na syntetických účtoch: uloženie poznámky faktúry, náhľad s QR, administrácia, pridelenie druhej šablóny a jej následná dostupnosť v bežnom účte.
- Skutočné Apple prihlásenie v nainštalovanej Mac aplikácii úspešne vrátilo rovnaký účet vlastníka do WKWebView vrátane administrácie. Po riadnom ukončení a opätovnom spustení aplikácie zostalo prihlásenie zachované. Kontrolné súčty všetkých 4 pôvodných JSON súborov zostali totožné aj po tejto kontrole.

Pôvodná lokálna databáza sa automaticky neimportuje do cloudu. Cloudový účet začína prázdny. Screenshoty, PDF, kontrolné súčty, zálohy a zostavené súbory sú lokálne v ignorovanom `output/`, nie v Gite.
