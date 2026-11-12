# NEXORA

**Meet. Connect. Discover.**

NEXORA — социальная платформа знакомств и виртуальный мир для совершеннолетних пользователей (18+).

## Текущий статус

Ветка разработки: `love-galaxy-redesign`.

### Реализовано в текущем этапе
- Отдельная таблица игровых персонажей с лимитом до трёх на аккаунт, выбором активного персонажа и редактированием базовых данных.
- Игровые комнаты для Nexora Prime, история общего чата комнат и WebSocket-сервер с проверкой сессии.
- Учёт подключений к комнатам, ограничение вместимости и базовый лимит частоты отправки сообщений.
- API списка комнат, истории комнатного чата и уведомлений с отметкой прочтения.
- Идемпотентная миграция `database/migrations/002_game_world.sql`; `npm run db:migrate` применяет базовую схему и миграции 002/003/004 с журналом `schema_migrations`.
- Адаптивная стартовая страница и демонстрационные карточки.
- Express API и PostgreSQL-схема.
- Регистрация с проверкой возраста 18+ и хешированием пароля bcrypt.
- Подтверждение email одноразовым токеном с ограниченным сроком действия.
- Вход, выход и серверные сессии с HttpOnly cookie.
- API профиля и сохранения внешнего вида персонажа.
- API списка планет и серверная логика виртуальных перелётов с оплатой билета.
- Система дружбы: отправка, принятие, отклонение запросов, список друзей и удаление из друзей.
- Личные диалоги между взаимными друзьями, список диалогов, история и отправка сообщений.
- Проверка блокировок и активного игрового ограничения на отправку сообщений.
- Rate limiting для auth API, Helmet, ограничение JSON body и проверка Origin для изменяющих запросов.

### API

**Авторизация**
- `POST /api/auth/register` — регистрация. JSON: `email`, `username`, `password`, `birthDate` (YYYY-MM-DD).
- `GET /api/auth/verify?token=...` — подтверждение email.
- `POST /api/auth/login` — вход. JSON: `email`, `password`.
- `GET /api/auth/me` — текущий пользователь.
- `POST /api/auth/logout` — завершение сессии.

**Мир и персонаж**
- `GET /api/world/planets` — список планет.
- `GET /api/world/me` — профиль, баланс, авторитет и текущая планета.
- `PATCH /api/world/profile` — изменение профиля.
- `GET /api/world/character` и `PUT /api/world/character` — внешний вид персонажа.
- `POST /api/world/travel` — перелёт на планету. JSON: `planetSlug`.

**Игровой мир (требует применения миграции 002)**
- `GET /api/game/characters` — список персонажей аккаунта.
- `POST /api/game/characters` — создать персонажа (максимум три).
- `PATCH /api/game/characters/:characterId` — изменить своего персонажа.
- `POST /api/game/characters/:characterId/activate` — выбрать активного персонажа.
- `DELETE /api/game/characters/:characterId` — удалить своего персонажа.
- `GET /api/game/rooms?planet=nexora-prime` — список комнат планеты и число присутствующих.
- `GET /api/game/rooms/:roomId/messages` — история общего чата комнаты.
- `GET /api/game/notifications` и `PATCH /api/game/notifications/read` — уведомления.
- `ws(s)://<host>/ws` — WebSocket. После подключения отправить `{"type":"join_room","roomId":"UUID"}`, затем сообщения `{"type":"room_message","body":"Текст"}`. Требуется активная сессия в HttpOnly cookie.

**Друзья и личные сообщения**
- `GET /api/social/discover?q=...` — поиск публичных анкет подтверждённых пользователей.
- `GET /api/social/friends` — список друзей и входящие/исходящие запросы.
- `POST /api/social/friends/:userId` — отправить запрос дружбы.
- `PATCH /api/social/friends/:userId` — принять или отклонить входящий запрос. JSON: `{"decision":"accept"}` или `{"decision":"reject"}`.
- `DELETE /api/social/friends/:userId` — удалить друга.
- `POST /api/social/conversations/:userId` — открыть или создать личный диалог с другом.
- `GET /api/social/conversations` — список диалогов.
- `GET /api/social/conversations/:conversationId/messages` — последние сообщения (параметр `limit`, максимум 100).
- `POST /api/social/conversations/:conversationId/messages` — отправить сообщение. JSON: `{"body":"Текст сообщения"}`.
- `GET /api/social/blocks` — список заблокированных пользователей.
- `POST /api/social/blocks/:userId` и `DELETE /api/social/blocks/:userId` — добавить или убрать блокировку.
- `POST /api/social/reports/:userId` — отправить жалобу. JSON: `{"category":"harassment","details":"Описание ситуации"}`. Повторная жалоба на того же пользователя ограничена по времени.

## Запуск

Требования: Node.js 20+, PostgreSQL 14+.

1. Скопируйте `.env.example` в `.env` и заполните `DATABASE_URL`.
2. Создайте базу PostgreSQL.
3. Установите зависимости: `npm install`.
4. Примените базовую схему и отслеживаемые миграции: `npm run db:migrate`. Команда записывает `001_base_schema`, `002_game_world.sql`, `003_social_game_systems.sql` и `004_media_assets.sql` в `schema_migrations` и пропускает уже применённые версии.
5. Запустите: `npm start`.

Для production настройте `NODE_ENV=production`, `APP_BASE_URL`, SMTP-переменные и HTTPS. Для первоначального доступа к панели администратора можно временно задать `NEXORA_BOOTSTRAP_ADMIN_EMAIL` на email уже подтверждённого аккаунта и выполнить `npm run db:migrate`; аккаунт получит роль `developer`. После этого удалите переменную из окружения.


## Социальные и игровые системы (foundation)

Перед использованием новых API примените все миграции командой `npm run db:migrate`. Все маршруты ниже требуют подтверждённую сессию, если явно не указано иное.

- `GET /api/game/planets` — планеты, число комнат и онлайн.
- `GET /api/game/rooms?planet=<slug>` — комнаты выбранной планеты.
- `POST /api/world/travel` — перемещение между планетами. JSON: `{"planetSlug":"love-planet"}`.
- `PATCH /api/game/characters/:id` — внешность персонажа в JSON-поле `appearance`.
- `GET /api/features/recipients?q=...` — список доступных подтверждённых пользователей для переводов, подарков и предложений отношений.
- `GET /api/features/catalog`, `GET /api/features/inventory` — каталог и инвентарь.
- `POST /api/features/characters/:characterId/equip` — надеть или снять предмет. JSON: `{"itemId":"UUID","equipped":true}`.
- `POST /api/features/transfer` — перевод валюты с обязательным UUID `idempotencyKey`.
- `POST /api/features/shop/buy` — покупка предмета с обязательным UUID `idempotencyKey` и `characterId`.
- `POST /api/features/shop/gift`, `GET /api/features/gifts`, `POST /api/features/gifts/:giftId/claim` — отправка и получение подарков.
- `GET /api/features/clans`, `POST /api/features/clans`, `POST /api/features/clans/:clanId/apply` — кланы и заявки; интерфейс также поддерживает клановый чат, просмотр состава и управление ролями.
- `GET /api/features/clans/:clanId/members`, `GET /api/features/clans/:clanId/applications`, `POST /api/features/clans/:clanId/decide`, `PATCH /api/features/clans/:clanId/members/:userId/role`, `DELETE /api/features/clans/:clanId/members/:userId` — управление составом и ролями.
- `GET /api/features/clans/:clanId/messages`, `POST /api/features/clans/:clanId/messages` — история и отправка сообщений клана (пока без WebSocket-доставки).
- `POST /api/features/clans/:clanId/bank`, `GET /api/features/clans/:clanId/ledger` — операции кланового банка и журнал; банковские операции принимают UUID `idempotencyKey`.
- `GET /api/features/pets`, `POST /api/features/pets`, `POST /api/features/pets/:petId/care` — питомцы, почасовое снижение сытости/настроения, рост уровня и пятиминутный cooldown ухода.
- `GET /api/features/blogs`, `POST /api/features/blogs`, `PATCH /api/features/blogs/:postId`, `DELETE /api/features/blogs/:postId`, `POST /api/features/blogs/:postId/like`, `POST /api/features/blogs/:postId/comments` — публикации и взаимодействия. Фотографии можно передавать HTTPS-ссылками или загружать напрямую в приватное S3-совместимое хранилище через подписанные URL; для загрузки требуется настроить переменные S3. Внешние ссылки публичны; для публикаций «Друзья» и «Только я» разрешены только собственные загруженные файлы NEXORA.
- `GET /api/features/relationships`, `POST /api/features/relationships/propose`, `POST /api/features/relationships/:id/respond`, `POST /api/features/relationships/:id/ceremony`, `POST /api/features/relationships/:id/divorce` — предложение, помолвка, виртуальная свадебная церемония, обручальные кольца и развод.
- `GET /api/features/leaderboards/:kind` — рейтинги `authority`, `experience`, `popularity`, `clans`. Репутация и опыт персонажа растут от подтверждённых игровых событий с дневными лимитами.
- `GET /api/features/achievements` — каталог достижений.
- `POST /api/features/mini-games/:slug/score` — запись непроверенного результата; он не участвует в наградах и достоверных рейтингах.
- `GET /api/features/admin/users?q=...`, `GET /api/features/admin/reports`, `POST /api/features/admin/reports/:id/resolve`, `POST /api/features/admin/users/:userId/punish`, `POST /api/features/admin/users/:userId/unsuspend`, `GET /api/features/admin/logs` — API модерации и управления аккаунтами. Доступ ограничен ролями.

Виртуальная валюта не имеет денежной стоимости. Платежи за реальные деньги не реализованы. Визуальные предметы представлены каталогом с категориями, редкостью, ценой, слотами экипировки и выдачей колец после свадьбы. Есть слоистый SVG-предпросмотр 2D-персонажа с настройкой тона кожи, причёски, глаз, одежды и обуви; после свадьбы кольца выдаются обоим активным персонажам. Полный набор графических ассетов и 3D-редактор остаются отдельным этапом.

## Клиентский интерфейс

Главная страница автоматически проверяет сессию. После входа доступны профиль, поиск, друзья, личные диалоги, персонажи, планеты и комнаты, общий WebSocket-чат, уведомления, кланы, магазин, питомцы, блоги, отношения, рейтинги и базовая панель жалоб. Личные сообщения пока обновляются опросом API. Новые игровые разделы являются первой версией интерфейса и требуют дальнейшей полировки и сквозного тестирования.

При регистрации нужно указать ник, email, пароль и дату рождения. Сервер проверяет возраст 18+ и отправляет ссылку подтверждения. В development без SMTP ссылка выводится в журнал сервера; в production SMTP обязателен.

## Что ещё не готово

- HTTP/WebSocket end-to-end сценарии и финансовые операции требуют расширенных интеграционных тестов и проверки на развёрнутом сервере. Workflow CI настроен на PostgreSQL 16: он применяет миграции, повторно запускает их для проверки идемпотентности и проверяет схемы, стартовые комнаты, награды и ограничения отношений. Успешный запуск конкретного workflow нужно подтверждать по GitHub Actions.
- Индикаторы присутствия в интерфейсе, восстановление присутствия после перезапуска и масштабирование realtime на несколько экземпляров сервера.
- Восстановление пароля и повторная отправка письма.
- Расширенный редактор 2D/3D-персонажа и уникальные графические ассеты. Сейчас есть SVG-предпросмотр; загрузка фотографий в S3-compatible storage реализована, но требует настройки bucket и ключей.
- Расширенные фильтры и массовые инструменты модерации, а также более детальная панель управления кланом.
- Проверяемая сервером логика мини-игр и полноценный графический сценарий свадебного события. Базовая виртуальная церемония и автоматическое начисление достижений за первые шаги, сообщения, дружбу, покупки и свадьбу уже добавлены.
- Полная проверка безопасности и end-to-end тесты реальных HTTP/WebSocket сценариев. Миграции добавлены и проверяются на временной PostgreSQL в CI, но ещё не применялись к развёрнутой базе проекта.

Текущая версия — развивающийся backend-прототип, а не готовый публичный сервис. Перед production необходимы тесты, CSRF-защита, восстановление аккаунта, политика хранения и удаления персональных данных, а также проверка всех миграций.


## Хранилище фотографий (S3-compatible / Cloudflare R2)

Фотографии загружаются напрямую в собственный S3-совместимый bucket через короткоживущую подписанную ссылку. Файлы ограничены 8 МБ и форматами JPEG, PNG и WebP; сервер проверяет владельца, размер, MIME и сигнатуру файла. В PostgreSQL сохраняются метаданные и внутренний URL приложения; изображения выдаются через авторизованный маршрут с временной подписанной ссылкой.

Добавьте в серверное окружение:
- `S3_BUCKET` — имя bucket.
- `S3_ENDPOINT` — endpoint S3 API вашего хранилища.
- `S3_REGION` — регион (для R2 обычно `auto`).
- `S3_ACCESS_KEY_ID` и `S3_SECRET_ACCESS_KEY` — отдельные ключи доступа только к нужному bucket.
- `DATABASE_URL` — PostgreSQL connection string.

Bucket должен оставаться приватным, без публичного чтения. Изображения выдаются через авторизованный `/api/media/:assetId` с короткоживущей подписанной ссылкой.

Настройте CORS bucket: разрешите `PUT` с домена приложения и заголовок `Content-Type`. Оставь bucket приватным, не включай публичное чтение. Сервер проверяет права доступа к публикации перед выдачей короткоживущей ссылки на изображение. Не делай ключи доступа публичными и не добавляй их в Git. Для незавершённых загрузок настрой lifecycle-удаление объектов с префиксом `staging/` (например, через 24 часа). После проверки сервер копирует файл в финальный ключ `users/…`, регистрирует его в PostgreSQL и удаляет временный объект. После настройки выполните `npm run db:migrate`.

API:
- `POST /api/media/presign` — получить URL для загрузки (JSON: `contentType`, `size`).
- Загрузить файл методом `PUT` по выданному URL с заголовком `Content-Type`.
- `POST /api/media/complete` — проверить объект и зарегистрировать файл (JSON: `assetId`, `key`, `contentType`, `size`).
- `GET /api/media` — список своих фотографий.
- `GET /api/media/:assetId` — проверка доступа и короткоживущий signed GET для приватного объекта.
- `DELETE /api/media/:assetId` — удалить свою фотографию, если она не используется в публикациях.

Для работы нескольких экземпляров WebSocket-сервера используются PostgreSQL `LISTEN/NOTIFY` события. Настройте `TRUST_PROXY_HOPS` только если приложение действительно находится за известным reverse proxy; по умолчанию доверие к forwarded-заголовкам отключено.
