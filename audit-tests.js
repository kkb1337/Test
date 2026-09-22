/* FTracker v1.8.51 workout logic regression tests; run with: node audit-tests.js */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const manifest=fs.readFileSync('manifest.json','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const readme=fs.readFileSync('README.md','utf8');

// Global progress model: 3 for strength, 1 for cardio/reps.
const required=t=>t==='strength'?3:1;
const progress=types=>{const total=types.reduce((s,t)=>s+required(t),0); return {done:0,total};};
assert.deepEqual(progress(['strength','strength','strength','strength','strength','strength','cardio','bodyweight']),{done:0,total:20});
const dynamicProgress=(requiredRows, rows, completed)=>({done:completed,total:requiredRows+Math.max(0,rows-requiredRows)});
assert.deepEqual(dynamicProgress(1,2,2),{done:2,total:2+0},'cardio second set model');
assert.deepEqual(dynamicProgress(1,3,3),{done:3,total:3},'cardio third set model');
assert.deepEqual(dynamicProgress(3,4,4),{done:4,total:4},'strength fourth set model');

// New/replaced exercise starts with zero sets; no copied historical row.
assert.match(app,/workoutSets\[ref\]=\[\];/);
assert.doesNotMatch(app,/workoutSets\[newRef\]=\[row\];/);
assert.doesNotMatch(app,/const previous=getPreviousExerciseResult\(replacementName/);

// Historical working weight is not restricted by program/split.
assert.match(app,/Working weight is an exercise-level historical metric/);
assert.doesNotMatch(app,/if\(programName && entry\.program!==programName\) return;/);

// Recommendation must come from a qualified historical working weight, not fallback estimation.
assert.match(app,/const base=getBestQualifiedStrengthResult\(exerciseName,programName,before\);/);
assert.doesNotMatch(app,/const base=working\|\|fallback/);

// Top progress must use required units, not number of existing input rows.
assert.match(app,/Global workout progress counts every actual set slot/);
assert.match(app,/total \+= required \+ Math\.max\(0, rows-required\)/);
assert.match(app,/done \+= completed/);
assert.doesNotMatch(app,/done\s*\+=\s*Math\.min\(completed,required\)/);

// Recommendation card contains only the target; explanatory copy is removed.
assert.doesNotMatch(app,/Почему стоит улучшить/);

// Split picker can create the same directory exercise inline and attach it to the current split.
assert.match(app,/openNewDirectoryExerciseForSplit/);
assert.match(app,/pendingSplitExerciseCreate/);
assert.match(index,/program-picker-add-new/);
assert.match(index,/Создать упражнение — нет в списке/);
assert.doesNotMatch(app,/insertAdjacentHTML\('beforeend', `.*program-picker-add-new/);
assert.match(index,/exercisePickerSearch/);

// Release metadata must be synchronized.
for(const s of [app,index,manifest,sw,readme]) assert.ok(s.includes('1.8.51'),'stale release version');
assert.ok(index.includes('от 22.09.26'),'release date missing');
assert.ok(sw.includes("const APP_VERSION = '1.8.51'"),'SW cache version missing');

console.log('FTracker v1.8.51 workout logic regression tests: OK');

// v1.8.51: replacement creation must replace the frozen slot, not append.
assert(fs.readFileSync('app.js','utf8').includes("workoutNewExerciseContext={mode:'replace',slot,programIndex:Number(currentProgram),oldRef:slots[slot]}"), 'replace creation context must freeze slot before closing replace modal');
assert(fs.readFileSync('app.js','utf8').includes('slots.splice(slot,1,ref);'), 'new exercise replacement must replace the selected slot');


// v1.8.51: workout header UI remains compact and uses a clear back arrow.
assert.ok(index.includes('class="workout-close"'),'workout back control missing');
assert.ok(index.includes('>←</button>'),'workout back arrow missing');
assert.ok(css.includes('v1.8.51 — compact workout header'),'v1.8.51 workout UI block missing');
assert.ok(css.includes('#workoutScreen .workout-time'),'workout timer styling missing');
assert.ok(css.includes('#workoutScreen .workout-exercise-name-large'),'workout exercise title styling missing');
