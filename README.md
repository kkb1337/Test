# FTracker v1.7.80 — Index restore + visual refinement

- Base: `FTracker_v1.7.60_FULL_CLEANUP.zip` (stable application).
- Donor: `FTracker_v1.7.76_GLOBAL_INDEX_HEADER_FIXED.zip`.
- This release keeps the stable window/screen architecture and only refines the integrated Progress / Dynamic Index functionality.

## Fixed
- Full backup import after a complete application reset now restores `fscoreGoal`, saved custom goals, the active custom-goal ID and the legacy F-Score preference mirrors.
- Dynamic Index no longer silently loses its configuration because the import normalizer previously discarded F-Score fields from the backup payload.
- Added a compact visual refinement pass for the Dynamic Index: clearer hierarchy, tighter cards, goal tabs, score hero, signal grid, reason blocks, methodology and next-step callout.
- No global screen/window architecture or unrelated sections were intentionally replaced.

## Verification
- `app.js` passes Node syntax validation.
- Version synchronized to `1.7.80` in the application shell, `manifest.json` and `sw.js`.

## Base and donor
- Base: `FTracker_v1.7.60_FULL_CLEANUP.zip` (stable application).
- Donor: `FTracker_v1.7.76_GLOBAL_INDEX_HEADER_FIXED.zip`.

## Approved integration
Integrated only the two requested sections from the donor into the stable base:
1. **Прогресс** — donor exercise-progress enhancements, including estimated 1RM as an additional strength metric, while retaining the stable screen/window rendering architecture.
2. **Индекс динамики** — donor calculation engine, goal presentation, custom-goal editor behavior, block composition, confidence/data coverage, performance signals, and the compact card-based UI.

## Strictly preserved
- Screen/window architecture of v1.7.60.
- Navigation and existing screen opening/closing logic outside the two requested sections.
- Existing workout/program/history/measurements/food functionality outside the integrated index/progress logic.
- No donor global safe-area/header contract was copied.
- No donor global viewport/scroll/header rules were copied.

## Versioning
All app/manifest/service-worker version identifiers were synchronized to `1.7.77`.

## QA notes
- Donor typo `Расчётный Расчётный 1ПМ` was normalized to `Расчётный 1ПМ`.
- JavaScript syntax is checked before packaging.
- The archive is rebuilt from the stable base, not from the donor.

## Next steps
If further changes are requested, continue from this archive and preserve the separation: section functionality/design may evolve, but the stable window architecture remains protected unless explicitly authorized.