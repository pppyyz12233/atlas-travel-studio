import { ArrowUpRight, Heart } from 'lucide-react'
import type { Destination } from '../content/destinations'
import DestinationCover from './DestinationCover'

interface DestinationCardProps {
  destination: Destination
  variant?: 'feature' | 'grid'
  favorited?: boolean
  onToggleFavorite?: (destinationId: string) => void
  onPlan: (destination: Destination) => void
}

export default function DestinationCard({
  destination,
  variant = 'grid',
  favorited = false,
  onToggleFavorite,
  onPlan,
}: DestinationCardProps) {
  const openDocument = () => { window.location.hash = `#/destination/${destination.id}` }
  return (
    <article className={`mag-destination-card is-${variant}`}>
      <button
        type="button"
        className="mag-destination-cover"
        onClick={openDocument}
        aria-label={`规划前往 ${destination.name} 的旅行`}
      >
        <DestinationCover destination={destination} />
        <span className="mag-destination-region">{destination.region}</span>
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          className={`mag-destination-fav ${favorited ? 'is-active' : ''}`}
          onClick={() => onToggleFavorite(destination.id)}
          aria-pressed={favorited}
          aria-label={favorited ? `取消收藏 ${destination.name}` : `收藏 ${destination.name}`}
        >
          <Heart size={15} fill={favorited ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      )}
      <div className="mag-destination-body">
        <header>
          <h3>{destination.name}</h3>
          <span className="mag-destination-meta">{destination.bestSeason}</span>
        </header>
        <p>{destination.blurb}</p>
        <footer>
          <span className="mag-destination-tags">
            {destination.styles.map(style => <i key={style}>{style}</i>)}
          </span>
          <button type="button" className="mag-destination-plan" onClick={openDocument}>
            阅读攻略 <ArrowUpRight size={14} aria-hidden="true" />
          </button>
          <button type="button" className="mag-destination-plan" onClick={() => onPlan(destination)}>开始规划</button>
        </footer>
      </div>
    </article>
  )
}
