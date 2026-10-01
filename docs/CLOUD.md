# Prevádzka INVOY

## Architektúra a hranice

`web/` obsahuje React/Vite klienta a Hono Worker. D1 `faktury-app` a R2 `faktury-app-private` používajú jurisdikciu EÚ; Workers bežia v globálnej sieti Cloudflare. R2 nemá verejný prístup. Jediná verejná cesta k R2 objektu je presne nakonfigurovaný inštalačný ZIP `/download/mac`. Zálohy sú dostupné len pod identitou prihláseného účtu.

API získava vlastníka z overenej serverovej session. Nikdy neprijíma vlastníka faktúry z tela požiadavky. Každý prístup k faktúre, histórii a exportu používa `user_id` zo session. Rola správcu oprávňuje spravovať používateľov a šablóny; nedáva prístup k cudzím faktúram cez aplikačné API. Prevádzkovateľ s Cloudflare oprávneniami má technický prístup k databáze. Nejde o koncové šifrovanie.

Administrácia zobrazuje pri každom účte počet všetkých vytvorených faktúr vrátane koša, počet aktuálne uložených odberateľov a poslednú zaznamenanú online aktivitu v časovom pásme Europe/Bratislava. Kliknutie na celý riadok (alebo Enter/medzerník) otvorí veľký formulár na úpravu stavu a šablón. Mac otvára tú istú administráciu, preto táto úprava nevyžaduje novú verziu natívnej aplikácie.

`users.last_seen_at` sa aktualizuje pri overenej API požiadavke najviac raz za minútu bez zmeny fakturačných dát a verzie profilu. Viditeľný web posiela každú minútu `/api/activity`, Mac využíva existujúcu synchronizáciu. Nejde o presný čas odhlásenia. Staršie návštevy sa spätne neodhadujú; dovtedy je hodnota neznáma. Čas zostáva zachovaný po odhlásení a v riadiacej zálohe; staršie zálohy bez tohto poľa sa dajú naďalej obnoviť. Migráciu `0006_user_activity.sql` treba aplikovať pred nasadením Workeru.

Prihlásenie overuje podpis Apple JWT, issuer, audience, expiry a nonce. Jednorazový OAuth state je viazaný na HttpOnly cookie konkrétneho prehliadača. Session je 30-dňová, token je v D1 len ako SHA-256 hash. Apple refresh token je AES-GCM šifrovaný a overuje sa najviac raz denne. Pozastavenie účtu vymaže všetky jeho sessions. API zápisy vyžadujú rovnaký Origin a CSRF token. Cookies sú Secure/HttpOnly; CSP blokuje cudzie skripty, rámce a obrázky zo vzdialených serverov. Obrázky šablón sú obmedzené PNG/JPEG, šablóny neumožňujú vložiť HTML alebo JS.

Mac používa `ASWebAuthenticationSession`, overí jednorazový kód cez dvojminútový handoff viazaný na tajný verifier a session nastaví priamo do WKWebView cookie store. Session sa nevkladá do JavaScriptu. Od verzie 1.1.1 faktúry zobrazuje pôvodné SwiftUI rozhranie. URLSession používa overenú HttpOnly session a rovnakú kontrolu Origin/CSRF; natívne API nemá osobitné oprávnenia. Každý účet má samostatnú lokálnu cache a verzie záznamov. Konflikt sa neprepisuje. Admin sa otvára na webe.

## Doména INVOY

Produkčná adresa je `https://invoy.xyz`, alias `www.invoy.xyz` sa presmeruje so zachovaním cesty a parametrov. Registrar Porkbun používa `olga.ns.cloudflare.com` a `randy.ns.cloudflare.com`; obe domény sú Custom Domains existujúceho Workeru `faktury-app`. Konfigurácia domén aj `APP_ORIGIN` je vo `web/wrangler.jsonc`.

Worker, databáza a súkromný bucket si zachovávajú svoje technické názvy a identifikátory. Pôvodná Workers adresa zostáva funkčná aj počas šírenia DNS; web aj staršie Mac verzie na nej môžu ďalej používať API a Apple callback so samostatne overovaným pôvodným Origin. Cookies sa medzi doménami nekopírujú. Na novej doméne je potrebné nové Apple prihlásenie do toho istého účtu.

Apple Services ID `sk.faktury.web` musí povoľovať `invoy.xyz` a návratovú adresu `https://invoy.xyz/auth/apple/callback`; pôvodnú doménu a callback ponechať kvôli starším Mac verziám. Názvy Apple identifikátorov možno premenovať na INVOY, samotné identifikátory a kľúče sa nemenia.

## Nasadenie

```sh
cd web
npm ci
npm run types
npm run check
npm test
npm run build
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

`wrangler.jsonc` obsahuje identifikátory prostredia, nikdy súkromné kľúče. Potrebné secrets:

- `APPLE_PRIVATE_KEY`: obsah schváleného Sign in with Apple `.p8`.
- `TOKEN_ENCRYPTION_KEY`: 32 náhodných bajtov ako 64 hex znakov.

Apple tím: `2UK483PFM5`, primárna aplikácia `sk.faktury.desktop`, Services ID `sk.faktury.web`. Domain a return URL musia zodpovedať `APP_ORIGIN` a `/auth/apple/callback`. Aktívny kľúč je `9BCA896N9L` (Faktury Web Login). Prvý kľúč `AY7HTA539R` sa nepoužíva: stiahnutie v zabudovanom prehliadači nevrátilo súbor.

Chránené prevádzkové kópie aktuálneho `.p8` a šifrovacieho kľúča sú lokálne v `~/Library/Application Support/sk.faktury.operator` s právami priečinka 700 a súborov 600. Zálohujte ich bezpečným spôsobom mimo repozitára. Strata šifrovacieho kľúča znamená neplatnosť uložených refresh tokenov a potrebu nového prihlásenia, nie stratu faktúr. Kľúče sa nevkladajú do dokumentácie, logov, klientského balíka ani Gitu.

`REGISTRATION_OPEN=true` umožňuje vytvárať iba **pending** účty, bez prístupu k faktúram a šablónam. Aktivácia a šablóny sa prideľujú v administrácii. Roly sa z UI nemôžu meniť. Prvého správcu nastaví prevádzkovateľ v D1 až po overení konkrétneho účtu vytvoreného skutočným Apple prihlásením. Nikdy nepoužívajte pravidlo „prvý návštevník = admin“ alebo e-mail z neovereného klienta.

## Testovanie

`npm test` spúšťa skutočný workerd s izolovanými D1/R2 a syntetickými účtami. Testuje horizontálny aj vertikálny prístup, CSRF, falošné sessions, OAuth browser binding, Mac jednorazový verifier, odobrané šablóny, súbežné ukladanie, históriu, kôš, účtové exporty, denné zálohy a obnovu do prázdnej databázy.

`npm run preview` vytvorí syntetickú ukážku na `http://127.0.0.1:8791/__preview/login`. Parameter `as=owner|alice|bob|pending` mení testovací účet. Tento runner je len lokálny skript, počúva na loopback a nikdy sa neimportuje do Workeru. V produkcii neexistuje testovacie prihlásenie ani obchádzanie Apple identity.

Miniflare 4 je použitý pre stabilné rozhranie testovacieho runnera. Jeho tranzitívne balíky `undici` a `sharp` sú cez npm overrides aktualizované na opravené verzie. `npm audit` pri vydaní nenašiel zraniteľnosti.

## Zálohy a obnova

1. Bežná strata počítača: prihlásiť sa rovnakým Apple účtom. D1 obsahuje aktuálne uložené údaje.
2. Nechcené vymazanie faktúry: obnoviť z Koša. Predchádzajúcu verziu možno otvoriť v Histórii zmien a uložiť ako novú verziu.
3. Denný R2 snapshot: `backups/<user-id>/<YYYY-MM-DD>.json`. Správca môže vyvolať celú dennú zálohu tlačidlom **Spustiť zálohu**. Stav je v `backup_runs` aj administrácii. Nedokončený multipart upload sa neoznačí ako úspešná záloha.
4. Riadiace údaje: `control/<YYYY-MM-DD>.json` obsahuje väzbu Apple identity, role, šablóny a pridelenia. Tento prefix nemá download API. Neobsahuje sessions ani súkromné kľúče.
5. Pri prevádzkovej havárii použite Cloudflare D1 Time Travel alebo obnovu R2 do **novej náhradnej databázy**. Pred zmenou bindingu overte obsah a prihlásenie. Pôvodnú databázu neodstraňujte.

R2 obnova: stiahnite súkromne `control/<day>.json` a zhodné účtové exporty (premenujte ich na `<user-id>.json` do jedného priečinka). Pripravte SQL offline:

```sh
cd web
npx tsx scripts/prepare-recovery.ts /private/path/control.json /private/path/accounts /private/path/recovery.sql
```

Nástroj validuje profily, šablóny, faktúry, čísla verzií a súkromný výstup vytvorí s právami 600. Nič nenasadzuje. Nová D1 databáza musí mať najprv všetky migrácie; vygenerované SQL odmietne naplnenú databázu. Obnovuje posledný obsah faktúr vrátane koša a uloženého vzhľadu, nie celú históriu predchádzajúcich revízií. Historické revízie zostávajú v pôvodnej D1/Time Travel. Po obnove sa používatelia prihlásia znova. Pred prepnutím `database_id` porovnajte počty účtov, faktúr, sumy a čitateľnosť vzorových PDF.

Denné snapshoty sa zatiaľ automaticky nemažú. Ručný export v ten istý UTC deň aktualizuje denný objekt. Záloha nie je transakčný okamih celej databázy: účty sa čítajú postupne. Zálohy u rovnakého poskytovateľa nenahrádzajú oddelený offline export pre haváriu celého Cloudflare účtu. Stav zálohy treba pri prevádzke kontrolovať; automatické e-mailové upozornenia zatiaľ nie sú zapojené.

## Vydanie a návrat

Mac: `bash scripts/test-native.sh`, `bash scripts/release-mac.sh`, nahrať ZIP do presného R2 release kľúča, zmeniť `MAC_DOWNLOAD_KEY` a nasadiť Worker. Archív nesmie obsahovať lokálnu databázu, logá/podpis pôvodného vlastníka ani secrets. Pri lokálnej aktualizácii ukončiť jedinú nainštalovanú aplikáciu, zálohovať jej dáta a overiť rovnaké SHA-256 po výmene.

Zdrojové zmeny commitovať a poslať na origin. Návrat riešiť novým revert commitom; nepoužívať force push. Worker podporuje Cloudflare version rollback. Pri zmene schémy sa najprv musí posúdiť kompatibilita; návrat kódu nie je automatická obnova dát.

Toto vydanie neposiela faktúry e-mailom, neobsahuje platby/predplatné ani nevyžiadaný automatický import lokálnej databázy. Import pôvodného `database.json` do prázdneho účtu sa spúšťa v Nastaveniach → Zálohy. Migrácia `0004_native_imports.sql` a atomická transakcia zabraňujú opakovanému importu či prepísaniu účtu. Webový PDF export vytvára A4 dokument lokálne z uloženej faktúry cez html2canvas a jsPDF, s QR kódom a pätičkou na každej strane. Strany sú rastrové (text vo webovom PDF nie je samostatne označiteľný); natívny Mac export zostáva vektorový. PDF sa priamo uloží cez systémový výber súboru, ak ho prehliadač podporuje, inak cez bežné stiahnutie. Náhľad ani tlačové okno sa neotvárajú. macOS aplikácia používa NSSavePanel. Prevádzkovateľ má pred širším komerčným spustením doplniť vlastné kontaktné a zmluvné informácie služby; stránka `/privacy.html` popisuje skutočné technické spracovanie údajov.
