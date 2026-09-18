create table if not exists public.calendar_events (
    id text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    type text not null default 'other' check (type in ('class', 'exam', 'meeting', 'other')),
    date date not null,
    start time not null,
    "end" time not null,
    location text not null default '',
    details text not null default '',
    color text not null default '#2563eb',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

drop policy if exists "Users can read their calendar events" on public.calendar_events;
create policy "Users can read their calendar events"
    on public.calendar_events for select
    using (auth.uid() = user_id);

drop policy if exists "Users can create their calendar events" on public.calendar_events;
create policy "Users can create their calendar events"
    on public.calendar_events for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can update their calendar events" on public.calendar_events;
create policy "Users can update their calendar events"
    on public.calendar_events for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "Users can delete their calendar events" on public.calendar_events;
create policy "Users can delete their calendar events"
    on public.calendar_events for delete
    using (auth.uid() = user_id);
