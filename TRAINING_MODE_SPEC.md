# Training Mode - Complete Design Specification

## Task #36 & #37: Play-by-Play Training + Counting Practice

**Document Version:** 1.1
**Status:** Design Complete - Ready for Implementation
**Last Updated:** Based on user input session

---

## Design Decisions Summary

These decisions were made through user input and guide the entire implementation:

| Area | Decision | Details |
|------|----------|---------|
| **Navigation (Mobile)** | Header with Back | Training shows "← Back to Simulator" in header |
| **Entry Point** | Mode Selection + Resume | Show mode menu, with "Resume" button if session exists |
| **Correction Mode** | User Toggleable | Setting to choose Full Stop Modal vs Inline Warning |
| **Hints** | Opt-in Feature | Hint button hidden by default, must enable in settings |
| **Betting** | Both Modes | Toggle between auto-bet and manual betting |
| **Card Style** | Classic Casino | Traditional playing cards with full pip patterns |
| **Table Style** | Green Felt | Classic casino green felt background |
| **Animations** | Essential | Smooth card dealing animations required |
| **Count Display** | Hidden by Default | Realistic practice - count is hidden unless enabled |
| **Count Drills** | Both Modes | Periodic checkpoints AND end-of-deck final answer |
| **Play Count Checks** | No Interruptions | Don't interrupt gameplay to quiz count |
| **Max Speed** | 0.1s (Insane) | Include extreme speed mode for mastery |
| **Statistics** | Comprehensive | Full breakdown by hand type, action, TC range, trends |
| **Progress** | Persistent | Save all stats/history to localStorage |
| **Achievements** | Subtle Milestones | Track milestones but don't over-gamify |
| **High TC Range** | Configurable | User sets min/max TC for scenario generation |
| **Situation Drill** | Both Options | Manual selection + auto weak-spot drills |
| **Insurance** | Always Prompt | Prompt every time dealer shows Ace |
| **Sound** | Optional (Off)  | Sound effects available but disabled by default |
| **Hand Flow** | Auto-Advance | Dealer reveals → brief delay → auto next hand |
| **Keyboard** | Yes (Secondary) | H/S/D/P/R shortcuts, but touch buttons primary |
| **Penetration** | From Simulator | Use same penetration setting as simulator rules |
| **Deck Estimation** | Rendered Tray | 3D/2D rendered discard tray, not photos |
| **Deck Est. Difficulty** | Progressive | Whole → Half → Quarter decks progression |
| **TC Integration** | Use User's Estimate | Wrong deck estimate → wrong TC in training |

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Integration with Main App](#3-integration-with-main-app)
4. [UI/UX Design - Desktop](#4-uiux-design---desktop)
5. [UI/UX Design - Mobile](#5-uiux-design---mobile)
6. [Component Breakdown](#6-component-breakdown)
7. [State Management](#7-state-management)
8. [Game Engine](#8-game-engine)
9. [Counting Practice Module](#9-counting-practice-module)
10. [Scenario Generation](#10-scenario-generation)
11. [Statistics & Progress](#11-statistics--progress)
12. [Implementation Phases](#12-implementation-phases)
13. [File Structure](#13-file-structure)
14. [API Contracts](#14-api-contracts)
15. [CSS & Theming](#15-css--theming)
16. [Deck Estimation Training](#16-deck-estimation-training)

---

## 1. Overview

### 1.1 Purpose

The Training Mode is a **separate page/tab** from the main simulator that allows users to:

1. **Practice playing blackjack hands** with immediate feedback on basic strategy and deviations
2. **Practice card counting** with speed drills and accuracy tracking
3. **Prepare for casino play** with realistic scenarios and time pressure

### 1.2 Key Principles

- **Separate from Simulator**: Training is about learning, not statistical analysis
- **Inherits Configuration**: Uses rules, counting system, deviations, and bet ramp from main app
- **Mobile-First**: Designed for phone use (practice anywhere)
- **Progressive Difficulty**: Start easy, build to casino speed
- **Immediate Feedback**: Know instantly if you made the right call

### 1.3 User Journey

```
Main App (Simulator)
       │
       ├── Configure rules, counting system, deviations, bet ramp
       │
       └── Click "Training Mode" button
              │
              ▼
       Training Mode Page
              │
              ├── Practice Mode Selection
              │     ├── Free Play (continuous hands)
              │     ├── Counting Drill (speed practice)
              │     ├── High Count Scenarios
              │     └── Specific Situations
              │
              ├── Play Hands with Feedback
              │     ├── See cards dealt
              │     ├── Make decisions (H/S/D/P/R)
              │     ├── Get immediate feedback
              │     └── Optional: Correction mode
              │
              └── View Statistics
                    ├── Accuracy by hand type
                    ├── Counting accuracy
                    └── Weak spots to improve
```

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Main App (App.tsx)                         │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Rules     │  │  Counting   │  │ Deviations  │  │  Bet Ramp  │ │
│  │   Config    │  │   System    │  │   Config    │  │   Config   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                │                │                │        │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
│                                   ▼                                  │
│                    ┌──────────────────────────┐                      │
│                    │   TrainingModeContext    │                      │
│                    │   (shares config state)  │                      │
│                    └────────────┬─────────────┘                      │
│                                 │                                    │
└─────────────────────────────────┼────────────────────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │                           │
                    │    Training Mode Page     │
                    │    /training              │
                    │                           │
                    └─────────────┬─────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Game Engine   │    │ Counting Drill  │    │   Statistics    │
│   Component     │    │   Component     │    │    Component    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 2.2 Data Flow

```
User Configuration (Main App)
         │
         │  (passed via Context or URL params)
         ▼
┌─────────────────────────────────────────┐
│         TrainingModeProvider            │
│                                         │
│  • rules: Rules                         │
│  • countingSystem: CountingSystem       │
│  • deviations: Deviation[]              │
│  • betRamp: BetRamp                     │
│  • unitSize: number                     │
│                                         │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│           TrainingGameEngine            │
│                                         │
│  • Manages shoe, count, hands           │
│  • Validates player decisions           │
│  • Calculates correct actions           │
│  • Tracks statistics                    │
│                                         │
└─────────────────────────────────────────┘
```

---

## 3. Integration with Main App

### 3.1 Navigation Between Simulator and Training

The app will have **two main sections** that users can switch between. Here are the navigation options:

#### Primary Navigation (Header/Topbar)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│   ┌─────────────────────┐  ┌─────────────────────┐                         │
│   │    📊 SIMULATOR     │  │   🎓 TRAINING       │         [Settings ⚙️]   │
│   │       (active)      │  │                     │                         │
│   └─────────────────────┘  └─────────────────────┘                         │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│                         [Current page content]                             │
│                                                                            │
```

**Desktop**: Tabs in the header, always visible
**Mobile**: Bottom navigation bar or hamburger menu

#### Navigation States

| From | To | Behavior |
|------|----|----------|
| Simulator → Training | Config is passed automatically. Training starts fresh or resumes last session |
| Training → Simulator | Return to simulator with all config preserved. Training session pauses (can resume) |
| Training (mid-hand) → Simulator | Prompt: "You have a hand in progress. Abandon or finish first?" |

#### Deep Linking / URLs

```
/                    → Simulator (default)
/simulator           → Simulator
/training            → Training mode landing (mode selection)
/training/play       → Free play mode
/training/counting   → Counting drill
/training/scenarios  → Scenario practice
/training/stats      → Statistics dashboard
```

#### Quick Access Points

**From Simulator to Training:**
1. Main nav tab (always visible)
2. "Practice This Strategy" button after running a simulation
3. "Train Deviations" link in the deviations panel

**From Training to Simulator:**
1. Main nav tab
2. "Back to Simulator" in training header
3. "Edit Rules/Strategy" link (goes to simulator config)

#### Mobile Navigation (DECISION: Header with Back Arrow)

```
┌────────────────────────────────────────┐
│  ← Simulator     TRAINING         ⚙️   │
├────────────────────────────────────────┤
│                                        │
│           [Training Content]           │
│                                        │
└────────────────────────────────────────┘
```

**Rationale:** Maximizes screen real estate for the game table. Training is a focused experience - users don't need to constantly switch between modes.

#### Session Persistence

- **Training session auto-saves** to localStorage every action
- If user leaves mid-session, they can resume where they left off
- "New Session" button to start fresh
- Session survives browser refresh and app switches

### 3.2 Shared Configuration

The Training Mode **inherits** the following from the main app:

| Config | Source | Usage in Training |
|--------|--------|-------------------|
| `rules` | Scenario config | Determines game rules (H17, DAS, surrender, etc.) |
| `countingSystem` | Scenario config | Card values for counting, true count calculation |
| `deviations` | Scenario config | When to deviate from basic strategy |
| `betRamp` | Scenario config | Suggested bet based on true count |
| `unitSize` | Scenario settings | Dollar value of one unit |

### 3.2 Navigation

**Option A: React Router (Recommended)**

```tsx
// App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <TrainingModeProvider config={scenarioConfig}>
        <Routes>
          <Route path="/" element={<SimulatorPage />} />
          <Route path="/training" element={<TrainingModePage />} />
        </Routes>
      </TrainingModeProvider>
    </BrowserRouter>
  );
}
```

**Option B: Tab-Based (Simpler)**

```tsx
// App.tsx
const [activeTab, setActiveTab] = useState<'simulator' | 'training'>('simulator');

return (
  <div className="app">
    <nav className="app-tabs">
      <button onClick={() => setActiveTab('simulator')}>Simulator</button>
      <button onClick={() => setActiveTab('training')}>Training Mode</button>
    </nav>

    {activeTab === 'simulator' ? (
      <SimulatorPage />
    ) : (
      <TrainingModePage config={scenarioConfig} />
    )}
  </div>
);
```

### 3.3 Entry Point in Main App

Add a prominent "Training Mode" button in the main app:

```tsx
// In App.tsx topbar or sidebar
<button
  className="btn-training-mode"
  onClick={() => navigate('/training')}
>
  🎓 Training Mode
</button>
```

---

## 4. UI/UX Design - Desktop

### 4.0 Mode Selection / Landing Screen

When entering Training Mode, users see the mode selection screen (with Resume option if session exists):

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Simulator          TRAINING MODE                    Settings ⚙️ │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│                                                                            │
│   ┌──────────────────────────────────────────────────────────────────┐     │
│   │  ▶  RESUME LAST SESSION                                          │     │
│   │     47 hands played • 89% accuracy • +$235                       │     │
│   │     Last played: 2 hours ago                                     │     │
│   └──────────────────────────────────────────────────────────────────┘     │
│                                                                            │
│   ─────────────────── OR START NEW ───────────────────                     │
│                                                                            │
│   ┌─────────────────────────┐  ┌─────────────────────────┐                 │
│   │                         │  │                         │                 │
│   │     🎰 FREE PLAY        │  │     🔢 COUNTING DRILL   │                 │
│   │                         │  │                         │                 │
│   │  Practice full hands    │  │  Speed counting         │                 │
│   │  with feedback          │  │  practice               │                 │
│   │                         │  │                         │                 │
│   └─────────────────────────┘  └─────────────────────────┘                 │
│                                                                            │
│   ┌─────────────────────────┐  ┌─────────────────────────┐                 │
│   │                         │  │                         │                 │
│   │     📈 HIGH COUNT       │  │     🎯 SITUATIONS       │                 │
│   │                         │  │                         │                 │
│   │  Practice at TC +3      │  │  Drill specific hands   │                 │
│   │  and above              │  │  or weak spots          │                 │
│   │                         │  │                         │                 │
│   └─────────────────────────┘  └─────────────────────────┘                 │
│                                                                            │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │     📊 VIEW STATISTICS                                          │      │
│   │     See your progress, accuracy breakdown, and weak spots       │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                            │
│                                                                            │
│   Using: 6-Deck, H17, DAS, Surrender • Hi-Lo • 18 Deviations              │
│   [Edit Configuration in Simulator]                                        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Mobile Version:**

```
┌────────────────────────────────┐
│  ← Simulator   TRAINING    ⚙️  │
├────────────────────────────────┤
│                                │
│  ┌────────────────────────┐    │
│  │ ▶ RESUME SESSION       │    │
│  │   47 hands • 89%       │    │
│  └────────────────────────┘    │
│                                │
│  ───── OR START NEW ─────      │
│                                │
│  ┌──────────┐ ┌──────────┐     │
│  │ 🎰       │ │ 🔢       │     │
│  │ Free     │ │ Counting │     │
│  │ Play     │ │ Drill    │     │
│  └──────────┘ └──────────┘     │
│                                │
│  ┌──────────┐ ┌──────────┐     │
│  │ 📈       │ │ 🎯       │     │
│  │ High     │ │ Specific │     │
│  │ Count    │ │ Hands    │     │
│  └──────────┘ └──────────┘     │
│                                │
│  ┌────────────────────────┐    │
│  │ 📊 View Statistics     │    │
│  └────────────────────────┘    │
│                                │
│  6D H17 DAS • Hi-Lo            │
│                                │
└────────────────────────────────┘
```

### 4.1 Overall Layout (Desktop)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Simulator          BLACKJACK TRAINING           Settings ⚙️     │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         MODE SELECTOR                                │   │
│  │  [Free Play] [Counting Drill] [High Count] [Scenarios] [Statistics] │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │                        GAME TABLE AREA                              │   │
│  │                                                                     │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │                      DEALER AREA                            │   │   │
│  │   │                                                             │   │   │
│  │   │               [🂠] [🃁]     Dealer: ?                        │   │   │
│  │   │                                                             │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │                     PLAYER AREA                             │   │   │
│  │   │                                                             │   │   │
│  │   │    Hand 1: [🃑] [🃕]  = 16        Hand 2: [🃒] [🃓]  = 5    │   │   │
│  │   │            Bet: $50                      Bet: $50           │   │   │
│  │   │                                                             │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │                    ACTION BUTTONS                           │   │   │
│  │   │                                                             │   │   │
│  │   │    [  HIT  ]  [ STAND ]  [ DOUBLE ]  [ SPLIT ]  [SURRENDER] │   │   │
│  │   │       H          S           D           P           R      │   │   │
│  │   │                                                             │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  ┌──────────────────────────────┐  ┌───────────────────────────────────┐   │
│  │        COUNT INFO            │  │         SESSION STATS             │   │
│  │                              │  │                                   │   │
│  │  Running: +7                 │  │  Hands: 47                        │   │
│  │  True Count: +3.2            │  │  Accuracy: 91.5%                  │   │
│  │  Decks Left: 2.2             │  │  Profit: +$235                    │   │
│  │  Suggested Bet: 4 units      │  │  Streak: 🔥 12 correct            │   │
│  │                              │  │                                   │   │
│  │  [Show/Hide]                 │  │  Weak: 16v10 (67%)                │   │
│  └──────────────────────────────┘  └───────────────────────────────────┘   │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         FEEDBACK AREA                               │   │
│  │                                                                     │   │
│  │   ✓ CORRECT! 16 vs 10: Surrender (lose half vs 77% loss expected)  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Card Design (Desktop)

```
┌─────────┐
│ A       │
│         │
│    ♠    │
│         │
│       A │
└─────────┘

Dimensions: 100px × 140px
Border-radius: 8px
Background: white
Border: 1px solid #333

Face-down card:
┌─────────┐
│░░░░░░░░░│
│░░░░░░░░░│
│░░░░░░░░░│
│░░░░░░░░░│
│░░░░░░░░░│
└─────────┘
Pattern: diagonal stripes or logo
```

### 4.3 Feedback States

**Correct Decision:**
```
┌──────────────────────────────────────────────────────────────────┐
│  ✓  CORRECT!                                                     │
│                                                                  │
│  Hard 16 vs 10: Surrender                                        │
│  Reason: Dealer makes 17+ 77% of the time. Surrendering saves    │
│          half your bet compared to expected 77% loss.            │
│                                                                  │
│  [Basic Strategy]                                                │
└──────────────────────────────────────────────────────────────────┘
Background: #27ae60 (green)
Animation: slide in from top, slight bounce
```

**Incorrect Decision:**
```
┌──────────────────────────────────────────────────────────────────┐
│  ✗  INCORRECT                                                    │
│                                                                  │
│  You chose: HIT                                                  │
│  Correct: SURRENDER                                              │
│                                                                  │
│  Hard 16 vs 10: Surrender                                        │
│  Reason: Hitting gives 62% bust chance. Even if you draw well,   │
│          dealer still has strong position. Surrender saves $.    │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                  │
│  │   Take It Back     │  │   Continue Anyway  │                  │
│  └────────────────────┘  └────────────────────┘                  │
│                                                                  │
│  [Basic Strategy]                                                │
└──────────────────────────────────────────────────────────────────┘
Background: #e74c3c (red)
Modal overlay when correction mode is ON
```

**Deviation Alert:**
```
┌──────────────────────────────────────────────────────────────────┐
│  ⚡ DEVIATION OPPORTUNITY                                        │
│                                                                  │
│  At TC +4, you should STAND on 16 vs 10 (not surrender)          │
│  Reason: High count means more 10s left, dealer more likely      │
│          to bust. Standing is profitable at this count.          │
│                                                                  │
│  [Illustrious 18 #3]                                             │
└──────────────────────────────────────────────────────────────────┘
Background: #9b59b6 (purple)
```

### 4.4 Settings Panel (Desktop)

```
┌─────────────────────────────────────────┐
│  TRAINING SETTINGS                   ✕  │
├─────────────────────────────────────────┤
│                                         │
│  GAMEPLAY                               │
│  ─────────────────────────────────────  │
│  Number of Hands                        │
│  ○ 1 Hand    ● 2 Hands                  │
│                                         │
│  Betting Mode                           │
│  ● Auto (suggested bet)                 │
│  ○ Manual (place your own)              │
│                                         │
│  Starting Bankroll                      │
│  [$] [1000]                             │
│                                         │
│  FEEDBACK & CORRECTION                  │
│  ─────────────────────────────────────  │
│  Correction Mode                        │
│  [Inline Warning ▼]                     │
│    • Inline Warning (show & continue)   │
│    • Full Stop (must acknowledge)       │
│                                         │
│  [ ] Enable Hint Button                 │
│      (Shows "?" to reveal correct play) │
│                                         │
│  COUNT DISPLAY                          │
│  ─────────────────────────────────────  │
│  Show Count                             │
│  ○ Always  ○ On Request  ● Hidden       │
│      (Hidden is realistic practice)     │
│                                         │
│  ANIMATION & SPEED                      │
│  ─────────────────────────────────────  │
│  Card Animation Speed                   │
│  [▬▬▬▬▬▬●▬▬▬] Normal                    │
│                                         │
│  Auto-Advance Delay                     │
│  [▬▬●▬▬▬▬▬▬▬] 2 seconds                 │
│                                         │
│  [ ] Sound Effects (off by default)     │
│                                         │
│  PRACTICE MODE                          │
│  ─────────────────────────────────────  │
│  ○ Basic Strategy Only                  │
│  ● Include Deviations                   │
│  ○ High Count Scenarios                 │
│      TC Range: [+2] to [+6]             │
│                                         │
│  INSURANCE                              │
│  ─────────────────────────────────────  │
│  ● Always prompt when dealer shows Ace  │
│  ○ Never offer (skip insurance)         │
│  ○ Auto-take at TC +3 (for counting)    │
│                                         │
├─────────────────────────────────────────┤
│  Current Rules: 6D, H17, DAS, LSR       │
│  Penetration: 75%                       │
│  Counting: Hi-Lo                        │
│  [Change in Simulator →]                │
│                                         │
│         [ Save Settings ]               │
└─────────────────────────────────────────┘
```

### 4.5 Default Settings

These are the default values based on "realistic practice" philosophy:

| Setting | Default | Reasoning |
|---------|---------|-----------|
| Number of Hands | 1 | Simpler start, user can increase |
| Betting Mode | Auto | Focus on decisions, not bet sizing initially |
| Starting Bankroll | $1000 | Enough for extended session |
| Correction Mode | Inline Warning | Less disruptive flow |
| Hint Button | Disabled | Hidden unless explicitly enabled |
| Show Count | Hidden | Realistic casino practice |
| Animation Speed | Normal | Balance of feel and pace |
| Auto-Advance Delay | 2 seconds | Time to see result, not too slow |
| Sound Effects | Off | Quiet by default, public-friendly |
| Practice Mode | Include Deviations | Full strategy practice |
| Insurance Prompt | Always | Every time dealer shows Ace |

---

## 5. UI/UX Design - Mobile

### 5.1 Mobile-First Principles

1. **Touch-friendly**: All buttons minimum 44×44px tap targets
2. **Thumb-reachable**: Action buttons at bottom of screen
3. **Vertical layout**: Stack elements vertically
4. **Swipe gestures**: Swipe up for stats, swipe left/right for modes
5. **Collapsible sections**: Minimize visual clutter
6. **Portrait-optimized**: Assume phone held vertically

### 5.2 Mobile Layout (Portrait)

```
┌────────────────────────────┐
│  ← Back      TRAINING   ⚙️ │  44px header
├────────────────────────────┤
│                            │
│  [Free] [Count] [High] [+] │  Mode tabs (scrollable)
│                            │
├────────────────────────────┤
│                            │
│      ┌─────┐ ┌─────┐       │
│      │ 🂠  │ │ 🃁  │       │  Dealer cards
│      └─────┘ └─────┘       │
│         Dealer: ?          │
│                            │
├────────────────────────────┤
│                            │
│   ┌─────┐ ┌─────┐          │
│   │ 🃑  │ │ 🃕  │          │  Player cards
│   └─────┘ └─────┘          │
│      16 Hard               │
│      Bet: $50              │
│                            │
│   (Hand 2 if playing 2)    │
│                            │
├────────────────────────────┤
│                            │
│  RC: +7  TC: +3.2  2.2D    │  Count bar (toggleable)
│                            │
├────────────────────────────┤
│                            │
│  ┌────────────────────────┐│
│  │ ✓ Correct! Surrender   ││  Feedback (compact)
│  └────────────────────────┘│
│                            │
├────────────────────────────┤
│                            │
│  ┌─────┐┌─────┐┌─────┐     │
│  │ HIT ││STAND││DBLE │     │  Action buttons
│  │  H  ││  S  ││  D  │     │  (large, thumb-reach)
│  └─────┘└─────┘└─────┘     │
│                            │
│  ┌─────┐┌─────┐            │
│  │SPLIT││SURR │            │
│  │  P  ││  R  │            │
│  └─────┘└─────┘            │
│                            │
└────────────────────────────┘
```

### 5.3 Mobile Card Design

```
Mobile cards: 60px × 84px (smaller for screen fit)

┌───────┐
│ A     │
│   ♠   │
│     A │
└───────┘

Two hands on mobile:
┌────────────────────────────┐
│  Hand 1        Hand 2      │
│  ┌──┐┌──┐     ┌──┐┌──┐    │
│  │A♠││5♥│     │K♦││3♣│    │
│  └──┘└──┘     └──┘└──┘    │
│  16 Hard      13 Hard      │
│  ─────●─      ────────     │  (● = active hand)
└────────────────────────────┘
```

### 5.4 Mobile Action Buttons

```
Primary actions (always visible):
┌────────────────────────────────────────┐
│                                        │
│  ┌──────────┐  ┌──────────┐            │
│  │          │  │          │            │
│  │   HIT    │  │  STAND   │            │
│  │    H     │  │    S     │            │
│  │          │  │          │            │
│  └──────────┘  └──────────┘            │
│                                        │
│  ┌──────┐  ┌──────┐  ┌──────┐          │
│  │DOUBLE│  │SPLIT │  │ SURR │          │
│  │  D   │  │  P   │  │  R   │          │
│  └──────┘  └──────┘  └──────┘          │
│                                        │
└────────────────────────────────────────┘

Button sizes:
- Primary (Hit/Stand): 120px × 60px
- Secondary (Double/Split/Surr): 80px × 50px
- Minimum touch target: 44px × 44px

Disabled state:
- Grayed out (opacity 0.4)
- No tap response
- Show reason on long-press
```

### 5.5 Mobile Gestures

| Gesture | Action |
|---------|--------|
| Tap action button | Execute action |
| Swipe up from bottom | Show full statistics panel |
| Swipe down from stats | Hide statistics |
| Swipe left/right on mode tabs | Switch practice mode |
| Long-press on card | Show card value info |
| Double-tap count bar | Toggle count visibility |
| Shake device | Start new shoe (optional fun feature) |

### 5.6 Mobile Settings (Bottom Sheet)

```
┌────────────────────────────────────────┐
│  ────────────────────────────────────  │  Drag handle
│                                        │
│  SETTINGS                              │
│                                        │
│  Hands: [1] [2]                        │
│                                        │
│  Show Count:  [Always ▼]               │
│                                        │
│  Correction Mode:  [ON]                │
│                                        │
│  Speed:  Slow ○───●───○ Fast           │
│                                        │
│  Sound:  [ON]                          │
│                                        │
│  ────────────────────────────────────  │
│                                        │
│  Current: 6D H17 DAS Hi-Lo             │
│  [Edit in Simulator]                   │
│                                        │
└────────────────────────────────────────┘

Opens as bottom sheet (slides up from bottom)
Swipe down to dismiss
Max height: 60% of screen
```

### 5.7 Mobile Correction Modal

```
┌────────────────────────────────────────┐
│                                        │
│           ✗ INCORRECT                  │
│                                        │
│      You chose: HIT                    │
│      Correct: SURRENDER                │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ 16 vs 10: Surrender saves half   │  │
│  │ your bet. Dealer makes 17+ 77%   │  │
│  │ of the time.                     │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌────────────────────────────────┐    │
│  │         TAKE IT BACK           │    │
│  └────────────────────────────────┘    │
│                                        │
│  ┌────────────────────────────────┐    │
│  │       CONTINUE ANYWAY          │    │
│  └────────────────────────────────┘    │
│                                        │
└────────────────────────────────────────┘

Full-screen modal on mobile
Large touch targets
Clear visual hierarchy
```

### 5.8 Responsive Breakpoints

```css
/* Mobile-first approach */

/* Base: Mobile (< 640px) */
.training-container {
  padding: 8px;
  flex-direction: column;
}

.card {
  width: 60px;
  height: 84px;
}

.action-btn {
  min-height: 50px;
  font-size: 16px;
}

/* Tablet (640px - 1024px) */
@media (min-width: 640px) {
  .training-container {
    padding: 16px;
  }

  .card {
    width: 80px;
    height: 112px;
  }

  .action-btn {
    min-height: 56px;
    font-size: 18px;
  }
}

/* Desktop (> 1024px) */
@media (min-width: 1024px) {
  .training-container {
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .card {
    width: 100px;
    height: 140px;
  }

  .action-btn {
    min-height: 60px;
    font-size: 20px;
  }
}
```

---

## 6. Component Breakdown

### 6.1 Component Tree

```
TrainingModePage
├── TrainingHeader
│   ├── BackButton
│   ├── Title
│   └── SettingsButton
│
├── ModeSelector
│   ├── ModeTab (Free Play)
│   ├── ModeTab (Counting Drill)
│   ├── ModeTab (High Count)
│   ├── ModeTab (Scenarios)
│   └── ModeTab (Statistics)
│
├── GameTable
│   ├── DealerArea
│   │   ├── DealerCards
│   │   │   └── AnimatedCard[]
│   │   └── DealerTotal
│   │
│   ├── PlayerArea
│   │   ├── PlayerHand (×1 or ×2)
│   │   │   ├── HandCards
│   │   │   │   └── AnimatedCard[]
│   │   │   ├── HandTotal
│   │   │   ├── BetDisplay
│   │   │   └── ActiveIndicator
│   │   └── BankrollDisplay
│   │
│   └── ShoeIndicator
│       ├── CardsRemaining
│       └── PenetrationBar
│
├── CountDisplay (toggleable)
│   ├── RunningCount
│   ├── TrueCount
│   ├── DecksRemaining
│   └── SuggestedBet
│
├── ActionButtons
│   ├── HitButton
│   ├── StandButton
│   ├── DoubleButton
│   ├── SplitButton
│   └── SurrenderButton
│
├── FeedbackPanel
│   ├── ResultIcon (✓ or ✗)
│   ├── ResultText
│   ├── Explanation
│   └── DeviationBadge
│
├── CorrectionModal (conditional)
│   ├── IncorrectMessage
│   ├── CorrectAction
│   ├── Explanation
│   ├── TakeItBackButton
│   └── ContinueButton
│
├── SessionStats
│   ├── HandsPlayed
│   ├── Accuracy
│   ├── Profit
│   └── WeakSpots
│
└── SettingsSheet (modal/bottom-sheet)
    ├── NumHandsSelector
    ├── ShowCountSelector
    ├── CorrectionModeToggle
    ├── SpeedSlider
    ├── SoundToggle
    └── RulesDisplay
```

### 6.2 Component Specifications

**AnimatedCard Component:**

```tsx
interface AnimatedCardProps {
  card: Card;
  faceDown?: boolean;
  position: { x: number; y: number };
  animationDelay?: number;
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
}

// Renders a playing card with:
// - Deal animation (slide from deck position)
// - Flip animation (when revealing hole card)
// - Hover effects (desktop only)
// - Touch feedback (mobile)
```

**ActionButton Component:**

```tsx
interface ActionButtonProps {
  action: 'H' | 'S' | 'D' | 'P' | 'R';
  label: string;
  shortcut: string;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

// Features:
// - Keyboard shortcut display
// - Disabled state with tooltip
// - Touch ripple effect
// - Loading state during action processing
```

**FeedbackPanel Component:**

```tsx
interface FeedbackPanelProps {
  result: 'correct' | 'incorrect' | null;
  userAction: string;
  correctAction: string;
  explanation: string;
  isDeviation: boolean;
  deviationName?: string;
  onDismiss?: () => void;
  autoHideDelay?: number;
}

// Features:
// - Slide-in animation
// - Color-coded background
// - Auto-hide after delay (configurable)
// - Expandable explanation
```

---

## 7. State Management

### 7.1 Training Context

```tsx
// TrainingContext.tsx

interface TrainingConfig {
  // Inherited from main app
  rules: Rules;
  countingSystem: CountingSystem;
  deviations: Deviation[];
  betRamp: BetRamp;
  unitSize: number;
}

interface TrainingSettings {
  numHands: 1 | 2;
  showCount: 'always' | 'on-request' | 'never';
  correctionMode: boolean;
  animationSpeed: 'slow' | 'normal' | 'fast' | 'instant';
  soundEnabled: boolean;
  practiceMode: 'basic' | 'deviations' | 'high-count' | 'scenarios';
  startingBankroll: number;
}

interface TrainingContextValue {
  config: TrainingConfig;
  settings: TrainingSettings;
  updateSettings: (updates: Partial<TrainingSettings>) => void;
}

const TrainingContext = createContext<TrainingContextValue | null>(null);

export function TrainingProvider({
  children,
  config
}: {
  children: ReactNode;
  config: TrainingConfig;
}) {
  const [settings, setSettings] = useState<TrainingSettings>(() => {
    // Load from localStorage or use defaults
    const saved = localStorage.getItem('training-settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const updateSettings = useCallback((updates: Partial<TrainingSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem('training-settings', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <TrainingContext.Provider value={{ config, settings, updateSettings }}>
      {children}
    </TrainingContext.Provider>
  );
}
```

### 7.2 Game Flow & Auto-Advance

The hand flow follows this sequence with auto-advance between phases:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HAND FLOW TIMELINE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  BETTING (if manual)                                                │
│       │                                                             │
│       ▼  [auto: use suggested bet]                                  │
│  DEALING ─────────────────────────────────────────────────────────  │
│       │  Cards dealt with animation (0.3s per card)                 │
│       │  Dealer shows one up, one down                              │
│       │                                                             │
│       ▼  [auto: 0.5s pause after deal]                              │
│  PLAYER-ACTION ──────────────────────────────────────────────────── │
│       │  Player chooses H/S/D/P/R                                   │
│       │  ┌─ Correct? → Show inline feedback (green flash)           │
│       │  └─ Incorrect? → Show feedback or correction modal          │
│       │                                                             │
│       │  [repeat for each action until stand/bust/blackjack]        │
│       │                                                             │
│       ▼  [auto: immediate after player done]                        │
│  DEALER-ACTION ──────────────────────────────────────────────────── │
│       │  Hole card revealed (flip animation, 0.5s)                  │
│       │  Dealer hits until 17+ (0.3s per card)                      │
│       │                                                             │
│       ▼  [auto: 0.3s pause after last dealer card]                  │
│  PAYOUT ────────────────────────────────────────────────────────    │
│       │  Show win/lose/push result                                  │
│       │  Update bankroll with animation                             │
│       │                                                             │
│       ▼  [auto: configurable delay (default 2s)]                    │
│  NEXT HAND ─────────────────────────────────────────────────────    │
│       │  Clear table                                                │
│       │  Check if shoe needs shuffle (penetration reached)          │
│       │  Deal new hand                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Auto-Advance Timing (Configurable):**

| Transition | Default Delay | Configurable Range |
|------------|---------------|-------------------|
| After deal complete | 0.5s | 0.2s - 1.0s |
| After correct decision | 0.8s | 0.3s - 2.0s |
| After incorrect (inline mode) | 1.5s | 1.0s - 3.0s |
| After dealer reveals | 0.5s | 0.3s - 1.0s |
| After payout shown | 2.0s | 1.0s - 5.0s |
| Shuffle animation | 1.5s | Fixed |

**User can tap to skip** any auto-advance delay and proceed immediately.

### 7.3 Game State (useReducer)

```tsx
// useGameState.ts

type GamePhase =
  | 'idle'           // Waiting to start
  | 'betting'        // Placing bets
  | 'dealing'        // Cards being dealt
  | 'player-action'  // Player making decision
  | 'dealer-action'  // Dealer playing out
  | 'payout'         // Showing results
  | 'feedback'       // Showing feedback (if correction mode off)
  | 'correction'     // Waiting for user correction choice

interface GameState {
  phase: GamePhase;

  // Shoe state
  shoe: Card[];
  pointer: number;
  cutCard: number;
  runningCount: number;
  shoeNumber: number;

  // Current round
  dealerHand: Hand;
  playerHands: Hand[];
  activeHandIndex: number;

  // Bankroll
  bankroll: number;
  currentBets: number[];

  // Feedback
  lastDecision: Decision | null;

  // Session stats
  stats: SessionStats;
}

type GameAction =
  | { type: 'START_ROUND' }
  | { type: 'PLACE_BET'; payload: { handIndex: number; amount: number } }
  | { type: 'DEAL_CARDS' }
  | { type: 'PLAYER_ACTION'; payload: { action: string } }
  | { type: 'CORRECTION_CHOICE'; payload: { takeBack: boolean } }
  | { type: 'NEXT_HAND' }
  | { type: 'DEALER_PLAY' }
  | { type: 'RESOLVE_PAYOUT' }
  | { type: 'NEW_SHOE' }
  | { type: 'RESET_SESSION' }

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_ROUND':
      return {
        ...state,
        phase: 'betting',
        playerHands: [],
        dealerHand: createEmptyHand(),
        currentBets: [],
        lastDecision: null,
      };

    case 'PLACE_BET':
      // ... handle bet placement

    case 'DEAL_CARDS':
      // ... deal initial cards

    case 'PLAYER_ACTION':
      // ... validate and execute action

    // ... other cases
  }
}
```

### 7.3 Statistics State

```tsx
// useSessionStats.ts

interface SessionStats {
  // Basic counts
  handsPlayed: number;
  roundsPlayed: number;

  // Decision accuracy
  decisionsTotal: number;
  decisionsCorrect: number;

  // By category
  byHandType: {
    hardTotals: { correct: number; total: number };
    softTotals: { correct: number; total: number };
    pairs: { correct: number; total: number };
  };

  byAction: {
    hit: { correct: number; total: number };
    stand: { correct: number; total: number };
    double: { correct: number; total: number };
    split: { correct: number; total: number };
    surrender: { correct: number; total: number };
  };

  // Deviations
  deviationsTotal: number;
  deviationsCorrect: number;

  // Counting (if periodic checks enabled)
  countChecks: Array<{
    actual: number;
    userAnswer: number;
    timestamp: number;
  }>;

  // Financial
  totalWagered: number;
  totalProfit: number;

  // Streaks
  currentStreak: number;
  longestStreak: number;

  // Weak spots (hands with < 80% accuracy, min 5 occurrences)
  weakSpots: Array<{
    handKey: string;
    description: string;
    accuracy: number;
    occurrences: number;
  }>;

  // Session timing
  startTime: number;
  lastActionTime: number;
}
```

---

## 8. Game Engine

### 8.1 Core Engine Class

```tsx
// TrainingGameEngine.ts

export class TrainingGameEngine {
  private config: TrainingConfig;
  private rng: () => number;

  constructor(config: TrainingConfig, seed?: number) {
    this.config = config;
    this.rng = seed ? seededRandom(seed) : Math.random;
  }

  // ============ SHOE MANAGEMENT ============

  buildShoe(): Card[] {
    const { decks } = this.config.rules;
    const cards: Card[] = [];

    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

    for (let d = 0; d < decks; d++) {
      for (const suit of suits) {
        for (const rank of ranks) {
          cards.push({
            id: `${d}-${rank}${suit}`,
            rank,
            suit,
          });
        }
      }
    }

    return this.shuffle(cards);
  }

  shuffle(cards: Card[]): Card[] {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // ============ COUNT CALCULATIONS ============

  getRunningCount(shoe: Card[], pointer: number): number {
    let count = 0;
    for (let i = 0; i < pointer; i++) {
      count += this.config.countingSystem.tags[shoe[i].rank] || 0;
    }
    return count;
  }

  getTrueCount(runningCount: number, cardsRemaining: number): number {
    const decksRemaining = Math.max(cardsRemaining / 52, 0.25);
    return runningCount / decksRemaining;
  }

  // ============ HAND VALUE ============

  handValue(cards: Card[]): { total: number; soft: boolean } {
    let total = 0;
    let aces = 0;

    for (const card of cards) {
      if (card.rank === 'A') {
        total += 11;
        aces++;
      } else if (['T', 'J', 'Q', 'K'].includes(card.rank)) {
        total += 10;
      } else {
        total += parseInt(card.rank);
      }
    }

    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }

    return {
      total,
      soft: aces > 0 && total <= 21,
    };
  }

  isBlackjack(cards: Card[]): boolean {
    if (cards.length !== 2) return false;
    const { total } = this.handValue(cards);
    return total === 21;
  }

  // ============ ACTION VALIDATION ============

  getCorrectAction(
    playerCards: Card[],
    dealerUpcard: Card,
    trueCount: number,
    hand: Hand
  ): { action: string; explanation: string; isDeviation: boolean; deviationName?: string } {

    // First check for deviation
    const handKey = this.getHandKey(playerCards, dealerUpcard.rank);
    const deviation = this.findApplicableDeviation(handKey, trueCount);

    if (deviation && this.config.practiceMode !== 'basic') {
      return {
        action: deviation.action,
        explanation: this.getDeviationExplanation(deviation, handKey, trueCount),
        isDeviation: true,
        deviationName: deviation.hand_key,
      };
    }

    // Fall back to basic strategy
    const action = this.getBasicStrategyAction(playerCards, dealerUpcard, hand);
    return {
      action,
      explanation: this.getBasicStrategyExplanation(playerCards, dealerUpcard, action),
      isDeviation: false,
    };
  }

  private getHandKey(playerCards: Card[], dealerUpRank: string): string {
    const { total, soft } = this.handValue(playerCards);
    const dealerKey = dealerUpRank === '10' ? 'T' : dealerUpRank;

    // Check for pair
    if (playerCards.length === 2 && playerCards[0].rank === playerCards[1].rank) {
      const pairRank = playerCards[0].rank === 'T' ? 'T' : playerCards[0].rank;
      return `${pairRank}${pairRank}v${dealerKey}`;
    }

    // Soft total
    if (soft) {
      return `A${total - 11}v${dealerKey}`;
    }

    // Hard total
    return `${total}v${dealerKey}`;
  }

  private findApplicableDeviation(handKey: string, trueCount: number): Deviation | null {
    const floorTC = Math.floor(trueCount);

    for (const dev of this.config.deviations) {
      if (dev.hand_key === handKey && floorTC >= dev.tc_floor) {
        return dev;
      }
    }

    return null;
  }

  // ============ BASIC STRATEGY ============

  private getBasicStrategyAction(
    playerCards: Card[],
    dealerUpcard: Card,
    hand: Hand
  ): string {
    const { total, soft } = this.handValue(playerCards);
    const dealerValue = this.cardValue(dealerUpcard);
    const { rules } = this.config;

    // Check for pair split
    if (playerCards.length === 2 &&
        playerCards[0].rank === playerCards[1].rank &&
        hand.canSplit) {
      const splitAction = this.getPairAction(playerCards[0].rank, dealerValue);
      if (splitAction === 'P') return 'P';
    }

    // Soft totals
    if (soft) {
      return this.getSoftAction(total, dealerValue, hand.canDouble, rules);
    }

    // Hard totals
    return this.getHardAction(total, dealerValue, hand.canDouble, rules.surrender, hand.canSurrender);
  }

  private getHardAction(
    total: number,
    dealerValue: number,
    canDouble: boolean,
    hasSurrender: boolean,
    canSurrender: boolean
  ): string {
    // Surrender
    if (hasSurrender && canSurrender) {
      if (total === 16 && [9, 10, 11].includes(dealerValue)) return 'R';
      if (total === 15 && dealerValue === 10) return 'R';
    }

    // Always stand on 17+
    if (total >= 17) return 'S';

    // 16
    if (total === 16) {
      if ([2, 3, 4, 5, 6].includes(dealerValue)) return 'S';
      return 'H';
    }

    // 15
    if (total === 15) {
      if ([2, 3, 4, 5, 6].includes(dealerValue)) return 'S';
      return 'H';
    }

    // 14
    if (total === 14) {
      if ([2, 3, 4, 5, 6].includes(dealerValue)) return 'S';
      return 'H';
    }

    // 13
    if (total === 13) {
      if ([2, 3, 4, 5, 6].includes(dealerValue)) return 'S';
      return 'H';
    }

    // 12
    if (total === 12) {
      if ([4, 5, 6].includes(dealerValue)) return 'S';
      return 'H';
    }

    // 11
    if (total === 11) {
      return canDouble ? 'D' : 'H';
    }

    // 10
    if (total === 10) {
      if ([2, 3, 4, 5, 6, 7, 8, 9].includes(dealerValue)) {
        return canDouble ? 'D' : 'H';
      }
      return 'H';
    }

    // 9
    if (total === 9) {
      if ([3, 4, 5, 6].includes(dealerValue)) {
        return canDouble ? 'D' : 'H';
      }
      return 'H';
    }

    // 8 or less - always hit
    return 'H';
  }

  // ... more strategy methods

  // ============ EXPLANATIONS ============

  private getBasicStrategyExplanation(
    playerCards: Card[],
    dealerUpcard: Card,
    action: string
  ): string {
    const { total, soft } = this.handValue(playerCards);
    const dealerRank = dealerUpcard.rank;

    const explanations: Record<string, Record<string, string>> = {
      'H': {
        'hard_16_vs_high': 'Hard 16 vs high card: Hit because standing loses more often than busting.',
        'hard_12_vs_2': 'Hard 12 vs 2: Hit because the dealer has a good chance of making a hand.',
        'default': `With ${total}, hitting is the best play against dealer ${dealerRank}.`,
      },
      'S': {
        'hard_17_plus': 'Always stand on 17 or higher - risk of busting outweighs potential gain.',
        'hard_12_16_vs_low': 'Stand on stiff hands vs dealer bust cards (2-6). Let the dealer bust.',
        'default': `Standing on ${total} is optimal against dealer ${dealerRank}.`,
      },
      'D': {
        'hard_11': 'Double on 11: Best doubling hand. You have the best chance of making 21.',
        'hard_10_vs_low': 'Double on 10 vs low cards: High probability of outscoring dealer.',
        'soft_double': 'Double on soft hands vs weak dealer to maximize value.',
        'default': `Doubling maximizes expected value with ${total} vs ${dealerRank}.`,
      },
      'P': {
        'aces': 'Always split Aces: Two chances at 21 vs one hard 12.',
        'eights': 'Always split 8s: 16 is the worst hand. Two 8s have better EV.',
        'default': `Splitting is optimal here to maximize expected value.`,
      },
      'R': {
        '16_vs_9_10_A': '16 vs 9/10/A: Surrender saves half your bet. Dealer wins 77%+ of the time.',
        '15_vs_10': '15 vs 10: Surrender is the least costly option here.',
        'default': `Surrendering saves half your bet in this unfavorable situation.`,
      },
    };

    // Select most relevant explanation
    // ... logic to pick best explanation based on hand

    return explanations[action]?.default || `${action} is the correct basic strategy play.`;
  }

  private getDeviationExplanation(
    deviation: Deviation,
    handKey: string,
    trueCount: number
  ): string {
    const deviationExplanations: Record<string, string> = {
      '16vT': `At TC +${deviation.tc_floor}+, stand on 16 vs 10. The extra 10s in the deck mean the dealer is more likely to bust.`,
      '15vT': `At TC +${deviation.tc_floor}+, stand on 15 vs 10. High count favors standing.`,
      '12v2': `At TC +${deviation.tc_floor}+, stand on 12 vs 2. Dealer bust rate increases with high count.`,
      '12v3': `At TC +${deviation.tc_floor}+, stand on 12 vs 3. High count makes dealer bust more likely.`,
      'TTv5': `At TC +${deviation.tc_floor}+, split 10s vs 5. The dealer is very likely to bust.`,
      'TTv6': `At TC +${deviation.tc_floor}+, split 10s vs 6. Maximize value against bust card.`,
      'insurance': `At TC +${deviation.tc_floor}+, take insurance. There are enough 10s to make it profitable.`,
    };

    return deviationExplanations[deviation.hand_key] ||
      `Deviation: ${deviation.action} on ${deviation.hand_key} at TC >= ${deviation.tc_floor}`;
  }

  // ============ BET CALCULATION ============

  getSuggestedBet(trueCount: number): number {
    const { steps } = this.config.betRamp;
    const floorTC = Math.floor(trueCount);

    let units = steps[0]?.units || 1;

    for (const step of steps) {
      if (floorTC >= step.tc_floor) {
        units = step.units;
      }
    }

    return units * this.config.unitSize;
  }

  // ============ UTILITY ============

  private cardValue(card: Card): number {
    if (card.rank === 'A') return 11;
    if (['T', 'J', 'Q', 'K'].includes(card.rank)) return 10;
    return parseInt(card.rank);
  }
}
```

---

## 9. Counting Practice Module

### 9.1 Counting Drill Modes

**Mode 1: Card Flash (Checkpoint Mode)**
- Cards appear one at a time at configured speed
- User tracks count mentally (no display)
- Periodic checkpoints (every ~10-15 cards) ask "What's the running count?"
- Shows accuracy after each checkpoint
- Good for beginners to catch errors early

**Mode 2: Countdown (Final Answer Mode)**
- Cards flash through entire deck without stopping
- User tracks count mentally throughout
- At end: "What's the final running count?"
- Single answer determines accuracy
- More realistic - this is how casino play works

**Mode 3: Speed Drill**
- Starts at learning speed (2s per card)
- Progressively increases speed as user succeeds
- Speed levels:
  - Learning: 2.0s
  - Slow: 1.5s
  - Medium: 1.0s
  - Fast: 0.5s
  - Casino: 0.3s
  - Expert: 0.2s
  - **Insane: 0.1s** (for mastery/bragging rights)
- Tracks personal best speed at 90%+ accuracy

**Mode 4: True Count Conversion Quiz**
- Shows: "Running Count: +8, Cards Remaining: 104"
- User calculates and enters true count
- Immediate feedback: "Correct! +8 ÷ 2 decks = +4"
- Practices the mental division that happens in real play

**Mode 5: Integrated Counting (During Gameplay)**
- Count is **hidden by default** (realistic practice)
- User must track count mentally while playing hands
- **NO INTERRUPTIONS**: No quizzes during play - focus on decisions
- After session: stats show if decisions matched count-appropriate plays
- Optional: enable count display to verify mental tracking

**Why No Interruptions?**
The user explicitly decided against interrupting gameplay to quiz the count. In a real casino, you never stop to verify your count mid-hand. Training should simulate this:

```
                    DURING HAND
                    ───────────
   ┌──────────────────────────────────────┐
   │   Dealer: 10                         │
   │   You: 16                            │
   │                                      │
   │   What's your action?                │
   │   [HIT] [STAND] [SURRENDER]          │  ← Focus here
   │                                      │
   │   (Count: hidden - track mentally!)  │
   └──────────────────────────────────────┘

                    AFTER SESSION
                    ─────────────
   ┌──────────────────────────────────────┐
   │   SESSION COMPLETE                   │
   │                                      │
   │   Decision Accuracy: 91%             │
   │   Count-Dependent Plays: 14          │
   │   Count-Correct Decisions: 12 (86%)  │  ← Did you track correctly?
   │                                      │
   │   You missed 2 deviations at TC+3    │
   │   → Possibly lost track of count     │
   └──────────────────────────────────────┘
```

If user wants to verify their count, they can:
1. Enable "Show Count" setting (less realistic)
2. Use the dedicated Counting Drill modes separately

### 9.2 Counting Practice UI

```
COUNTING DRILL

Mode: [Card Flash ▼]   Speed: [●○○○○] Learning   Deck: [1 ▼]

┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                         ┌─────────┐                            │
│                         │         │                            │
│                         │    7    │                            │
│                         │    ♥    │                            │
│                         │         │                            │
│                         └─────────┘                            │
│                                                                │
│                     Card 23 of 52                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  CHECKPOINT!  What is the running count?                       │
│                                                                │
│  [ -10 ] [ -5 ] [ 0 ] [ +5 ] [ +10 ] [Custom...]              │
│                                                                │
└────────────────────────────────────────────────────────────────┘

Previous Answers:
  Checkpoint 1: You: +3, Actual: +4 (off by 1)
  Checkpoint 2: You: +7, Actual: +7 ✓
```

### 9.3 Counting Practice State

```tsx
interface CountingDrillState {
  mode: 'card-flash' | 'speed-drill' | 'tc-conversion' | 'integrated';

  // Deck state
  deck: Card[];
  position: number;
  actualRunningCount: number;

  // Speed settings
  cardDelay: number;  // ms per card
  speedLevel: 'learning' | 'slow' | 'medium' | 'fast' | 'casino' | 'expert';

  // Checkpoints
  checkpoints: Checkpoint[];
  currentCheckpoint: number | null;
  userAnswers: CountAnswer[];

  // Progress
  isPaused: boolean;
  isComplete: boolean;

  // Stats
  accuracy: number;
  averageError: number;
  bestStreak: number;
}

interface CountAnswer {
  checkpointIndex: number;
  userAnswer: number;
  actualCount: number;
  error: number;
  responseTime: number;  // ms
}
```

---

## 10. Scenario Generation

### 10.1 Configurable TC Range for Scenarios

The High Count practice mode allows users to configure the true count range they want to practice:

```
Settings → Practice Mode → High Count Scenarios
TC Range: [+2] to [+6]
```

**Configuration Options:**
- **Min TC**: Minimum true count for scenarios (default: +2)
- **Max TC**: Maximum true count for scenarios (default: +6)
- **Focus on deviation TCs**: Auto-suggest TCs where deviations kick in
- **Extreme counts**: Optional toggle for TC +7 and above (rare but valuable)

**Use Cases:**
- Beginner: TC +2 to +4 (common counts, basic deviations)
- Intermediate: TC +2 to +6 (full range of deviations)
- Advanced: TC +3 to +8 (focus on high-value situations)
- Extreme practice: TC +5 to +10 (rare high counts, max bet situations)

### 10.2 Scenario Generation Engine

```tsx
// ScenarioGenerator.ts

export class ScenarioGenerator {
  private engine: TrainingGameEngine;
  private tcRange: { min: number; max: number };

  constructor(config: TrainingConfig, tcRange = { min: 2, max: 6 }) {
    this.engine = new TrainingGameEngine(config);
    this.tcRange = tcRange;
  }

  /**
   * Generate a shoe biased toward high counts
   * by removing low cards from the initial shuffle
   */
  generateHighCountShoe(targetTC?: number): {
    shoe: Card[];
    startPosition: number;
    runningCount: number;
  } {
    const { decks } = this.engine.config.rules;

    // Build normal shoe
    let shoe = this.engine.buildShoe();

    // Calculate how many low cards to remove
    const totalCards = decks * 52;
    const targetRC = targetTC * decks;  // Approximate

    // Remove low cards (2-6) to increase count
    const lowCardRanks = ['2', '3', '4', '5', '6'];
    let removedCount = 0;

    shoe = shoe.filter(card => {
      if (lowCardRanks.includes(card.rank) && removedCount < targetRC) {
        removedCount++;
        return false;  // Remove card
      }
      return true;
    });

    // Shuffle remaining cards
    shoe = this.engine.shuffle(shoe);

    // Calculate actual count at various points
    // Find a point where TC is close to target
    const cardsRemaining = shoe.length;
    const runningCount = removedCount;  // Each removed low card = +1

    return {
      shoe,
      startPosition: 0,
      runningCount,
    };
  }

  /**
   * Generate specific scenario (e.g., 16 vs 10)
   */
  generateSpecificScenario(
    playerTotal: number,
    dealerUpcard: string,
    options?: {
      soft?: boolean;
      pair?: boolean;
      trueCountRange?: [number, number];
    }
  ): Scenario {
    // Build shoe to create desired situation
    // ... implementation
  }

  /**
   * Generate scenarios for a specific deviation
   */
  generateDeviationScenario(deviation: Deviation): Scenario {
    // Create situation where deviation applies
    // ... implementation
  }
}

interface Scenario {
  shoe: Card[];
  startPosition: number;
  runningCount: number;
  trueCount: number;
  playerCards: Card[];
  dealerUpcard: Card;
  dealerHoleCard: Card;
  correctAction: string;
  explanation: string;
  isDeviation: boolean;
}
```

### 10.3 Situation Drill Mode

The Situation Drill mode supports **both manual selection and automatic weak-spot targeting**:

#### Manual Selection
User picks specific hands to practice:

```
SITUATION DRILL - MANUAL MODE

Select situation to practice:

HARD TOTALS          SOFT TOTALS          PAIRS
[  ] 16 vs 9         [  ] A7 vs 9         [  ] 99 vs 7
[  ] 16 vs 10        [  ] A7 vs 10        [  ] 99 vs 9
[  ] 15 vs 10        [  ] A6 vs 2         [  ] 88 vs 10
[  ] 12 vs 2         [  ] A8 vs 6         [  ] TT vs 5
[  ] 12 vs 3         [  ] A2 vs 5         [  ] TT vs 6
[  ] 11 vs A         [  ] A4 vs 4         [  ] 66 vs 2

DEVIATIONS (at specific TC)
[  ] 16v10 @ TC+0 (Stand)
[  ] 15vT @ TC+4 (Stand)
[  ] Insurance @ TC+3

[Select All Hard] [Select All Soft] [Select All Pairs] [Select All Deviations]

[Start Drill: 12 situations selected]
```

#### Auto Weak-Spot Mode
System analyzes your history and automatically drills your weakest areas:

```
SITUATION DRILL - AUTO WEAK-SPOT MODE

Based on your last 500 decisions, here are your weakest areas:

   HAND          ACCURACY    OCCURRENCES    CORRECT PLAY
1. 16 vs 9       62.5%       16             Hit (no surrender)
2. Soft 18 vs 9  66.7%       12             Hit
3. 99 vs 7       50.0%       8              Stand
4. 12 vs 2       70.0%       20             Hit
5. A7 vs 10      71.4%       14             Hit

[Start Auto-Drill]  (focuses on these 5 situations)

───────────────────────────────────────────────────────
Analysis: You tend to stand too often on 16 vs 9.
Remember: Without surrender, 16 vs 9 is a HIT.
```

**Auto Weak-Spot Algorithm:**
```tsx
function identifyWeakSpots(history: DecisionHistory[]): WeakSpot[] {
  // Group by hand key
  const byHand = groupBy(history, h => h.handKey);

  // Filter to hands with at least 5 occurrences
  const filtered = Object.entries(byHand)
    .filter(([key, decisions]) => decisions.length >= 5);

  // Calculate accuracy and sort by worst
  return filtered
    .map(([key, decisions]) => ({
      handKey: key,
      accuracy: decisions.filter(d => d.correct).length / decisions.length,
      occurrences: decisions.length,
      mostCommonMistake: findMostCommonMistake(decisions),
    }))
    .filter(w => w.accuracy < 0.85)  // Only show <85% accuracy
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10);  // Top 10 weak spots
}
```

### 10.4 Scenario Library

Pre-generated scenarios for common situations:

```tsx
const SCENARIO_LIBRARY = {
  // Basic strategy edge cases
  basicStrategy: {
    '16v10': [], // Hard 16 vs 10 scenarios
    '12v2': [],  // Hard 12 vs 2 scenarios
    '12v3': [],  // Hard 12 vs 3 scenarios
    'A7v9': [],  // Soft 18 vs 9 scenarios
    '99v7': [],  // Pair of 9s vs 7 scenarios
  },

  // Deviation situations
  deviations: {
    'stand_16v10_TC+0': [],  // Stand on 16 vs 10 at TC >= 0
    'double_10vT_TC+4': [],  // Double 10 vs 10 at TC >= 4
    'split_TT_TC+5': [],     // Split 10s vs 5 at TC >= 5
    'insurance_TC+3': [],    // Take insurance at TC >= 3
  },

  // High count practice
  highCount: {
    'TC+3': [],
    'TC+4': [],
    'TC+5': [],
    'TC+6': [],
  },
};
```

---

## 11. Statistics & Progress

### 11.1 Statistics Dashboard

```
SESSION STATISTICS

Overall Accuracy: 89.2%  (134/150 decisions)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 89%

BY HAND TYPE:
  Hard Totals:    92.3%  (72/78)   ████████████░░
  Soft Totals:    85.7%  (30/35)   ██████████░░░░
  Pairs:          86.5%  (32/37)   ██████████░░░░

BY ACTION:
  Hit:            95.0%  (38/40)   █████████████░
  Stand:          90.5%  (38/42)   ████████████░░
  Double:         82.4%  (14/17)   ██████████░░░░
  Split:          85.7%  (12/14)   ██████████░░░░
  Surrender:      81.8%  (9/11)    █████████░░░░░

DEVIATIONS:
  Recognized:     75.0%  (12/16)   █████████░░░░░

WEAK SPOTS (need practice):
  • 16 vs 9:   66.7%  (4/6)   - You're hitting too often
  • Soft 18:   71.4%  (5/7)   - Remember to double vs 3-6
  • 99 vs 7:   50.0%  (2/4)   - This is a stand, not split

COUNTING ACCURACY:
  Average Error: 0.8 points
  Perfect Checks: 7/12 (58.3%)

FINANCIAL (simulated):
  Hands Played: 47
  Total Wagered: $2,350
  Net Profit: +$185
  Win Rate: 52.3%

SESSION TIME: 23 minutes
```

### 11.2 Progress Over Time

```tsx
interface ProgressHistory {
  sessions: SessionSummary[];
  allTimeStats: {
    totalHands: number;
    totalDecisions: number;
    overallAccuracy: number;
    improvementTrend: number;  // % change over last 5 sessions
  };
  weakSpotHistory: WeakSpot[];
  milestones: Milestone[];
}

interface SessionSummary {
  date: Date;
  duration: number;  // minutes
  handsPlayed: number;
  accuracy: number;
  deviationAccuracy: number;
  countingAccuracy: number;
  profit: number;
}

interface Milestone {
  name: string;
  achieved: boolean;
  achievedDate?: Date;
  description: string;
}

const MILESTONES = [
  { name: '100 Hands', description: 'Play 100 training hands' },
  { name: '90% Accuracy', description: 'Achieve 90% decision accuracy in a session' },
  { name: '50 Streak', description: 'Get 50 correct decisions in a row' },
  { name: 'Deviation Master', description: 'Get 90%+ on deviations' },
  { name: 'Casino Speed', description: 'Complete a counting drill at 0.3s pace' },
  { name: 'Perfect Session', description: '100% accuracy in a 50+ hand session' },
];
```

---

## 12. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Set up routing (React Router or tab-based)
- [ ] Create TrainingModeProvider context
- [ ] Create TrainingGameEngine class
- [ ] Basic state management with useReducer
- [ ] Basic card component (no animations yet)

### Phase 2: Basic Gameplay (Week 2)
- [ ] Implement dealing flow
- [ ] Add action buttons
- [ ] Implement all player actions (H/S/D/P/R)
- [ ] Add dealer play logic
- [ ] Implement payout resolution
- [ ] Basic feedback display

### Phase 3: Decision Validation (Week 3)
- [ ] Implement basic strategy lookup
- [ ] Implement deviation checking
- [ ] Add detailed explanations
- [ ] Implement correction mode
- [ ] Add keyboard shortcuts

### Phase 4: Mobile Optimization (Week 4)
- [ ] Responsive layout
- [ ] Touch-optimized buttons
- [ ] Bottom sheet settings
- [ ] Gesture support
- [ ] Test on various devices

### Phase 5: Counting Practice (Week 5)
- [ ] Card flash mode
- [ ] Speed drill mode
- [ ] True count quizzes
- [ ] Integrated counting during play
- [ ] Count checkpoints

### Phase 6: Statistics & Polish (Week 6)
- [ ] Session statistics tracking
- [ ] Progress history
- [ ] Weak spot analysis
- [ ] Card animations
- [ ] Sound effects
- [ ] Final polish

---

## 13. File Structure

```
frontend/src/
├── components/
│   ├── training/
│   │   ├── TrainingModePage.tsx       # Main page component
│   │   ├── TrainingHeader.tsx         # Header with back button, settings
│   │   ├── ModeSelector.tsx           # Tab/mode selection
│   │   │
│   │   ├── game/
│   │   │   ├── GameTable.tsx          # Main game area container
│   │   │   ├── DealerArea.tsx         # Dealer cards display
│   │   │   ├── PlayerArea.tsx         # Player hands display
│   │   │   ├── PlayerHand.tsx         # Single hand component
│   │   │   ├── ActionButtons.tsx      # Hit/Stand/Double/Split/Surrender
│   │   │   ├── BettingControls.tsx    # Bet placement UI
│   │   │   └── ShoeIndicator.tsx      # Cards remaining display
│   │   │
│   │   ├── feedback/
│   │   │   ├── FeedbackPanel.tsx      # Correct/incorrect feedback
│   │   │   ├── CorrectionModal.tsx    # Take it back modal
│   │   │   └── DeviationAlert.tsx     # Deviation notification
│   │   │
│   │   ├── counting/
│   │   │   ├── CountDisplay.tsx       # RC/TC display
│   │   │   ├── CountingDrill.tsx      # Standalone counting practice
│   │   │   ├── CardFlash.tsx          # Flash card component
│   │   │   ├── CountCheckpoint.tsx    # Count check modal
│   │   │   └── SpeedDrill.tsx         # Speed practice mode
│   │   │
│   │   ├── deck-estimation/
│   │   │   ├── DeckEstimationDrill.tsx    # Standalone drill mode
│   │   │   ├── DiscardTrayView.tsx        # Canvas renderer component
│   │   │   ├── DeckEstimatePrompt.tsx     # Question UI overlay
│   │   │   ├── DeckEstimateFeedback.tsx   # Result feedback
│   │   │   ├── DeckEstimationStats.tsx    # Stats dashboard
│   │   │   └── TrayTemplateSelector.tsx   # Template picker UI
│   │   │
│   │   ├── statistics/
│   │   │   ├── SessionStats.tsx       # Current session stats
│   │   │   ├── StatsDashboard.tsx     # Full statistics view
│   │   │   ├── WeakSpots.tsx          # Weak areas display
│   │   │   └── ProgressChart.tsx      # Progress over time
│   │   │
│   │   ├── cards/
│   │   │   ├── Card.tsx               # Single card component
│   │   │   ├── AnimatedCard.tsx       # Card with animations
│   │   │   └── CardBack.tsx           # Face-down card
│   │   │
│   │   └── settings/
│   │       ├── SettingsSheet.tsx      # Settings bottom sheet/modal
│   │       └── SettingsForm.tsx       # Settings form fields
│   │
│   └── ui/
│       ├── BottomSheet.tsx            # Reusable bottom sheet
│       ├── Modal.tsx                  # Reusable modal
│       └── Button.tsx                 # Styled button component
│
├── context/
│   └── TrainingContext.tsx            # Training mode context provider
│
├── hooks/
│   ├── useGameState.ts                # Game state reducer
│   ├── useSessionStats.ts             # Statistics tracking
│   ├── useCountingDrill.ts            # Counting practice state
│   └── useKeyboardShortcuts.ts        # Keyboard controls
│
├── engine/
│   ├── TrainingGameEngine.ts          # Core game logic
│   ├── BasicStrategy.ts               # Basic strategy lookup
│   ├── DeviationChecker.ts            # Deviation detection
│   ├── ScenarioGenerator.ts           # Scenario generation
│   ├── CountingEngine.ts              # Counting calculations
│   └── DeckEstimationEngine.ts        # Tray rendering + deck scoring
│
├── utils/
│   ├── cardUtils.ts                   # Card value, hand key, etc.
│   ├── explanations.ts                # Strategy explanations
│   └── storage.ts                     # LocalStorage helpers
│
└── styles/
    └── training/
        ├── training.css               # Main training styles
        ├── cards.css                  # Card styles & animations
        ├── game-table.css             # Table layout
        ├── feedback.css               # Feedback panel styles
        └── mobile.css                 # Mobile-specific overrides
```

---

## 14. API Contracts

### 14.1 No Backend Required

The training mode is **entirely client-side**. No API calls needed because:

1. All game logic runs in the browser
2. Statistics are stored in localStorage
3. Rules come from main app state
4. No server-side validation needed

### 14.2 localStorage Schema

```tsx
// Keys used in localStorage

// Settings
'training-settings': TrainingSettings

// Progress
'training-progress': {
  allTimeStats: AllTimeStats;
  sessions: SessionSummary[];
  milestones: Record<string, boolean>;
}

// Current session (for resume)
'training-current-session': {
  gameState: GameState;
  sessionStats: SessionStats;
  startTime: number;
}
```

### 14.3 Future API (Optional)

If cloud sync is desired later:

```
POST /api/training/sessions
  - Save session to server

GET /api/training/progress
  - Get user's progress history

POST /api/training/scenarios
  - Get pre-generated scenarios from server
```

---

## 15. CSS & Theming

### 15.1 CSS Variables

```css
/* training/training.css */

:root {
  /* Table colors */
  --table-felt: #1e5128;
  --table-felt-light: #2d6a4f;
  --table-border: #143d1e;

  /* Card colors */
  --card-bg: #ffffff;
  --card-border: #333333;
  --card-red: #d32f2f;
  --card-black: #000000;
  --card-back: #1a1a2e;

  /* Feedback colors */
  --feedback-correct: #27ae60;
  --feedback-incorrect: #e74c3c;
  --feedback-deviation: #9b59b6;
  --feedback-warning: #f39c12;

  /* Action button colors */
  --btn-hit: #4ecdc4;
  --btn-stand: #95a5a6;
  --btn-double: #f39c12;
  --btn-split: #9b59b6;
  --btn-surrender: #e74c3c;

  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Mobile breakpoints */
  --mobile-max: 639px;
  --tablet-min: 640px;
  --tablet-max: 1023px;
  --desktop-min: 1024px;

  /* Touch targets */
  --min-touch-target: 44px;
}
```

### 15.2 Animation Keyframes

```css
/* cards.css */

@keyframes deal {
  0% {
    transform: translate(200px, -200px) rotate(15deg) scale(0.5);
    opacity: 0;
  }
  70% {
    transform: translate(0, 0) rotate(0deg) scale(1.05);
    opacity: 1;
  }
  100% {
    transform: translate(0, 0) rotate(0deg) scale(1);
    opacity: 1;
  }
}

@keyframes flip {
  0% {
    transform: rotateY(0deg);
  }
  50% {
    transform: rotateY(90deg);
  }
  100% {
    transform: rotateY(0deg);
  }
}

@keyframes slideInFromTop {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-5px);
  }
  75% {
    transform: translateX(5px);
  }
}
```

### 15.3 Mobile-Specific Styles

```css
/* mobile.css */

@media (max-width: 639px) {
  .training-page {
    padding: var(--spacing-sm);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .game-table {
    border-radius: 12px;
  }

  .card {
    width: 60px;
    height: 84px;
    font-size: 14px;
  }

  .action-buttons {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: var(--spacing-md);
    padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom));
    background: var(--table-felt);
    border-top: 1px solid var(--table-border);
  }

  .action-btn {
    min-height: var(--min-touch-target);
    font-size: 16px;
    font-weight: 600;
  }

  .action-btn.primary {
    flex: 1;
    min-height: 56px;
  }

  .action-btn.secondary {
    min-width: 80px;
  }

  .count-display {
    font-size: 14px;
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .feedback-panel {
    position: fixed;
    top: 60px;
    left: var(--spacing-sm);
    right: var(--spacing-sm);
    z-index: 100;
  }

  .correction-modal {
    padding: var(--spacing-md);
  }

  .correction-modal .modal-content {
    width: 100%;
    max-width: none;
    border-radius: 16px 16px 0 0;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
  }

  .settings-sheet {
    max-height: 70vh;
    border-radius: 16px 16px 0 0;
  }

  /* Two hands on mobile */
  .player-hands.two-hands {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-sm);
  }

  .player-hands.two-hands .card {
    width: 50px;
    height: 70px;
    font-size: 12px;
  }

  /* Hide non-essential elements on mobile */
  .shoe-indicator.detailed {
    display: none;
  }

  .keyboard-shortcuts {
    display: none;
  }
}

/* Landscape mobile */
@media (max-width: 896px) and (orientation: landscape) {
  .training-page {
    flex-direction: row;
  }

  .game-area {
    flex: 1;
  }

  .action-buttons {
    position: relative;
    flex-direction: column;
    width: 120px;
    padding: var(--spacing-sm);
  }
}
```

---

## 16. Deck Estimation Training

### 16.1 Why Deck Estimation is Critical

Deck estimation is the **most undertrained skill** in card counting. The True Count formula is:

```
True Count = Running Count / Decks Remaining
```

Any error in deck estimation **directly corrupts your TC**, which cascades into:

| Error Source | Consequence |
|--------------|-------------|
| Think 2 decks left, actually 3 | TC+6 becomes TC+4 → wrong bet size |
| Think 4 decks left, actually 2.5 | TC+4 becomes TC+6.4 → over-bet, increased variance |
| Off by 0.5 decks at TC+3 | Can flip deviation decisions (stand vs hit) |

**Real-world challenge**: You can't see inside the shoe. You estimate decks remaining from:
1. The discard tray (primary visual cue)
2. Cards on table (secondary)
3. Mental tracking of rounds played (backup)

Most counters practice running count religiously but never train deck estimation. This module fixes that.

### 16.2 Rendering Approach (Why Not Photos)

**Decision: Use rendered 3D/2D discard tray, not photographs**

| Approach | Pros | Cons |
|----------|------|------|
| **Photos** | Ultra-realistic, familiar | Need huge labeled dataset, lighting variations, different tray types, licensing issues, can't vary angle dynamically |
| **Rendered** | Infinite scenarios, any penetration, adjustable angles, no assets needed, consistent calibration | Slightly less "photo-real" (but sufficient for training) |

The renderer gives us:
- **Any card count**: 0 to 416 cards (8 decks)
- **Any angle**: Simulate different seat positions
- **Controlled variance**: Realistic "messiness" without memorizable patterns
- **Zero maintenance**: No photo library to curate

### 16.3 Tray Templates (Casino Variations)

Different casinos use different discard trays. We model several archetypes:

```typescript
interface TrayTemplate {
  id: string;
  name: string;
  description: string;

  // Physical dimensions (in mm, for accurate scaling)
  innerWidth: number;      // Width cards sit in
  innerDepth: number;      // Front-to-back depth
  innerHeight: number;     // Max stack height
  wallThickness: number;   // Tray wall thickness

  // Tray geometry
  slopeAngle: number;      // 0 = vertical, 15 = typical slanted tray
  isOpen: boolean;         // Open-top vs enclosed
  material: 'acrylic' | 'wood' | 'plastic';
  color: string;           // Hex color

  // Default camera pose
  defaultCamera: CameraPose;
}

interface CameraPose {
  distance: number;        // Camera distance from tray center
  pitch: number;           // Up/down angle (-30 = looking down)
  yaw: number;             // Left/right angle (0 = straight on)
  roll: number;            // Tilt (usually 0)
  fov: number;             // Field of view (affects perspective distortion)
}

// Preset templates
const TRAY_TEMPLATES: TrayTemplate[] = [
  {
    id: 'standard-slanted',
    name: 'Standard Slanted Tray',
    description: 'Most common casino discard tray, slight angle',
    innerWidth: 65,
    innerDepth: 100,
    innerHeight: 120,
    wallThickness: 5,
    slopeAngle: 12,
    isOpen: true,
    material: 'acrylic',
    color: '#1a1a1a',
    defaultCamera: {
      distance: 400,
      pitch: -25,
      yaw: 15,
      roll: 0,
      fov: 45,
    },
  },
  {
    id: 'vertical-holder',
    name: 'Vertical Card Holder',
    description: 'Home game style, cards sit vertically',
    innerWidth: 65,
    innerDepth: 40,
    innerHeight: 100,
    wallThickness: 3,
    slopeAngle: 0,
    isOpen: true,
    material: 'plastic',
    color: '#cc0000',
    defaultCamera: {
      distance: 350,
      pitch: -20,
      yaw: 10,
      roll: 0,
      fov: 50,
    },
  },
  {
    id: 'deep-tray',
    name: 'Deep Casino Tray',
    description: '8-deck shoe tray, deeper walls',
    innerWidth: 65,
    innerDepth: 120,
    innerHeight: 150,
    wallThickness: 6,
    slopeAngle: 8,
    isOpen: true,
    material: 'acrylic',
    color: '#222222',
    defaultCamera: {
      distance: 450,
      pitch: -30,
      yaw: 20,
      roll: 0,
      fov: 40,
    },
  },
];
```

### 16.4 Card Stack Physics Model

The core rendering challenge: **map card count → visual stack height → projected pixel height**

```typescript
interface CardStackModel {
  // Physical constants
  cardThickness: number;      // ~0.3mm for casino cards
  cardWidth: number;          // 63.5mm (2.5")
  cardHeight: number;         // 88.9mm (3.5")

  // Stack properties
  cardsInStack: number;

  // Calculated
  stackHeight: number;        // cardsInStack * cardThickness
  stackHeightWithVariance: number;  // Adds realistic "fluff"
}

// Card thickness varies by manufacturer and wear
const CARD_THICKNESS_MM = {
  newCasino: 0.32,
  wornCasino: 0.28,
  plastic: 0.30,
  paper: 0.27,
};

function calculateStackHeight(
  cardCount: number,
  cardThickness: number = 0.30,
  compressionFactor: number = 0.95  // Cards compress slightly under weight
): number {
  // Base height
  let height = cardCount * cardThickness;

  // Compression: bottom cards compress more
  // Roughly 5% compression for a full 8-deck stack
  const compressionReduction = 1 - ((1 - compressionFactor) * (cardCount / 416));
  height *= compressionReduction;

  return height;  // in mm
}
```

### 16.5 Realism & Variance (Anti-Memorization)

To prevent users from memorizing exact pixel heights, add controlled randomness:

```typescript
interface StackVariance {
  // Packet jitter: dealers drop cards in chunks, creating uneven layers
  packetJitter: {
    enabled: boolean;
    packetSize: [number, number];     // Random chunk size (e.g., [5, 20] cards)
    maxOffset: number;                 // Max horizontal offset per packet (mm)
    maxRotation: number;               // Max rotation per packet (degrees)
  };

  // Stack lean: cards don't stack perfectly vertical
  stackLean: {
    enabled: boolean;
    maxAngle: number;                  // Max lean angle (degrees)
    direction: 'random' | 'consistent';
  };

  // Edge visibility: subtle lines suggesting card edges
  edgeBanding: {
    enabled: boolean;
    visibility: number;                // 0-1, how visible edge lines are
    irregularity: number;              // 0-1, how uneven spacing is
  };

  // Camera variance: slight angle shifts each question
  cameraVariance: {
    enabled: boolean;
    pitchRange: [number, number];      // e.g., [-5, +5] degrees from default
    yawRange: [number, number];
    distanceRange: [number, number];   // e.g., [-20, +20] mm
  };
}

const DEFAULT_VARIANCE: StackVariance = {
  packetJitter: {
    enabled: true,
    packetSize: [8, 25],
    maxOffset: 3,
    maxRotation: 2,
  },
  stackLean: {
    enabled: true,
    maxAngle: 4,
    direction: 'random',
  },
  edgeBanding: {
    enabled: true,
    visibility: 0.3,
    irregularity: 0.4,
  },
  cameraVariance: {
    enabled: true,
    pitchRange: [-8, 8],
    yawRange: [-12, 12],
    distanceRange: [-30, 30],
  },
};
```

### 16.6 Rendering Implementation

**Recommended: Canvas 2D with perspective math** (simpler, sufficient for training)

```typescript
// DiscardTrayRenderer.ts

interface RenderOptions {
  template: TrayTemplate;
  cardsDealt: number;
  totalCards: number;          // decks * 52
  variance: StackVariance;
  seed?: number;               // For reproducible renders
}

class DiscardTrayRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  render(options: RenderOptions): void {
    const { template, cardsDealt, variance, seed } = options;
    const rng = seed ? seededRandom(seed) : Math.random;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply camera variance
    const camera = this.applyVariance(template.defaultCamera, variance.cameraVariance, rng);

    // Calculate stack geometry
    const stackHeight = calculateStackHeight(cardsDealt);
    const stackHeightPx = this.projectHeight(stackHeight, camera, template);

    // Draw tray body
    this.drawTray(template, camera);

    // Draw card stack with variance
    this.drawCardStack(stackHeightPx, template, variance, rng);

    // Draw edge lines (subtle card edges)
    if (variance.edgeBanding.enabled) {
      this.drawEdgeBanding(cardsDealt, stackHeightPx, variance.edgeBanding, rng);
    }
  }

  private projectHeight(heightMm: number, camera: CameraPose, template: TrayTemplate): number {
    // Perspective projection: objects further away appear smaller
    // This is simplified - real impl would use full 3D projection matrix

    const fovRad = (camera.fov * Math.PI) / 180;
    const scale = this.canvas.height / (2 * camera.distance * Math.tan(fovRad / 2));

    // Account for viewing angle
    const pitchRad = (camera.pitch * Math.PI) / 180;
    const apparentHeight = heightMm * Math.cos(pitchRad);

    return apparentHeight * scale;
  }

  private drawCardStack(
    heightPx: number,
    template: TrayTemplate,
    variance: StackVariance,
    rng: () => number
  ): void {
    // Draw as a gradient-filled shape representing the stack
    const ctx = this.ctx;
    const centerX = this.canvas.width / 2;
    const bottomY = this.canvas.height * 0.85;  // Tray bottom position

    // Stack width (perspective narrowing at top)
    const bottomWidth = 120;
    const topWidth = bottomWidth * 0.92;  // Slight perspective narrowing

    // Apply stack lean
    let leanOffset = 0;
    if (variance.stackLean.enabled) {
      const leanAngle = (rng() - 0.5) * 2 * variance.stackLean.maxAngle;
      leanOffset = Math.tan((leanAngle * Math.PI) / 180) * heightPx;
    }

    // Draw stack shape
    ctx.beginPath();
    ctx.moveTo(centerX - bottomWidth / 2, bottomY);
    ctx.lineTo(centerX + bottomWidth / 2, bottomY);
    ctx.lineTo(centerX + topWidth / 2 + leanOffset, bottomY - heightPx);
    ctx.lineTo(centerX - topWidth / 2 + leanOffset, bottomY - heightPx);
    ctx.closePath();

    // Gradient fill (white cards with shadow)
    const gradient = ctx.createLinearGradient(
      centerX - bottomWidth / 2, bottomY,
      centerX + bottomWidth / 2, bottomY
    );
    gradient.addColorStop(0, '#e8e8e8');
    gradient.addColorStop(0.3, '#ffffff');
    gradient.addColorStop(0.7, '#ffffff');
    gradient.addColorStop(1, '#d0d0d0');

    ctx.fillStyle = gradient;
    ctx.fill();

    // Stack edge (top of cards)
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - topWidth / 2 + leanOffset, bottomY - heightPx);
    ctx.lineTo(centerX + topWidth / 2 + leanOffset, bottomY - heightPx);
    ctx.stroke();
  }

  private drawEdgeBanding(
    cardCount: number,
    stackHeightPx: number,
    banding: StackVariance['edgeBanding'],
    rng: () => number
  ): void {
    // Draw subtle horizontal lines suggesting individual cards
    // NOT enough to count - just visual texture

    const ctx = this.ctx;
    const centerX = this.canvas.width / 2;
    const bottomY = this.canvas.height * 0.85;
    const stackWidth = 115;

    // Draw ~15-25 visible "bands" regardless of actual card count
    const numBands = 15 + Math.floor(rng() * 10);

    ctx.strokeStyle = `rgba(100, 100, 100, ${banding.visibility * 0.3})`;
    ctx.lineWidth = 0.5;

    for (let i = 0; i < numBands; i++) {
      // Irregular spacing
      const baseY = bottomY - (stackHeightPx * (i + 1) / (numBands + 1));
      const irregularity = (rng() - 0.5) * banding.irregularity * (stackHeightPx / numBands);
      const y = baseY + irregularity;

      if (y > bottomY - stackHeightPx && y < bottomY) {
        ctx.beginPath();
        ctx.moveTo(centerX - stackWidth / 2 + 5, y);
        ctx.lineTo(centerX + stackWidth / 2 - 5, y);
        ctx.stroke();
      }
    }
  }
}
```

**Alternative: Three.js for full 3D** (more realistic, more complex)

```typescript
// For higher realism, use Three.js with actual 3D geometry
// This allows proper lighting, shadows, and camera controls

import * as THREE from 'three';

class DiscardTray3DRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  // Build actual 3D tray geometry
  private buildTrayMesh(template: TrayTemplate): THREE.Mesh {
    // Create tray walls as box geometry
    // Add card stack as textured plane with height
    // Apply materials for realistic look
  }

  // Animate camera for "look around" effect
  animateCamera(duration: number): void {
    // Smooth camera movement to show different angles
  }
}
```

### 16.7 Training Modes

#### Mode 1: Standalone Deck Estimation Drill

```
┌────────────────────────────────────────────────────────────────────┐
│  DECK ESTIMATION DRILL                                    Settings │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Tray: [Standard Slanted ▼]    Difficulty: [Half Decks ▼]         │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                                                            │   │
│  │                    ╔═══════════════╗                       │   │
│  │                    ║               ║                       │   │
│  │                    ║  ┌─────────┐  ║                       │   │
│  │                    ║  │░░░░░░░░░│  ║   ← Rendered         │   │
│  │                    ║  │░░░░░░░░░│  ║     discard tray     │   │
│  │                    ║  │░░░░░░░░░│  ║                       │   │
│  │                    ║  │▓▓▓▓▓▓▓▓▓│  ║                       │   │
│  │                    ║  │▓▓▓▓▓▓▓▓▓│  ║                       │   │
│  │                    ║  │█████████│  ║                       │   │
│  │                    ║  │█████████│  ║                       │   │
│  │                    ║  └─────────┘  ║                       │   │
│  │                    ╚═══════════════╝                       │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  How many decks have been dealt?                                   │
│                                                                    │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐         │
│  │ 0.5 │ │  1  │ │ 1.5 │ │  2  │ │ 2.5 │ │  3  │ │ 3.5 │  ...    │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘         │
│                                                                    │
│  Or enter precisely: [____] decks    [Submit]                      │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│  Session: 12/20    Avg Error: 0.3 decks    Streak: 5 ✓            │
└────────────────────────────────────────────────────────────────────┘
```

**Difficulty Progression:**
- **Whole Decks**: Answer in whole numbers (1, 2, 3...)
- **Half Decks**: Answer in 0.5 increments (1.5, 2.0, 2.5...)
- **Quarter Decks**: Answer in 0.25 increments (1.25, 1.5, 1.75...)
- **Casino Speed**: Time limit per answer (5 seconds, then 3, then 2)

#### Mode 2: Integrated with Free Play (Critical!)

During Free Play, periodically prompt for deck estimation **using their estimate for TC**:

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│        Dealer: 10                     ┌──────────────────┐         │
│        Player: 16                     │ Discard Tray     │         │
│                                       │  ╔═══════════╗   │         │
│  [HIT] [STAND] [SURRENDER]            │  ║ █████████ ║   │         │
│                                       │  ║ █████████ ║   │         │
│                                       │  ╚═══════════╝   │         │
│                                       └──────────────────┘         │
│                                                                    │
├──────────────────────────── DECK CHECK ────────────────────────────┤
│                                                                    │
│  How many decks remain in the shoe?                                │
│                                                                    │
│  [1] [1.5] [2] [2.5] [3] [3.5] [4] [4.5]                          │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**After user answers:**
```
Your estimate: 2 decks remaining
Actual: 2.5 decks remaining

Running Count: +8

Your TC:    +8 / 2.0 = +4.0
Actual TC:  +8 / 2.5 = +3.2

→ You over-estimated TC by 0.8!
  At your TC+4, you would stand on 12v2.
  At actual TC+3.2, you should still hit.

[Continue with YOUR TC]  [Continue with ACTUAL TC]
```

**The key insight**: When users choose "Continue with YOUR TC", their betting and deviation decisions use their (possibly wrong) estimate. This makes deck estimation errors **hurt** in a tangible way during training.

#### Mode 3: TC Combo Drill

Quick-fire: show tray → user estimates decks → immediately ask for TC:

```
Step 1: "Decks remaining?"  [User: 2.5]
Step 2: "Running count is +10. True count?"  [User: +4]

Result:
  Your decks: 2.5 → Your TC: +4.0
  Actual decks: 2.0 → Actual TC: +5.0

  Deck error: 0.5 decks
  TC error: 1.0 (20% off)
```

### 16.8 Statistics & Scoring

```typescript
interface DeckEstimationStats {
  // Attempt tracking
  totalAttempts: number;

  // Accuracy metrics
  averageError: number;           // Mean absolute error in decks
  standardDeviation: number;      // Consistency measure
  withinQuarterDeck: number;      // % of attempts within 0.25 decks
  withinHalfDeck: number;         // % of attempts within 0.5 decks

  // Bias detection (critical!)
  averageBias: number;            // Positive = overestimate, negative = underestimate
  biasDirection: 'over' | 'under' | 'neutral';

  // By penetration (are they better early or late in shoe?)
  byPenetration: {
    early: { attempts: number; avgError: number };    // 0-33%
    middle: { attempts: number; avgError: number };   // 33-66%
    late: { attempts: number; avgError: number };     // 66-100%
  };

  // By deck count
  byDeckCount: Record<number, { attempts: number; avgError: number }>;

  // Response time
  averageResponseTime: number;    // ms

  // Correlation with TC errors (if integrated mode)
  tcErrorCorrelation: number;     // How much deck error affects TC decisions
}

interface DeckEstimationAttempt {
  timestamp: number;

  // Scenario
  actualCardsDealt: number;
  actualDecksDealt: number;
  actualDecksRemaining: number;
  totalDecks: number;
  penetration: number;
  trayTemplate: string;
  cameraAngle: CameraPose;

  // User response
  userEstimate: number;           // Decks dealt (or remaining, depending on question)
  responseTime: number;           // ms

  // Scoring
  error: number;                  // User estimate - actual
  absoluteError: number;
  withinTolerance: boolean;       // Based on current difficulty level

  // TC impact (if in integrated mode)
  runningCount?: number;
  userTC?: number;
  actualTC?: number;
  tcError?: number;
}
```

### 16.9 UI Component Structure

```
frontend/src/components/training/
├── deck-estimation/
│   ├── DeckEstimationDrill.tsx      # Standalone drill mode
│   ├── DiscardTrayView.tsx          # Canvas renderer component
│   ├── DeckEstimatePrompt.tsx       # Question UI
│   ├── DeckEstimateFeedback.tsx     # Result feedback
│   ├── DeckEstimationStats.tsx      # Stats dashboard
│   └── TrayTemplateSelector.tsx     # Template picker
│
├── engine/
│   └── DeckEstimationEngine.ts      # Rendering + scoring logic
```

### 16.10 Integration Points

1. **Add to Mode Selector:**
```
[Free Play] [Counting Drill] [Deck Estimation] [High Count] [Scenarios]
                                    ↑ NEW
```

2. **Add to Training Settings:**
```
DECK ESTIMATION
─────────────────────────────────────
Tray Style: [Standard Slanted ▼]
Difficulty: [Half Decks ▼]
[ ] Ask during Free Play (every ~15 hands)
[ ] Use MY estimate for TC (makes errors hurt)
[Preview Tray]
```

3. **Add to Session Stats:**
```
DECK ESTIMATION (if practiced)
  Attempts: 24
  Avg Error: 0.35 decks
  Bias: Slight overestimate (+0.2 decks)
  Best: Quarter-deck accuracy 3x in a row!
```

4. **Add to Design Decisions table:**
```
| **Deck Estimation** | Rendered Tray | 3D/2D rendered discard tray, not photos |
| **Deck Est. Difficulty** | Progressive | Whole → Half → Quarter decks |
| **TC Integration** | Use User's Estimate | Wrong deck estimate → wrong TC in training |
```

---

## Summary

This specification provides a complete blueprint for implementing the Training Mode feature. Key highlights:

1. **Separate from Simulator**: Training has its own page/tab focused on learning
2. **Inherits Configuration**: Uses rules, counting system, deviations from main app
3. **Mobile-First**: Designed for phone use with touch-friendly controls
4. **Comprehensive Feedback**: Immediate, detailed explanations for every decision
5. **Correction Mode**: Optional stopping on mistakes for deliberate practice
6. **Counting Integration**: Count practice built into gameplay
7. **Deck Estimation Training**: Rendered discard tray for practicing the critical but undertrained skill
8. **Progressive Difficulty**: Start easy, build to casino conditions
9. **Statistics Tracking**: Know your weak spots and track improvement

The implementation is broken into 6 phases over approximately 6 weeks, with clear milestones and file structure.

1. **Separate from Simulator**: Training has its own page/tab focused on learning
2. **Inherits Configuration**: Uses rules, counting system, deviations from main app
3. **Mobile-First**: Designed for phone use with touch-friendly controls
4. **Comprehensive Feedback**: Immediate, detailed explanations for every decision
5. **Correction Mode**: Optional stopping on mistakes for deliberate practice
6. **Counting Integration**: Count practice built into gameplay
7. **Progressive Difficulty**: Start easy, build to casino conditions
8. **Statistics Tracking**: Know your weak spots and track improvement

The implementation is broken into 6 phases over approximately 6 weeks, with clear milestones and file structure.
