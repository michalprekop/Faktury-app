# INVOY

- Komunikuj stručne a po slovensky.
- Web a Mac sú jeden produkt s rovnakým UI. Každú zmenu dizajnu, textov, ovládacích prvkov a ich umiestnenia skontroluj a aplikuj na oboch platformách v tom istom zadaní. Referenciou je posledný schválený vzhľad; zmeny neobmedzuj na jednu platformu bez výslovného pokynu. Systémová lišta macOS a natívne systémové dialógy zostávajú platformové.
- Dokončené úpravy aplikácie over, ulož do zrozumiteľne pomenovaného commitu a pošli na `origin` (`git@github.com:michalprekop/INVOY.git`). Používateľ chce históriu pre návrat k starším verziám.
- Zachovaj históriu; nepoužívaj force push ani deštruktívny reset bez výslovného pokynu.
- Do Gitu nepatria lokálne faktúry, databázy, zálohy, exporty, tajné údaje ani zostavené aplikácie. Rešpektuj `.gitignore`.
- Zachovaj existujúce fakturačné dáta v `~/Library/Application Support/sk.faktury.desktop`. Pri overovaní ich neprepisuj testovacími údajmi.
- Aktualizuj jedinú nainštalovanú aplikáciu `~/Applications/INVOY.app`; nevytváraj ďalšiu nainštalovanú ani QA aplikáciu. Pred výmenou ju ukonči.
- Postup zostavenia, overenia a obnovy je v `README.md`.
