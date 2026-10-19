import assert from 'node:assert/strict';
import { scoreResult, parseScoreAnswers, emptyScoreAnswers } from '../lib/lead-score.ts';
assert.equal(scoreResult().score, null);
const q = answers => ({ answers, reason:'',author:'테스트',updatedAt:'2026-10-14T00:00:00Z' });
assert.equal(scoreResult(q({budget:25,timing:25,property:25,intent:null})).grade,'미평가');
for (const [answers, expected, grade] of [
 [{budget:25,timing:25,property:25,intent:25},100,'A'],
 [{budget:20,timing:20,property:20,intent:20},80,'A'],
 [{budget:20,timing:20,property:10,intent:10},60,'B'],
 [{budget:10,timing:10,property:10,intent:10},40,'C'],
 [{budget:0,timing:0,property:0,intent:0},0,'D'],
]) { const r=scoreResult(q(parseScoreAnswers(answers)));assert.equal(r.score,expected);assert.equal(r.grade,grade); }
assert.deepEqual(parseScoreAnswers(emptyScoreAnswers()),emptyScoreAnswers());
for (const invalid of [null,[],{}, {budget:99,timing:25,property:25,intent:25}, {budget:'25',timing:25,property:25,intent:25}, {...emptyScoreAnswers(),total:100}]) assert.throws(()=>parseScoreAnswers(invalid));
console.log('PASS: 100-point score, boundaries, missing vs zero, invalid/tampered answers.');
