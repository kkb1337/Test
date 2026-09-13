# FTracker v1.7.97 — Dynamic Index refinement + UI consistency

This release keeps the stable window/screen architecture. Workout behavior is preserved, with only targeted rendering/performance reductions in the set-entry path.

## Changes
- Refined Dynamic Index scoring so training performance is not counted multiple times through separate repetition, 1RM and volume weights.
- Training score now uses Systemity 40%, Load 25%, Strength/e1RM 20%, Volume 15%.
- e1RM analysis uses a conservative 1–12 rep range for trend scoring.
- Custom body goals now handle reaching a target and drifting beyond it as two different states.
- Custom goal editor made more compact; inactive parameters can be shown/hidden repeatedly.
- Goal instructions now clearly distinguish fixed targets from stability corridors.
- Dynamic Index now presents confidence as a confidence indicator rather than implying false precision.
- Progress summary is clearer about the selected period and trend metrics.
- Application, manifest and service-worker versions synchronized to 1.7.97.

## Intentionally unchanged
- Stable workout rendering/performance path is intentionally left untouched in this release.
- Window/screen architecture is intentionally left untouched.


### v1.7.97
- Индекс: тренировки 50/25/10/15; добавлено описание состава расчёта.
- Ручной КБЖУ: допустимое отклонение ±10% по каждому заданному показателю.
- Архитектура окон не изменялась. Глубокая переработка CSS не выполнялась.
