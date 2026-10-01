# Overenie vydania INVOY 1.2.0 — 1. 10. 2026

- Produkt, webové rozhranie, Mac aplikácia, ikony, distribučné súbory, zdrojové moduly a GitHub repozitár používajú názov INVOY. Repozitár je `michalprekop/INVOY`; história zostala zachovaná.
- Porkbun má uložené nameservery `olga.ns.cloudflare.com` a `randy.ns.cloudflare.com`. Rovnaké hodnoty potvrdil RDAP registra .xyz. Domény `invoy.xyz` a `www.invoy.xyz` sú pripojené ako Cloudflare Worker Custom Domains.
- Web je nasadený vo verzii Workeru `27e25823-0e7d-43f3-a349-935ea36afe4a`. Pôvodná Workers adresa zostáva funkčná, kým sa šíri DNS, aj pre staršie Mac verzie. Nová doména nevyžaduje ďalšie nasadenie.
- Apple Services ID má názov INVOY Web a pridanú doménu aj callback `https://invoy.xyz/auth/apple/callback`. Primárna Apple aplikácia má názov INVOY. Stabilné identifikátory, kľúče, úložiská a formáty dát zostali zachované.
- Prešlo 60 natívnych a 36 webových testov. Po úprave súbežnej podpory starej adresy prešiel aj cielený test domény, pôvodu požiadaviek a CSRF. TypeScript, build a formátovanie upraveného webového kódu prešli.
- Produkčný web bol otvorený s existujúcim prihlásením: zobrazuje INVOY a 141 faktúr. Health a konfigurácia vracajú nový názov; anonymný prístup k účtu zostáva chránený.
- Presné porovnanie databázy pred a po nasadení potvrdilo zhodu: 1 účet, 141 faktúr, 149 historických verzií, 3 šablóny a 2 priradenia šablón. Súkromné zálohy sú iba v ignorovanom `output/invoy-migration/`.
- Jediná nainštalovaná aplikácia je `~/Applications/INVOY.app`, verzia 1.2.0, build 6. Spustenie zobrazilo okno, menu a prihlasovaciu obrazovku INVOY. Fakturačné dáta, rozpracované údaje a obrázky zostali zachované; jediná odlišnosť kontrolného súčtu synchronizačného JSON bola poradie kľúčov pri nezmenenom obsahu.
- Mac aplikácia má Developer ID podpis, úspešnú Apple notarizáciu, stapling a Gatekeeper overenie. Verejne stiahnutý ZIP je totožný s lokálnym vydaním: SHA-256 `8e66b1b0f6c682a9601b47fa921a9ad3d29a2edef538e0cdf86f478810e731eb`.

## Zostávajúce externé overenie pri vydaní

Pri kontrole po nasadení ešte autoritatívne DNS registra .xyz vracalo pôvodné Porkbun nameservery a Cloudflare uvádzal stav `pending`. HTTPS a Apple prihlásenie na novej doméne preto zatiaľ nebolo možné potvrdiť. Nová Mac verzia vyžaduje funkčnú doménu invoy.xyz a nové Apple prihlásenie; do aktivácie je dostupná pôvodná webová adresa.

Pracovný priečinok a uložený projekt v bočnom paneli Codexu zostávajú pomenované `Faktury app`; dostupné nástroje neposkytli podporované premenovanie uloženého projektu. Názov aktuálneho chatu bol zmenený na INVOY.
