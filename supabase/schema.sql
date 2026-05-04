-- REELY SHORTS V1 schema scaffold
-- Apply carefully in Supabase once credentials and project access are confirmed.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('viewer', 'admin', 'moderator')),
  coin_balance integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shows (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  genre text,
  tagline text,
  description text,
  poster_url text,
  hero_video_url text,
  featured boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  episode_number integer not null,
  title text not null,
  synopsis text,
  video_source text not null check (video_source in ('youtube', 'vimeo', 'supabase_upload', 'r2_upload')),
  video_url text not null,
  duration_seconds integer,
  coin_cost integer not null default 15,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_id, episode_number)
);

create table if not exists public.video_assets (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows(id) on delete cascade,
  episode_id uuid references public.episodes(id) on delete cascade,
  title text not null,
  source_type text not null check (source_type in ('youtube', 'vimeo', 'upload')),
  source_value text not null,
  upload_size_limit_bytes bigint not null default 1395864371,
  moderation_status text not null default 'draft' check (moderation_status in ('draft', 'review', 'published', 'archived')),
  featured boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.episodes add column if not exists managed_asset_id uuid references public.video_assets(id) on delete set null;

create table if not exists public.episode_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  unlock_method text not null check (unlock_method in ('coins', 'rewarded_ad', 'admin_grant', 'subscription')),
  created_at timestamptz not null default now(),
  unique (user_id, episode_id)
);

create table if not exists public.ad_reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  placement text not null,
  reward_coins integer not null,
  verification_token text unique not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.watch_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  progress_seconds integer not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, episode_id)
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limits (
  key text primary key,
  action text not null,
  hits integer not null default 1,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shows_status_featured_created_at on public.shows (status, featured desc, created_at desc);
create index if not exists idx_episodes_show_status_number on public.episodes (show_id, status, episode_number);
create index if not exists idx_video_assets_status_featured_created_at on public.video_assets (moderation_status, featured desc, created_at desc);
create index if not exists idx_video_assets_show_episode on public.video_assets (show_id, episode_id);
create index if not exists idx_episode_unlocks_user_created_at on public.episode_unlocks (user_id, created_at desc);
create index if not exists idx_ad_reward_events_user_created_at on public.ad_reward_events (user_id, created_at desc);
create index if not exists idx_watch_progress_user_updated_at on public.watch_progress (user_id, updated_at desc);
create index if not exists idx_audit_log_actor_created_at on public.audit_log (actor_id, created_at desc);
create index if not exists idx_rate_limits_action_updated_at on public.rate_limits (action, updated_at desc);

alter table public.shows add column if not exists genre text;

alter table public.profiles enable row level security;
alter table public.shows enable row level security;
alter table public.episodes enable row level security;
alter table public.video_assets enable row level security;
alter table public.episode_unlocks enable row level security;
alter table public.ad_reward_events enable row level security;
alter table public.watch_progress enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;

create or replace function public.is_staff(check_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_user
      and role in ('admin', 'moderator')
  );
$$;

create or replace function public.check_rate_limit(limit_key text, limit_action text, max_hits integer, window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.rate_limits%rowtype;
begin
  select * into current_row
  from public.rate_limits
  where key = limit_key
  for update;

  if not found then
    insert into public.rate_limits (key, action, hits, window_started_at, updated_at)
    values (limit_key, limit_action, 1, now(), now());
    return true;
  end if;

  if current_row.window_started_at <= now() - make_interval(secs => window_seconds) then
    update public.rate_limits
    set action = limit_action,
        hits = 1,
        window_started_at = now(),
        updated_at = now()
    where key = limit_key;
    return true;
  end if;

  if current_row.hits >= max_hits then
    return false;
  end if;

  update public.rate_limits
  set action = limit_action,
      hits = current_row.hits + 1,
      updated_at = now()
  where key = limit_key;

  return true;
end;
$$;

create or replace function public.claim_rewarded_ad(reward_coins integer, verification_token text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  user_id uuid := auth.uid();
  current_balance integer;
  next_balance integer;
  normalized_token text := coalesce(nullif(trim(verification_token), ''), gen_random_uuid()::text);
begin
  if user_id is null then
    raise exception 'Authentication required';
  end if;

  if reward_coins <= 0 or reward_coins > 25 then
    raise exception 'Invalid reward amount';
  end if;

  if not public.check_rate_limit('rewarded_ad:' || user_id::text, 'rewarded_ad', 6, 3600) then
    raise exception 'Reward rate limit exceeded';
  end if;

  select coin_balance into current_balance
  from public.profiles
  where id = user_id
  for update;

  if current_balance is null then
    raise exception 'Profile not found';
  end if;

  next_balance := current_balance + reward_coins;

  insert into public.ad_reward_events (user_id, provider, placement, reward_coins, verification_token, verified_at)
  values (user_id, 'mock_rewarded_ad', 'client_reward_button', reward_coins, normalized_token, now());

  update public.profiles
  set coin_balance = next_balance,
      updated_at = now()
  where id = user_id;

  insert into public.audit_log (actor_id, entity_type, entity_id, action, details)
  values (user_id, 'profile', user_id, 'rewarded_ad_claimed', jsonb_build_object('reward_coins', reward_coins, 'verification_token', normalized_token));

  return next_balance;
end;
$$;

create or replace function public.unlock_episode_with_coins(target_episode_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  user_id uuid := auth.uid();
  episode_cost integer;
  current_balance integer;
  next_balance integer;
begin
  if user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.check_rate_limit('episode_unlock:' || user_id::text, 'episode_unlock', 30, 3600) then
    raise exception 'Unlock rate limit exceeded';
  end if;

  if exists (
    select 1 from public.episode_unlocks
    where user_id = unlock_episode_with_coins.user_id
      and episode_id = target_episode_id
  ) then
    select coin_balance into current_balance from public.profiles where id = user_id;
    return coalesce(current_balance, 0);
  end if;

  select coin_cost into episode_cost
  from public.episodes
  where id = target_episode_id
    and status = 'published';

  if episode_cost is null then
    raise exception 'Episode not found or not publishable';
  end if;

  select coin_balance into current_balance
  from public.profiles
  where id = user_id
  for update;

  if current_balance is null then
    raise exception 'Profile not found';
  end if;

  if current_balance < episode_cost then
    raise exception 'Insufficient balance';
  end if;

  next_balance := current_balance - episode_cost;

  insert into public.episode_unlocks (user_id, episode_id, unlock_method)
  values (user_id, target_episode_id, 'coins');

  update public.profiles
  set coin_balance = next_balance,
      updated_at = now()
  where id = user_id;

  insert into public.audit_log (actor_id, entity_type, entity_id, action, details)
  values (user_id, 'episode_unlock', target_episode_id, 'episode_unlocked_with_coins', jsonb_build_object('coin_cost', episode_cost));

  return next_balance;
end;
$$;

create or replace function public.guard_profile_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required for profile writes';
  end if;

  if public.is_staff(auth.uid()) then
    new.updated_at = now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id <> auth.uid() then
      raise exception 'You may only create your own profile row';
    end if;

    new.role = 'viewer';
    new.coin_balance = 10;
    new.updated_at = now();
    return new;
  end if;

  if old.id <> auth.uid() then
    raise exception 'You may only update your own profile row';
  end if;

  new.id = old.id;
  new.role = old.role;
  new.coin_balance = old.coin_balance;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guard_profile_mutation on public.profiles;
create trigger guard_profile_mutation
before insert or update on public.profiles
for each row execute function public.guard_profile_mutation();

drop policy if exists "published shows are readable" on public.shows;
drop policy if exists "staff manage shows" on public.shows;
create policy "published shows are readable"
on public.shows
for select
using (status = 'published' or public.is_staff());
create policy "staff manage shows"
on public.shows
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "published episodes are readable" on public.episodes;
drop policy if exists "staff manage episodes" on public.episodes;
create policy "published episodes are readable"
on public.episodes
for select
using (status = 'published' or public.is_staff());
create policy "staff manage episodes"
on public.episodes
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "published video assets are readable" on public.video_assets;
drop policy if exists "staff manage video assets" on public.video_assets;
create policy "published video assets are readable"
on public.video_assets
for select
using (moderation_status = 'published' or public.is_staff());
create policy "staff manage video assets"
on public.video_assets
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "users read own profile" on public.profiles;
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "staff read all profiles" on public.profiles;
drop policy if exists "staff manage all profiles" on public.profiles;
create policy "users read own profile"
on public.profiles
for select
using (auth.uid() = id or public.is_staff());
create policy "users insert own profile"
on public.profiles
for insert
with check (auth.uid() = id or public.is_staff());
create policy "users update own profile"
on public.profiles
for update
using (auth.uid() = id or public.is_staff())
with check (auth.uid() = id or public.is_staff());

drop policy if exists "users read own unlocks" on public.episode_unlocks;
drop policy if exists "users manage own unlocks" on public.episode_unlocks;
create policy "users read own unlocks"
on public.episode_unlocks
for select
using (auth.uid() = user_id or public.is_staff());
create policy "staff manage unlocks"
on public.episode_unlocks
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "users read own reward events" on public.ad_reward_events;
drop policy if exists "staff insert reward events" on public.ad_reward_events;
create policy "users read own reward events"
on public.ad_reward_events
for select
using (auth.uid() = user_id or public.is_staff());
create policy "staff insert reward events"
on public.ad_reward_events
for insert
with check (public.is_staff());

drop policy if exists "users manage own progress" on public.watch_progress;
drop policy if exists "users update own progress" on public.watch_progress;
create policy "users manage own progress"
on public.watch_progress
for all
using (auth.uid() = user_id or public.is_staff())
with check (auth.uid() = user_id or public.is_staff());

drop policy if exists "staff manage rate limits" on public.rate_limits;
create policy "staff manage rate limits"
on public.rate_limits
for all
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "staff read audit log" on public.audit_log;
drop policy if exists "staff manage audit log" on public.audit_log;
create policy "staff read audit log"
on public.audit_log
for select
using (public.is_staff());
create policy "staff manage audit log"
on public.audit_log
for all
using (public.is_staff())
with check (public.is_staff());
