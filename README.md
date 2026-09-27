# Faktúry pre macOS

Natívna lokálna aplikácia v slovenčine, macOS 14 a novší, Apple Silicon.

## Spustenie

Nainštalovaná aplikácia je v `~/Applications/Faktúry.app`. Otvára sa dvojklikom a nepotrebuje webový server ani internet.

Pri prvom spustení obsahuje dodávateľa, oba bankové účty v nastaveniach, odberateľa a uhradenú faktúru 2026025 z dodaného PDF. Na každej faktúre je iba jeden vybraný účet. Predvolená je Tatra banka.

## Funkcie

- Zoznam s veľkým náhľadom alebo tabuľka, hľadanie, filtre stavu a roka, zoradenie. Výber faktúry ani stav automatického ukladania neposúvajú bočný zoznam.
- Nová faktúra, úprava a duplikovanie priamo na faktúre v hlavnom okne. Vľavo zostáva zoznam, vpravo upraviteľný papier s natívnymi textovými poľami a živými súčtami. QR kód sa počas úprav nepočíta ani nezobrazuje; vytvorí sa z aktuálnych platobných údajov až pri generovaní PDF alebo otvorení jeho náhľadu. Editor nemá zoom ani zväčšovanie vykreslenej plochy; veľkosť písma zostáva rovnaká pri zmene šírky okna. Všetky zmeny sa ukladajú automaticky vrátane neúplných faktúr a rozpísaných čísel. Presný stránkovaný PDF náhľad s lupou sa otvára ikonou dokumentu v detaile.
- Faktúry sú rovno vystavené; stav sa určuje podľa úhrady a splatnosti. Vymazanie s potvrdením.
- Položky, množstvo, jednotka, cena, zľava, voliteľná DPH, poznámka a dátumy.
- Výber jedného účtu, evidencia uhradenej sumy, zostávajúca úhrada a preplatok.
- Správa odberateľov, dodávateľa, loga, podpisu a bankových účtov vrátane predvoleného účtu.
- A4 PDF s viacstranovými položkami, diakritikou, logom a podpisom.
- Písmo SF Mono v aplikácii aj PDF pre samostatné sumy, dátumy, množstvá a identifikátory. Čísla vo vetách, názvoch, adresách a popisoch používajú rovnaké písmo ako okolitý text.
- Platobný QR kód na neuhradených faktúrach: PAY by square (SK) alebo QR Platba (CZ).
- Export a obnova kompletnej JSON zálohy vrátane obrázkov.

Úpravy fakturačných údajov v globálnych nastaveniach platia pre nové faktúry. Existujúce faktúry si uchovávajú kópiu údajov dodávateľa, odberateľa, účtu, loga a podpisu. Farba zvýraznení v Nastavenia → Vzhľad je spoločná pre náhľady a nové PDF exporty všetkých faktúr, bez zmeny ich údajov. Platobný QR kód zostáva čiernobiely a text má čitateľný kontrast aj pri svetlej farbe. Platné zmeny nastavení sa ukladajú automaticky krátko po dopísaní, aj pri odchode z nastavení a ukončení appky. Neplatné údaje zobrazia upozornenie a nenahradia uložené nastavenia. Formulár bankového účtu sa potvrdzuje tlačidlom Uložiť účet.

Faktúry nemajú tlačidlo Uložiť: platné zmeny sa zapíšu po 450 ms nečinnosti aj pri prepnutí alebo ukončení aplikácie. Rozpracovaný vstup sa nezávisle zapisuje okamžite, vrátane neúplnej ceny ako `250,`. Pri ďalšom spustení sa obnoví posledná rozpracovaná faktúra; ostatné zostávajú v zozname. Neúplné údaje nenahradia poslednú platnú faktúru a do dokončenia sa nedajú exportovať do PDF. Pri chybe zápisu sa zobrazí Neuložené a možnosť zopakovať uloženie; bežné ukončenie aplikácie sa pri neuložených zmenách zablokuje.

## Dáta

Ukladajú sa do `~/Library/Application Support/sk.faktury.desktop/database.json`. Rozpracované faktúry a surový vstup sú v susednom `invoice-drafts.json`, zapisovanom atómovo. Export JSON zálohy zahŕňa aj tieto rozpracované údaje. Predchádzajúca verzia databázy zostáva v `database.previous.json`. Pred obnovením zálohy sa vytvorí aj samostatná kópia pôvodných dát vrátane rozpracovaných faktúr. Odporúča sa pravidelný export zálohy na iné úložisko.

Appka neposiela faktúry e-mailom, nesynchronizuje banku ani cloud, nepripája sa do SuperFaktúry a nevytvára ISDOC. Sadzby DPH sú nastaviteľné. Dodávateľ z predlohy je nastavený ako neplatiteľ DPH.

## Vývoj a overenie

SwiftUI, AppKit, PDFKit, Core Image, Vision a Foundation. Kompresiu PAY by square
zabezpečuje systémová macOS knižnica liblzma; jej API hlavičky sú v `Sources/CLZMA`.
Nie je potrebný Homebrew ani externá služba počas behu aplikácie.

```sh
swift test
bash scripts/build-app.sh
.build/release/Faktury --verify output/pdf
```

Testy pokrývajú desatinné výpočty, DPH, čiastočné úhrady, číslovanie, validáciu IBAN-u, údaje zachované vo faktúre a zálohy. Príkaz `--verify` overí PDF predlohy, iba jeden účet, viacstranový export a uloženie dát. Na izolované UI testy možno nastaviť `FAKTURY_DATA_DIR`.

Skript vytvorí pracovnú kópiu v `.build/distribution.noindex/Faktúry.app`, mimo vyhľadávania Spotlight. Túto kópiu nespúšťajte ani nepripínajte do Docku; pri aktualizácii ňou nahraďte existujúcu aplikáciu v `~/Applications/Faktúry.app` až po jej ukončení. Nevytvárajte ďalšiu nainštalovanú ani QA aplikáciu.

Zostavená aplikácia má lokálny ad-hoc podpis. Nie je notarizovaná na distribúciu iným používateľom.

## História a návrat k staršej verzii

Zdrojový kód je v [GitHub repozitári Faktury-app](https://github.com/michalprekop/Faktury-app).
Dokončené úpravy sa ukladajú do samostatných commitov a posielajú na GitHub.
Prvý bod obnovy `baseline-2026-09-27` obsahuje stav aplikácie pri zavedení Gitu;
staršie priebežné verzie pred týmto bodom v histórii nie sú.

Históriu zobrazí `git log --oneline`. Konkrétnu neskoršiu zmenu možno vrátiť pomocou
`git revert <hash-commitu>` a výsledok uložiť na GitHub cez `git push`.
Potom treba aplikáciu znovu zostaviť a nahradiť nainštalovanú kópiu podľa postupu vyššie.
Pri zmenách dátového formátu treba pred návratom overiť kompatibilitu a exportovať zálohu.

Git sleduje zdrojový kód, testy a zdrojové obrázky. Databáza faktúr, rozpracované údaje,
exportované PDF/JSON zálohy a zostavená aplikácia sa do repozitára neposielajú.
Návrat k staršiemu kódu sám osebe neobnoví staršie fakturačné údaje.

## Platobný QR kód

Predvolený formát je PAY by square; pre českého odberateľa sa automaticky použije
QR Platba. Vo faktúre možno formát zmeniť alebo QR vypnúť. Žiadny formát nie je
univerzálny pre všetky bankové aplikácie; zahraničný IBAN a cudzie meny závisia
aj od možností konkrétnej banky.

QR obsahuje výhradne účet vybraný vo faktúre, majiteľa účtu (ak nie je uvedený,
použije sa názov dodávateľa), zostávajúcu sumu, menu, VS, voliteľný KS/ŠS a správu
s číslom faktúry. Platba nemá naplánovaný dátum vykonania. QR sa negeneruje pre
uhradené faktúry ani hotovosť, kartu či dobierku. Neplatné údaje zobrazia upozornenie
namiesto chybného QR. Žiadne platobné údaje neopúšťajú Mac.

Špecifikácie:
- https://portal.bysquare.com/files/bysquare-PAYspecifications-1.2.0.pdf
- https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
- https://pomoc.superfaktura.sk/ako-zapnem-qr-kod-na-fakture/

`--render-database <database.json> <output-directory> --expect-single-page`
overí všetky PDF aj načítanie QR z vyrenderovaných strán a vytvorí `qr-codes.json`.
`python3 scripts/verify-payment-qr.py <qr-codes.json>` nezávisle overí CRC32,
dekompresiu a všetky dôležité platobné údaje.
