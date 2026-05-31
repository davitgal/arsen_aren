# Рассадка гостей

Простое мобильное веб-приложение для просмотра рассадки гостей по столам на свадьбе.

## Как добавить гостей

Открой `data.js` и заполни массив `guests` для каждого стола:

```js
{ id: 1, guests: ["Карен Петросян", "Анна Саркисян", ...] },
```

## Публикация на GitHub Pages

1. Запушить ветку в репозиторий.
2. Settings → Pages → Source: ветка `main` (или нужная), папка `/ (root)`.
3. Откроется по адресу `https://<username>.github.io/<repo>/`.

## Подключение базы данных (Supabase)

Отметки «пришёл / не пришёл» хранятся в Supabase (общие для всех устройств).
Пока ключи не вставлены — приложение работает на localStorage (офлайн).

**Шаги:**

1. Создай бесплатный проект на https://supabase.com
2. В проекте: **SQL Editor** → выполни:

   ```sql
   create table if not exists attendance (
     guest_key  text primary key,
     attended   boolean not null default false,
     updated_at timestamptz not null default now()
   );

   alter table attendance enable row level security;

   -- Открытый доступ (чтение и запись) для anon-ключа
   create policy "anon read"   on attendance for select using (true);
   create policy "anon insert" on attendance for insert with check (true);
   create policy "anon update" on attendance for update using (true) with check (true);
   ```

3. **Settings → API**: скопируй **Project URL** и **anon public** ключ.
4. Вставь их в `config.js`:

   ```js
   window.SUPABASE_URL = 'https://xxxx.supabase.co';
   window.SUPABASE_ANON_KEY = 'eyJ...';
   ```

5. Закоммить `config.js` и запушь — готово. Отметки синхронизируются между всеми устройствами автоматически (каждые 12 сек и при возврате на вкладку).

## Локальный запуск

Просто открыть `index.html` в браузере, либо:

```
python3 -m http.server 8000
```
