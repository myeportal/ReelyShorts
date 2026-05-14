import './App.css'
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  archiveCmsVideo,
  createCmsEpisode,
  createCmsShow,
  createCmsVideo,
  cycleCmsVideoStatus,
  ensureViewerProfile,
  featuredVideoUrl,
  loadReelyData,
  persistCoinReward,
  persistEpisodeUnlock,
  persistWatchProgress,
  updateCmsEpisode,
  updateCmsShow,
  updateCmsVideo,
} from './data/reelyApi'
import { starterAdminVideos, starterShows } from './data/mockData'
import { signInAsGuest, signOutUser, subscribeToAuthChanges } from './lib/auth'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { captureError, trackEvent, trackScreenView } from './lib/telemetry'
import type { AdminVideo, ModerationStatus, Show, VideoSource, ViewerMode } from './types'

function youtubeEmbedUrl(url: string) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    const start = parsed.searchParams.get('t')?.replace('s', '')
    const startParam = start ? `start=${Number.parseInt(start, 10) || 0}` : ''

    if (host === 'youtu.be') {
      const videoId = parsed.pathname.replace(/^\//, '')
      return videoId ? `https://www.youtube.com/embed/${videoId}${startParam ? `?${startParam}` : ''}` : ''
    }

    const playlistId = parsed.searchParams.get('list')
    if (playlistId && parsed.pathname.includes('/playlist')) {
      return `https://www.youtube.com/embed/videoseries?list=${playlistId}`
    }

    const videoId = parsed.searchParams.get('v')
    if (videoId) {
      const params = new URLSearchParams()
      if (playlistId) params.set('list', playlistId)
      if (start) params.set('start', String(Number.parseInt(start, 10) || 0))
      const query = params.toString()
      return `https://www.youtube.com/embed/${videoId}${query ? `?${query}` : ''}`
    }

    if (/^\/(channel|c|@)/.test(parsed.pathname)) {
      return ''
    }

    return ''
  } catch {
    return ''
  }
}

function vimeoEmbedUrl(url: string) {
  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/\/(\d+)/)
    if (!match) return url
    return `https://player.vimeo.com/video/${match[1]}`
  } catch {
    return url
  }
}

function renderPlaybackMedia(source: VideoSource | null | undefined, value: string | null | undefined, title: string, large = false) {
  const className = `player-frame${large ? ' large' : ''}`
  if (!value) {
    return <div className={className}><div className="feedback-line">No playback source linked yet.</div></div>
  }

  if (source === 'upload') {
    return <div className={className}><video controls playsInline src={value} title={title} /></div>
  }

  const embedUrl = source === 'vimeo' ? vimeoEmbedUrl(value) : youtubeEmbedUrl(value)
  if (!embedUrl) {
    return <div className={className}><div className="feedback-line">This source is not directly embeddable yet. Link a YouTube video or playlist URL for playback.</div></div>
  }
  return <div className={className}><iframe title={title} src={embedUrl} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>
}

const genreChips = ['All', 'Romance', 'Fantasy', 'Thriller', 'Drama', 'Mystery']

type CmsFormState = Omit<AdminVideo, 'id'>
type ViewerRole = 'viewer' | 'admin' | 'moderator'
type CmsFilter = 'all' | ModerationStatus

const defaultCmsForm: CmsFormState = {
  title: '',
  source: 'youtube',
  sourceValue: '',
  uploadLimit: '1.3GB max upload',
  status: 'draft',
  featured: false,
  showId: null,
  episodeId: null,
}

function App() {
  const location = useLocation()
  const [coinBalance, setCoinBalance] = useState(10)
  const [adCount, setAdCount] = useState(0)
  const [shows, setShows] = useState<Show[]>(starterShows)
  const [adminVideos, setAdminVideos] = useState<AdminVideo[]>(starterAdminVideos)
  const [activeShowId, setActiveShowId] = useState(starterShows[0].id)
  const [loading, setLoading] = useState(true)
  const [dataMessage, setDataMessage] = useState('Preparing REELY SHORTS…')
  const [adminMessage, setAdminMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [authMessage, setAuthMessage] = useState('Guest mode ready.')
  const [formState, setFormState] = useState<CmsFormState>(defaultCmsForm)
  const [session, setSession] = useState<Session | null>(null)
  const [viewerRole, setViewerRole] = useState<ViewerRole>('viewer')

  async function hydrate(nextSession: Session | null = session, nextViewerRole: ViewerRole = viewerRole) {
    setLoading(true)
    const result = await loadReelyData(nextSession, { includeAdminAssets: nextViewerRole === 'admin' || nextViewerRole === 'moderator' })
    setShows(result.shows)
    setAdminVideos(result.adminVideos)
    setDataMessage(result.message)
    setActiveShowId(result.shows[0]?.id ?? starterShows[0].id)
    setLoading(false)
  }

  const viewerMode: ViewerMode = session ? 'signed-in' : 'guest'
  const adminAccess = viewerRole === 'admin' || viewerRole === 'moderator'

  useEffect(() => {
    hydrate(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    trackScreenView(location.pathname, {
      viewer_mode: viewerMode,
      viewer_role: viewerRole,
    })
  }, [location.pathname, viewerMode, viewerRole])

  useEffect(() => {
    let mounted = true

    async function bootstrapSession() {
      if (!supabase) return
      const { data } = await supabase.auth.getSession()
      if (!mounted) return

      let activeSession = data.session
      if (!activeSession) {
        const { session: guestSession, error } = await signInAsGuest()
        if (!mounted) return
        if (error) {
          setAuthMessage(`Guest sign-in failed: ${error.message}`)
          return
        }
        activeSession = guestSession
        setAuthMessage('Signed in as guest automatically.')
      }

      setSession(activeSession)
      if (activeSession) {
        try {
          const profile = await ensureViewerProfile(activeSession)
          if (!mounted) return
          setViewerRole(profile?.role ?? 'viewer')
          setCoinBalance(profile?.coin_balance ?? 10)
          setAuthMessage(`Signed in. Role: ${profile?.role ?? 'viewer'}.`)
          await hydrate(activeSession, profile?.role ?? 'viewer')
        } catch (error) {
          if (!mounted) return
          const message = error instanceof Error ? error.message : 'Profile bootstrap failed'
          setAuthMessage(`Session found, but profile setup failed: ${message}`)
        }
      }
    }

    bootstrapSession()
    const subscription = subscribeToAuthChanges(async (nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      if (!nextSession) {
        setViewerRole('viewer')
        setCoinBalance(10)
        await hydrate(null)
        return
      }

      try {
        const profile = await ensureViewerProfile(nextSession)
        if (!mounted) return
        setViewerRole(profile?.role ?? 'viewer')
        setCoinBalance(profile?.coin_balance ?? 10)
        setAuthMessage(`Signed in. Role: ${profile?.role ?? 'viewer'}.`)
        await hydrate(nextSession, profile?.role ?? 'viewer')
      } catch (error) {
        if (!mounted) return
        const message = error instanceof Error ? error.message : 'Profile sync failed'
        setAuthMessage(`Signed in, but profile sync failed: ${message}`)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPublished = useMemo(
    () => adminVideos.filter((video) => video.status === 'published').length,
    [adminVideos],
  )

  const activeShow = useMemo(
    () => shows.find((show) => show.id === activeShowId) ?? shows[0] ?? starterShows[0],
    [activeShowId, shows],
  )

  async function watchRewardedAd() {
    const reward = adCount === 0 ? 15 : 10
    setCoinBalance((current) => current + reward)
    setAdCount((current) => current + 1)

    try {
      const nextBalance = await persistCoinReward(session, reward)
      if (typeof nextBalance === 'number') setCoinBalance(nextBalance)
      trackEvent({ name: 'rewarded_ad_completed', properties: { reward, viewer_mode: viewerMode } })
      if (session) setAuthMessage(`Reward persisted: +${reward} coins.`)
    } catch (error) {
      setCoinBalance((current) => Math.max(current - reward, 0))
      setAdCount((current) => Math.max(current - 1, 0))
      captureError(error, { action: 'watch_rewarded_ad' })
      const message = error instanceof Error ? error.message : 'Coin reward persistence failed'
      setAuthMessage(message)
    }
  }

  async function unlockEpisode(showId: string, episodeId: string, cost: number) {
    if (coinBalance < cost) return

    setCoinBalance((current) => current - cost)
    setShows((current) =>
      current.map((show) =>
        show.id !== showId
          ? show
          : {
              ...show,
              episodes: show.episodes.map((episode) =>
                episode.id === episodeId ? { ...episode, unlocked: true } : episode,
              ),
            },
      ),
    )

    try {
      trackEvent({ name: 'episode_unlocked', properties: { show_id: showId, episode_id: episodeId, cost } })
      const nextBalance = await persistEpisodeUnlock(session, episodeId, cost)
      if (typeof nextBalance === 'number') setCoinBalance(nextBalance)
      if (session) setAuthMessage('Episode unlock saved to Supabase.')
    } catch (error) {
      setCoinBalance((current) => current + cost)
      setShows((current) =>
        current.map((show) =>
          show.id !== showId
            ? show
            : {
                ...show,
                episodes: show.episodes.map((episode) =>
                  episode.id === episodeId ? { ...episode, unlocked: false } : episode,
                ),
              },
        ),
      )
      captureError(error, { action: 'unlock_episode', show_id: showId, episode_id: episodeId })
      const message = error instanceof Error ? error.message : 'Unlock persistence failed'
      setAuthMessage(message)
    }
  }

  async function handleCreateVideo() {
    if (!formState.title || !formState.sourceValue) {
      setAdminMessage('Add a title and a source value before saving the CMS entry.')
      return
    }

    setSaving(true)
    setAdminMessage('')

    try {
      const created = await createCmsVideo(formState)
      setAdminVideos((current) => [created, ...current])
      setAdminMessage(
        isSupabaseConfigured
          ? 'CMS entry saved to Supabase.'
          : 'Saved locally only. Supabase env vars are not configured.',
      )
      setFormState(defaultCmsForm)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error'
      captureError(error, { action: 'create_cms_video' })
      setAdminMessage(`Save failed: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleCycleModerationStatus(videoId: string) {
    const target = adminVideos.find((video) => video.id === videoId)
    if (!target) return

    setAdminMessage('')

    try {
      const updated = await cycleCmsVideoStatus(target)
      setAdminVideos((current) => current.map((video) => (video.id === videoId ? updated : video)))
      setAdminMessage('Moderation status updated.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown update error'
      setAdminMessage(`Status update failed: ${message}`)
    }
  }

  async function handleGuestAuth() {
    if (!isSupabaseConfigured) {
      setAuthMessage('Supabase is not configured yet, so guest auth is running in local demo mode.')
      return
    }

    const { session: nextSession, error } = await signInAsGuest()
    if (error) {
      setAuthMessage(`Guest sign-in failed: ${error.message}`)
      return
    }

    setSession(nextSession)
    try {
      const profile = await ensureViewerProfile(nextSession)
      setViewerRole(profile?.role ?? 'viewer')
      setCoinBalance(profile?.coin_balance ?? 10)
      setAuthMessage('Signed in as guest. Unlocks and progress can now be tied to a live Supabase session.')
      await hydrate(nextSession)
    } catch (profileError) {
      const message = profileError instanceof Error ? profileError.message : 'Profile setup failed'
      setAuthMessage(`Guest sign-in worked, but profile setup failed: ${message}`)
    }
  }

  async function handleSignOut() {
    await signOutUser()
    setSession(null)
    setViewerRole('viewer')
    setCoinBalance(10)
    setAuthMessage('Signed out. Back to guest mode.')
    await hydrate(null)
  }

  const shared = {
    coinBalance,
    adCount,
    totalPublished,
    activeShow,
    shows,
    setActiveShowId,
    unlockEpisode,
    watchRewardedAd,
    viewerMode,
    session,
    setAuthMessage,
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup brand-lockup--banner">
          <img src="/reely-banner.jpg" alt="Reely Shorts banner logo" className="brand-logo brand-logo--banner" />
        </div>

        <nav className="topbar-nav" aria-label="Primary navigation">
          <Link to="/">For You</Link>
          <Link to={`/show/${activeShow.id}`}>Series</Link>
          <Link to={`/watch/${activeShow.id}/${activeShow.episodes[0]?.id ?? 'episode-1'}`}>Watch</Link>
          <Link to="/admin">Studio</Link>
        </nav>
      </header>

      <div className="status-banner">
        <strong>{loading ? 'Loading…' : isSupabaseConfigured ? 'Supabase wired' : 'Demo mode'}</strong>
        <span>{dataMessage}</span>
      </div>

      <div className="status-banner auth-banner">
        <strong>{viewerMode === 'signed-in' ? `Signed in (${viewerRole})` : 'Guest mode'}</strong>
        <span>{authMessage}</span>
        <div className="auth-actions">
          {viewerMode === 'signed-in' ? (
            <button onClick={handleSignOut}>Sign out</button>
          ) : (
            <button onClick={handleGuestAuth}>Continue as guest</button>
          )}
        </div>
      </div>

      <Routes>
        <Route path="/" element={<HomeScreen {...shared} />} />
        <Route path="/show/:showId" element={<ShowDetailScreen {...shared} />} />
        <Route path="/watch/:showId/:episodeId" element={<PlayerScreen {...shared} />} />
        <Route
          path="/admin"
          element={
            <AdminGate adminAccess={adminAccess} viewerMode={viewerMode}>
              <AdminScreen
                adminVideos={adminVideos}
                setAdminVideos={setAdminVideos}
                shows={shows}
                setShows={setShows}
                formState={formState}
                setFormState={setFormState}
                saving={saving}
                adminMessage={adminMessage}
                onCreate={handleCreateVideo}
                onCycleStatus={handleCycleModerationStatus}
              />
            </AdminGate>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

type SharedProps = {
  coinBalance: number
  adCount: number
  totalPublished: number
  activeShow: Show
  shows: Show[]
  setActiveShowId: (id: string) => void
  unlockEpisode: (showId: string, episodeId: string, cost: number) => Promise<void>
  watchRewardedAd: () => Promise<void>
  viewerMode: ViewerMode
  session: Session | null
  setAuthMessage: (value: string) => void
}

function HomeScreen({ coinBalance, adCount, totalPublished, activeShow, shows, setActiveShowId, unlockEpisode, watchRewardedAd, viewerMode }: SharedProps) {
  return (
    <main className="page-grid watch-grid">
      <section className="hero-card hero-card--cinematic">
        <div className="hero-backdrop" style={{ backgroundImage: `url(${activeShow.poster})` }} />
        <div className="hero-copy hero-copy--overlay">
          <span className="feature-badge">Top Pick</span>
          <p className="eyebrow">For you tonight</p>
          <h2>{activeShow.title}</h2>
          <p className="hero-tagline">{activeShow.tagline}</p>
          <div className="meta-pills">
            <span className="pill gold">⭐ {activeShow.rating}</span>
            <span className="pill">{activeShow.genre}</span>
            <span className="pill">{activeShow.episodes.length} episodes</span>
            <span className="pill">{viewerMode === 'signed-in' ? 'Persistent viewer' : 'Guest mode'}</span>
          </div>
          <div className="hero-actions">
            <Link to={`/watch/${activeShow.id}/${activeShow.episodes[0]?.id ?? 'episode-1'}`}>Watch free now</Link>
            <button onClick={watchRewardedAd}>Earn coins</button>
          </div>
          <div className="stats-row">
            <article><strong>{coinBalance}</strong><span>Coins</span></article>
            <article><strong>{adCount}</strong><span>Rewarded ads watched</span></article>
            <article><strong>{totalPublished}</strong><span>Published video entries</span></article>
          </div>
        </div>
      </section>

      <section className="mobile-preview section-block">
        <div className="section-heading compact"><div><p className="eyebrow">App preview</p><h3>{viewerMode === 'signed-in' ? 'Signed-in mobile feel' : 'Guest mobile feel'}</h3></div></div>
        <div className="phone-shell">
          <div className="phone-topbar"><span>⌕</span><span className="search-pill">Search romance, revenge, alpha...</span><span>♡</span></div>
          <div className="phone-hero" style={{ backgroundImage: `url(${activeShow.poster})` }}>
            <div className="phone-hero-overlay">
              <span className="feature-badge">HOT</span>
              <h4>{activeShow.title}</h4>
              <p>{activeShow.tagline}</p>
              <Link className="phone-play" to={`/watch/${activeShow.id}/${activeShow.episodes[0]?.id ?? 'episode-1'}`}>▶ Watch Free</Link>
            </div>
          </div>
          <div className="phone-strip">
            {shows.map((show) => (
              <Link
                key={show.id}
                className={`mini-poster ${show.id === activeShow.id ? 'active' : ''}`}
                to={`/show/${show.id}`}
                onClick={() => setActiveShowId(show.id)}
                style={{ backgroundImage: `url(${show.poster})` }}
                aria-label={`Open ${show.title}`}
              />
            ))}
          </div>
          <div className="phone-nav"><span className="active">Home</span><span>Search</span><span>My List</span><span>Coins</span><span>Profile</span></div>
        </div>
      </section>

      <section className="genre-row section-block">
        <div className="chip-row">{genreChips.map((chip, index) => <button key={chip} className={`genre-chip ${index === 0 ? 'active' : ''}`}>{chip}</button>)}</div>
      </section>

      <section className="section-block section-block--catalog">
        <div className="section-heading section-heading--catalog"><div><p className="eyebrow">Trending now</p><h3>Portrait-first discovery with that familiar short-drama rhythm</h3></div><span className="pill">Ads unlock episodes for guests</span></div>
        <div className="show-grid show-grid--tall">
          {shows.map((show) => (
            <article className={`show-card show-card--tall ${show.id === activeShow.id ? 'selected' : ''}`} key={show.id}>
              <Link className="poster-hit" to={`/show/${show.id}`} onClick={() => setActiveShowId(show.id)}><img src={show.poster} alt={`${show.title} poster placeholder`} className="show-poster show-poster--tall" /></Link>
              <div className="show-body">
                <div className="show-title-row"><div><h4>{show.title}</h4><p>{show.genre}</p></div><span>⭐ {show.rating}</span></div>
                <p className="tagline">{show.tagline}</p>
                <div className="hero-actions">
                  <Link className="ghost-link" to={`/show/${show.id}`} onClick={() => setActiveShowId(show.id)}>View details</Link>
                  <Link className="ghost-link" to={`/watch/${show.id}/${show.episodes[0]?.id ?? 'episode-1'}`} onClick={() => setActiveShowId(show.id)}>Watch now</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="detail-grid">
        <section className="section-block player-card">
          <div className="section-heading compact"><div><p className="eyebrow">Episode player</p><h3>{activeShow.title}</h3></div><span className="pill gold">First episode free</span></div>
          {renderPlaybackMedia(activeShow.episodes[0]?.playbackSource ?? 'youtube', activeShow.episodes[0]?.playbackValue ?? featuredVideoUrl, 'Featured REELY SHORTS video')}
          <div className="player-meta"><div><h4>{activeShow.episodes[0]?.title ?? 'Episode 1'}</h4><p>{activeShow.tagline}</p></div><div className="player-actions"><button>♡ Save</button><button>⤴ Share</button></div></div>
        </section>

        <section className="section-block episode-panel">
          <div className="section-heading compact"><div><p className="eyebrow">Episodes</p><h3>{activeShow.episodes.length} total</h3></div><span className="pill">Unlock with coins</span></div>
          <ul className="episode-list episode-list--stacked">
            {activeShow.episodes.map((episode) => (
              <li key={episode.id}>
                <div><strong>{episode.title}</strong><span>{episode.duration}</span></div>
                {episode.unlocked || episode.cost === 0 ? <Link className="unlocked-pill" to={`/watch/${activeShow.id}/${episode.id}`}>Watch now</Link> : <button onClick={() => unlockEpisode(activeShow.id, episode.id, episode.cost)}>Unlock for {episode.cost} coins</button>}
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="section-block cms-summary">
        <div>
          <p className="eyebrow">White label opportunity</p>
          <h3>Own the REELY SHORTS app before the first 100 white label licenses disappear.</h3>
          <p>Own the REELY SHORTS app before the first 100 white label licenses disappear and position yourself at the front of one of the fastest-growing entertainment categories online: vertical short drama streaming. This is your opportunity to secure a fully branded-ready short drama app system designed for entrepreneurs, creators, marketers, agencies, and digital publishers who want to enter the booming “Reel-style binge content” market without spending months or years building technology from scratch.</p>
          <p>The early white label release is now open for a limited number of founding license holders, giving you access to a ready-to-brand streaming platform engineered specifically for addictive short-form drama experiences. Instead of trying to piece together developers, designers, backend systems, mobile frameworks, hosting, and monetization tools on your own, REELY SHORTS gives you a launch-ready foundation you can customize into your own entertainment brand.</p>
          <p>This isn’t just a template or generic clone script. REELY SHORTS was built around the explosive demand for serialized vertical storytelling — the kind of rapid-consumption content audiences binge for hours across mobile devices. From romance and suspense to billionaire stories, revenge arcs, emotional cliffhangers, viral mini-series, and creator-driven episodic entertainment, the short drama niche is rapidly becoming one of the most profitable mobile content markets online. With REELY SHORTS, you can step into that momentum with a platform already structured to support modern viewer behavior.</p>
        </div>
        <div className="carrier-list social-links-card">
          <h4>Follow the launch across social channels</h4>
          <p>We can drop in each live page URL next. For now, this section is ready for Facebook, Instagram, X, and LinkedIn.</p>
          <div className="social-button-grid">
            <a href="#" className="social-button social-button--facebook" aria-label="Facebook page link placeholder">
              <span className="social-button__icon" aria-hidden="true">f</span>
              <span>Facebook</span>
            </a>
            <a href="#" className="social-button social-button--instagram" aria-label="Instagram page link placeholder">
              <span className="social-button__icon" aria-hidden="true">◉</span>
              <span>Instagram</span>
            </a>
            <a href="#" className="social-button social-button--x" aria-label="X page link placeholder">
              <span className="social-button__icon" aria-hidden="true">𝕏</span>
              <span>X</span>
            </a>
            <a href="#" className="social-button social-button--linkedin" aria-label="LinkedIn page link placeholder">
              <span className="social-button__icon" aria-hidden="true">in</span>
              <span>LinkedIn</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}

function ShowDetailScreen({ activeShow, shows, setActiveShowId, unlockEpisode }: SharedProps) {
  const { showId } = useParams()
  const navigate = useNavigate()
  const show = shows.find((item) => item.id === showId) ?? activeShow
  useEffect(() => { if (show?.id) setActiveShowId(show.id) }, [setActiveShowId, show?.id])
  if (!show) return <Navigate to="/" replace />
  return (
    <main className="page-grid">
      <section className="section-block detail-hero">
        <img src={show.poster} alt={`${show.title} poster`} className="detail-poster" />
        <div className="detail-copy">
          <p className="eyebrow">Show detail</p><h2>{show.title}</h2><p className="hero-tagline">{show.tagline}</p>
          <div className="meta-pills"><span className="pill gold">⭐ {show.rating}</span><span className="pill">{show.genre}</span><span className="pill">{show.episodes.length} episodes</span></div>
          <div className="hero-actions"><Link to={`/watch/${show.id}/${show.episodes[0]?.id ?? 'episode-1'}`}>Start episode 1</Link><button onClick={() => navigate('/admin')}>Open CMS</button></div>
        </div>
      </section>
      <section className="section-block">
        <div className="section-heading compact"><div><p className="eyebrow">Episode list</p><h3>Cliffhangers and coin unlocks</h3></div></div>
        <ul className="episode-list episode-list--stacked">
          {show.episodes.map((episode) => (
            <li key={episode.id}>
              <div><strong>{episode.title}</strong><span>{episode.duration}</span></div>
              {episode.unlocked || episode.cost === 0 ? <Link className="unlocked-pill" to={`/watch/${show.id}/${episode.id}`}>Watch now</Link> : <button onClick={() => unlockEpisode(show.id, episode.id, episode.cost)}>Unlock for {episode.cost} coins</button>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

function PlayerScreen({ activeShow, shows, setActiveShowId, session, setAuthMessage }: SharedProps) {
  const { showId, episodeId } = useParams()
  const show = shows.find((item) => item.id === showId) ?? activeShow
  const location = useLocation()
  const [progressMessage, setProgressMessage] = useState('Progress not saved yet.')
  useEffect(() => { if (show?.id) setActiveShowId(show.id) }, [setActiveShowId, show?.id])
  if (!show) return <Navigate to="/" replace />
  const episode = show.episodes.find((item) => item.id === episodeId) ?? show.episodes[0]

  async function handleProgressSave(progressSeconds: number, completed = false) {
    if (!episode) return
    try {
      await persistWatchProgress(session, episode.id, progressSeconds, completed)
      trackEvent({ name: completed ? 'episode_completed' : 'watch_progress_saved', properties: { episode_id: episode.id, progress_seconds: progressSeconds, show_id: show.id } })
      const message = completed ? 'Playback completion saved.' : `Progress saved at ${progressSeconds} seconds.`
      setProgressMessage(message)
      if (session) setAuthMessage(message)
    } catch (error) {
      captureError(error, { action: 'save_progress', episode_id: episode.id, show_id: show.id })
      const message = error instanceof Error ? error.message : 'Progress persistence failed'
      setProgressMessage(message)
      setAuthMessage(message)
    }
  }

  return (
    <main className="page-grid">
      <section className="section-block player-route-card">
        <div className="section-heading compact"><div><p className="eyebrow">Now playing</p><h3>{show.title}</h3></div><span className="pill">Route: {location.pathname}</span></div>
        {renderPlaybackMedia(episode?.playbackSource ?? 'youtube', episode?.playbackValue ?? featuredVideoUrl, 'REELY SHORTS player', true)}
        <div className="player-meta route-meta">
          <div><h4>{episode?.title ?? 'Episode'}</h4><p>{show.tagline}</p></div>
          <div className="player-actions"><button onClick={() => handleProgressSave(45)}>Save 45s progress</button><button onClick={() => handleProgressSave(180, true)}>Mark complete</button><Link to={`/show/${show.id}`}>Back to show</Link><Link to="/">Back home</Link></div>
        </div>
        <p className="feedback-line">{progressMessage}</p>
      </section>
    </main>
  )
}

type AdminProps = {
  adminVideos: AdminVideo[]
  setAdminVideos: React.Dispatch<React.SetStateAction<AdminVideo[]>>
  shows: Show[]
  setShows: React.Dispatch<React.SetStateAction<Show[]>>
  formState: CmsFormState
  setFormState: React.Dispatch<React.SetStateAction<CmsFormState>>
  saving: boolean
  adminMessage: string
  onCreate: () => Promise<void>
  onCycleStatus: (videoId: string) => Promise<void>
}

type AdminGateProps = { adminAccess: boolean; viewerMode: ViewerMode; children: React.ReactNode }

function AdminGate({ adminAccess, viewerMode, children }: AdminGateProps) {
  if (adminAccess) return <>{children}</>
  return (
    <main className="page-grid">
      <section className="section-block gated-card">
        <p className="eyebrow">Admin access required</p>
        <h2>CMS is protected until your profile role is upgraded.</h2>
        <p>Current mode: {viewerMode}. Once your Supabase profile role is set to <strong>admin</strong> or <strong>moderator</strong>, this route will open automatically.</p>
        <div className="hero-actions"><Link to="/">Back to home</Link><Link to="/show/midnight-vows">Open show detail</Link></div>
      </section>
    </main>
  )
}

function validateCmsForm(formState: CmsFormState) {
  if (!formState.title.trim()) return 'Title is required.'
  if (!formState.sourceValue.trim()) return 'Source URL or upload reference is required.'

  if (formState.source === 'youtube' && !/(youtube\.com|youtu\.be)/i.test(formState.sourceValue)) {
    return 'YouTube entries need a valid youtube.com or youtu.be link.'
  }
  if (formState.source === 'vimeo' && !/vimeo\.com/i.test(formState.sourceValue)) {
    return 'Vimeo entries need a valid vimeo.com link.'
  }
  if (formState.source === 'upload' && !/(supabase:\/\/|\.mp4|\.mov|\.m3u8)/i.test(formState.sourceValue)) {
    return 'Upload entries need a storage path or video file reference.'
  }
  return null
}

function assetEditorialIssues(formState: CmsFormState, statusOverride?: ModerationStatus) {
  const issues: string[] = []
  const nextState = { ...formState, status: statusOverride ?? formState.status }
  const baseError = validateCmsForm(nextState)
  if (baseError) issues.push(baseError)
  if (nextState.status === 'published' && !nextState.showId) {
    issues.push('Published assets should be linked to a show.')
  }
  if (nextState.status === 'published' && nextState.episodeId && !nextState.showId) {
    issues.push('Episode-linked assets must also be linked to a show.')
  }
  return issues
}

function showEditorialIssues(show: Show | null, statusOverride?: ModerationStatus) {
  if (!show) return ['Choose a show first.']
  const nextShow = { ...show, status: statusOverride ?? show.status }
  const issues: string[] = []
  if (!nextShow.title.trim()) issues.push('Show title is required.')
  if (!nextShow.tagline.trim()) issues.push('Show tagline is required.')
  if (!nextShow.poster.trim()) issues.push('Show poster is required.')
  if (nextShow.episodes.length === 0) issues.push('A publishable show needs at least one episode.')
  if (!nextShow.episodes.some((episode) => Boolean(episode.playbackValue))) issues.push('At least one episode needs a playable source.')
  return issues
}

function episodeEditorialIssues(episode: Show['episodes'][number] | null, statusOverride?: ModerationStatus) {
  if (!episode) return ['Choose an episode first.']
  const nextEpisode = { ...episode, status: statusOverride ?? episode.status }
  const issues: string[] = []
  if (!nextEpisode.title.trim()) issues.push('Episode title is required.')
  if (!nextEpisode.duration.trim()) issues.push('Episode duration is required.')
  if (nextEpisode.cost < 0) issues.push('Coin cost cannot be negative.')
  if (!nextEpisode.playbackValue) issues.push('Episode needs a playable managed asset or fallback source.')
  return issues
}

function sourceHint(source: VideoSource) {
  if (source === 'youtube') return 'Paste a full YouTube URL'
  if (source === 'vimeo') return 'Paste a full Vimeo URL'
  return 'Use a storage path like supabase://bucket/video.mp4'
}

function AdminScreen({ adminVideos, setAdminVideos, shows, setShows, formState, setFormState, saving, adminMessage, onCreate, onCycleStatus }: AdminProps) {
  const [filter, setFilter] = useState<CmsFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(adminVideos[0]?.id ?? null)
  const [selectedShowId, setSelectedShowId] = useState<string>(shows[0]?.id ?? '')
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null)
  const [showDraft, setShowDraft] = useState({ title: '', genre: 'Drama', tagline: '', poster: '/reely-logo.png', status: 'draft' as ModerationStatus })
  const [episodeDraft, setEpisodeDraft] = useState({ title: '', duration: '03:00', cost: 15, playbackAssetId: null as string | null, status: 'draft' as ModerationStatus })
  const [showMessage, setShowMessage] = useState('')
  const [episodeMessage, setEpisodeMessage] = useState('')
  const [assetMessage, setAssetMessage] = useState('')

  useEffect(() => {
    if (!selectedId && adminVideos[0]?.id) setSelectedId(adminVideos[0].id)
  }, [adminVideos, selectedId])

  useEffect(() => {
    if (!selectedShowId && shows[0]?.id) setSelectedShowId(shows[0].id)
  }, [selectedShowId, shows])

  const filteredVideos = adminVideos.filter((video) => (filter === 'all' ? true : video.status === filter))
  const selectedVideo = adminVideos.find((video) => video.id === selectedId) ?? filteredVideos[0] ?? null
  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? shows[0] ?? null
  const selectedEpisode = selectedShow?.episodes.find((episode) => episode.id === selectedEpisodeId) ?? null
  const assetIssues = assetEditorialIssues(formState)
  const assetPublishIssues = assetEditorialIssues(formState, 'published')
  const validationError = assetIssues[0] ?? null
  const showDraftPreview = selectedShow ? { ...selectedShow, ...showDraft } : null
  const showIssues = showEditorialIssues(showDraftPreview)
  const showPublishIssues = showEditorialIssues(showDraftPreview, 'published')
  const showError = showIssues[0] ?? null
  const episodeDraftPreview = selectedEpisode ? { ...selectedEpisode, ...episodeDraft } : null
  const episodeIssues = episodeEditorialIssues(episodeDraftPreview)
  const episodePublishIssues = episodeEditorialIssues(episodeDraftPreview, 'published')
  const episodeError = episodeIssues[0] ?? null
  useEffect(() => {
    if (selectedVideo) {
      setFormState({
        title: selectedVideo.title,
        source: selectedVideo.source,
        sourceValue: selectedVideo.sourceValue,
        uploadLimit: selectedVideo.uploadLimit,
        status: selectedVideo.status,
        featured: selectedVideo.featured,
        showId: selectedVideo.showId ?? null,
        episodeId: selectedVideo.episodeId ?? null,
      })
    }
  }, [selectedVideo, setFormState])

  const linkedShow = shows.find((show) => show.id === formState.showId) ?? null
  const linkedEpisode = linkedShow?.episodes.find((episode) => episode.id === formState.episodeId) ?? null
  const availablePlaybackAssets = adminVideos.filter((asset) => {
    if (!selectedShow) return false
    return asset.showId === selectedShow.id || asset.episodeId === selectedEpisodeId || (!asset.showId && !asset.episodeId)
  })

  const selectedShowReady = showPublishIssues.length === 0
  const selectedEpisodeReady = episodePublishIssues.length === 0
  const selectedAssetReady = assetPublishIssues.length === 0

  const statusCounts = {
    all: adminVideos.length,
    draft: adminVideos.filter((v) => v.status === 'draft').length,
    review: adminVideos.filter((v) => v.status === 'review').length,
    published: adminVideos.filter((v) => v.status === 'published').length,
    archived: adminVideos.filter((v) => v.status === 'archived').length,
  }

  useEffect(() => {
    if (selectedShow) {
      setShowDraft({
        title: selectedShow.title,
        genre: selectedShow.genre,
        tagline: selectedShow.tagline,
        poster: selectedShow.poster,
        status: selectedShow.status ?? 'draft',
      })
    }
  }, [selectedShowId, selectedShow])

  useEffect(() => {
    if (!selectedShow) {
      setSelectedEpisodeId(null)
      setEpisodeDraft({ title: '', duration: '03:00', cost: 15, playbackAssetId: null, status: 'draft' })
      return
    }

    const nextEpisode = selectedShow.episodes.find((episode) => episode.id === selectedEpisodeId) ?? selectedShow.episodes[0] ?? null
    setSelectedEpisodeId(nextEpisode?.id ?? null)
    setEpisodeDraft(nextEpisode
      ? { title: nextEpisode.title, duration: nextEpisode.duration, cost: nextEpisode.cost, playbackAssetId: nextEpisode.playbackAssetId ?? null, status: nextEpisode.status ?? 'draft' }
      : { title: '', duration: '03:00', cost: 15, playbackAssetId: null, status: 'draft' })
  }, [selectedEpisodeId, selectedShow])

  async function saveAssetEntry() {
    if (!selectedVideo || validationError) return
    const publishIssues = assetEditorialIssues(formState, 'published')
    if (formState.status === 'published' && publishIssues.length) {
      setAssetMessage(`Publish blocked: ${publishIssues[0]}`)
      return
    }
    setAssetMessage('')
    try {
      const updated = await updateCmsVideo(selectedVideo.id, formState)
      setAdminVideos((current) => current.map((video) => video.id === selectedVideo.id ? updated : video))
      setAssetMessage(formState.status === 'published' ? 'Asset published.' : 'Asset updated.')
    } catch {
      setAdminVideos((current) => current.map((video) => video.id === selectedVideo.id ? { ...video, ...formState } : video))
      setAssetMessage(formState.status === 'published' ? 'Asset published locally because Supabase write failed.' : 'Asset updated locally because Supabase write failed.')
    }
  }

  async function handleAssetStatusCycle(video: AdminVideo) {
    const order: ModerationStatus[] = ['draft', 'review', 'published', 'archived']
    const nextStatus = order[(order.indexOf(video.status) + 1) % order.length]
    const nextIssues = assetEditorialIssues({
      title: video.title,
      source: video.source,
      sourceValue: video.sourceValue,
      uploadLimit: video.uploadLimit,
      status: video.status,
      featured: video.featured,
      showId: video.showId ?? null,
      episodeId: video.episodeId ?? null,
    }, nextStatus)

    if (nextStatus === 'published' && nextIssues.length) {
      setAssetMessage(`Publish blocked: ${nextIssues[0]}`)
      return
    }

    await onCycleStatus(video.id)
    setAssetMessage(nextStatus === 'published' ? 'Asset passed gating and was published.' : '')
  }

  async function archiveAssetEntry() {
    if (!selectedVideo) return
    setAssetMessage('')
    try {
      const updated = await archiveCmsVideo(selectedVideo)
      setAdminVideos((current) => current.map((video) => video.id === selectedVideo.id ? updated : video))
      setFormState((current) => ({ ...current, status: 'archived' }))
      setAssetMessage('Asset archived safely.')
    } catch {
      setAdminVideos((current) => current.map((video) => video.id === selectedVideo.id ? { ...video, status: 'archived' } : video))
      setFormState((current) => ({ ...current, status: 'archived' }))
      setAssetMessage('Asset archived locally because Supabase write failed.')
    }
  }

  async function createShowEntry() {
    if (showError) return
    setShowMessage('')
    try {
      const created = await createCmsShow(showDraft)
      setShows((current) => [created, ...current])
      setSelectedShowId(created.id)
      setShowMessage('Show created.')
    } catch {
      const nextId = `show-${Date.now()}`
      setShows((current) => [{ id: nextId, title: showDraft.title, genre: showDraft.genre, tagline: showDraft.tagline, poster: showDraft.poster, rating: 4.5, status: showDraft.status, episodes: [] }, ...current])
      setSelectedShowId(nextId)
      setShowMessage('Show saved locally because Supabase write failed.')
    }
  }

  async function saveShowEntry() {
    if (!selectedShow || showError) return
    if (showDraft.status === 'published' && showPublishIssues.length) {
      setShowMessage(`Publish blocked: ${showPublishIssues[0]}`)
      return
    }
    setShowMessage('')
    try {
      const updated = await updateCmsShow(selectedShow.id, showDraft)
      setShows((current) => current.map((show) => show.id === selectedShow.id ? { ...show, ...updated, status: showDraft.status, episodes: show.episodes } : show))
      setShowMessage(showDraft.status === 'published' ? 'Show published.' : 'Show updated.')
    } catch {
      setShows((current) => current.map((show) => show.id === selectedShow.id ? { ...show, ...showDraft } : show))
      setShowMessage(showDraft.status === 'published' ? 'Show published locally because Supabase write failed.' : 'Show updated locally because Supabase write failed.')
    }
  }

  function cycleShowStatus() {
    if (!selectedShow) return
    const order: ModerationStatus[] = ['draft', 'review', 'published', 'archived']
    const nextStatus = order[(order.indexOf(showDraft.status) + 1) % order.length]
    const nextIssues = showEditorialIssues({ ...selectedShow, ...showDraft }, nextStatus)
    if (nextStatus === 'published' && nextIssues.length) {
      setShowMessage(`Publish blocked: ${nextIssues[0]}`)
      return
    }
    setShowDraft((current) => ({ ...current, status: nextStatus }))
    setShowMessage(nextStatus === 'published' ? 'Show passed gating and is ready to save as published.' : `Show status set to ${nextStatus}.`)
  }

  async function createEpisodeEntry() {
    if (!selectedShow || episodeError) return
    setEpisodeMessage('')
    try {
      const created = await createCmsEpisode({
        showId: selectedShow.id,
        title: episodeDraft.title,
        duration: episodeDraft.duration,
        cost: Number(episodeDraft.cost) || 0,
        playbackAssetId: episodeDraft.playbackAssetId,
      }, selectedShow.episodes.length, adminVideos)
      setShows((current) => current.map((show) => show.id === selectedShow.id ? { ...show, episodes: [...show.episodes, created] } : show))
      if (episodeDraft.playbackAssetId) {
        setAdminVideos((current) => current.map((asset) => asset.id === episodeDraft.playbackAssetId ? { ...asset, showId: selectedShow.id, episodeId: created.id } : asset))
      }
      setSelectedEpisodeId(created.id)
      setEpisodeMessage('Episode created.')
    } catch {
      const playbackAsset = adminVideos.find((asset) => asset.id === episodeDraft.playbackAssetId) ?? null
      const nextEpisode = {
        id: `ep-${Date.now()}`,
        title: episodeDraft.title,
        duration: episodeDraft.duration,
        cost: Number(episodeDraft.cost) || 0,
        unlocked: Number(episodeDraft.cost) === 0,
        status: episodeDraft.status,
        playbackAssetId: episodeDraft.playbackAssetId,
        playbackSource: playbackAsset?.source ?? 'youtube',
        playbackValue: playbackAsset?.sourceValue ?? featuredVideoUrl,
      }
      setShows((current) => current.map((show) => show.id === selectedShow.id ? { ...show, episodes: [...show.episodes, nextEpisode] } : show))
      if (episodeDraft.playbackAssetId) {
        setAdminVideos((current) => current.map((asset) => asset.id === episodeDraft.playbackAssetId ? { ...asset, showId: selectedShow.id, episodeId: nextEpisode.id } : asset))
      }
      setSelectedEpisodeId(nextEpisode.id)
      setEpisodeMessage('Episode saved locally because Supabase write failed.')
    }
  }

  async function saveEpisodeEntry() {
    if (!selectedShow || !selectedEpisode || episodeError) return
    if (episodeDraft.status === 'published' && episodePublishIssues.length) {
      setEpisodeMessage(`Publish blocked: ${episodePublishIssues[0]}`)
      return
    }
    setEpisodeMessage('')
    try {
      const updated = await updateCmsEpisode(selectedEpisode.id, {
        title: episodeDraft.title,
        duration: episodeDraft.duration,
        cost: Number(episodeDraft.cost) || 0,
        playbackAssetId: episodeDraft.playbackAssetId,
      }, adminVideos)
      setShows((current) => current.map((show) => show.id !== selectedShow.id
        ? show
        : { ...show, episodes: show.episodes.map((episode) => episode.id === selectedEpisode.id ? { ...episode, ...updated, status: episodeDraft.status } : episode) }))
      if (episodeDraft.playbackAssetId) {
        setAdminVideos((current) => current.map((asset) => asset.id === episodeDraft.playbackAssetId ? { ...asset, showId: selectedShow.id, episodeId: selectedEpisode.id } : asset))
      }
      setEpisodeMessage(episodeDraft.status === 'published' ? 'Episode published.' : 'Episode updated.')
    } catch {
      const playbackAsset = adminVideos.find((asset) => asset.id === episodeDraft.playbackAssetId) ?? null
      setShows((current) => current.map((show) => show.id !== selectedShow.id
        ? show
        : { ...show, episodes: show.episodes.map((episode) => episode.id === selectedEpisode.id ? { ...episode, ...episodeDraft, unlocked: Number(episodeDraft.cost) === 0, status: episodeDraft.status, playbackAssetId: episodeDraft.playbackAssetId, playbackSource: playbackAsset?.source ?? 'youtube', playbackValue: playbackAsset?.sourceValue ?? featuredVideoUrl } : episode) }))
      if (episodeDraft.playbackAssetId) {
        setAdminVideos((current) => current.map((asset) => asset.id === episodeDraft.playbackAssetId ? { ...asset, showId: selectedShow.id, episodeId: selectedEpisode.id } : asset))
      }
      setEpisodeMessage(episodeDraft.status === 'published' ? 'Episode published locally because Supabase write failed.' : 'Episode updated locally because Supabase write failed.')
    }
  }

  function cycleEpisodeStatus() {
    if (!selectedEpisode) return
    const order: ModerationStatus[] = ['draft', 'review', 'published', 'archived']
    const nextStatus = order[(order.indexOf(episodeDraft.status) + 1) % order.length]
    const playbackAsset = adminVideos.find((asset) => asset.id === episodeDraft.playbackAssetId) ?? null
    const nextIssues = episodeEditorialIssues({
      ...selectedEpisode,
      ...episodeDraft,
      playbackSource: playbackAsset?.source ?? selectedEpisode.playbackSource,
      playbackValue: playbackAsset?.sourceValue ?? selectedEpisode.playbackValue,
    }, nextStatus)
    if (nextStatus === 'published' && nextIssues.length) {
      setEpisodeMessage(`Publish blocked: ${nextIssues[0]}`)
      return
    }
    setEpisodeDraft((current) => ({ ...current, status: nextStatus }))
    setEpisodeMessage(nextStatus === 'published' ? 'Episode passed gating and is ready to save as published.' : `Episode status set to ${nextStatus}.`)
  }

  return (
    <main className="page-grid admin-grid admin-grid-wide">
      <section className="section-block admin-form-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Video asset CMS</p>
            <h3>Moderate, add, remove, and manage videos</h3>
          </div>
          <span className="pill">Upload cap: 1.3GB</span>
        </div>

        <div className="quick-stats-row">
          <article><strong>{statusCounts.all}</strong><span>Total assets</span></article>
          <article><strong>{statusCounts.review}</strong><span>Needs review</span></article>
          <article><strong>{statusCounts.published}</strong><span>Published</span></article>
        </div>

        <div className="form-grid">
          <label>
            Title
            <input value={formState.title} onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))} placeholder="Episode or feature title" />
          </label>

          <label>
            Source type
            <select value={formState.source} onChange={(event) => setFormState((current) => ({ ...current, source: event.target.value as VideoSource }))}>
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="upload">Direct upload</option>
            </select>
          </label>

          <label className="full-width">
            Source URL or file reference
            <input value={formState.sourceValue} onChange={(event) => setFormState((current) => ({ ...current, sourceValue: event.target.value }))} placeholder={sourceHint(formState.source)} />
          </label>

          <label>
            Moderation status
            <select value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as ModerationStatus }))}>
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label>
            Upload policy
            <input value={formState.uploadLimit} readOnly />
          </label>

          <label>
            Linked show
            <select value={formState.showId ?? ''} onChange={(event) => setFormState((current) => ({ ...current, showId: event.target.value || null, episodeId: null }))}>
              <option value="">No show linked</option>
              {shows.map((show) => <option key={show.id} value={show.id}>{show.title}</option>)}
            </select>
          </label>

          <label>
            Linked episode
            <select value={formState.episodeId ?? ''} onChange={(event) => setFormState((current) => ({ ...current, episodeId: event.target.value || null }))} disabled={!linkedShow}>
              <option value="">No episode linked</option>
              {(linkedShow?.episodes ?? []).map((episode) => <option key={episode.id} value={episode.id}>{episode.title}</option>)}
            </select>
          </label>

          <label className="checkbox-row full-width">
            <input type="checkbox" checked={formState.featured} onChange={(event) => setFormState((current) => ({ ...current, featured: event.target.checked }))} />
            Mark as featured placement candidate
          </label>
        </div>

        <div className="moderation-help">
          <h4>Validation + moderation rules</h4>
          <ul>
            <li>YouTube and Vimeo links are validated before save.</li>
            <li>Direct uploads should point at storage-ready video paths.</li>
            <li>Published assets should belong to a show, and optionally an episode.</li>
            <li>Uploads above 1.3GB should be rejected server-side when storage is wired live.</li>
          </ul>
        </div>

        <div className="meta-pills entity-list">
          <span className={`pill ${selectedAssetReady ? 'success-pill' : 'warning-pill'}`}>{selectedAssetReady ? 'Ready for publish' : 'Publish blocked'}</span>
        </div>
        {assetPublishIssues.length ? <ul className="backend-list entity-list">{assetPublishIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
        {validationError ? <p className="feedback-line error-line">{validationError}</p> : null}
        <div className="admin-actions-row">
          <button className="primary-action admin-action-no-margin" onClick={onCreate} disabled={saving || Boolean(validationError)}>
            {saving ? 'Saving…' : 'Create asset'}
          </button>
          <button className="secondary-action" onClick={saveAssetEntry} disabled={!selectedVideo || Boolean(validationError)}>
            Save edits
          </button>
        </div>
        {adminMessage ? <p className="feedback-line">{adminMessage}</p> : null}
        {assetMessage ? <p className="feedback-line">{assetMessage}</p> : null}
      </section>

      <section className="section-block queue-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Moderation queue</p>
            <h3>Current CMS inventory</h3>
          </div>
          <span className="pill">Server-side moderation next</span>
        </div>

        <div className="chip-row filter-row">
          {(['all', 'draft', 'review', 'published', 'archived'] as CmsFilter[]).map((value) => (
            <button key={value} className={`genre-chip ${filter === value ? 'active' : ''}`} onClick={() => setFilter(value)}>
              {value} ({statusCounts[value]})
            </button>
          ))}
        </div>

        <div className="admin-video-list compact-list">
          {filteredVideos.map((video) => (
            <article key={video.id} className={`admin-video-card selectable ${selectedId === video.id ? 'selected' : ''}`} onClick={() => setSelectedId(video.id)}>
              <div>
                <strong>{video.title}</strong>
                <p>{video.source.toUpperCase()} • {video.sourceValue}</p>
                <small>Status: {video.status} • {video.uploadLimit} {video.featured ? '• Featured' : ''}{video.showId ? ' • Linked' : ''}</small>
              </div>
              <div className="asset-card-actions">
                <button onClick={(event) => { event.stopPropagation(); setSelectedId(video.id) }}>Edit</button>
                <button onClick={(event) => { event.stopPropagation(); handleAssetStatusCycle(video) }}>Cycle status</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block detail-panel">
        <div className="section-heading"><div><p className="eyebrow">Selected asset</p><h3>{selectedVideo?.title ?? 'No asset selected'}</h3></div></div>
        {selectedVideo ? (
          <div className="selected-asset-card">
            <div className="meta-pills">
              <span className="pill gold">{selectedVideo.status}</span>
              <span className="pill">{selectedVideo.source}</span>
              <span className="pill">{selectedVideo.featured ? 'Featured' : 'Standard'}</span>
            </div>
            <p className="selected-source">{selectedVideo.sourceValue}</p>
            <div className="meta-pills">
              <span className="pill">{linkedShow ? `Show: ${linkedShow.title}` : 'No show linked'}</span>
              <span className="pill">{linkedEpisode ? `Episode: ${linkedEpisode.title}` : 'No episode linked'}</span>
            </div>
            <div className="admin-actions-row entity-list">
              <button className="secondary-action" onClick={saveAssetEntry} disabled={Boolean(validationError)}>Save asset edits</button>
              <button className="secondary-action danger-action" onClick={archiveAssetEntry}>Archive asset</button>
            </div>
            <ul className="backend-list">
              <li>Review source validity before publishing.</li>
              <li>Confirm poster/hero placement if featured.</li>
              <li>Check upload size/server-side moderation pipeline for direct uploads.</li>
              <li>Archive instead of deleting so recovery stays possible.</li>
            </ul>
          </div>
        ) : (
          <p className="feedback-line">Choose an item from the queue to inspect it.</p>
        )}
      </section>

      <section className="section-block cms-entity-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Show CMS</p>
            <h3>Create and manage show containers</h3>
          </div>
          <span className="pill">{shows.length} shows</span>
        </div>
        <div className="form-grid">
          <label>
            Show title
            <input value={showDraft.title} onChange={(event) => setShowDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Show name" />
          </label>
          <label>
            Genre
            <input value={showDraft.genre} onChange={(event) => setShowDraft((current) => ({ ...current, genre: event.target.value }))} placeholder="Romance / Thriller / Drama" />
          </label>
          <label className="full-width">
            Tagline
            <input value={showDraft.tagline} onChange={(event) => setShowDraft((current) => ({ ...current, tagline: event.target.value }))} placeholder="Quick cliffhanger hook" />
          </label>
          <label className="full-width">
            Poster URL
            <input value={showDraft.poster} onChange={(event) => setShowDraft((current) => ({ ...current, poster: event.target.value }))} placeholder="Poster or placeholder image path" />
          </label>
          <label>
            Show status
            <select value={showDraft.status} onChange={(event) => setShowDraft((current) => ({ ...current, status: event.target.value as ModerationStatus }))}>
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <div className="meta-pills entity-list">
          <span className={`pill ${selectedShowReady ? 'success-pill' : 'warning-pill'}`}>{selectedShowReady ? 'Show ready to publish' : 'Show has blockers'}</span>
        </div>
        {showIssues.length ? <ul className="backend-list entity-list">{showIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
        {showError ? <p className="feedback-line error-line">{showError}</p> : null}
        <div className="admin-actions-row">
          <button className="primary-action" onClick={createShowEntry} disabled={Boolean(showError)}>Create show</button>
          <button className="secondary-action" onClick={saveShowEntry} disabled={!selectedShow || Boolean(showError)}>Save edits</button>
        </div>
        <div className="admin-actions-row compact-actions-row">
          <button className="secondary-action" onClick={cycleShowStatus} disabled={!selectedShow}>Cycle status</button>
          <span className="pill">Current: {showDraft.status}</span>
        </div>
        {showMessage ? <p className="feedback-line">{showMessage}</p> : null}
        <div className="admin-video-list compact-list entity-list">
          {shows.map((show) => (
            <article key={show.id} className={`admin-video-card selectable ${selectedShowId === show.id ? 'selected' : ''}`} onClick={() => setSelectedShowId(show.id)}>
              <div>
                <strong>{show.title}</strong>
                <p>{show.genre} • {show.episodes.length} episodes</p>
                <small>{show.tagline} • {show.status ?? 'draft'}</small>
              </div>
              <button onClick={(event) => { event.stopPropagation(); setSelectedShowId(show.id) }}>Edit</button>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block cms-entity-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Episode CMS</p>
            <h3>{selectedShow ? `Manage episodes for ${selectedShow.title}` : 'Choose a show first'}</h3>
          </div>
          <span className="pill">{selectedShow?.episodes.length ?? 0} episodes</span>
        </div>
        <div className="form-grid">
          <label className="full-width">
            Target show
            <select value={selectedShowId} onChange={(event) => setSelectedShowId(event.target.value)}>
              {shows.map((show) => <option key={show.id} value={show.id}>{show.title}</option>)}
            </select>
          </label>
          <label>
            Episode title
            <input value={episodeDraft.title} onChange={(event) => setEpisodeDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Episode 4: Twist" />
          </label>
          <label>
            Duration
            <input value={episodeDraft.duration} onChange={(event) => setEpisodeDraft((current) => ({ ...current, duration: event.target.value }))} placeholder="03:20" />
          </label>
          <label>
            Coin cost
            <input type="number" min="0" value={episodeDraft.cost} onChange={(event) => setEpisodeDraft((current) => ({ ...current, cost: Number(event.target.value) }))} />
          </label>
          <label className="full-width">
            Playback asset
            <select value={episodeDraft.playbackAssetId ?? ''} onChange={(event) => setEpisodeDraft((current) => ({ ...current, playbackAssetId: event.target.value || null }))}>
              <option value="">Use default fallback video</option>
              {availablePlaybackAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title} • {asset.source.toUpperCase()}</option>)}
            </select>
          </label>
          <label>
            Episode status
            <select value={episodeDraft.status} onChange={(event) => setEpisodeDraft((current) => ({ ...current, status: event.target.value as ModerationStatus }))}>
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <div className="meta-pills entity-list">
          <span className={`pill ${selectedEpisodeReady ? 'success-pill' : 'warning-pill'}`}>{selectedEpisodeReady ? 'Episode ready to publish' : 'Episode has blockers'}</span>
        </div>
        {episodeIssues.length ? <ul className="backend-list entity-list">{episodeIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
        {episodeError ? <p className="feedback-line error-line">{episodeError}</p> : null}
        <div className="admin-actions-row">
          <button className="primary-action" onClick={createEpisodeEntry} disabled={Boolean(episodeError)}>Add episode</button>
          <button className="secondary-action" onClick={saveEpisodeEntry} disabled={!selectedEpisode || Boolean(episodeError)}>Save edits</button>
        </div>
        <div className="admin-actions-row compact-actions-row">
          <button className="secondary-action" onClick={cycleEpisodeStatus} disabled={!selectedEpisode}>Cycle status</button>
          <span className="pill">Current: {episodeDraft.status}</span>
        </div>
        {episodeMessage ? <p className="feedback-line">{episodeMessage}</p> : null}
        <p className="feedback-line subtle-line">{episodeDraft.playbackAssetId ? `Playback will resolve from the selected managed asset.` : 'No managed asset selected yet — this episode will use the fallback player source.'}</p>
        <ul className="episode-list episode-list--stacked entity-list">
          {(selectedShow?.episodes ?? []).map((episode) => (
            <li key={episode.id} className={selectedEpisodeId === episode.id ? 'selected' : ''} onClick={() => setSelectedEpisodeId(episode.id)}>
              <div>
                <strong>{episode.title}</strong>
                <span>{episode.duration}</span>
              </div>
              <div className="episode-admin-meta">
                <span className="pill">{episode.cost === 0 ? 'Free' : `${episode.cost} coins`}</span>
                <span className="pill">{episode.playbackAssetId ? 'Managed asset' : 'Fallback source'}</span>
                <span className="pill">{episode.status ?? 'draft'}</span>
                <button onClick={(event) => { event.stopPropagation(); setSelectedEpisodeId(episode.id) }}>Edit</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
