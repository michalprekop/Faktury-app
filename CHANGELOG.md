# Zmeny

## 1.2.17 — 2. 10. 2026 — Pomer A4 a platobné údaje Manolo & Bay

- Papier v editore a PDF náhľade sa na webe aj Macu zväčšuje rovnomerne podľa formátu A4. Užšie okno nepreusporiada obsah a nenatiahne stránku.
- Logo Manolo & Bay je posunuté o 22 px nižšie. Znak v pozadí zostáva od horného okraja.
- Béžový platobný blok obsahuje aj IBAN účtu vybraného na faktúre, spolu s variabilným symbolom, splatnosťou a sumou.
- Pätička zobrazuje iba manolobay.com bez označenia „Web:“.

## 2. 10. 2026 — Viac miesta na faktúry

- Filtre stavu, počet faktúr, vyhľadávanie, nová faktúra a prepínanie zoznamu sú v jednom riadku na webe aj Macu. Pre faktúru tak zostáva viac miesta.
- Výber roka je pri zoradení nad zoznamom a funguje aj v tabuľkovom zobrazení.

## 1.2.16 — 2. 10. 2026 — Vlastné logo a podpis pre každý účet

- Nový používateľ začína s prázdnym logom aj podpisom. Obrázky sa doplnia až po nahraní do jeho vlastného účtu.
- Web pri zmene účtu obnoví pracovný priestor a nastavenia. Mac pri pripojení načíta iba cache a synchronizačný stav prihláseného používateľa.
- Existujúce vlastné obrázky a faktúry zostávajú zachované. Testy overujú oddelenie dvoch účtov aj pridelenie šablóny bez prenosu obrázkov správcu.

## 1.2.15 — 2. 10. 2026 — Viac miesta na faktúre Manolo & Bay

- Logo je o 40 % menšie s rovnakou medzerou nad ním aj pod ním. Obsah začína vyššie a menšie medzery uvoľňujú miesto pre položky aj platobný QR kód na webe, Macu aj v PDF.
- Béžový blok sumy obsahuje aj variabilný symbol a dátum splatnosti.
- Celý znak v pozadí zostáva bez orezania a bez medzery od horného okraja.

## 1.2.14 — 2. 10. 2026 — Celý znak Manolo & Bay

- Znak v pozadí šablóny Manolo & Bay sa zobrazuje celý, bez orezania a bez medzery od horného okraja papiera. Úprava platí pre web, Mac aj PDF export.
- Logo, rozloženie údajov a svetlobéžové zvýraznenie zostávajú zachované.

## 2. 10. 2026 — Jednotná a priestranná administrácia

- Administrácia využíva celú šírku okna a rovnaké systémové písmo, tlačidlá, tabuľku a štítky ako hlavná aplikácia. Lepšie čitateľné sú aj šablóny a formuláre na úpravu prístupu.
- Horné taby Faktúry, Odberatelia a Nastavenia nahrádza tlačidlo Späť do aplikácie. Sekcie Používatelia a Šablóny zostávajú v administrácii.
- Rovnaká administrácia sa otvára z webu aj Mac aplikácie; na menších obrazovkách sa obsah prispôsobí a tabuľka sa posúva samostatne.

## 1.2.13 — 2. 10. 2026 — Nová adresa administrácie

- Hlavná administrácia je na `https://invoy.xyz/admin42`. Odkazy na webe aj v Mac aplikácii vedú na novú adresu.
- Starý odkaz sa automaticky presmeruje. Pri prihlásení z administrácie sa používateľ po overení cez Apple vráti na `/admin42`.

## 1.2.12 — 1. 10. 2026 — Aktuálna ikona v Docku

- Mac aplikácia pri štarte obnoví žltú ikonu s jednoradovým logom INVOY., aby v Docku nezostávala stará tyrkysová ikona IN.
- Inštalačný balík používa nový názov súboru ikony. Ikona je z rovnakého schváleného originálu ako na webe.

## 1.2.11 — 1. 10. 2026 — Klikanie na celú plochu dropdownov

- Dropdowny na Macu sa otvoria aj kliknutím na voľnú plochu a šípku, nielen na text. Oprava platí pre výber šablóny, roka, zoradenia aj ponuku účtu.
- Rovnaké správanie celej plochy výberových polí je overené aj na webe.

## 1.2.10 — 1. 10. 2026 — Šablóna Manolo & Bay

- Nová šablóna na webe aj Macu vychádza z rozloženia Mono 01 a zachováva všetky fakturačné údaje aj platobný QR kód.
- Biele pozadie, jemný znak za vycentrovaným logom Manolo & Bay a svetlobéžové zvýraznenie sumy `#F2EEEA`.
- Pätička obsahuje Dominiku Vašek, manolobay.com a dominika@manolobay.com. Nový dizajn nemení vzhľad existujúcich faktúr ani priradenia šablón.

## 1.2.9 — 1. 10. 2026 — Neutrálne označenie faktúry

- Vybraná faktúra má na Macu aj webe teplé sivé pozadie s tmavým textom, bez modrého systémového zvýraznenia.
- Výber myšou a klávesnicou aj poloha posunutého zoznamu zostávajú zachované.

## 1.2.8 — 1. 10. 2026 — Jednotné vyhľadávacie polia

- Vyhľadávanie odberateľov na Macu má výšku 40 px a je zarovnané s tlačidlom Nový odberateľ. Faktúry aj odberatelia používajú rovnaké vyhľadávacie pole.
- Rovnaké pole je aj na webe; odberateľov možno filtrovať podľa názvu, IČO alebo mesta, aj bez diakritiky.

## 1. 10. 2026 — Zjednotenie webu s Mac aplikáciou

- Pri logu na webe už nie je meno ani obláčik. Účet, administrácia a odhlásenie sú v Nastavenia → Účet, rovnako ako na Macu.
- Pracovný priestor používa rovnaké systémové písmo, svetlé pozadie, rozmery tabov a dropdownov. Vybrané taby a hlavné tlačidlá sú žlté bez obrysu.
- Hlavička faktúry zobrazuje aj stav úhrady. Prázdne identifikačné údaje používajú pomlčku namiesto zopakovaného názvu poľa.
- Otvorený web upozorní na novú verziu vrátane zmien samotných štýlov. Obnova najprv uloží rozpracované zmeny; pri chybe zostane editor otvorený.
- Projektové pravidlá vyžadujú kontrolovať a dodávať ďalšie zmeny UI spoločne pre web aj Mac.

## 1.2.7 — 1. 10. 2026 — Čierna horná lišta na Macu

- Horná systémová lišta okna má čierne pozadie a svetlý názov aplikácie. Pracovný priestor zostáva svetlý.

## 1. 10. 2026 — Čistejší výber faktúry vo webovom zozname

- Vybranú faktúru označuje iba jemné pozadie, bez farebného pásika vľavo. Deliaca čiara tesne nad vybranou faktúrou sa skryje a po zmene výberu sa obnoví.

## 1.2.6 — 1. 10. 2026 — Žlté ovládacie prvky a oprava DIČ

- Vybrané taby a hlavné tlačidlá majú na webe aj Macu opäť žlté pozadie s tmavým textom, bez orámovania.
- Jednotná výška ovládacích prvkov 40 px zostáva zachovaná.
- Prázdne DIČ v Mac editore zobrazuje pomlčku namiesto opakovaného názvu a pretínajúcej čiary. Identifikačné údaje sú zarovnané a zostávajú priamo editovateľné.

## 1.2.5 — 1. 10. 2026 — Čierne ovládacie prvky so žltými detailmi

- Hlavné tlačidlá a vybrané taby majú na webe aj Macu čierne pozadie, žltý text a jemný žltý obrys.
- Navigácia, filtre, dropdowny a tlačidlá faktúry používajú jednotnú výšku 40 px. Rovnaký štýl tabov je aj v Nastaveniach.
- Vybraná faktúra na webe má neutrálne pozadie s úzkym žltým pruhom namiesto žltej plochy.

## 1.2.4 — 1. 10. 2026 — Čistejšia hlavička na Macu

- Pri logu sa už nezobrazuje meno ani ikona obláčika. Hlavička obsahuje len logo a hlavnú navigáciu.
- Ponuka účtu, synchronizácie, administrácie a odhlásenia je dostupná cez Nastavenia → Účet.

## 1.2.3 — 1. 10. 2026 — Zarovnanie filtrov na Macu

- Taby stavu faktúr začínajú na rovnakom ľavom okraji ako logo a počet faktúr. Odsadenie horných riadkov je jednotné.

## 1.2.2 — 1. 10. 2026 — Jednotné rozbaľovacie polia

- Mac aplikácia zobrazuje v hornej lište faktúry rozbaľovacie pole s názvom aktuálnej šablóny namiesto samotnej ikony.
- Výber roka, zoradenia a šablóny má na webe aj Macu jednotnú výšku 34 px, neutrálne pozadie, zaoblenie a šípku. Susedné taby a tlačidlá výškou nadväzujú.

## 1. 10. 2026 — Farebné karty v pozadí

- Oranžová a modrá karta na úvodnej stránke sú pod faktúrou a ostatnými kartami. Ich poloha, veľkosť aj pootočenie zostávajú rovnaké.

## 1.2.1 — 1. 10. 2026 — Jednotná značka na webe a Macu

- Webová aj Mac aplikácia používajú finálne jednoradové logo „INVOY.“ vrátane bodky.
- Hlavné tlačidlá a navigácia nadväzujú na žltú farbu landing page. Tmavý text a teplé neutrálne pozadie zjednocujú pracovný priestor.
- Mac má novú žltú ikonu v Docku a zjednotenú prihlasovaciu obrazovku. Nová verzia je dostupná aj na stiahnutie z webu.
- Prihlasovacia obrazovka Mac aplikácie už neponúka otvorenie pôvodnej lokálnej zálohy.
- Fakturačné údaje, vlastné logá a farby uložených šablón zostávajú zachované.

## 1. 10. 2026 — Jasnejšie stiahnutie pre Mac

- Odkaz v hlavičke úvodnej stránky sa volá „Stiahnuť pre Mac“.

## 1. 10. 2026 — Jemné vrstvenie úvodných kariet

- Bočné karty vo variante B sú mierne pootočené a zasahujú do okrajov stredovej faktúry. Farebné karty, texty aj sumy zostávajú čitateľné.

## 1. 10. 2026 — Vyvážené prihlasovacie tlačidlá

- Text a Apple logo v žltých tlačidlách oddeľuje jemná zvislá linka s hrúbkou 1 px. Medzery a okraje sú zjednotené v hlavičke, úvode aj na konci stránky.

## 1. 10. 2026 — Žltý favicon INVOY

- Karta prehliadača používa schválenú žltú ikonu s jednoradovým logom „INVOY.“ bez pootočenia.

## 1. 10. 2026 — Finálne logo a hlavná farba značky

- Žltá `#F5FF36` je uložená ako hlavná farba INVOY. Finálne logo je „INVOY.“ z pätičky vrátane bodky, vždy v jednom riadku.
- Žltá ikona teraz používa rovnaké jednoradové logo ako hlavička a pätička. Vektorové logo, ikona a pravidlá značky sú uložené pre ďalšie použitie.

## 1. 10. 2026 — Čitateľnejšie karty vo variante B

- Farebné karty a ich texty už neprekrývajú biele ukážky. Odberatelia a úhrady sú pod farebnými kartami, potvrdenie uloženia pod faktúrou.
- Na mobile sú farebné karty vedľa seba nad faktúrou, aby zostali celé viditeľné.

## 1. 10. 2026 — Varianty úvodnej stránky A a B

- Pôvodná biela úvodná stránka zostáva zachovaná ako variant A na `/?variant=a`.
- Nový variant B používa teplé sivé pozadie, veľkú centrovanú typografiu, žlté tlačidlá a vrstvené ukážky faktúr. Je dostupný na `/?variant=b` aj ako predvolený úvod.
- Oba varianty možno otvoriť aj po prihlásení. Apple prihlásenie, produktové náhľady a stiahnutie aplikácie pre Mac zostávajú dostupné.

## 1. 10. 2026 — Jedno prihlasovacie tlačidlo

- Tlačidlo „Vytvoriť účet / Prihlásiť sa“ má namiesto šípky logo Apple. Samostatné Apple tlačidlo pod ním už nie je zobrazené.

## 1. 10. 2026 — Nová úvodná stránka

- Úvodný web má nový čistý vzhľad s bielym pozadím, výraznou typografiou a prehľadným predstavením aplikácie.
- Medzi ukážkou úpravy faktúry a tabuľkovým prehľadom sa dá prepínať. Náhľady pochádzajú zo skutočnej aplikácie a obsahujú iba ukážkové údaje.
- Web vysvetľuje vytvorenie a aktiváciu účtu, prácu s faktúrami aj používanie na Macu. Prihlásenie cez Apple a stiahnutie aplikácie sú dostupné priamo z úvodu.

## 1. 10. 2026 — Registrácia a prihlásenie na webe

- Hlavné tlačidlo na úvodnej stránke sa volá „Vytvoriť účet / Prihlásiť sa“. Pod ním je oficiálne tlačidlo prihlásenia cez Apple v slovenčine.

## 1.2.0 — 1. 10. 2026

- Aplikácia sa volá INVOY. Nový názov používa web, Mac aplikácia, ikona, stiahnuté súbory aj GitHub projekt.
- Web má vlastnú adresu invoy.xyz a presmerovanie z www.invoy.xyz. Pôvodná webová adresa zostáva funkčná aj počas šírenia DNS.
- Prihlásenie cez Apple podporuje novú doménu. Existujúce účty, faktúry, šablóny a lokálne dáta zostávajú zachované.
- Staršie Mac verzie sa naďalej môžu pripájať k pôvodnému API. Nová Mac verzia 1.2.0 používa invoy.xyz a má podpis aj notarizáciu Apple.

## 1.1.3 — 28. 9. 2026

- Z webu aj Mac aplikácie zmizla samostatná ikona náhľadu PDF. V hornej lište zostáva jedno tlačidlo PDF.

## 1.1.2 — 28. 9. 2026

- Možnosti faktúry v Mac aplikácii majú nepriesvitné pozadie, aby faktúra nepresvitala cez text a ovládacie prvky.

## 28. 9. 2026 — Širší PDF náhľad

- Webový náhľad faktúry má širšie okno a papier využíva dostupnú šírku, aby sa text a položky zbytočne nelámali.

## 1.1.1 — 28. 9. 2026

- Vrátilo sa pôvodné natívne rozhranie Mac aplikácie a úpravy priamo na faktúre.
- Web používa rovnaké usporiadanie, zoznam aj tabuľku faktúr, filtre, odberateľov a automatické ukladanie.
- Mac synchronizuje cloudový účet z pôvodných ovládacích prvkov. Každý účet má vlastné lokálne úložisko.
- Pôvodné faktúry možno bezpečne importovať do prázdneho účtu vrátane odberateľov, bankových účtov, loga a podpisu; opakovaný import nevytvára duplicity.
- Pôvodné lokálne údaje zostávajú zachované. Pridelené súkromné šablóny fungujú aj v natívnom editore.

## 1.1.0 — 28. 9. 2026

- Webová aplikácia a Mac verzia používajú spoločný cloudový účet s prihlásením cez Apple.
- Každý používateľ má vlastný profil, faktúry, bankové účty a zálohy. Prístupy kontroluje server.
- Správca aktivuje účty, tvorí značkové šablóny a zaškrtáva, ktoré môže konkrétny používateľ používať.
- Vystavené faktúry si zachovajú pôvodný vzhľad aj po úprave alebo odobratí šablóny.
- Pribudla história zmien, obnoviteľný kôš, ochrana pred prepísaním novšej verzie a denné súkromné zálohy.
- Mac aplikácia má Developer ID podpis a notarizáciu Apple. Pôvodné lokálne faktúry zostávajú dostupné v pôvodnom režime.
- Noví používatelia nedostávajú pôvodné osobné údaje ani podpis; ich účet začína prázdny.
