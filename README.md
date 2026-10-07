# VeloData 🚴

Личный статический велоатлас на основе реальных FIT, GPX и TCX из экспорта Strava.

- Интерактивная карта всех маршрутов, раскраска по годам, выбор поездки.
- Пробег, набор высоты, время в седле и средняя скорость по общему времени.
- График по месяцам, календарь активности и личные рекорды.
- Журнал с поиском и фильтром по году, подробности и профиль высоты.
- Адаптивный интерфейс на русском. Сервер и база данных не нужны.

## Запуск

Нужен Node.js 22.12+.

```sh
npm ci
npm run dev
```

Данные уже подготовлены в `public/data/rides.json`. Для обычной сборки Python не требуется.

## Обновление данных

Нужен Python 3.10+ и оригинальный экспорт Strava в локальной папке (например, `export_118409300-2`).

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/import_rides.py export_118409300-2
npm test
npm run build
```

Добавить новые FIT-файлы с велокомпьютера, сохранив прежние поездки:

```sh
.venv/bin/python scripts/import_rides.py data/raw --merge
git add public/data/rides.json
git commit -m "Add new rides"
git push
```

Повторный импорт тех же исходных файлов с `--merge` не создаёт дубликаты. После обновления JSON и push в `main` GitHub Actions пересоберёт сайт.

## Публикация

В настройках репозитория: **Settings → Pages → Source → GitHub Actions**. Workflow `.github/workflows/pages.yml` выполняет проверки, собирает сайт и публикует `dist/`. Относительные пути поддерживают адрес `https://USERNAME.github.io/velodata/`. Папку `dist/` также можно разместить на любом статическом хостинге.

## Данные и приватность

**По решению владельца публикуются полные GPS-маршруты, даты, названия поездок и статистика.** Исходный экспорт, фото, переписка, профиль, заметки и оригинальные бинарные треки не включаются в Git и сборку. Публичный JSON можно скачать любому посетителю; фильтры интерфейса не ограничивают доступ к нему. Точки прорежены для отображения, но начало и конец маршрутов не скрыты.

## Проверки

```sh
npm test
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm run build
```

[Документация](docs/README.md) · [Импорт и формат данных](docs/ride-atlas.md)

Карта: [Leaflet](https://leafletjs.com/) и [OpenStreetMap](https://www.openstreetmap.org/copyright), тайлы загружаются по [правилам OSM](https://operations.osmfoundation.org/policies/tiles/). FIT: [официальный Garmin SDK](https://github.com/garmin/fit-python-sdk). Иконки: [Lucide](https://lucide.dev/). Шрифт: Golos Text (Google Fonts). Для подложки карты и шрифта нужен интернет; собственный backend не используется.
