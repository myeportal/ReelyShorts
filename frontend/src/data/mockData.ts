import type { AdminVideo, Show } from '../types'

type ImportedShow = {
  id: string
  title: string
  genre: string
  tagline: string
  poster: string
  rating: number
  videoUrl: string
  featured?: boolean
}

const posters = {
  hero: '/placeholders/show-01.jpg',
  romance: '/placeholders/show-02.jpg',
  dark: '/placeholders/show-03.jpg',
} as const

const importedShows: ImportedShow[] = [
  {
    id: 'move-aside-im-the-final-boss',
    title: "Move Aside! I'm the Final Boss",
    genre: 'CEO / Secret Identity / Romance',
    tagline: "Kingsley returns from the battlefield a hidden king and richest man on earth—only to face a brutal breakup that triggers a satisfying revenge arc.",
    poster: posters.hero,
    rating: 5.0,
    videoUrl: 'https://www.youtube.com/playlist?list=PLZola-ZiDRuslDXLL3Tb-QTVkg8GCmzAr',
    featured: true,
  },
  {
    id: 'double-life-of-my-billionaire-husband',
    title: 'The Double Life of My Billionaire Husband',
    genre: 'Billionaire Romance / Secret Identity',
    tagline: 'A woman unknowingly married to a secret billionaire gets pulled into loyalty tests, hidden wealth, and dramatic reveals.',
    poster: posters.romance,
    rating: 4.9,
    videoUrl: 'https://www.youtube.com/@ReelShort',
  },
  {
    id: 'dont-miss-me-when-im-gone',
    title: "Don't Miss Me When I'm Gone",
    genre: 'Heartbreak / Revenge / Second Chances',
    tagline: 'Only after she leaves does her partner grasp what he lost in this emotional second-chance revenge drama.',
    poster: posters.dark,
    rating: 4.8,
    videoUrl: 'https://www.youtube.com/playlist?list=PLZola-ZiDRusAbYd5SDi-yNxkDAdoScvO',
  },
  {
    id: 'the-cursed-alphas-mate',
    title: "The Cursed Alpha's Mate",
    genre: 'Paranormal / Werewolf Romance / Fantasy',
    tagline: 'Heartbreak drives Shay toward Alpha Mal Haywood, a cursed werewolf who may need her as his mate to survive.',
    poster: posters.dark,
    rating: 4.8,
    videoUrl: 'https://www.youtube.com/playlist?list=PLZola-ZiDRus4HFQ6Xm28YhsK2Z3r1h9P',
  },
  {
    id: 'bound-by-vendetta-sleeping-with-the-enemy',
    title: 'Bound by Vendetta: Sleeping with the Enemy',
    genre: 'Mafia Boss / Enemies-to-Lovers',
    tagline: 'Organized crime, deadly rivals, and undeniable chemistry collide in a high-tension enemies-to-lovers setup.',
    poster: posters.dark,
    rating: 4.7,
    videoUrl: 'https://www.youtube.com/@ReelShort',
  },
  {
    id: 'how-to-tame-a-silver-fox',
    title: 'How to Tame a Silver Fox',
    genre: 'Age-Gap / Forbidden Romance / Young Adult',
    tagline: 'A college seduction plan spirals into a breakout forbidden romance with her father’s business partner.',
    poster: posters.romance,
    rating: 4.7,
    videoUrl: 'https://www.youtube.com/playlist?list=PLZola-ZiDRusqKcB2gU7v1l30o-R3U-tz',
  },
  {
    id: 'undercover-prison-king',
    title: 'Undercover Prison King',
    genre: 'Action / Thriller / Undercover',
    tagline: 'An ex-soldier goes undercover inside a corrupt prison he inherits to expose the criminal leadership from within.',
    poster: posters.hero,
    rating: 4.7,
    videoUrl: 'https://www.youtube.com/playlist?list=PLZola-ZiDRuv0-8uS1VuFjNhRJ4k3w2pT',
  },
  {
    id: 'love-at-dangerous-speeds',
    title: 'Love at Dangerous Speeds',
    genre: 'Street Racing / Romance / Dark Secret',
    tagline: 'A runaway bride finds passion with a street racer whose darkest confession ties back to her father’s death.',
    poster: posters.hero,
    rating: 4.6,
    videoUrl: 'https://www.youtube.com/playlist?list=PLZola-ZiDRuvqKRhILQM4DHLjxeHIw84B',
  },
  {
    id: 'mommy-dont-cry-daddy-is-sorry',
    title: "Mommy Don't Cry, Daddy Is Sorry",
    genre: 'Family Drama / Revenge / Mistaken Identity',
    tagline: 'A mother believed dead returns with a ruthless alter ego to reclaim her daughter and expose the people who betrayed her.',
    poster: posters.dark,
    rating: 4.8,
    videoUrl: 'https://www.youtube.com/playlist?list=PLZola-ZiDRusJEJ4426R76zXPoWRUuJS6',
  },
  {
    id: 'my-stepbrothers-dirty-secret',
    title: "My Stepbrother's Dirty Secret",
    genre: 'Forbidden Romance / Teen Drama / Stepsibling',
    tagline: 'A new school, a millionaire stepfamily, and forbidden chemistry make this one of the year’s most bingeable dramas.',
    poster: posters.romance,
    rating: 4.6,
    videoUrl: 'https://www.youtube.com/playlist?list=PLZola-ZiDRuuqIZpB7w7GIUH5m1mNHI24',
  },
]

const featuredShow = importedShows.find((show) => show.featured) ?? importedShows[0]

export const heroVideoUrl = featuredShow.videoUrl

export const starterShows: Show[] = importedShows.map((show) => ({
  id: show.id,
  title: show.title,
  genre: show.genre,
  tagline: show.tagline,
  poster: show.poster,
  rating: show.rating,
  status: 'published',
  episodes: [
    {
      id: `${show.id}-ep1`,
      title: 'Preview Playlist',
      duration: '03:00',
      cost: 0,
      status: 'published',
      unlocked: true,
      playbackSource: 'youtube',
      playbackValue: show.videoUrl,
    },
  ],
}))

export const starterAdminVideos: AdminVideo[] = importedShows.map((show, index) => ({
  id: `vid-${index + 1}`,
  title: `${show.title} Preview`,
  source: 'youtube',
  sourceValue: show.videoUrl,
  uploadLimit: 'Remote embed',
  status: 'published',
  featured: show.id === featuredShow.id,
  showId: show.id,
  episodeId: `${show.id}-ep1`,
}))

export const adCarriers = ['Google Ad Manager', 'SpringServe', 'Equativ', 'Publica by IAS', 'Direct sponsor deals']
