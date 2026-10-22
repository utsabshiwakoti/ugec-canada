import { S } from '../core/state.js';

function options(f) {
  if (f.o === '@programs') return S.programs.filter((p) => p.category !== 'Skilled trades').map((p) => `${p.name} (${p.province})`).concat(['Not sure yet']);
  if (f.o === '@trades') return S.programs.filter((p) => p.category === 'Skilled trades').map((p) => p.name).concat(['Other']);
  return Array.isArray(f.o) ? f.o : [];
}

function fieldView(f, pre) {
  const t = f.t || 'text', value = pre[f.n] ?? '';
  return {
    id: 'f_' + f.n, name: f.n, label: f.l, required: !!f.r, value, type: t,
    isTextarea: t === 'textarea', isSelect: t === 'select', isInput: t !== 'textarea' && t !== 'select',
    emptyOption: f.n === 'interest',
    options: t === 'select' ? options(f).map((o) => ({ text: o, selected: o === value })) : [],
    autocomplete: t === 'tel' ? 'tel' : t === 'email' ? 'email' : f.n === 'name' ? 'name' : '',
    inputmode: t === 'tel' ? 'tel' : '',
  };
}

function referralView(pre) {
  const list = [...(S.site.referrers || [])];
  if (S.ref && !list.some((r) => r.code === S.ref.code)) list.push(S.ref);
  const chosen = pre.referral_partner !== undefined ? pre.referral_partner : (S.ref ? S.ref.code : '');
  return {
    partners: list.map((r) => ({ code: r.code, name: r.name, selected: chosen === r.code })),
    otherSelected: chosen === '__other', otherValue: pre.referral_other || '',
  };
}

export function formView(type, pre = {}, submitLabel = 'Send inquiry') {
  const d = S.site.forms[type];
  if (!d) return { unavailable: true };
  return {
    unavailable: false, type, submitLabel,
    fields: d.fields.map((f) => fieldView(f, pre)),
    referral: type === 'partner' ? null : referralView(pre), // institutions are not asked who referred them
  };
}
