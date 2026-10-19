'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function Login({ onLogin }: { onLogin: () => Promise<unknown> }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="wordmark">
          SALES<span>WORKS</span>
          <small>광고·영업대행 인트라넷</small>
        </div>
        <h1>로그인</h1>
        <p className="muted">발급받은 계정으로 시작하세요.</p>
        <form
          className="modal-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const d = new FormData(e.currentTarget);
            try {
              const r = await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  username: d.get('username'),
                  password: d.get('password'),
                }),
              });
              const b = (await r.json()) as { error?: string };
              if (!r.ok) throw Error(b.error);
              await onLogin();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : '로그인할 수 없습니다.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="login-field-1">
            아이디
            <Input
              id="login-field-1"
              autoComplete="username"
              name="username"
              required
            />
          </label>
          <label htmlFor="login-field-2">
            비밀번호
            <Input
              id="login-field-2"
              type="password"
              autoComplete="current-password"
              name="password"
              required
            />
          </label>
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? '로그인 중…' : '로그인'}
          </Button>
        </form>
        <div className="login-foot">로컬 개발 환경 · 임시 데이터</div>
      </section>
    </main>
  );
}
