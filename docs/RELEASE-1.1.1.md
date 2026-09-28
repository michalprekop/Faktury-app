# Overenie vydania 1.1.1 — 28. 9. 2026

- Mac opäť používa pôvodné SwiftUI rozhranie. Web má zoznam a filtre, upraviteľnú faktúru vpravo, tabuľkové zobrazenie, odberateľov a automatické ukladanie.
- NativeCloudSync používa rovnaké účtové API a overenú Apple session. Lokálne údaje účtu sú oddelené od pôvodnej databázy aj od iných účtov.
- Import pôvodnej databázy bol vykonaný do overeného účtu vlastníka: 25 faktúr a 8 odberateľov. Porovnanie všetkých fakturačných polí, profilových údajov a celkovej sumy prešlo. Opakovaný import je idempotentný; neprázdny účet sa neprepisuje.
- Všetky 4 pôvodné lokálne JSON súbory majú po importe a inštalácii nezmenené SHA-256. Súkromné zálohy sú v ignorovanom `output/pre-restore-20260928/`.
- 60 natívnych testov a 35 testov vo workerd prešlo. Nové testy pokrývajú izoláciu importu, odmietnutie prepisovania, CSRF, pridelené šablóny a verzie pri úpravách medzi webom a Macom. TypeScript a kontrola formátovania prešli.
- Exportovaných bolo všetkých 25 importovaných faktúr: každá má jednu stranu. QR na jedinej neuhradenej faktúre sa načítal z vyrenderovanej strany; nezávislý dekodér potvrdil účet, príjemcu, sumu, menu a VS. Vzorová strana bola skontrolovaná vizuálne.
- Webový syntetický účet: úprava poznámky, automatické uloženie, prepnutie faktúry a spätné načítanie; tabuľka a náhľad PDF s QR. Export webového PDF používa tlač prehliadača.
- Jediná nainštalovaná aplikácia `~/Applications/Faktúry.app` bola aktualizovaná na 1.1.1 a jej pôvodné UI zobrazuje 25 cloudových faktúr a stav „Uložené v cloude“.
- Mac ZIP má Developer ID podpis, úspešnú notarizáciu, stapling a Gatekeeper overenie. Verejne stiahnutý ZIP je totožný s lokálnym vydaním: SHA-256 `c65bbb17bebf0a430570e16114fe508ce4664d935149b0bd8f55841c7c3f6e64`.
- Worker verzie `70860971-f483-41c3-959b-d418605fc085` je nasadený na produkčnej adrese. Download používa `releases/Faktury-Mac-1.1.1.zip`.
- Denná súkromná záloha po importe bola spustená cez administráciu a skončila úspešne.

Mac pri otvorení overuje účet cez internet. Rozpracované údaje pri výpadku spojenia ostávajú v zariadení; konflikt so zmenou na inom zariadení sa automaticky neprepisuje.
