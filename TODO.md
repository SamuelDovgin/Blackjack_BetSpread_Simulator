# Blackjack Simulator - Improvement Roadmap

> Generated: January 25, 2026
> Total Tasks: 49

---

## Overview

This document tracks all planned improvements for the Blackjack Simulator. Tasks are organized by category and include priority ratings to help with planning.

**Priority Legend:**
- 🔴 **High** - Critical improvements, should be done first
- 🟡 **Medium** - Important but not urgent
- 🟢 **Low** - Nice to have, can wait

**Status Legend:**
- [ ] Not started
- [x] Completed

---

## Top 10 Priority Recommendations

These are the most impactful improvements to tackle first:

1. **Fix RoR calculation** - Current formula assumes constant bet, but variable betting is used
2. **Refactor App.tsx** - 3000+ line file is hard to maintain
3. **Add counting systems** - Hi-Lo only is limiting for serious users
4. **Multi-processing** - Big performance win for large simulations
5. **Confidence intervals** - Users need to know statistical significance
6. **Custom strategy editor** - Power users need this flexibility
7. **Tooltips/help** - Improve UX for beginners
8. **Test suite** - Currently minimal test coverage
9. **Bankroll calculator** - Critical practical tool for players
10. **Better charts** - Interactive tooltips, zoom, export capabilities

---

## Simulator Algorithm & Card Counting

### Counting Systems

- [ ] 🔴 **#1 - Add more counting systems (KO, Hi-Opt I/II, Omega II, Zen)**
  - Currently only Hi-Lo is supported
  - Add: KO (Knock-Out), Hi-Opt I (Einstein), Hi-Opt II, Omega II, Zen Count, Red Seven, Halves
  - Each system needs: name, tag values per rank, balanced/unbalanced flag
  - For unbalanced counts, true count calculation should be optional or handled differently

- [ ] 🔴 **#2 - Implement side count tracking (Aces, specific cards)**
  - Track side counts alongside main count
  - Ace side count (critical for insurance decisions and betting)
  - Other card side counts (5s, 10s, etc.)
  - Display side count info in results
  - Allow deviations based on ace-richness/poorness

### Simulation Features

- [ ] 🟡 **#3 - Add back-counting (mid-shoe entry) simulation**
  - Simulate back-counting strategy where player watches without playing
  - Enters at favorable count (e.g., TC >= +2)
  - Optionally exits at unfavorable count
  - Track time spent watching vs playing
  - Calculate effective hourly EV with back-counting overhead

- [ ] 🟡 **#4 - Implement multi-hand play option**
  - Allow simulating 1-3 hands simultaneously
  - Each hand gets full bet from ramp
  - Handle splitting across hands
  - Calculate correlation between hands
  - Show impact on variance and EV

- [ ] 🔴 **#8 - Implement proper insurance EV tracking**
  - Track insurance decisions separately
  - Insurance taken count and win rate
  - EV of insurance decisions by TC
  - Show when insurance is +EV
  - Even money on blackjack tracking
  - Insurance correlation with side counts

- [ ] 🟢 **#9 - Add shuffle tracking simulation (advanced)**
  - Track high/low card clumps
  - Zone tracking through shuffle
  - Key card tracking
  - Adjust bet based on expected zone composition
  - Toggle on/off for standard counting comparison

### True Count & Statistics

- [ ] 🟡 **#10 - Implement true count frequency distribution analysis**
  - Show expected vs actual TC distribution
  - Chi-square goodness of fit test
  - Time spent at each TC
  - Cumulative EV by TC threshold
  - Optimal wong-out point calculator

- [ ] 🔴 **#11 - Fix RoR calculation for variable betting**
  - Current RoR uses simple log-ruin formula assuming constant bet
  - Use actual bet distribution from simulation
  - Implement Kelly-based RoR calculation
  - Monte Carlo RoR estimation option
  - Show RoR by session length (trip RoR)
  - Confidence intervals on RoR estimate

- [ ] 🟡 **#39 - Fix TC histogram bin edge handling**
  - Current histogram uses floor for binning
  - TC exactly at boundary may be inconsistent
  - Negative TC binning should be verified
  - Consider half-integer bins for more detail
  - Handle extreme TC values (cap display range)

- [ ] 🔴 **#40 - Add confidence intervals to all metrics**
  - 95% CI for EV/100
  - CI for standard deviation
  - CI for DI and SCORE
  - Sample size warnings for small sims
  - Required hands for desired precision

### Rule Variations

- [ ] 🟡 **#41 - Implement early surrender vs late surrender toggle**
  - Currently only late surrender
  - Early surrender option (before dealer peek)
  - Separate deviation sets for each
  - Show EV impact of each surrender type
  - Document rule differences

- [ ] 🟡 **#42 - Add European no-hole-card rule (ENHC)**
  - Dealer doesn't peek
  - Player loses all bets to dealer BJ
  - Adjust basic strategy for ENHC
  - Calculate EV impact

- [ ] 🟢 **#43 - Implement CSM (Continuous Shuffle Machine) simulation**
  - Cards returned to shoe immediately
  - No penetration/count advantage
  - Show why counting doesn't work
  - Compare CSM vs shoe EV
  - Educational value

- [ ] 🟡 **#44 - Add double on 9/10/11 only rule option**
  - Double on 9/10/11 only
  - Double on 10/11 only
  - No soft doubling
  - Adjust basic strategy accordingly
  - Show EV impact of restrictions

- [ ] 🟢 **#45 - Implement 6:5 blackjack payout option**
  - 6:5 payout option (already has custom payout field)
  - Show massive EV hit clearly
  - Warning when 6:5 selected
  - Compare 6:5 vs 3:2 side-by-side

---

## Strategy & Deviations

- [ ] 🔴 **#5 - Add custom basic strategy editor**
  - Editable grid for hard totals, soft totals, pairs
  - Click cells to cycle through H/S/D/P/R actions
  - Validate strategy completeness
  - Compare to optimal and show deviations
  - Save/load custom strategies

- [ ] 🔴 **#6 - Implement playing deviations beyond Illustrious 18**
  - Full deviation set (all hands, all TCs)
  - Import from CVCX or other simulator formats
  - Generate optimal deviations based on sim rules
  - Show EV gain per deviation
  - Priority/importance ranking for learning order

- [ ] 🟡 **#7 - Add betting strategy comparison mode**
  - Run multiple bet ramps simultaneously
  - Side-by-side comparison of 2-4 different ramps
  - Same random seed for fair comparison
  - Show EV/variance/RoR differences
  - Highlight optimal spread for given bankroll
  - Kelly criterion calculator integration

- [ ] 🟡 **#23 - Add "What-If" quick scenario buttons**
  - "What if S17 instead of H17?"
  - "What if no DAS?"
  - "What if 8 decks?"
  - Show EV difference immediately
  - Reset to original after viewing

---

## Frontend Design & UX

### Code Architecture

- [ ] 🔴 **#12 - Refactor App.tsx into separate components**
  - Current file is 3000+ lines
  - Extract RulesCard component
  - Extract BetRampCard component
  - Extract DeviationsCard component
  - Extract ResultsPanel component
  - Extract charts into separate components
  - Create shared UI components (StepperInput, ToggleGroup, etc.)
  - Use proper React patterns (context, reducers)

- [ ] 🟡 **#49 - Implement state management (Redux/Zustand)**
  - Extract state from App.tsx
  - Separate UI state from config state
  - Persist relevant state
  - Enable time-travel debugging
  - Cleaner component props

- [ ] 🟡 **#48 - Add error boundary and crash recovery**
  - React error boundaries
  - Auto-save config on change
  - Recover from crashes
  - Clear error messages
  - Report error option

### Visual Design

- [ ] 🟡 **#13 - Implement dark mode theme**
  - CSS variables for colors
  - Toggle in header
  - Persist preference in localStorage
  - Proper contrast ratios
  - Chart colors that work in both modes

- [ ] 🟡 **#14 - Add responsive mobile layout**
  - Stack columns on narrow screens
  - Collapsible sections
  - Touch-friendly inputs
  - Swipe between input/results views
  - Optimize chart rendering for mobile

- [ ] 🔴 **#15 - Implement proper charting library (Recharts or Chart.js)**
  - Interactive tooltips with full data
  - Zoom/pan on trip simulation chart
  - Export charts as PNG/SVG
  - Animated transitions
  - Better axis labeling and legends
  - Responsive chart sizing

### User Experience

- [ ] 🟢 **#16 - Add keyboard shortcuts for power users**
  - Ctrl+Enter to run simulation
  - Escape to stop
  - Tab navigation through sections
  - Number keys for quick hand counts
  - Ctrl+S to save preset
  - Ctrl+D to duplicate

- [ ] 🔴 **#17 - Add tooltips and help text throughout UI**
  - Hover tooltips on all metrics (EV, DI, SCORE, N0, etc.)
  - Help icons with expanded explanations
  - Contextual tips for beginners
  - Link to documentation/glossary
  - "What's this?" mode

- [ ] 🟢 **#18 - Implement undo/redo for configuration changes**
  - Undo last change (Ctrl+Z)
  - Redo (Ctrl+Shift+Z)
  - History panel showing recent changes
  - Restore to any previous state
  - Clear history on save

- [ ] 🟢 **#19 - Add drag-and-drop for bet ramp entries**
  - Drag rows to reorder
  - Visual indicator of current sort
  - Auto-sort toggle
  - Inline editing without modal
  - Better visual bet ramp preview chart

- [ ] 🔴 **#28 - Add input validation with helpful error messages**
  - Real-time validation as user types
  - Clear error messages explaining issue
  - Highlight invalid fields
  - Prevent submission with invalid config
  - Suggest corrections where possible

### Data & Export

- [ ] 🟡 **#20 - Implement scenario comparison dashboard**
  - Compare multiple saved scenarios
  - Side-by-side metric comparison table
  - Difference highlighting
  - Bar chart comparing EV/RoR/etc
  - Export comparison as report
  - Quick switch between scenarios

- [ ] 🟡 **#21 - Add export options (PDF report, CSV data)**
  - PDF report with all metrics and charts
  - CSV export of TC table data
  - CSV export of debug hands
  - JSON export of full results
  - Copy metrics to clipboard
  - Share link generation

- [ ] 🟢 **#22 - Implement session bankroll tracking**
  - Track bankroll across multiple runs
  - Running total bankroll
  - Session win/loss history
  - Bankroll chart over time
  - Reset session option
  - Target bankroll alerts

---

## Performance & Backend

- [ ] 🔴 **#24 - Implement multi-processing for faster simulations**
  - Backend currently single-threaded
  - Use Python multiprocessing for parallel simulation
  - Split hands across CPU cores
  - Aggregate results from workers
  - Show per-worker progress
  - Handle process communication properly
  - Support `processes` parameter in request

- [ ] 🟡 **#25 - Optimize simulation hot path with Cython/Numba**
  - Profile to find bottlenecks
  - Convert hot loops to Cython
  - Or use Numba JIT compilation
  - Optimize hand_value() function
  - Reduce object allocations
  - Target: 2-5x speedup

- [ ] 🟢 **#26 - Add WebSocket for real-time progress updates**
  - Replace polling with WebSocket
  - Push progress updates as they happen
  - Real-time EV estimate streaming
  - Lower latency updates
  - Reduce server load vs polling
  - Graceful fallback to polling

- [ ] 🟢 **#27 - Implement simulation caching/resumption**
  - Cache intermediate state
  - Resume from checkpoint
  - Background continuation
  - Persistent simulation history
  - Compare paused vs completed

---

## Advanced Features

### Game Variants

- [ ] 🟢 **#31 - Add Spanish 21 / Blackjack Switch variants**
  - Spanish 21 (no 10s, bonus payouts)
  - Blackjack Switch (swap second cards)
  - Free Bet Blackjack
  - Pontoon
  - Double Exposure
  - Custom rules for variant basic strategy

- [ ] 🟢 **#32 - Implement side bet simulation (Perfect Pairs, 21+3)**
  - Perfect Pairs (same rank)
  - 21+3 (poker hand)
  - Royal Match
  - Lucky Ladies
  - Insurance as side bet analysis
  - Show house edge per side bet

### Advanced Play

- [ ] 🟢 **#33 - Add team play simulation**
  - Big Player / Spotter model
  - Signal-based entry
  - Multiple table coverage
  - Bankroll pooling effects
  - Team vs solo EV comparison

- [ ] 🟡 **#34 - Implement heat/longevity analysis**
  - Bet spread visibility score
  - Cover play suggestions
  - Wonging frequency analysis
  - Session length recommendations
  - Camouflage play options

- [ ] 🔴 **#35 - Add bankroll requirement calculator**
  - For target RoR (e.g., 5% ruin)
  - For target Kelly fraction
  - For session goals
  - Show unit size recommendations
  - Bankroll growth projections

- [ ] 🟢 **#29 - Implement preset cloud sync (Firebase/Supabase)**
  - User accounts (optional)
  - Sync presets across devices
  - Share presets with others
  - Community preset library
  - Version history for presets

---

## Training & Education

- [ ] 🟡 **#36 - Implement play-by-play training mode**
  - Deal hands one at a time
  - User selects action
  - Show correct action and reason
  - Track accuracy stats
  - Focus on mistakes
  - Deviation flashcards

- [ ] 🟡 **#37 - Add counting practice module**
  - Flash cards through deck
  - Track running count accuracy
  - Variable speed settings
  - Multiple counting system support
  - Score and progress tracking

- [ ] 🟡 **#38 - Implement deviation quiz mode**
  - Show hand and TC
  - User selects action
  - Compare to optimal
  - Track weak spots
  - Spaced repetition learning

---

## Documentation & Testing

- [ ] 🔴 **#30 - Add comprehensive test suite**
  - Unit tests for all simulation logic
  - Integration tests for API endpoints
  - Frontend component tests (React Testing Library)
  - E2E tests (Playwright/Cypress)
  - CI/CD pipeline with test gates
  - Test coverage reporting

- [ ] 🟡 **#46 - Add API documentation (OpenAPI/Swagger)**
  - OpenAPI spec generation
  - Swagger UI at /docs
  - Request/response examples
  - Error code documentation
  - Rate limiting info

- [ ] 🟢 **#47 - Create user documentation/wiki**
  - Getting started guide
  - Feature explanations
  - Metric definitions
  - Strategy guide
  - FAQ section
  - Video tutorials links

---

## Progress Tracker

| Category | Total | Completed | Remaining |
|----------|-------|-----------|-----------|
| Simulator Algorithm & Card Counting | 15 | 0 | 15 |
| Strategy & Deviations | 4 | 0 | 4 |
| Frontend Design & UX | 14 | 0 | 14 |
| Performance & Backend | 4 | 0 | 4 |
| Advanced Features | 6 | 0 | 6 |
| Training & Education | 3 | 0 | 3 |
| Documentation & Testing | 3 | 0 | 3 |
| **Total** | **49** | **0** | **49** |

---

## Changelog

### January 25, 2026
- Initial roadmap created with 49 improvement tasks
- Tasks categorized and prioritized
- Top 10 priorities identified

---

## Notes

- Tasks can be worked on in any order, but following the priority recommendations will maximize impact
- Some tasks have dependencies (e.g., #12 refactoring should happen before major frontend additions)
- Performance optimizations (#24, #25) become more important as simulation size increases
- Training features (#36-38) are standalone and can be developed independently
