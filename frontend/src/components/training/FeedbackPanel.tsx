// Feedback Panel Component
// Shows real-time feedback on player decisions

import React from 'react';
import type { LastDecision, PlayerAction, DecisionResultType } from './types';
import './FeedbackPanel.css';

interface FeedbackPanelProps {
  /** The last decision made (null if none yet) */
  lastDecision: LastDecision | null;
  /** Whether to show the panel */
  visible: boolean;
  /** Compact mode (inline with table) vs expanded */
  compact?: boolean;
}

const ACTION_LABELS: Record<PlayerAction, string> = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double',
  split: 'Split',
  surrender: 'Surrender',
  insurance: 'Insurance',
};

/**
 * Get appropriate feedback text based on decision result type
 */
function getFeedbackText(decision: LastDecision): string {
  const { resultType, userAction, correctAction, deviationName, handType, total, dealerUp, trueCount } = decision;
  const dealerStr = dealerUp === 11 ? 'A' : String(dealerUp);
  const handStr = handType === 'pair'
    ? `${total / 2}s`
    : handType === 'soft'
      ? `S${total}`
      : `${total}`;

  switch (resultType) {
    case 'correct_basic':
      return `${ACTION_LABELS[userAction]} ${handStr} v${dealerStr}`;

    case 'correct_deviation':
      if (deviationName) {
        return deviationName;
      }
      return `${ACTION_LABELS[userAction]} ${handStr} v${dealerStr}`;

    case 'missed_deviation':
      return `${ACTION_LABELS[correctAction]} ${handStr} v${dealerStr}`;

    case 'wrong_deviation':
      const tcStr = trueCount !== undefined ? ` (TC ${trueCount.toFixed(0)})` : '';
      return `${ACTION_LABELS[correctAction]} ${handStr} v${dealerStr}${tcStr}`;

    case 'incorrect_basic':
      return `${ACTION_LABELS[correctAction]} ${handStr} v${dealerStr}`;

    default:
      return `${ACTION_LABELS[correctAction]} ${handStr} v${dealerStr}`;
  }
}

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  lastDecision,
  visible,
  compact = true,
}) => {
  if (!visible || !lastDecision) {
    return null;
  }

  const { isCorrect, resultType } = lastDecision;
  const feedbackText = getFeedbackText(lastDecision);

  // Add a tag for deviation-related outcomes
  const showDeviationTag = resultType === 'correct_deviation' || resultType === 'missed_deviation' || resultType === 'wrong_deviation';

  if (compact) {
    return (
      <div className="feedback-banner-wrapper">
        <div className={`feedback-panel compact ${isCorrect ? 'correct' : 'incorrect'}`}>
          <span className="feedback-icon">
            {isCorrect ? '\u2713' : '\u2717'}
          </span>
          <span className="feedback-text">
            {feedbackText}
          </span>
          {showDeviationTag && (
            <span className={`feedback-tag ${isCorrect ? 'tag-correct' : 'tag-missed'}`}>
              {resultType === 'correct_deviation' ? 'DEV' : resultType === 'missed_deviation' ? 'MISS' : 'NO DEV'}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Expanded mode with full explanation
  const { userAction, correctAction, reason, handType, total, dealerUp, deviationName, deviationThreshold, trueCount } = lastDecision;

  const dealerStr = dealerUp === 11 ? 'A' : String(dealerUp);
  const handStr = handType === 'pair'
    ? `Pair (${total / 2}s)`
    : handType === 'soft'
      ? `Soft ${total}`
      : `Hard ${total}`;

  // Get title based on result type
  const getTitle = () => {
    switch (resultType) {
      case 'correct_basic': return 'Correct!';
      case 'correct_deviation': return 'Correct Deviation!';
      case 'missed_deviation': return 'Missed Deviation';
      case 'wrong_deviation': return 'Wrong Deviation';
      case 'incorrect_basic': return 'Incorrect';
      default: return isCorrect ? 'Correct!' : 'Incorrect';
    }
  };

  return (
    <div className={`feedback-panel expanded ${isCorrect ? 'correct' : 'incorrect'}`}>
      <div className="feedback-header">
        <div className="feedback-icon large">
          {isCorrect ? '\u2713' : '\u2717'}
        </div>
        <div className="feedback-title">
          {getTitle()}
        </div>
      </div>

      <div className="feedback-details">
        <div className="feedback-hand">
          <span className="label">Your hand:</span>
          <span className="value">{handStr} vs {dealerStr}</span>
        </div>

        {trueCount !== undefined && (
          <div className="feedback-hand">
            <span className="label">True Count:</span>
            <span className="value">{trueCount.toFixed(1)}</span>
          </div>
        )}

        <div className="feedback-actions">
          <div className="action-row">
            <span className="label">You chose:</span>
            <span className={`value ${isCorrect ? 'correct' : 'incorrect'}`}>
              {ACTION_LABELS[userAction]}
            </span>
          </div>
          {!isCorrect && (
            <div className="action-row">
              <span className="label">Correct play:</span>
              <span className="value correct">{ACTION_LABELS[correctAction]}</span>
            </div>
          )}
        </div>

        {deviationName && (resultType === 'missed_deviation' || resultType === 'correct_deviation') && (
          <div className="feedback-deviation">
            <span className="deviation-name">{deviationName}</span>
            {deviationThreshold !== undefined && (
              <span className="deviation-threshold">TC {deviationThreshold >= 0 ? '+' : ''}{deviationThreshold}</span>
            )}
          </div>
        )}

        <div className="feedback-reason">
          <span className="reason-text">{reason}</span>
        </div>
      </div>
    </div>
  );
};

// Correction Modal - blocks play until user acknowledges
interface CorrectionModalProps {
  lastDecision: LastDecision;
  onContinue: () => void;
  onTakeBack: () => void;
}

export const CorrectionModal: React.FC<CorrectionModalProps> = ({
  lastDecision,
  onContinue,
  onTakeBack,
}) => {
  const {
    userAction,
    correctAction,
    reason,
    handType,
    total,
    dealerUp,
    resultType,
    deviationName,
    deviationThreshold,
    trueCount,
  } = lastDecision;

  const dealerStr = dealerUp === 11 ? 'A' : String(dealerUp);
  const handStr = handType === 'pair'
    ? `Pair of ${total / 2}s`
    : handType === 'soft'
      ? `Soft ${total}`
      : `Hard ${total}`;

  // Get title based on result type
  const getTitle = () => {
    switch (resultType) {
      case 'missed_deviation': return 'Missed Deviation';
      case 'wrong_deviation': return 'Wrong Deviation';
      case 'incorrect_basic': return 'Incorrect Play';
      default: return 'Incorrect Play';
    }
  };

  return (
    <div className="correction-modal-overlay">
      <div className="correction-modal">
        <div className="correction-header">
          <div className="correction-icon">\u2717</div>
          <h2>{getTitle()}</h2>
        </div>

        <div className="correction-content">
          <div className="correction-hand">
            {handStr} vs Dealer {dealerStr}
            {trueCount !== undefined && (
              <span className="correction-tc"> (TC: {trueCount.toFixed(1)})</span>
            )}
          </div>

          {deviationName && (resultType === 'missed_deviation' || resultType === 'wrong_deviation') && (
            <div className="correction-deviation-info">
              <span className="deviation-name">{deviationName}</span>
              {deviationThreshold !== undefined && (
                <span className="deviation-threshold">
                  {' '}at TC {deviationThreshold >= 0 ? '+' : ''}{deviationThreshold}
                </span>
              )}
            </div>
          )}

          <div className="correction-comparison">
            <div className="comparison-item wrong">
              <span className="comparison-label">You chose</span>
              <span className="comparison-value">{ACTION_LABELS[userAction]}</span>
            </div>
            <div className="comparison-arrow">\u2192</div>
            <div className="comparison-item correct">
              <span className="comparison-label">Correct play</span>
              <span className="comparison-value">{ACTION_LABELS[correctAction]}</span>
            </div>
          </div>

          <div className="correction-reason">
            {reason}
          </div>
        </div>

        <div className="correction-actions">
          <button className="btn-take-back" onClick={onTakeBack}>
            Take it back
          </button>
          <button className="btn-continue" onClick={onContinue}>
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackPanel;
