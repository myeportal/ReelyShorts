export type Episode = {
  id: string
  title: string
  duration: string
  cost: number
  status?: ModerationStatus
  unlocked?: boolean
  playbackAssetId?: string | null
  playbackSource?: VideoSource | null
  playbackValue?: string | null
}

export type Show = {
  id: string
  title: string
  genre: string
  tagline: string
  poster: string
  rating: number
  status?: ModerationStatus
  episodes: Episode[]
}

export type VideoSource = 'youtube' | 'vimeo' | 'upload'
export type ModerationStatus = 'draft' | 'review' | 'published' | 'archived'

export type AdminVideo = {
  id: string
  title: string
  source: VideoSource
  sourceValue: string
  uploadLimit: string
  status: ModerationStatus
  featured: boolean
  showId?: string | null
  episodeId?: string | null
}

export type ViewerMode = 'guest' | 'signed-in'
