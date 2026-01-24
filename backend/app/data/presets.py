from app.models import BetRamp, BetRampEntry, CountingSystem, Deviation, Rules

# Default Midwest-style 6D H17 DAS rules (75% penetration).
DEFAULT_RULES = Rules()

# Hi-Lo counting system (extensible later).
DEFAULT_COUNT = CountingSystem()

# Illustrious 18 + Fab 4 deviations (common subset).
ILLUSTRIOUS_18_FAB_4 = [
    Deviation(hand_key="16v10", tc_floor=0, action="S"),
    Deviation(hand_key="15v10", tc_floor=4, action="S"),
    Deviation(hand_key="10v10", tc_floor=4, action="D"),
    Deviation(hand_key="12v3", tc_floor=2, action="S"),
    Deviation(hand_key="12v2", tc_floor=3, action="S"),
    Deviation(hand_key="12v4", tc_floor=0, action="S"),
    Deviation(hand_key="12v5", tc_floor=-2, action="S"),
    Deviation(hand_key="12v6", tc_floor=-1, action="S"),
    Deviation(hand_key="9v2", tc_floor=1, action="D"),
    Deviation(hand_key="9v7", tc_floor=3, action="D"),
    Deviation(hand_key="10vA", tc_floor=4, action="D"),
    Deviation(hand_key="10v10", tc_floor=4, action="D"),
    Deviation(hand_key="11vA", tc_floor=1, action="D"),
    Deviation(hand_key="16v9", tc_floor=5, action="S"),
    Deviation(hand_key="13v2", tc_floor=-1, action="S"),
    Deviation(hand_key="13v3", tc_floor=-2, action="S"),
    Deviation(hand_key="15v9", tc_floor=5, action="S"),
    Deviation(hand_key="insurance", tc_floor=3, action="I"),
    # Fab 4 surrender
    Deviation(hand_key="15v10_surrender", tc_floor=0, action="R"),
    Deviation(hand_key="15v9_surrender", tc_floor=2, action="R"),
    Deviation(hand_key="15vA_surrender", tc_floor=1, action="R"),
    Deviation(hand_key="14v10_surrender", tc_floor=3, action="R"),
]

# Additional preset slots could be added here if desired (e.g., full I18, full surrender sets).

# Simple starter bet ramp for 1–12 spread; adjust in UI.
DEFAULT_RAMP = BetRamp(
    steps=[
        BetRampEntry(tc_floor=-1, units=1),
        BetRampEntry(tc_floor=0, units=2),
        BetRampEntry(tc_floor=1, units=4),
        BetRampEntry(tc_floor=2, units=6),
        BetRampEntry(tc_floor=3, units=8),
        BetRampEntry(tc_floor=4, units=10),
        BetRampEntry(tc_floor=5, units=12),
    ],
    wong_out_below=-2,
    wong_out_policy="anytime",
)
