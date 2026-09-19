/* FTracker Dynamic Index invariant tests; run with: node audit-tests.js */
const assert=require('node:assert/strict');
const clamp=(v,min=0,max=100)=>{v=Number(v);if(!Number.isFinite(v))return null;min=Number.isFinite(Number(min))?Number(min):0;max=Number.isFinite(Number(max))?Number(max):100;if(min>max)[min,max]=[max,min];return Math.max(min,Math.min(max,v));};
const frequency=(count,periodDays=30)=>{count=Math.max(0,Number(count)||0);periodDays=Math.max(7,Number(periodDays)||30);const weekly=count*7/periodDays;if(weekly>=2&&weekly<=5)return 100;if(weekly<2)return clamp(weekly/2*100);return 100;};
const nutritionCoverage=(days,periodDays=90)=>Math.min(1,days/Math.min(14,periodDays));
const nutritionAvailable=(days)=>days>=3;
const nutritionFinal=(raw,days)=>nutritionAvailable(days)?clamp(raw):null;
for(const n of [0,1,7,13,17,30,100])assert.ok(frequency(n)>=0&&frequency(n)<=100);
assert.equal(frequency(13,30),100); // ~3.0/week
assert.equal(frequency(17,30),100); // ~4.0/week
assert.equal(frequency(30,30),100); // high frequency is not penalized by itself
assert.ok(frequency(6,30)<100);      // ~1.4/week is insufficient
assert.equal(nutritionAvailable(2),false);
assert.equal(nutritionAvailable(3),true);
assert.equal(nutritionFinal(100,3),100);
assert.equal(nutritionFinal(0,3),0);
assert.equal(nutritionCoverage(2,90),2/14);
assert.equal(nutritionCoverage(7,90),.5);
assert.equal(nutritionCoverage(14,90),1);
assert.equal(clamp(NaN),null);assert.equal(clamp(Infinity),null);assert.equal(clamp(120),100);
const files=['index.html','manifest.json','sw.js','app.js','README.md'].map(f=>require('node:fs').readFileSync(f,'utf8'));
for(const s of files) assert.ok(!/1\.8\.(21|27|28)/.test(s),'stale version identifier found');
console.log('FTracker scoring invariants: OK');
