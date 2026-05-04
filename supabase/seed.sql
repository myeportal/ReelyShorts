-- REELY SHORTS V1 seed data
-- Run after schema.sql
-- This seeds demo content for the current frontend.

with inserted_shows as (
  insert into public.shows (slug, title, genre, tagline, description, poster_url, hero_video_url, featured, status)
  values
    (
      'midnight-vows',
      'Midnight Vows',
      'Romance Thriller',
      'A runaway bride discovers the man hunting her already knows her darkest secret.',
      'A premium short-drama romance thriller built for coin unlocks, rapid cliffhangers, and mobile-first viewing.',
      '/placeholders/show-01.jpg',
      'https://www.youtube.com/watch?v=pvqiR0Q0sGQ&t=3305s',
      true,
      'published'
    ),
    (
      'city-of-echoes',
      'City of Echoes',
      'Neo-Noir Mystery',
      'Every alley remembers a lie, and every lie points back to her.',
      'A neo-noir mystery series with escalating reveals and locked episodes.',
      '/placeholders/show-02.jpg',
      null,
      false,
      'published'
    ),
    (
      'hearts-on-trial',
      'Hearts on Trial',
      'Legal Drama',
      'She defends strangers for a living until the next case puts her own family on the stand.',
      'A legal drama series optimized for mobile vertical discovery and episodic retention.',
      '/placeholders/show-03.jpg',
      null,
      false,
      'published'
    )
  on conflict (slug) do update
    set title = excluded.title,
        genre = excluded.genre,
        tagline = excluded.tagline,
        description = excluded.description,
        poster_url = excluded.poster_url,
        hero_video_url = excluded.hero_video_url,
        featured = excluded.featured,
        status = excluded.status,
        updated_at = now()
  returning id, slug
)
insert into public.episodes (show_id, episode_number, title, synopsis, video_source, video_url, duration_seconds, coin_cost, status)
select s.id, e.episode_number, e.title, e.synopsis, e.video_source, e.video_url, e.duration_seconds, e.coin_cost, 'published'
from inserted_shows s
join (
  values
    ('midnight-vows', 1, 'Episode 1: Run', 'The wedding night collapses into a desperate escape.', 'youtube', 'https://www.youtube.com/watch?v=pvqiR0Q0sGQ&t=3305s', 200, 0),
    ('midnight-vows', 2, 'Episode 2: The Deal', 'A dangerous bargain is the only path forward.', 'youtube', 'https://www.youtube.com/watch?v=pvqiR0Q0sGQ&t=3305s', 185, 15),
    ('midnight-vows', 3, 'Episode 3: Blood Oath', 'The secret binding them grows darker.', 'youtube', 'https://www.youtube.com/watch?v=pvqiR0Q0sGQ&t=3305s', 224, 20),

    ('city-of-echoes', 1, 'Episode 1: White Noise', 'A missing tape sparks a dangerous search.', 'vimeo', 'https://vimeo.com/example-placeholder', 168, 0),
    ('city-of-echoes', 2, 'Episode 2: Wiretap', 'Every call reveals another betrayal.', 'vimeo', 'https://vimeo.com/example-placeholder', 192, 15),
    ('city-of-echoes', 3, 'Episode 3: Crossfire', 'Two hunters close in at once.', 'vimeo', 'https://vimeo.com/example-placeholder', 211, 20),

    ('hearts-on-trial', 1, 'Episode 1: Objection', 'A courtroom victory opens a personal war.', 'upload', 'supabase://uploads/hearts-on-trial-ep1.mp4', 181, 0),
    ('hearts-on-trial', 2, 'Episode 2: The Witness', 'The witness list changes everything.', 'upload', 'supabase://uploads/hearts-on-trial-ep2.mp4', 197, 15),
    ('hearts-on-trial', 3, 'Episode 3: Verdict', 'The verdict lands where no one expects.', 'upload', 'supabase://uploads/hearts-on-trial-ep3.mp4', 238, 20)
) as e(show_slug, episode_number, title, synopsis, video_source, video_url, duration_seconds, coin_cost)
  on e.show_slug = s.slug
on conflict (show_id, episode_number) do update
  set title = excluded.title,
      synopsis = excluded.synopsis,
      video_source = excluded.video_source,
      video_url = excluded.video_url,
      duration_seconds = excluded.duration_seconds,
      coin_cost = excluded.coin_cost,
      status = excluded.status,
      updated_at = now();

insert into public.video_assets (show_id, title, source_type, source_value, upload_size_limit_bytes, moderation_status, featured)
select s.id, v.title, v.source_type, v.source_value, 1395864371, v.moderation_status, v.featured
from public.shows s
join (
  values
    ('midnight-vows', 'Hero Feature Slot', 'youtube', 'https://www.youtube.com/watch?v=pvqiR0Q0sGQ&t=3305s', 'published', true),
    ('city-of-echoes', 'Neo-Noir Teaser', 'vimeo', 'https://vimeo.com/example-placeholder', 'review', false),
    ('hearts-on-trial', 'Sample Uploaded Episode', 'upload', 'supabase://uploads/hearts-on-trial-ep1.mp4', 'review', false)
) as v(show_slug, title, source_type, source_value, moderation_status, featured)
  on s.slug = v.show_slug
where not exists (
  select 1
  from public.video_assets existing
  where existing.show_id = s.id
    and existing.title = v.title
);
