'use client';
import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { State, User } from '@/lib/types';
import { roleLabel } from '@/lib/permissions';

type Props = {
  data: State;
  busy: boolean;
  action: (
    payload: Record<string, unknown>,
    message: string,
  ) => Promise<boolean>;
};
export function CompanyTeam({ data, busy, action }: Props) {
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const account = editing && editing !== 'new' ? editing : null;
  return (
    <section className="company-team">
      <div className="company-team-heading">
        <div>
          <h2>
            <Users size={20} /> 등록된 직원 {data.accounts.length}명
          </h2>
          <p>
            직원 등록과 로그인 계정 발급을 한 번에 진행하세요. 직원은 배정받은
            고객만 관리합니다.
          </p>
        </div>
        <Button onClick={() => setEditing('new')} disabled={busy || !!editing}>
          <Plus size={16} />
          직원 추가
        </Button>
      </div>
      <div className="company-workflow">
        <span>① 직원 계정 만들기</span>
        <span>② 고객 DB에서 선택 배정</span>
        <span>③ 직원이 상담·일정 관리</span>
      </div>
      {editing && (
        <form
          className="company-employee-form"
          key={account?.id || 'new'}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            if (
              await action(
                {
                  action: 'companyEmployee',
                  id: account?.id,
                  name: form.get('name'),
                  username: form.get('username'),
                  password: form.get('password'),
                  brandIds: form.getAll('brandIds'),
                  active: form.get('active') === 'true',
                },
                account
                  ? '직원 정보를 수정했습니다.'
                  : '직원과 로그인 계정을 만들었습니다. 고객 DB에서 담당자를 배정해 주세요.',
              )
            )
              setEditing(null);
          }}
        >
          <h3>{account ? '직원 정보 수정' : '새 직원 계정'}</h3>
          <div className="company-form-grid">
            <label>
              직원 이름
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={account?.name || ''}
              />
            </label>
            <label>
              로그인 아이디
              <input
                name="username"
                required
                minLength={2}
                maxLength={40}
                autoComplete="off"
                defaultValue={account?.username || ''}
                placeholder="예: 바른보쌈.김영업"
              />
            </label>
            <label>
              {account ? '새 비밀번호 (변경할 때만)' : '초기 비밀번호'}
              <input
                name="password"
                type="password"
                required={!account}
                minLength={4}
                maxLength={200}
                autoComplete="new-password"
              />
            </label>
            <label>
              재직 상태
              <select
                name="active"
                defaultValue={String(account?.active ?? true)}
              >
                <option value="true">재직</option>
                <option value="false">비활성</option>
              </select>
            </label>
          </div>
          <fieldset>
            <legend>담당 브랜드</legend>
            <div className="inline">
              {data.brands.map((b) => (
                <label className="inline" key={b.id}>
                  <input
                    type="checkbox"
                    name="brandIds"
                    value={b.id}
                    defaultChecked={
                      account
                        ? account.brandIds.includes(b.id)
                        : data.brands.length === 1
                    }
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="muted">
            직원은 고객 배정·계정 관리 권한이 없습니다. 비활성화 전 진행 중인
            고객을 다른 직원에게 인수인계하세요.
          </p>
          <div className="inline">
            <Button type="submit" disabled={busy}>
              {busy ? '저장 중…' : account ? '수정 저장' : '직원 계정 만들기'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              취소
            </Button>
          </div>
        </form>
      )}
      {!data.accounts.length ? (
        <div className="empty-state">
          아직 등록된 직원이 없습니다. ‘직원 추가’로 첫 계정을 만들어 주세요.
        </div>
      ) : (
        <div className="company-team-table">
          <table>
            <thead>
              <tr>
                <th>직원 / 아이디</th>
                <th>담당 브랜드</th>
                <th>배정 고객</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.name}</strong>
                    <small>
                      {a.username} · {roleLabel(a.role)}
                    </small>
                  </td>
                  <td>
                    {a.brandIds
                      .map((id) => data.brands.find((b) => b.id === id)?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </td>
                  <td>
                    {data.leads.filter((l) => l.ownerId === a.memberId).length}
                    명
                  </td>
                  <td>{a.active ? '재직' : '비활성'}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditing(a)}
                    >
                      수정
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
