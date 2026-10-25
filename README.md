# Cloudplus — 3D-презентация

«Бизнес, который работает сам»: город-миниатюра, где каждое здание — отдел компании, а Cloudplus связывает их в одну систему. Three.js + Vite.

- Сайт: https://razzor1703.github.io/cloudplus/
- Старая версия 8.6: https://razzor1703.github.io/cloudplus/v8/

## Структура

- `index.html`, `src/style.css` — интерфейс (свободная камера, пауза, время суток, качество)
- `src/main.js` — рендер, режимы камеры, цикл дня и ночи, HUD (`?debug`)
- `src/tour.js` — маршрут пролёта камеры (ключевые точки и скорость)
- `src/scene/city.js` — город: бульвар, супермаркет, магазины и кафе, логистика, производство, штаб-квартира
- `src/scene/logo.js` — объёмный логотип CLOUD PLUS (контур облака из версии 8.6)
- `src/scene/traffic.js` — машины и фургоны (модели из версии 8.6, облегчённые)
- `src/scene/lighting.js` — небо, солнце и луна, освещение от HDRI-панорам дня и ночи
- `src/scene/facade.js` — окна, витрины и ночная подсветка фасадов
- `src/scene/signs.js` — вывески магазинов (один атлас на все)
- `public/assets/` — сжатые текстуры, модели и HDRI (Poly Haven, CC0)
- `scripts/build-assets.mjs` — пересобирает `public/assets/` из исходников в `assets-src/` (не в git)
- `public/v8/` — старая версия 8.6 без изменений

## Запуск

```bash
npm install
npm run dev
```

Публикация автоматическая: каждый push в `main` собирает сайт и выкладывает его на GitHub Pages.
