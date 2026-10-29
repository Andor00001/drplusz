# drplusz – projektmemória

## Cél
DrPlusz független egészségügyi termékmagazin. Statikus oldal, nem magánrendelő. 
README kivonat: DrPlusz Független egészségügyi magazin, statikus HTML és egy CSS. Nem magánrendelő, és nem a székesfehérvári Doktor Plusz Magánorvosi Központ. Az első szám a `/workspace/drplusz` mappából készült. Új téma: másold a `cikkek/` egyik fájlját, és tegyél rá hivatkozást a főoldalra meg a `cikkek/index.html` oldalra. A logó a meglévő fájl, nem újragenerált kép (`img/logo.jpg`, JPEG).

## Döntések / LOCK-ok (közös)
- Szerkesztés csak GitHubon; a Lovable csak Publish-ra való.
- Éles lépés, publikálás, adatbázis-módosítás, e-mail, fizetés csak Andor jóváhagyásával. Fizetés: két megerősítés, csak a Pénzügy bot.
- Titok (API kulcs) soha nem kerül a repóba.
- Csendes órák: hétköznap 10:00 előtt és 22:00 után, hétvégén 11:00 előtt nincs értesítés.
- Napi ellenőrzés (hétköznap 10:15, hétvégén 11:15): technikai hibák, Sentry, tartalom, regisztráció – csak hiba esetén szól.

## Szerkezet
Fő fájlok: .agents, .claude, .gemini, .nojekyll, CNAME, README.md, adatkezeles.html, admin, ads.txt, cikkek, css, img, impresszum.html, index.html, jev-ellenorzes.json, tesztek, tools

## Nyitott feladatok
- [ ] Projektmemória átnézése, kiegészítése (Andor / oldalbot)
- [ ] Napi ellenőrző rutin működik
