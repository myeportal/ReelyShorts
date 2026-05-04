import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { AdminVideo, Episode, ModerationStatus, Show, VideoSource } from '../types'
import { heroVideoUrl, starterAdminVideos, starterShows } from './mockData'

type LoadResult = {
  shows: Show[]
  adminVideos: AdminVideo[]
  source: 'supabase' | 'fallback'
  message: string
}

type LoadOptions = {
  includeAdminAssets?: boolean
}

type ShowRow = {
  id: string
  slug: string
  title: string
  genre: string | null
  tagline: string | null
  poster_url: string | null
  status: ModerationStatus
}

type EpisodeRow = {
  id: string
  show_id: string
  title: string
  duration_seconds: number | null
  coin_cost: number
  episode_number: number
  managed_asset_id: string | null
  video_source: 'youtube' | 'vimeo' | 'supabase_upload' | 'r2_upload'
  video_url: string
  status: ModerationStatus
}

type CmsShowInput = {
  title: string
  genre: string
  tagline: string
  poster: string
}

type CmsEpisodeInput = {
  showId: string
  title: string
  duration: string
  cost: number
  playbackAssetId?: string | null
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function runtimeToSeconds(runtime: string) {
  const parts = runtime.split(':').map((value) => Number(value))
  if (parts.length === 2 && parts.every((value) => Number.isFinite(value) && value >= 0)) {
    return (parts[0] * 60) + parts[1]
  }
  return 180
}

type VideoAssetRow = {
  id: string
  title: string
  source_type: 'youtube' | 'vimeo' | 'upload'
  source_value: string
  moderation_status: ModerationStatus
  featured: boolean
  show_id: string | null
  episode_id: string | null
}

type ProfileRow = {
  id: string
  display_name: string | null
  role: 'viewer' | 'admin' | 'moderator'
  coin_balance: number
}

function normalizeEpisodeSource(source: EpisodeRow['video_source']): VideoSource {
  if (source === 'vimeo') return 'vimeo'
  if (source === 'youtube') return 'youtube'
  return 'upload'
}

function findPlaybackAsset(videoRows: VideoAssetRow[], episode: EpisodeRow) {
  return videoRows.find((asset) => asset.id === episode.managed_asset_id)
    ?? videoRows.find((asset) => asset.episode_id === episode.id)
    ?? null
}

function secondsToRuntime(seconds: number | null) {
  if (!seconds || seconds <= 0) return '03:00'
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

export async function loadReelyData(session?: Session | null, options: LoadOptions = {}): Promise<LoadResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      shows: starterShows,
      adminVideos: starterAdminVideos,
      source: 'fallback',
      message: 'Supabase env vars are missing, so the app is using local demo content.',
    }
  }

  try {
    const videoQuery = options.includeAdminAssets
      ? supabase.from('video_assets').select('id, title, source_type, source_value, moderation_status, featured, show_id, episode_id').order('featured', { ascending: false }).order('created_at', { ascending: false })
      : supabase.from('video_assets').select('id, title, source_type, source_value, moderation_status, featured, show_id, episode_id').eq('moderation_status', 'published').order('featured', { ascending: false }).order('created_at', { ascending: false })

    const [{ data: showsData, error: showsError }, { data: episodesData, error: episodesError }, { data: videoData, error: videoError }, unlockedIds] = await Promise.all([
      supabase.from('shows').select('id, slug, title, genre, tagline, poster_url, status').eq('status', 'published').order('featured', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('episodes').select('id, show_id, title, duration_seconds, coin_cost, episode_number, managed_asset_id, video_source, video_url, status').eq('status', 'published').order('episode_number', { ascending: true }),
      videoQuery,
      loadUnlockedEpisodeIds(session),
    ])

    if (showsError || episodesError || videoError) {
      throw new Error(showsError?.message || episodesError?.message || videoError?.message)
    }

    const showRows = (showsData ?? []) as ShowRow[]
    const episodeRows = (episodesData ?? []) as EpisodeRow[]
    const videoRows = (videoData ?? []) as VideoAssetRow[]

    if (showRows.length === 0) {
      return {
        shows: starterShows,
        adminVideos: videoRows.length ? mapAdminVideos(videoRows) : starterAdminVideos,
        source: 'fallback',
        message: 'Supabase is connected, but there is no published show data yet. Apply the schema and seed content next.',
      }
    }

    const shows = showRows.map((show) => ({
      id: show.id,
      title: show.title,
      genre: show.genre ?? 'Short Drama',
      tagline: show.tagline ?? 'Add a tagline in the CMS.',
      poster: show.poster_url || '/reely-logo.png',
      rating: 4.7,
      status: show.status,
      episodes: episodeRows
        .filter((episode) => episode.show_id === show.id)
        .map((episode, index) => {
          const playbackAsset = findPlaybackAsset(videoRows, episode)
          return {
            id: episode.id,
            title: episode.title,
            duration: secondsToRuntime(episode.duration_seconds),
            cost: episode.coin_cost,
            unlocked: index === 0 || unlockedIds.has(episode.id),
            status: episode.status,
            playbackAssetId: playbackAsset?.id ?? episode.managed_asset_id,
            playbackSource: playbackAsset?.source_type ?? normalizeEpisodeSource(episode.video_source),
            playbackValue: playbackAsset?.source_value ?? episode.video_url,
          }
        }),
    }))

    return {
      shows,
      adminVideos: videoRows.length ? mapAdminVideos(videoRows) : starterAdminVideos,
      source: 'supabase',
      message: 'Live Supabase content loaded.',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Supabase error'
    return {
      shows: starterShows,
      adminVideos: starterAdminVideos,
      source: 'fallback',
      message: `Supabase wiring is live, but the app fell back to demo data: ${message}`,
    }
  }
}

async function loadUnlockedEpisodeIds(session?: Session | null) {
  const unlockedIds = new Set<string>()
  if (!isSupabaseConfigured || !supabase || !session?.user) return unlockedIds

  const { data, error } = await supabase.from('episode_unlocks').select('episode_id').eq('user_id', session.user.id)
  if (error) return unlockedIds
  for (const row of data ?? []) {
    if (row.episode_id) unlockedIds.add(row.episode_id)
  }
  return unlockedIds
}

function mapAdminVideos(rows: VideoAssetRow[]): AdminVideo[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    source: row.source_type,
    sourceValue: row.source_value,
    uploadLimit: row.source_type === 'upload' ? '1.3GB max upload' : 'Remote embed',
    status: row.moderation_status,
    featured: row.featured,
    showId: row.show_id,
    episodeId: row.episode_id,
  }))
}

export async function ensureViewerProfile(session: Session | null): Promise<ProfileRow | null> {
  if (!isSupabaseConfigured || !supabase || !session?.user) return null

  const payload = {
    id: session.user.id,
    display_name: session.user.email ?? 'Guest Viewer',
    role: 'viewer' as const,
    coin_balance: 10,
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('id, display_name, role, coin_balance')
    .single()

  if (error) throw new Error(error.message)
  return data as ProfileRow
}

export async function createCmsVideo(input: Omit<AdminVideo, 'id'>): Promise<AdminVideo> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ...input,
      id: crypto.randomUUID(),
    }
  }

  const payload = {
    title: input.title,
    source_type: input.source as VideoSource,
    source_value: input.sourceValue,
    upload_size_limit_bytes: 1395864371,
    moderation_status: input.status,
    featured: input.featured,
    show_id: input.showId ?? null,
    episode_id: input.episodeId ?? null,
  }

  const { data, error } = await supabase.from('video_assets').insert(payload).select('id, title, source_type, source_value, moderation_status, featured, show_id, episode_id').single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Video entry insert failed')
  }

  return {
    id: data.id,
    title: data.title,
    source: data.source_type,
    sourceValue: data.source_value,
    uploadLimit: input.source === 'upload' ? '1.3GB max upload' : 'Remote embed',
    status: data.moderation_status,
    featured: data.featured,
    showId: data.show_id,
    episodeId: data.episode_id,
  }
}

export async function cycleCmsVideoStatus(video: AdminVideo): Promise<AdminVideo> {
  const order: ModerationStatus[] = ['draft', 'review', 'published', 'archived']
  const nextStatus = order[(order.indexOf(video.status) + 1) % order.length]
  return updateCmsVideo(video.id, { ...video, status: nextStatus })
}

export async function updateCmsVideo(videoId: string, input: Omit<AdminVideo, 'id'>): Promise<AdminVideo> {
  if (!isSupabaseConfigured || !supabase || videoId.startsWith('vid-')) {
    return { ...input, id: videoId }
  }

  const { data, error } = await supabase
    .from('video_assets')
    .update({
      title: input.title,
      source_type: input.source,
      source_value: input.sourceValue,
      moderation_status: input.status,
      featured: input.featured,
      show_id: input.showId ?? null,
      episode_id: input.episodeId ?? null,
    })
    .eq('id', videoId)
    .select('id, title, source_type, source_value, moderation_status, featured, show_id, episode_id')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Video update failed')
  }

  return {
    id: data.id,
    title: data.title,
    source: data.source_type,
    sourceValue: data.source_value,
    uploadLimit: data.source_type === 'upload' ? '1.3GB max upload' : 'Remote embed',
    status: data.moderation_status,
    featured: data.featured,
    showId: data.show_id,
    episodeId: data.episode_id,
  }
}

export async function archiveCmsVideo(video: AdminVideo): Promise<AdminVideo> {
  return updateCmsVideo(video.id, { ...video, status: 'archived' })
}

export async function createCmsShow(input: CmsShowInput): Promise<Show> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      id: crypto.randomUUID(),
      title: input.title,
      genre: input.genre,
      tagline: input.tagline,
      poster: input.poster,
      rating: 4.5,
      episodes: [],
    }
  }

  const { data, error } = await supabase
    .from('shows')
    .insert({
      slug: slugify(input.title),
      title: input.title,
      genre: input.genre,
      tagline: input.tagline,
      poster_url: input.poster,
      status: 'draft',
    })
    .select('id, title, genre, tagline, poster_url, status')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Show create failed')

  return {
    id: data.id,
    title: data.title,
    genre: data.genre ?? input.genre,
    tagline: data.tagline ?? input.tagline,
    poster: data.poster_url || input.poster,
    rating: 4.5,
    status: data.status,
    episodes: [],
  }
}

export async function createCmsEpisode(input: CmsEpisodeInput, currentCount: number, adminVideos: AdminVideo[] = []): Promise<Episode> {
  if (!isSupabaseConfigured || !supabase) {
    const playbackAsset = adminVideos.find((asset) => asset.id === input.playbackAssetId) ?? null
    return {
      id: crypto.randomUUID(),
      title: input.title,
      duration: input.duration,
      cost: input.cost,
      unlocked: input.cost === 0,
      playbackAssetId: input.playbackAssetId ?? null,
      playbackSource: playbackAsset?.source ?? 'youtube',
      playbackValue: playbackAsset?.sourceValue ?? heroVideoUrl,
    }
  }

  const durationSeconds = runtimeToSeconds(input.duration)
  const playbackAsset = adminVideos.find((asset) => asset.id === input.playbackAssetId) ?? null

  const { data, error } = await supabase
    .from('episodes')
    .insert({
      show_id: input.showId,
      episode_number: currentCount + 1,
      title: input.title,
      duration_seconds: durationSeconds,
      coin_cost: input.cost,
      managed_asset_id: input.playbackAssetId ?? null,
      video_source: playbackAsset?.source === 'upload' ? 'supabase_upload' : (playbackAsset?.source ?? 'youtube'),
      video_url: playbackAsset?.sourceValue ?? heroVideoUrl,
      status: 'draft',
    })
    .select('id, title, duration_seconds, coin_cost, managed_asset_id, video_source, video_url, status')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Episode create failed')

  return {
    id: data.id,
    title: data.title,
    duration: secondsToRuntime(data.duration_seconds),
    cost: data.coin_cost,
    unlocked: data.coin_cost === 0,
    status: data.status,
    playbackAssetId: data.managed_asset_id,
    playbackSource: normalizeEpisodeSource(data.video_source),
    playbackValue: data.video_url,
  }
}

export async function updateCmsShow(showId: string, input: CmsShowInput): Promise<Show> {
  if (!isSupabaseConfigured || !supabase || showId.startsWith('show-')) {
    return {
      id: showId,
      title: input.title,
      genre: input.genre,
      tagline: input.tagline,
      poster: input.poster,
      rating: 4.5,
      episodes: [],
    }
  }

  const { data, error } = await supabase
    .from('shows')
    .update({
      slug: slugify(input.title),
      title: input.title,
      genre: input.genre,
      tagline: input.tagline,
      poster_url: input.poster,
      updated_at: new Date().toISOString(),
    })
    .eq('id', showId)
    .select('id, title, genre, tagline, poster_url, status')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Show update failed')

  return {
    id: data.id,
    title: data.title,
    genre: data.genre ?? input.genre,
    tagline: data.tagline ?? input.tagline,
    poster: data.poster_url || input.poster,
    rating: 4.5,
    status: data.status,
    episodes: [],
  }
}

export async function updateCmsEpisode(episodeId: string, input: Omit<CmsEpisodeInput, 'showId'>, adminVideos: AdminVideo[] = []): Promise<Episode> {
  if (!isSupabaseConfigured || !supabase || episodeId.startsWith('ep-')) {
    const playbackAsset = adminVideos.find((asset) => asset.id === input.playbackAssetId) ?? null
    return {
      id: episodeId,
      title: input.title,
      duration: input.duration,
      cost: input.cost,
      unlocked: input.cost === 0,
      playbackAssetId: input.playbackAssetId ?? null,
      playbackSource: playbackAsset?.source ?? 'youtube',
      playbackValue: playbackAsset?.sourceValue ?? heroVideoUrl,
    }
  }

  const playbackAsset = adminVideos.find((asset) => asset.id === input.playbackAssetId) ?? null

  const { data, error } = await supabase
    .from('episodes')
    .update({
      title: input.title,
      duration_seconds: runtimeToSeconds(input.duration),
      coin_cost: input.cost,
      managed_asset_id: input.playbackAssetId ?? null,
      video_source: playbackAsset?.source === 'upload' ? 'supabase_upload' : (playbackAsset?.source ?? 'youtube'),
      video_url: playbackAsset?.sourceValue ?? heroVideoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', episodeId)
    .select('id, title, duration_seconds, coin_cost, managed_asset_id, video_source, video_url, status')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Episode update failed')

  return {
    id: data.id,
    title: data.title,
    duration: secondsToRuntime(data.duration_seconds),
    cost: data.coin_cost,
    unlocked: data.coin_cost === 0,
    status: data.status,
    playbackAssetId: data.managed_asset_id,
    playbackSource: normalizeEpisodeSource(data.video_source),
    playbackValue: data.video_url,
  }
}

export async function persistEpisodeUnlock(session: Session | null, episodeId: string, cost: number): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase || !session?.user) return null

  const { data, error } = await supabase.rpc('unlock_episode_with_coins', {
    target_episode_id: episodeId,
  })

  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : Math.max(0, 10 - cost)
}

export async function persistCoinReward(session: Session | null, rewardCoins: number): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase || !session?.user) return null

  const verificationToken = crypto.randomUUID()
  const { data, error } = await supabase.rpc('claim_rewarded_ad', {
    reward_coins: rewardCoins,
    verification_token: verificationToken,
  })

  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : null
}

export async function persistWatchProgress(session: Session | null, episodeId: string, progressSeconds: number, completed = false) {
  if (!isSupabaseConfigured || !supabase || !session?.user) return

  const { error } = await supabase.from('watch_progress').upsert(
    {
      user_id: session.user.id,
      episode_id: episodeId,
      progress_seconds: progressSeconds,
      completed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,episode_id' },
  )

  if (error) throw new Error(error.message)
}

export const featuredVideoUrl = heroVideoUrl
