# Cloudplus — 3D-презентация

«Бизнес, который работает сам»: город-миниатюра, где каждое здание — отдел компании, а Cloudplus связывает их в одну систему. Three.js + Vite.

- Сайт: https://razzor1703.github.io/cloudplus/
- Старая версия 8.6: https://razzor1703.github.io/cloudplus/v8/

## Структура

- `index.html`, `src/style.css` — интерфейс
- `src/main.js` — рендер, камера, цикл, HUD
- `src/scene/lighting.js` — небо, солнце/луна, смена дня и ночи
- `src/scene/city.js` — город (этап 1: заглушки вместо моделей)
- `src/scene/facade.js` — шейдер окон для фасадов
- `src/quality.js` — уровни качества и авто-подстройка
- `public/v8/` — старая версия 8.6 без изменений

## Запуск

```bash
npm install
npm run dev
```

Публикация автоматическая: каждый push в `main` собирает сайт и выкладывает его на GitHub Pages.
