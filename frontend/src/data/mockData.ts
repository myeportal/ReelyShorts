import type { AdminVideo, Show } from '../types'

export const heroVideoUrl = 'https://www.youtube.com/watch?v=pvqiR0Q0sGQ&t=3305s'

export const starterShows: Show[] = [
  {
    id: 'midnight-vows',
    title: 'Midnight Vows',
    genre: 'Romance Thriller',
    tagline: 'A runaway bride discovers the man hunting her already knows her darkest secret.',
    poster: '/placeholders/show-01.jpg',
    rating: 4.8,
    status: 'published',
    episodes: [
      { id: 'mv-1', title: 'Episode 1: Run', duration: '03:20', cost: 0, status: 'published', unlocked: true },
      { id: 'mv-2', title: 'Episode 2: The Deal', duration: '03:05', cost: 15, status: 'published' },
      { id: 'mv-3', title: 'Episode 3: Blood Oath', duration: '03:44', cost: 20, status: 'published' },
    ],
  },
  {
    id: 'city-of-echoes',
    title: 'City of Echoes',
    genre: 'Neo-Noir Mystery',
    tagline: 'Every alley remembers a lie, and every lie points back to her.',
    poster: '/placeholders/show-02.jpg',
    rating: 4.6,
    status: 'published',
    episodes: [
      { id: 'ce-1', title: 'Episode 1: White Noise', duration: '02:48', cost: 0, status: 'published', unlocked: true },
      { id: 'ce-2', title: 'Episode 2: Wiretap', duration: '03:12', cost: 15, status: 'published' },
      { id: 'ce-3', title: 'Episode 3: Crossfire', duration: '03:31', cost: 20, status: 'published' },
    ],
  },
  {
    id: 'hearts-on-trial',
    title: 'Hearts on Trial',
    genre: 'Legal Drama',
    tagline: 'She defends strangers for a living until the next case puts her own family on the stand.',
    poster: '/placeholders/show-03.jpg',
    rating: 4.7,
    status: 'published',
    episodes: [
      { id: 'ht-1', title: 'Episode 1: Objection', duration: '03:01', cost: 0, status: 'published', unlocked: true },
      { id: 'ht-2', title: 'Episode 2: The Witness', duration: '03:17', cost: 15, status: 'published' },
      { id: 'ht-3', title: 'Episode 3: Verdict', duration: '03:58', cost: 20, status: 'published' },
    ],
  },
]

export const starterAdminVideos: AdminVideo[] = [
  {
    id: 'vid-1',
    title: 'Hero Feature Slot',
    source: 'youtube',
    sourceValue: heroVideoUrl,
    uploadLimit: 'Remote embed',
    status: 'published',
    featured: true,
    showId: 'midnight-vows',
    episodeId: null,
  },
  {
    id: 'vid-2',
    title: 'Sample Locked Episode',
    source: 'upload',
    sourceValue: 'Upload placeholder — max 1.3GB per file',
    uploadLimit: '1.3GB max upload',
    status: 'review',
    featured: false,
    showId: 'hearts-on-trial',
    episodeId: 'ht-2',
  },
]

export const adCarriers = ['Google Ad Manager', 'SpringServe', 'Equativ', 'Publica by IAS', 'Direct sponsor deals']
