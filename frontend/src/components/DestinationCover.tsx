import { useEffect, useState } from 'react'
import type { Destination } from '../content/destinations'

export default function DestinationCover({ destination }: { destination: Destination }) {
  const images = destination.coverImages?.length ? destination.coverImages : [destination.coverImage ?? '/images/destinations/fallback.svg']
  const [index, setIndex] = useState(() => Math.floor(Math.random() * images.length))
  const imageSrc = index < 0 ? '/images/destinations/fallback.svg' : images[index]
  useEffect(() => { if (images.length < 2) return; const id = window.setInterval(() => setIndex(i => (i + 1) % images.length), 90000); return () => window.clearInterval(id) }, [images.length])

  return <div className="mag-cover-stack"><img key={imageSrc} className="mag-cover-art" src={imageSrc} alt={destination.coverAlt ?? `${destination.name}旅行风景`} onError={() => setIndex(-1)} /></div>
}
