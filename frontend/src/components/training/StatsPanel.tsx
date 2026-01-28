// Stats Panel Component
// Shows detailed training statistics and weak spots

import React, { useMemo } from 'react';
import type { TrainingStats, WeakSpot, PlayerAction } from './types';
import './StatsPanel.css';

interface StatsPanelProps {
  stats: TrainingStats;
  onClose: () => void;
  onReset?: () => void;
}

const ACTION_LABELS: Record<PlayerAction, string> = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double',
  split: 'Split',
  surrender: 'Surrender',
  insurance: 'Insurance',
};

export const StatsPanel: React.FC<StatsPanelProps> = ({ stats, onClose, onReset }) => {
  // Calculate overall accuracy
  const totalDecisions = stats.correctDecisions + stats.incorrectDecisions;
  const overallAccuracy = totalDecisions > 0
    ? (stats.correctDecisions / totalDecisions) * 100
    : 0;

  // Calculate accuracy by action type
  const actionAccuracies = useMemo(() => {
    return (['hit', 'stand', 'double', 'split', 'surrender'] as const).map(action => {
      const key = `${action}Accuracy` as keyof TrainingStats;
      const stat = stats[key] as { correct: number; total: number } | undefined;
      if (!stat || stat.total === 0) return { action, accuracy: null, total: 0 };
      return {
        action,
        accuracy: (stat.correct / stat.total) * 100,
        total: stat.total,
      };
    }).filter(a => a.total > 0);
  }, [stats]);

  // Calculate accuracy by hand type
  const handTypeAccuracies = useMemo(() => {
    return (['hard', 'soft', 'pair'] as const).map(type => {
      const key = `${type}Accuracy` as keyof TrainingStats;
      const stat = stats[key] as { correct: number; total: number } | undefined;
      if (!stat || stat.total === 0) return { type, accuracy: null, total: 0 };
      return {
        type,
        accuracy: (stat.correct / stat.total) * 100,
        total: stat.total,
      };
    }).filter(a => a.total > 0);
  }, [stats]);

  // Find weak spots (hands with <80% accuracy and at least 3 occurrences)
  const weakSpots: WeakSpot[] = useMemo(() => {
    return Object.entries(stats.handStats)
      .filter(([_, data]) => data.total >= 3)
      .map(([handKey, data]) => {
        const accuracy = (data.correct / data.total) * 100;
        // Find most common mistake
        let commonMistake: PlayerAction | undefined;
        let maxMistakes = 0;
        for (const [action, count] of Object.entries(data.mistakes)) {
          if (count > maxMistakes) {
            maxMistakes = count;
            commonMistake = action as PlayerAction;
          }
        }
        return {
          handKey,
          occurrences: data.total,
          correct: data.correct,
          accuracy,
          commonMistake,
        };
      })
      .filter(spot => spot.accuracy < 80)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 10);
  }, [stats.handStats]);

  // Format hand key for display
  const formatHandKey = (key: string): string => {
    // e.g., "hard-16-v10" -> "Hard 16 vs 10"
    // e.g., "soft-17-v6" -> "Soft 17 vs 6"
    // e.g., "pair-8-v10" -> "Pair 8s vs 10"
    const parts = key.split('-');
    if (parts.length < 3) return key;

    const [type, value, dealer] = parts;
    const dealerVal = dealer.replace('v', '');

    if (type === 'pair') {
      return `Pair ${value}s vs ${dealerVal}`;
    }
    return `${type.charAt(0).toUpperCase() + type.slice(1)} ${value} vs ${dealerVal}`;
  };

  // Calculate session duration
  const sessionDuration = useMemo(() => {
    const ms = Date.now() - stats.sessionStart;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [stats.sessionStart]);

  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={e => e.stopPropagation()}>
        <div className="stats-header">
          <h2>Session Statistics</h2>
          <button className="close-btn" onClick={onClose}>{'\u2715'}</button>
        </div>

        {/* Session Summary */}
        <div className="stats-section">
          <h3>Session Summary</h3>
          <div className="stats-grid">
            <div className="stat-box">
              <span className="stat-number">{stats.handsPlayed}</span>
              <span className="stat-label">Hands Played</span>
            </div>
            <div className="stat-box">
              <span className="stat-number">{totalDecisions}</span>
              <span className="stat-label">Decisions Made</span>
            </div>
            <div className="stat-box highlight">
              <span className="stat-number">{overallAccuracy.toFixed(1)}%</span>
              <span className="stat-label">Overall Accuracy</span>
            </div>
            <div className="stat-box">
              <span className="stat-number">{sessionDuration}</span>
              <span className="stat-label">Session Time</span>
            </div>
          </div>
        </div>

        {/* Accuracy by Action */}
        {actionAccuracies.length > 0 && (
          <div className="stats-section">
            <h3>Accuracy by Action</h3>
            <div className="accuracy-bars">
              {actionAccuracies.map(({ action, accuracy, total }) => (
                <div key={action} className="accuracy-row">
                  <span className="accuracy-label">{ACTION_LABELS[action]}</span>
                  <div className="accuracy-bar-container">
                    <div
                      className={`accuracy-bar ${accuracy! >= 90 ? 'excellent' : accuracy! >= 70 ? 'good' : 'needs-work'}`}
                      style={{ width: `${accuracy}%` }}
                    />
                  </div>
                  <span className="accuracy-value">{accuracy!.toFixed(0)}%</span>
                  <span className="accuracy-count">({total})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accuracy by Hand Type */}
        {handTypeAccuracies.length > 0 && (
          <div className="stats-section">
            <h3>Accuracy by Hand Type</h3>
            <div className="accuracy-bars">
              {handTypeAccuracies.map(({ type, accuracy, total }) => (
                <div key={type} className="accuracy-row">
                  <span className="accuracy-label">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                  <div className="accuracy-bar-container">
                    <div
                      className={`accuracy-bar ${accuracy! >= 90 ? 'excellent' : accuracy! >= 70 ? 'good' : 'needs-work'}`}
                      style={{ width: `${accuracy}%` }}
                    />
                  </div>
                  <span className="accuracy-value">{accuracy!.toFixed(0)}%</span>
                  <span className="accuracy-count">({total})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weak Spots */}
        {weakSpots.length > 0 && (
          <div className="stats-section">
            <h3>Weak Spots</h3>
            <p className="section-desc">Hands where you need more practice (under 80% accuracy)</p>
            <div className="weak-spots-list">
              {weakSpots.map(spot => (
                <div key={spot.handKey} className="weak-spot-item">
                  <div className="weak-spot-main">
                    <span className="weak-spot-hand">{formatHandKey(spot.handKey)}</span>
                    <span className={`weak-spot-accuracy ${spot.accuracy < 50 ? 'bad' : 'moderate'}`}>
                      {spot.accuracy.toFixed(0)}%
                    </span>
                  </div>
                  <div className="weak-spot-details">
                    <span>{spot.correct}/{spot.occurrences} correct</span>
                    {spot.commonMistake && (
                      <span className="common-mistake">
                        Common mistake: {ACTION_LABELS[spot.commonMistake]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reset Button */}
        <div className="stats-footer">
          <button className="reset-stats-btn" onClick={() => {
            if (window.confirm('Reset all session statistics?')) {
              onReset?.();
              onClose();
            }
          }}>
            Reset Statistics
          </button>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;
