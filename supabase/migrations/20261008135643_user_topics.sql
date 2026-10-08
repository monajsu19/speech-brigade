-- Speaking topics people write for themselves on the Impromptu and Extemp setup pages ("My Topic").
create table public.user_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event text not null check (event in ('impromptu', 'extemp')),
  text text not null check (char_length(btrim(text)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_topics_user_event_idx on public.user_topics (user_id, event, created_at desc);

create or replace function public.user_topics_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_topics_touch_updated_at
  before update on public.user_topics
  for each row execute function public.user_topics_touch_updated_at();

-- At most 50 topics per person per event.
create or replace function public.user_topics_enforce_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.user_topics where user_id = new.user_id and event = new.event) >= 50 then
    raise exception 'user_topics_cap_exceeded';
  end if;
  return new;
end;
$$;

create trigger user_topics_enforce_cap
  before insert on public.user_topics
  for each row execute function public.user_topics_enforce_cap();

alter table public.user_topics enable row level security;

create policy "Users read their own topics" on public.user_topics
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users add their own topics" on public.user_topics
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users edit their own topics" on public.user_topics
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users delete their own topics" on public.user_topics
  for delete to authenticated using ((select auth.uid()) = user_id);
