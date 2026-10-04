/* FTracker v1.8.76 logic regression tests; run with: node audit-tests.js */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const manifest=fs.readFileSync('manifest.json','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const css=fs.readFileSync('styles.css','utf8');
const uiCss=fs.readFileSync('ui_refactor_1.8.76.css','utf8');
const readme=fs.readFileSync('README.md','utf8');

// Global progress model: 3 for strength, 1 for cardio/reps.
const required=t=>t==='strength'?3:1;
const progress=types=>{const total=types.reduce((s,t)=>s+required(t),0); return {done:0,total};};
assert.deepEqual(progress(['strength','strength','strength','strength','strength','strength','cardio','bodyweight']),{done:0,total:20});
const dynamicProgress=(requiredRows, rows, completed)=>({done:Math.min(completed,requiredRows),total:requiredRows});
assert.deepEqual(dynamicProgress(1,2,2),{done:1,total:1},'cardio extra result must not expand progress');
assert.deepEqual(dynamicProgress(1,3,3),{done:1,total:1},'cardio extra results must not expand progress');
assert.deepEqual(dynamicProgress(3,4,4),{done:3,total:3},'strength fourth set must not expand progress');

// New/replaced exercise starts with zero sets; no copied historical row.
assert.match(app,/workoutSets\[ref\]=\[\];/);
assert.doesNotMatch(app,/workoutSets\[newRef\]=\[row\];/);
assert.doesNotMatch(app,/const previous=getPreviousExerciseResult\(replacementName/);

// Historical working weight is not restricted by program/split.
assert.match(app,/Working weight is an exercise-level historical metric/);
assert.doesNotMatch(app,/if\(programName && entry\.program!==programName\) return;/);

// Recommendation must come from a qualified historical working weight, not fallback estimation.
assert.match(app,/const base=getLatestWorkingResult\(exerciseName,programName,before\);/);
assert.doesNotMatch(app,/const base=working\|\|fallback/);
assert.ok(app.includes('const evaluationDays=custom?Math.max(7,Math.min(365,Number(custom.evaluationDays)||90)):90;'),'standard Index period must be fixed at 90 days');
assert.ok(app.includes('e1rmScore*.6+workingScore*.4'),'strength weighting must be 60/40');
assert.ok(app.includes('const evaluationDays=custom?Math.max(7,Math.min(365,Number(custom.evaluationDays)||90)):90;'),'standard Index period must be fixed at 90 days');
assert.ok(app.includes('e1rmScore*.6+workingScore*.4'),'strength weighting must be 60/40');

// Top progress uses the planned required units and never penalizes additional completed sets.
assert.match(app,/const baseTotal=activeIndices\.reduce\(\(sum,idx\)=>sum\+getWorkoutCompletionTarget/);
assert.match(app,/const completed=activeIndices\.reduce\(\(sum,idx\)=>sum\+countWorkoutSetResults/);
assert.match(app,/const total=baseTotal;/);
assert.match(app,/const completedForProgress=Math\.min\(completed,baseTotal\)/);

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
for(const s of [app,index,manifest,sw,readme]) assert.ok(s.includes('1.8.76'),'stale release version');
assert.ok(index.includes('от 04.10.26'),'release date missing');
assert.ok(sw.includes("const APP_VERSION = '1.8.76'"),'SW cache version missing');
assert.match(index,/ui_refactor_1\.8\.76\.css\?v=1\.8\.76/,'unified UI stylesheet is not linked');
assert.match(sw,/ui_refactor_1\.8\.76\.css/,'unified UI stylesheet is not cached by the SW');
assert.match(uiCss,/body:not\(\.light-mode\)/,'dark theme token layer missing');
assert.match(uiCss,/body\.light-mode|:root/,'light theme token layer missing');
assert.match(uiCss,/safe-area-inset-top/,'iOS safe-area UI layer missing');
assert.match(uiCss,/workoutScreen \.workout-close::after/,'workout back control styling missing');


assert.ok(app.includes("weights:{systemity:40,strength:60}"),'training index default weights must be 40/60');
assert.ok(!app.includes('fscoreCustomTrainingVolumeWeight'),'custom goal editor must not expose volume weight');
assert.ok(!app.includes("name:'Объём'"),'volume must not be a training Index factor');
assert.ok(app.includes("name:'Системность'"),'systemity factor missing');
assert.ok(app.includes("name:'Силовая динамика'"),'strength factor missing');
assert.ok(app.includes('createdAt'), 'custom goal creation baseline missing');
assert.ok(app.includes('Math.max(now-days*86400000,Number(startAt)||0)'), 'goal startAt baseline missing');
assert.ok(app.includes('const total=baseTotal;'),'extra completed sets must not expand workout progress');

// v1.8.76: exercise notes use a durable exercise-keyed store and remain mirrored in the directory.
assert.match(app,/exerciseNotes:\s*\{\}/,'durable exercise notes store missing');
assert.match(app,/data\.exerciseNotes\[key\]=note/,'exercise note write path missing');
assert.match(app,/delete data\.exerciseNotes\[key\]/,'exercise note clear path missing');
assert.match(app,/data\.exerciseNotes && Object\.prototype\.hasOwnProperty\.call\(data\.exerciseNotes,key\)/,'exercise note read path missing');
assert.match(css,/#workoutScreen \.workout-completion-head\{[^}]*justify-content:center!important/,'workout completion should be centered');
assert.match(css,/#workoutScreen \.workout-action-grid\{[^}]*grid-template-columns:1fr 1fr!important/,'workout action buttons should have equal width');
console.log('FTracker v1.8.76 logic regression tests: OK');

// v1.8.57: replacement creation must replace the frozen slot, not append.
assert(fs.readFileSync('app.js','utf8').includes("workoutNewExerciseContext={mode:'replace',slot,programIndex:Number(currentProgram),oldRef:slots[slot]}"), 'replace creation context must freeze slot before closing replace modal');
assert(fs.readFileSync('app.js','utf8').includes('slots.splice(slot,1,ref);'), 'new exercise replacement must replace the selected slot');


// v1.8.57: workout header UI remains compact and uses a clear back arrow.
assert.ok(index.includes('class="workout-close"'),'workout back control missing');
assert.ok(index.includes('>←</button>'),'workout back arrow missing');
assert.ok(css.includes('#workoutScreen .workout-time'),'workout timer styling missing');
assert.ok(css.includes('#workoutScreen .workout-exercise-name-large'),'workout exercise title styling missing');

// v1.8.66: partial food diary days are excluded until at least 70% of calorie target.
assert.match(app,/d\.cal>=target\*0\.70/,'nutrition days must meet the 70% calorie threshold');
assert.match(app,/if\(days\.length<3\)return \{score:null,available:false,days:days\.length/,'nutrition Index requires at least three eligible days');
assert.match(app,/blockEnabled:\{body:cfg\.blockEnabled\?\.body!==false,training:cfg\.blockEnabled\?\.training!==false,nutrition:cfg\.blockEnabled\?\.nutrition!==false\}/,'custom goal factor switches must persist');
assert.match(app,/toggleFScoreFactor\('nutrition'\)/,'nutrition factor toggle missing');
assert.match(app,/const enabledWeightSum=/,'custom goal weights must normalize only enabled factors');
assert.match(app,/Выключено в цели/,'disabled factor should not be treated as missing data');

// v1.8.66: tolerance is a maintain-only UI field. The hidden class must
// override the more-specific flex layout rule.
assert.match(css,/\.fscore-target-values \.fscore-target-value-cell\.tolerance\.hidden\{display:none!important;?\}/,
  'non-maintain tolerance field must remain hidden');

// v1.8.66: enabled Index factors must always sum to exactly 100%.
assert.match(app,/function normalizeFScoreBlockWeights\(raw,enabled\)/,'Index weight normalization helper missing');
assert.match(app,/const bw=normalizeFScoreBlockWeights\(rawBlockWeights,blockEnabled\)/,'saved custom goal weights must be normalized');
assert.match(app,/const normBW=normalizeFScoreBlockWeights\(rawBW,blockEnabled\)/,'loaded custom goal weights must be normalized');
assert.match(app,/The edited field is authoritative/,'edited factor must remain authoritative');
assert.match(app,/Only the OTHER enabled factors/,'only other active factors may be rebalanced');
const normalize=(raw,enabled)=>{const keys=['body','training','nutrition'];const clean=Object.fromEntries(keys.map(k=>[k,Math.max(0,Math.min(100,Number(raw?.[k])||0))]));const active=keys.filter(k=>enabled?.[k]);if(!active.length)return clean;const sum=active.reduce((s,k)=>s+clean[k],0);if(sum<=0){const base=Math.floor(100/active.length),remainder=100-base*active.length;active.forEach((k,i)=>clean[k]=base+(i===active.length-1?remainder:0));return clean;}let used=0;active.forEach((k,i)=>{if(i===active.length-1)clean[k]=100-used;else{clean[k]=Math.round(clean[k]/sum*100);used+=clean[k];}});return clean;};
assert.deepEqual(normalize({body:40,training:30,nutrition:30},{body:true,training:true,nutrition:true}),{body:40,training:30,nutrition:30});
assert.deepEqual(normalize({body:40,training:30,nutrition:30},{body:true,training:true,nutrition:false}),{body:57,training:43,nutrition:30});
assert.deepEqual(normalize({body:50,training:100,nutrition:20},{body:true,training:true,nutrition:false}),{body:33,training:67,nutrition:20});
assert.deepEqual(normalize({body:50,training:50,nutrition:20},{body:true,training:false,nutrition:true}),{body:71,training:50,nutrition:29});
const zero=normalize({body:0,training:0,nutrition:0},{body:true,training:true,nutrition:true}); assert.equal(zero.body+zero.training+zero.nutrition,100);
const rebalanceEdited=(weights,enabled,changedKey,value)=>{const out={...weights, [changedKey]:Math.max(0,Math.min(100,value))}; const others=['body','training','nutrition'].filter(k=>k!==changedKey&&enabled[k]); const remaining=100-out[changedKey]; const sum=others.reduce((a,k)=>a+Math.max(0,weights[k]),0); let used=0; others.forEach((k,i)=>{if(i===others.length-1)out[k]=remaining-used;else{const v=sum>0?Math.round(remaining*weights[k]/sum):Math.round(remaining/others.length);out[k]=v;used+=v;}}); return out;};
assert.deepEqual(rebalanceEdited({body:40,training:30,nutrition:30},{body:true,training:true,nutrition:true},'body',70),{body:70,training:15,nutrition:15});
assert.deepEqual(rebalanceEdited({body:70,training:15,nutrition:15},{body:true,training:true,nutrition:false},'body',70),{body:70,training:30,nutrition:15});
assert.deepEqual(rebalanceEdited({body:50,training:30,nutrition:20},{body:true,training:true,nutrition:true},'training',60),{body:29,training:60,nutrition:11});
console.log('FTracker v1.8.76 Index-weight regression checks: OK');
