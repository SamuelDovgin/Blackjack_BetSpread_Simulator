// Scenario Panel Component
// Controls for reshuffling, bankroll, and practice scenarios

import React, { useState, useCallback } from 'react';
import { getDeviationOptions } from './engine/scenarioGenerator';
import './ScenarioPanel.css';

export type ScenarioMode = 'jump' | 'playTo';

interface ScenarioPanelProps {
  /** Current bankroll in units */
  bankroll: number;
  /** Number of hands being played (1, 2, or 3) */
  handsToPlay: number;
  /** Called when bankroll is changed */
  onBankrollChange: (newBankroll: number) => void;
  /** Called when reshuffle is requested */
  onReshuffle: () => void;
  /** Called when a TC scenario is generated */
  onGenerateTCScenario: (targetTC: number, mode: ScenarioMode) => void;
  /** Called when a deviation scenario is generated */
  onGenerateDeviationScenario: (deviationIndex: number, mode: ScenarioMode) => void;
  /** Called to close the panel */
  onClose: () => void;
  /** Whether scenario is being generated (loading state) */
  isGenerating?: boolean;
}

export const ScenarioPanel: React.FC<ScenarioPanelProps> = ({
  bankroll,
  handsToPlay,
  onBankrollChange,
  onReshuffle,
  onGenerateTCScenario,
  onGenerateDeviationScenario,
  onClose,
  isGenerating = false,
}) => {
  const [targetTC, setTargetTC] = useState<number>(3);
  const [selectedDeviation, setSelectedDeviation] = useState<number>(1); // Default to 16v10

  const deviationOptions = getDeviationOptions();

  const handleReshuffle = useCallback(() => {
    onReshuffle();
    onClose();
  }, [onReshuffle, onClose]);

  const handleJumpToTC = useCallback(() => {
    onGenerateTCScenario(targetTC, 'jump');
  }, [onGenerateTCScenario, targetTC]);

  const handlePlayToTC = useCallback(() => {
    onGenerateTCScenario(targetTC, 'playTo');
  }, [onGenerateTCScenario, targetTC]);

  const handleJumpToDeviation = useCallback(() => {
    onGenerateDeviationScenario(selectedDeviation, 'jump');
  }, [onGenerateDeviationScenario, selectedDeviation]);

  const handlePlayToDeviation = useCallback(() => {
    onGenerateDeviationScenario(selectedDeviation, 'playTo');
  }, [onGenerateDeviationScenario, selectedDeviation]);

  return (
    <div className="scenario-overlay" onClick={onClose}>
      <div className="scenario-panel" onClick={e => e.stopPropagation()}>
        <div className="scenario-header">
          <h2>Scenario Controls</h2>
          <button className="scenario-close-btn" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        <div className="scenario-content">
          {/* Shoe Controls Section */}
          <section className="scenario-section">
            <h3>Shoe Controls</h3>
            <div className="scenario-controls">
              <button
                className="scenario-btn scenario-btn-primary"
                onClick={handleReshuffle}
                disabled={isGenerating}
              >
                Reshuffle Now
              </button>

              <div className="scenario-input-row">
                <label htmlFor="bankroll-input">Bankroll (units):</label>
                <input
                  id="bankroll-input"
                  type="number"
                  min={0}
                  step={100}
                  value={bankroll}
                  onChange={(e) => onBankrollChange(Math.max(0, parseInt(e.target.value) || 0))}
                  className="scenario-input"
                />
              </div>
            </div>
          </section>

          {/* Target TC Section */}
          <section className="scenario-section">
            <h3>Practice at Specific True Count</h3>
            <div className="scenario-controls">
              <div className="scenario-input-row">
                <label htmlFor="target-tc-input">Target True Count:</label>
                <input
                  id="target-tc-input"
                  type="number"
                  min={-10}
                  max={15}
                  step={1}
                  value={targetTC}
                  onChange={(e) => setTargetTC(parseInt(e.target.value) || 0)}
                  className="scenario-input scenario-input-small"
                />
              </div>
              <p className="scenario-hint">Range: -10 to +15</p>
              <div className="scenario-btn-row">
                <button
                  className="scenario-btn scenario-btn-secondary"
                  onClick={handleJumpToTC}
                  disabled={isGenerating}
                  title="Start directly at this TC"
                >
                  {isGenerating ? 'Generating...' : 'Jump to TC'}
                </button>
                <button
                  className="scenario-btn scenario-btn-tertiary"
                  onClick={handlePlayToTC}
                  disabled={isGenerating}
                  title="Play from start until you reach this TC"
                >
                  {isGenerating ? 'Generating...' : 'Play to TC'}
                </button>
              </div>
            </div>
          </section>

          {/* Deviation Practice Section */}
          <section className="scenario-section">
            <h3>Practice Specific Deviation</h3>
            <p className="scenario-hint scenario-hands-info">
              Playing {handsToPlay} hand{handsToPlay > 1 ? 's' : ''} per round
            </p>
            <div className="scenario-controls">
              <div className="scenario-input-row">
                <label htmlFor="deviation-select">Deviation:</label>
                <select
                  id="deviation-select"
                  value={selectedDeviation}
                  onChange={(e) => setSelectedDeviation(parseInt(e.target.value))}
                  className="scenario-select"
                >
                  {deviationOptions.map((opt) => (
                    <option key={opt.index} value={opt.index}>
                      {opt.description}
                    </option>
                  ))}
                </select>
              </div>
              <p className="scenario-hint">
                Sets up the exact hand situation at the threshold TC.
              </p>
              <div className="scenario-btn-row">
                <button
                  className="scenario-btn scenario-btn-secondary"
                  onClick={handleJumpToDeviation}
                  disabled={isGenerating}
                  title="Start directly at this deviation scenario"
                >
                  {isGenerating ? 'Generating...' : 'Jump to Deviation'}
                </button>
                <button
                  className="scenario-btn scenario-btn-tertiary"
                  onClick={handlePlayToDeviation}
                  disabled={isGenerating}
                  title="Play from start until you reach this deviation"
                >
                  {isGenerating ? 'Generating...' : 'Play to Deviation'}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="scenario-footer">
          <button className="scenario-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScenarioPanel;
