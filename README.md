# Cloudplus — 3D-презентация

Рекламная 3D-презентация «Cloudplus» на Three.js.

- `index.html` — разметка и интерфейс
- `style.css` — стили
- `main.js` — сцена, камера, анимация
- `assets/textures/` — текстуры материалов
- `assets/models/` — 3D-модели машин (GLB)

## Запуск у себя

Двойной клик по `index.html` не сработает: браузер не грузит модули и текстуры с диска. Нужен локальный сервер:

```bash
python3 -m http.server 8000
```

Затем откройте http://localhost:8000
