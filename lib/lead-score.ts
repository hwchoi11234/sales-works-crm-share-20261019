export const scoreCriteria = [
  { key: 'budget', label: '예산 준비', options: ['미확인', '자금 계획 없음', '자금 마련 검토', '일부 자금 확보', '필요 자금 확보 확인'] },
  { key: 'timing', label: '창업 시기', options: ['미확인', '시기 미정', '6개월 이후', '3~6개월 이내', '3개월 이내'] },
  { key: 'property', label: '점포 준비', options: ['미확인', '점포 계획 없음', '희망 상권 검토', '후보 점포 확인', '점포 확보 또는 조건 협의'] },
  { key: 'intent', label: '창업 의사', options: ['미확인', '정보 수집', '브랜드 비교', '구체적 조건 상담', '계약 진행 의사 확인'] },
] as const;
export type ScoreKey = typeof scoreCriteria[number]['key'];
export type Qualification = {
  answers: Record<ScoreKey, number | null>;
  reason: string;
  updatedAt: string;
  author: string;
};
export const emptyScoreAnswers = (): Qualification['answers'] => ({ budget: null, timing: null, property: null, intent: null });
export function parseScoreAnswers(input: unknown): Qualification['answers'] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('평가 항목을 확인해 주세요.');
  const object = input as Record<string, unknown>;
  if (Object.keys(object).some(k => !scoreCriteria.some(c => c.key === k))) throw new Error('지원하지 않는 평가 항목입니다.');
  const answers = emptyScoreAnswers();
  for (const { key } of scoreCriteria) {
    const value = object[key];
    if (value !== null && ![0, 10, 20, 25].includes(value as number)) throw new Error('각 항목은 미확인 또는 0·10·20·25점 중 선택해 주세요.');
    answers[key] = value as number | null;
  }
  return answers;
}
export function scoreResult(q?: Qualification) {
  const values = scoreCriteria.map(c => q?.answers?.[c.key] ?? null);
  const answered = values.filter(v => v !== null).length;
  if (answered < 4) return { score: null, grade: '미평가', answered, label: '미평가' };
  const score = values.reduce<number>((sum, v) => sum + (v || 0), 0);
  const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  return { score, grade, answered, label: `${score}점 · ${grade}` };
}
