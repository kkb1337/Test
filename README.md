# FTracker v1.8.38 — Workout Set Logic

## Approved logic / actions
1. The workout completion indicator shows only `ВЫПОЛНЕНО X/3 подходов` for strength exercises. The redundant `Цель: 3 подхода` text is removed.
2. Progress counts only fully completed sets:
   - strength: both weight and reps must be filled with positive values;
   - cardio: time and intensity must be filled;
   - bodyweight: reps must be filled.
3. A strength exercise may exceed the planned target, so values such as `4/3` are valid after an additional completed set.
4. At workout start, the first set is prefixed from the existing application working-weight calculation (`getAutofillStrengthResult`), using the established history/formula logic. No new formula was introduced and workout/history scoring logic was not changed.
5. Version/cache identifiers are synchronized to v1.8.38.

## What changed
- Removed the duplicate target label from the workout completion block.
- Fixed the strength completion target to 3 working sets while keeping the completed count based strictly on fully filled sets.
- Activated the existing calculated working-weight autofill for the first set when a valid historical calculation is available.
- Synchronized release version to 1.8.38 in app metadata and service worker.

## Remaining / planned
- Validate the workout flow on iOS PWA after installation/update:
  1. new exercise with no history;
  2. exercise with calculated working weight;
  3. partial set must remain 0/3;
  4. completed sets become 1/3, 2/3, 3/3;
  5. an additional completed set can show 4/3.
- Confirm cache refresh after the service-worker version bump.

## Key architecture decisions
- The displayed completion count is a result counter, not an input-row counter.
- Empty or partially filled rows never count as completed results.
- The existing working-weight calculation remains the single source of truth for first-set autofill; no duplicate formula was added.
