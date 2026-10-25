# SPEC — «Путь пачки кофе»

GOAL:    the viewer understands that Cloudplus builds one program for any business, because they watch one
         pack of coffee pass through four businesses and see exactly what the program does in each.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps
TIME:    36 s x 30 = 1080 frames; music bed ~110 BPM (16.4 frames/beat, bar 65.5 frames), re-gridded to the chosen track

LOOK:
- Worlds (each business has its own ground, flat colour + one radial light, no linear full-frame gradients):
  roastery #F4E7DC, logistics #E6EDF6, coffee shop #EFE3D3, supermarket #E5F1EA, finale night #0A1B33 with the
  site's vertical light beam (#3FA9F5 core at 70% → transparent, 140 px wide, blurred 40 px).
- Product UI is the site's own: panel #0B0C10, inner cards #14161D, hairline rgba(255,255,255,.08), radius 24 px,
  text #FFFFFF, muted #9A9EAA; chips: in stock #1F9D55 on rgba(31,157,85,.16), low #F0A03C on rgba(240,160,60,.16),
  info #3FA9F5. UI shown at 1.6–2x: body 30 px, numbers 64–96 px.
- Accent: brand blue #3FA9F5 → #0B3A8C, only on the one highlighted word per title, the active UI row and the logo.
- Type: titles Onest 600, 76 px, tracking -2%, ink #0A1B33 on light worlds, #FFFFFF at night; numbers Geist Mono 500.
  One title on screen at a time, left-aligned at x = 120 px, never over the UI.
- Illustration medium: flat vector shapes with one soft shadow each (0 24 px 48 px rgba(10,27,51,.18)),
  2–3 tones per object, no outlines, no gradients except the coffee bag's kraft fold.
- Grain 2%, vignette 0 on light worlds, 8% at night.

OBJECTS:
- Coffee pack (the carrier, in every shot): kraft paper #C89B6C with a folded top #A87D52, a brand-blue band #0B3A8C
  with white "COFFEE" 22 px Onest 700, a small cloud mark on the band; 300 x 420 px at hero size.
- Scale (roastery): steel body #9AA6B1, dark display #0B0C10 with green digits #4ADE80.
- Van (logistics): white body, brand-blue stripe, two dark wheels; on a drawn route line.
- POS terminal (coffee shop): dark screen tilted 0°, item tiles 220 x 140 px.
- Shelf (supermarket): light wood #D9B98F with three rows of packs.
- Cloud mark: the site's own SVG (assets/cloudplus-mark.svg), filled #3FA9F5 → #0B3A8C.

MOTION:
- enter: expo.out 0.5 s (15 f); UI rows stagger 3 f; numbers count with power2.out
- move/camera: power2.inOut 0.6 s (18 f), motion blur 12 px horizontal on whips
- exit: power3.in 0.3 s (9 f)
- morphs (display → panel, card → world): power3.inOut 0.65 s (20 f), radius shrinks with growth
- the cursor: 64 px dark pointer, enters from off-frame, click = 3 f press (scale .9) then the action fires on the same frame

SHOTS:
1. 0–90 f   ROASTERY HOOK. Beans pour into the pack on the scale; display counts 0.00 → 1.00 кг (f 10–55).
            Read: «Кофе начинает путь в цеху» (f 20–80). Sound: bean rattle, tick. Hand-off: the scale display
            morphs into the production panel (f 62–90).
2. 90–240 f PRODUCTION. Panel: hours 09:00–13:00, card «Партия №147 · обжарка · 09:00–12:30 · цех 1», progress
            fills, chip «Себестоимость ниже плана на 6%». Title «Производство: план по часам» (f 100–220).
            Hand-off: cursor clicks «Отгрузить» (f 205); the pack slides right out of frame (whip, f 222–240).
3. 240–420 f LOGISTICS. Pack lands in a warehouse table: «Кофе в зёрнах +240 кг · В наличии» row flashes in;
            then a route draws Склад → Кофейня and the van drives it, chip «В пути» → «Доставлено» (f 360).
            Title «Склад и доставка без звонков» (f 255–400). Hand-off: iris opens from the cafe door (f 400–420).
4. 420–750 f COFFEE SHOP (the proof, four beats):
            a 420–510 POS: cursor taps «Капучино», receipt prints «Итого 28 000 сум». Title «Своя касса».
            b 510–600 MONEY: receipt flies into the day panel: Выручка 3,4 млн / Расходы 1,1 млн / Прибыль 2,3 млн
              counting up. Title «Доходы и расходы — на сегодня».
            c 600–690 RAW STOCK: «Зерно, арабика» bar drops 12 кг → 2 кг, chip turns «Мало»; card
              «Заказ поставщику: 20 кг — отправлен» drops in. Title «Сырьё кончается — заказ уже отправлен».
            d 690–750 SUPPLIER: card «Coffee Import · последняя цена 210 000 сум/кг · доставка завтра».
              Title «Поставщики под рукой». Hand-off: the pack is picked off the counter → carry across.
5. 750–870 f SUPERMARKET. Pack lands on the shelf; panel row «Кофе 250 г · 46 шт · В наличии», sold counter
            ticks 46 → 45 as a pack leaves. Title «Остатки сходятся с продажами» (site copy). Hand-off: pull back.
6. 870–960 f ONE PROGRAM. The four worlds shrink into tiles placed around one Cloudplus window (not a row),
            lines connect them to it. Title «Вся компания в одной программе» (site copy).
7. 960–1080 f FINALE. Night city skyline; the cloud mark rises out of the window and hovers above the city on the
            light beam; «Cloudplus» wipes in; «Программа под ваш бизнес. Работает через 14 дней» (site copy);
            «cloudplus.uz» holds f 1010–1080. Sound: riser into impact on the mark (f 975).

BANNED: dark void with small floating UI; glow/particles as decoration; glass cards; purple gradients;
        three cards in a row; KPI grid as a scene; logo docked in a corner; every element fading up;
        titles moving after they land; invented brand names of real companies; phone numbers.
QA:     f 45 (hook reads), 170 (production panel legible), 380 (van mid-route), 470 (POS tap), 560 (money),
        650 (low stock + order), 720 (supplier), 810 (shelf), 930 (one program), 1060 (end card).
