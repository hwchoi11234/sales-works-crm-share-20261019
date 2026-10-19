// Component event handlers, not browser/DOM tests. No application DB writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as workflow from '../lib/workflow.ts';
const code = ts.transpileModule(
  fs.readFileSync('components/crm/composer.tsx', 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const storage = new Map();
const calls = [];
let behavior = 'unknown';
function mount(callbacks = []) {
  const slots = [];
  let cursor = 0;
  const useState = (initial) => {
    const i = cursor++;
    if (!(i in slots))
      slots[i] = typeof initial === 'function' ? initial() : initial;
    return [
      slots[i],
      (value) => {
        slots[i] = value;
      },
    ];
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const imports = {
    react: {
      useState,
      useRef: (initial) => useState(() => ({ current: initial }))[0],
      useEffect() {},
      useImperativeHandle(ref, create) {
        if (ref) ref.current = create();
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@/lib/workflow': workflow,
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (id) =>
      imports[id] || new Proxy({}, { get: (_, name) => String(name) }),
    crypto: globalThis.crypto,
    requestAnimationFrame: (callback) => callback(),
    sessionStorage: {
      getItem: (k) => storage.get(k),
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
  });
  const props = {
    data: {
      environment: 'test',
      user: { id: 'staff' },
      role: 'staff',
      members: [],
      callbacks,
      statusOptions: [],
    },
    lead: { id: 1, status: '신규', ownerId: 'staff' },
    busy: false,
    callbackEditorRef: { current: null },
    action: async (p, m, f) => {
      calls.push(JSON.parse(JSON.stringify(p)));
      if (behavior === 'success') return true;
      f({
        uncertain: behavior === 'unknown',
        alreadySaved: behavior === 'conflict',
      });
      return false;
    },
  };
  const render = () => {
    cursor = 0;
    return exports.Composer(props);
  };
  const flatten = (n) =>
    !n || typeof n !== 'object'
      ? []
      : Array.isArray(n)
        ? n.flatMap(flatten)
        : [n, ...flatten(n.props?.children)];
  return {
    render,
    editCallback: () => {
      render();
      props.callbackEditorRef.current.editCallback();
    },
    field: (label) =>
      flatten(render()).find((n) => n.props['aria-label'] === label),
    button: (label) =>
      flatten(render()).find(
        (n) => n.type === 'Button' && n.props.children === label,
      ),
    disabled: () =>
      flatten(render()).find((n) => n.type === 'fieldset').props.disabled,
    submit: () => render().props.onSubmit({ preventDefault() {} }),
  };
}
let ui = mount();
ui.field('상담 메모').props.onChange({
  target: { value: '고객이 요청한 원문' },
});
ui.button('재연락 예약').props.onClick();
ui.field('다음 연락 날짜와 시간').props.onChange({
  target: { value: '2099-01-01T10:00' },
});
await ui.submit();
assert.equal(ui.disabled(), true);
assert.equal(storage.has('sales-draft:test:staff:1:pending'), true);
// A reload must recover the exact outgoing payload rather than generate a new ID.
ui = mount();
assert.equal(ui.field('상담 메모').props.value, '고객이 요청한 원문');
assert.equal(ui.disabled(), true);
behavior = 'success';
await ui.submit();
assert.deepEqual(calls[1], calls[0]);
assert.equal(storage.size, 0);
assert.equal(ui.field('상담 메모').props.value, '');
// A definite conflict permits editing and preserves the entire draft.
ui.field('상담 메모').props.onChange({
  target: { value: '수정해서 다시 예약' },
});
ui.button('미팅 예약').props.onClick();
ui.field('상담 미팅 시작').props.onChange({
  target: { value: '2099-01-01T14:00' },
});
ui.field('상담 미팅 장소').props.onChange({ target: { value: '본사' } });
behavior = 'rejected';
await ui.submit();
assert.equal(ui.disabled(), false);
assert.equal(ui.field('상담 메모').props.value, '수정해서 다시 예약');
assert.equal(ui.field('상담 미팅 시작').props.value, '2099-01-01T14:00');
const rejectedId = calls.at(-1).requestId;
ui.field('상담 미팅 시작').props.onChange({
  target: { value: '2099-01-01T16:00' },
});
behavior = 'success';
await ui.submit();
assert.equal(calls.at(-1).requestId, rejectedId);
assert.equal(calls.at(-1).meeting.start, '16:00');
// A known saved request with different contents needs an explicit new record.
ui.field('상담 메모').props.onChange({ target: { value: '추가 메모' } });
behavior = 'conflict';
await ui.submit();
const conflictId = calls.at(-1).requestId;
const count = calls.length;
await ui.submit();
assert.equal(calls.length, count);
ui.button('새 기록으로 남기기').props.onClick();
behavior = 'success';
await ui.submit();
assert.notEqual(calls.at(-1).requestId, conflictId);
assert.equal(calls.at(-1).text, '추가 메모');
console.log(
  'PASS: uncertain save + reload + exact retry, known failure preserves editable draft, explicit new record after payload conflict',
);

storage.clear();
ui = mount([{ leadId: 1, status: '예정', dueAt: '2099-02-01T10:00' }]);
const writesBeforeShortcut = calls.length;
ui.field('상담 메모').props.onChange({ target: { value: '통화 도중 작성' } });
ui.editCallback();
assert.equal(ui.field('다음 연락 날짜와 시간').props.value, '2099-02-01T10:00');
ui.field('다음 연락 날짜와 시간').props.onChange({
  target: { value: '2099-02-02T15:00' },
});
ui.editCallback();
assert.equal(ui.field('다음 연락 날짜와 시간').props.value, '2099-02-02T15:00');
assert.equal(ui.field('상담 메모').props.value, '통화 도중 작성');
assert.equal(
  calls.length,
  writesBeforeShortcut,
  'shortcut does not independently save an appointment',
);
ui.button('메모만').props.onClick();
ui.editCallback();
assert.equal(ui.button('메모만').props['aria-pressed'], true);
ui.button('통화 완료').props.onClick();
behavior = 'unknown';
await ui.submit();
const beforeRetry = calls.at(-1);
ui.editCallback();
assert.equal(ui.disabled(), true);
behavior = 'success';
await ui.submit();
assert.deepEqual(calls.at(-1), beforeRetry);
console.log(
  'PASS: callback shortcut prefill, unsaved time/memo preservation, no independent write, memo-only and uncertain save protection',
);
