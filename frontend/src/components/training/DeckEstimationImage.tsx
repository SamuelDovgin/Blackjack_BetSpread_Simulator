// Deck Estimation Image Component
// Displays cropped shoe image showing remaining deck depth for visual training
// Replaces the discard pile on the left side of the table (desktop only)

import React, { useState, useEffect, useMemo } from 'react';
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
  const [imageError, setImageError] = useState(false);

  const desiredFilename = getImageFilename(cardsRemaining);
  const [displayFilename, setDisplayFilename] = useState(desiredFilename);

  // Use Vite's BASE_URL so this works on GitHub Pages project sites (/repo/).
  const baseUrl = import.meta.env.BASE_URL;
  const desiredPath = useMemo(
    () => `${baseUrl}assets/deck-estimation/${desiredFilename}`,
    [baseUrl, desiredFilename]
  );
  const displayPath = useMemo(
    () => `${baseUrl}assets/deck-estimation/${displayFilename}`,
    [baseUrl, displayFilename]
  );

  // Calculate decks remaining for tooltip
  const decksRemaining = Math.max(0, Math.floor(cardsRemaining / 52));

  // Keep the image visually stable: preload the next file and only swap the displayed
  // src once it's already loaded. This avoids "blinking" between rounds.
  useEffect(() => {
    setImageError(false);
    if (desiredFilename === displayFilename) return;

    let cancelled = false;
    const img = new Image();
    img.src = desiredPath;
    img.onload = () => {
      if (cancelled) return;
      setDisplayFilename(desiredFilename);
    };
    img.onerror = () => {
      if (cancelled) return;
      setImageError(true);
    };

    return () => {
      cancelled = true;
    };
  }, [desiredFilename, displayFilename, desiredPath]);

  return (
    <div
      className="deck-estimation"
      title={`${decksRemaining} decks remaining (${cardsRemaining} cards)`}
    >
      <img
        src={displayPath}
        alt={`Shoe depth showing ${decksRemaining} decks remaining`}
        className="deck-estimation-image"
        onError={() => {
          setImageError(true);
          console.error(`Failed to load deck estimation image: ${displayPath}`);
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
