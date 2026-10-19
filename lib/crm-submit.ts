export type SaveFailure = {
  uncertain: boolean;
  alreadySaved?: boolean;
};
type SaveResult =
  | { ok: true; replayed: boolean }
  | ({ ok: false; error: string; existingLeadId?: number } & SaveFailure);

// A missing/invalid response does not establish whether the transaction committed.
export async function submitCrmAction(
  payload: Record<string, unknown>,
  send: typeof fetch = fetch,
): Promise<SaveResult> {
  try {
    const response = await send('/api/crm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const raw = await response.json();
    const result =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    if (response.ok && result?.ok === true)
      return { ok: true, replayed: result.replayed === true };
    if (
      response.status >= 400 &&
      response.status < 500 &&
      typeof result?.error === 'string'
    )
      return {
        ok: false,
        uncertain: false,
        error: result.error,
        alreadySaved: result.alreadySaved === true,
        existingLeadId:
          typeof result.existingLeadId === 'number'
            ? result.existingLeadId
            : undefined,
      };
  } catch {
    // Retryable calls retain their exact request ID and payload in the composer.
  }
  return {
    ok: false,
    uncertain: true,
    error:
      '저장 결과를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.',
  };
}
