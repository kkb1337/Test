/* FTracker v1.8.45 workout logic regression tests; run with: node audit-tests.js */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const manifest=fs.readFileSync('manifest.json','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const readme=fs.readFileSync('README.md','utf8');

// Global progress model: 3 for strength, 1 for cardio/reps.
const required=t=>t==='strength'?3:1;
const progress=types=>{const total=types.reduce((s,t)=>s+required(t),0); return {done:0,total};};
assert.deepEqual(progress(['strength','strength','strength','strength','strength','strength','cardio','bodyweight']),{done:0,total:20});
assert.equal(Math.min(4,3),3,'per-exercise required target remains 3');
const dynamicTotal=(types,rows)=>types.reduce((sum,t,i)=>sum+required(t)+Math.max(0,(rows[i]||0)-required(t)),0);
const dynamicDone=filled=>filled.reduce((s,n)=>s+n,0);
assert.equal(dynamicTotal(['strength','strength','strength','strength','strength','strength','cardio','bodyweight'],[3,3,3,3,3,3,1,1]),20);
assert.equal(dynamicTotal(['strength','strength','strength','strength','strength','strength','cardio','bodyweight'],[3,3,3,3,3,3,2,1]),21);
assert.equal(dynamicDone([3,3,3,3,3,3,2,1]),21);
assert.equal(dynamicTotal(['strength'],[4]),4);
assert.equal(dynamicDone([4]),4);

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

// Top progress uses required sets plus explicitly added extra sets.
assert.match(app,/Global workout progress: required sets \+ explicitly added extra sets/);
assert.ok(app.includes('const extra=Math.max(0,rows-required)'));
assert.ok(app.includes('total+=required+extra'));
assert.ok(app.includes('done+=completed'));
assert.ok(app.includes('Выполнено ${done} из ${total} подходов'));

// Split picker can create a directory exercise and immediately attach it to the split.
assert.ok(index.includes('openNewExerciseFromSplitPicker()'));
assert.ok(app.includes('function openNewExerciseFromSplitPicker()'));
assert.ok(app.includes('selectExerciseForProgram(targetProgram,name,type)'));

// Release metadata must be synchronized.
for(const s of [app,index,manifest,sw,readme]) assert.ok(s.includes('1.8.45'),'stale release version');
assert.ok(index.includes('от 22.09.26'),'release date missing');
assert.ok(sw.includes("const APP_VERSION = '1.8.45'"),'SW cache version missing');

console.log('FTracker v1.8.45 workout logic regression tests: OK');
