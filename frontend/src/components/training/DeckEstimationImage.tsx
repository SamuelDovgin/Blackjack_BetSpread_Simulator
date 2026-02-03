// Deck Estimation Image Component
// Displays cropped shoe image showing remaining deck depth for visual training
// Replaces the discard pile on the left side of the table (desktop only)

import React, { useState, useEffect } from 'react';
import './DeckEstimationImage.css';

interface DeckEstimationImageProps {
  cardsRemaining: number;
  totalCards: number;
  cardScale?: string;
}

// Map cards remaining to image filename
const getImageFilename = (cardsRemaining: number): string => {
  // Images numbered 000-363, representing full shoe (312) down to empty
  const imageNumber = Math.max(0, Math.min(363, 312 - cardsRemaining));
  return `${String(imageNumber).padStart(3, '0')}.webp`;
};

export const DeckEstimationImage: React.FC<DeckEstimationImageProps> = ({
  cardsRemaining,
  totalCards,
  cardScale = 'medium',
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const imageFilename = getImageFilename(cardsRemaining);
  // Use Vite's BASE_URL so this works on GitHub Pages project sites (/repo/).
  const imagePath = `${import.meta.env.BASE_URL}assets/deck-estimation/${imageFilename}`;

  // Calculate decks remaining for tooltip
  const decksRemaining = Math.max(0, Math.floor(cardsRemaining / 52));

  // Reset loading state when image changes
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [imageFilename]);

  return (
    <div
      className="deck-estimation"
      title={`${decksRemaining} decks remaining (${cardsRemaining} cards)`}
    >
      {!imageLoaded && !imageError && (
        <div className="deck-estimation-skeleton" />
      )}

      <img
        src={imagePath}
        alt={`Shoe depth showing ${decksRemaining} decks remaining`}
        className={`deck-estimation-image ${imageLoaded ? 'loaded' : ''}`}
        loading="lazy"
        onLoad={() => setImageLoaded(true)}
        onError={() => {
          setImageError(true);
          console.error(`Failed to load deck estimation image: ${imagePath}`);
        }}
      />

      {imageError && (
        <div className="deck-estimation-error">
          <span className="deck-estimation-error-text">
            {decksRemaining}D
          </span>
        </div>
      )}
    </div>
  );
};
