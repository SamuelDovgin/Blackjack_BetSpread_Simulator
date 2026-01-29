// Action Buttons Component
// Touch-friendly buttons for player decisions

import React from 'react';
import type { PlayerAction } from './types';
import './ActionButtons.css';

interface ActionButtonsProps {
  onAction: (action: PlayerAction) => void;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canSplit: boolean;
  canSurrender: boolean;
  /** Optional: number of starting hands to deal next round (1-3). */
  handsToPlay?: 1 | 2 | 3;
  /** Optional: cycle hands-to-play control (applies next round). */
  onCycleHandsToPlay?: () => void;
  disabled?: boolean;
  /** Optional per-action locks (e.g., lock Hit/Double/Split while a card is animating) */
  disabledActions?: PlayerAction[];
  highlightAction?: PlayerAction | null;
  showKeyboardHints?: boolean;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  onAction,
  canHit,
  canStand,
  canDouble,
  canSplit,
  canSurrender,
  handsToPlay = 1,
  onCycleHandsToPlay,
  disabled = false,
  disabledActions = [],
  highlightAction = null,
  showKeyboardHints = false,
}) => {
  // Handle keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;

      const key = e.key.toLowerCase();
      switch (key) {
        case 'h':
          if (canHit && !disabledActions.includes('hit')) onAction('hit');
          break;
        case 's':
          if (canStand && !disabledActions.includes('stand')) onAction('stand');
          break;
        case 'd':
          if (canDouble && !disabledActions.includes('double')) onAction('double');
          break;
        case 'p':
          if (canSplit && !disabledActions.includes('split')) onAction('split');
          break;
        case 'r':
          if (canSurrender && !disabledActions.includes('surrender')) onAction('surrender');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, canHit, canStand, canDouble, canSplit, canSurrender, onAction]);

  return (
    <div className="action-buttons">
      <button
        className={`action-btn action-hit ${highlightAction === 'hit' ? 'highlight' : ''}`}
        onClick={() => onAction('hit')}
        disabled={disabled || disabledActions.includes('hit') || !canHit}
      >
        <span className="action-label">Hit</span>
        {showKeyboardHints && <span className="action-key">H</span>}
      </button>

      <button
        className={`action-btn action-stand ${highlightAction === 'stand' ? 'highlight' : ''}`}
        onClick={() => onAction('stand')}
        disabled={disabled || disabledActions.includes('stand') || !canStand}
      >
        <span className="action-label">Stand</span>
        {showKeyboardHints && <span className="action-key">S</span>}
      </button>

      <button
        className={`action-btn action-double ${highlightAction === 'double' ? 'highlight' : ''}`}
        onClick={() => onAction('double')}
        disabled={disabled || disabledActions.includes('double') || !canDouble}
      >
        <span className="action-label">Double</span>
        {showKeyboardHints && <span className="action-key">D</span>}
      </button>

      <button
        className={`action-btn action-split ${highlightAction === 'split' ? 'highlight' : ''}`}
        onClick={() => onAction('split')}
        disabled={disabled || disabledActions.includes('split') || !canSplit}
      >
        <span className="action-label">Split</span>
        {showKeyboardHints && <span className="action-key">P</span>}
      </button>

      <button
        className={`action-btn action-surrender ${highlightAction === 'surrender' ? 'highlight' : ''}`}
        onClick={() => onAction('surrender')}
        disabled={disabled || disabledActions.includes('surrender') || !canSurrender}
      >
        <span className="action-label">Surrender</span>
        {showKeyboardHints && <span className="action-key">R</span>}
      </button>

      {onCycleHandsToPlay && (
        <button
          type="button"
          className="hands-toggle-btn"
          onClick={onCycleHandsToPlay}
          title={`Deal ${handsToPlay} hand${handsToPlay === 1 ? '' : 's'} per round (applies next round)`}
          aria-label={`Hands per round: ${handsToPlay}. Applies next round.`}
        >
          {handsToPlay}H
        </button>
      )}
    </div>
  );
};

export default ActionButtons;
