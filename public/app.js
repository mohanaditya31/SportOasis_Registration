import { SPORTS, sportById, validateRegistration } from './shared.js';

const DRAFT_KEY = 'sportoasis-reg-draft-v1';

const $ = (sel, root = document) => root.querySelector(sel);
const form = $('#reg-form');
const playersEl = $('#players');
const teamSection = $('#team-section');
const errorsEl = $('#form-errors');
const submitBtn = $('#submit');
const addBtn = $('#add-player');

// ── ID field (Emirates ID / passport toggle) ─────────────

function mountIdField(container, label) {
  container.append($('#id-tpl').content.cloneNode(true));
  const input = $('input', container);
  input.setAttribute('aria-label', `${label} ID number`);
  container.dataset.type = 'emirates';
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-type]');
    if (btn) setIdType(container, btn.dataset.type);
  });
}

function setIdType(container, type) {
  container.dataset.type = type;
  container.querySelectorAll('button[data-type]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.type === type)));
  $('.id-name', container).textContent = type === 'passport' ? 'Passport no.' : 'Emirates ID';
  const input = $('input', container);
  input.placeholder = type === 'passport' ? 'N1234567' : '784-2003-1234567-1';
  input.inputMode = type === 'passport' ? 'text' : 'numeric';
  saveDraft();
}

const readId = (container) => ({
  idType: container.dataset.type,
  idNumber: $('input', container).value,
});

// ── Sports ───────────────────────────────────────────────

const sportsEl = $('#sport-options');
for (const s of SPORTS) {
  const label = document.createElement('label');
  label.className = 'sport';
  label.innerHTML = `<input type="radio" name="sport" value="${s.id}" required />
    <span class="name"></span><span class="size">${s.min === s.max ? s.min : `${s.min}–${s.max}`} players</span>`;
  $('.name', label).textContent = s.name;
  sportsEl.append(label);
}

const currentSport = () => sportById(form.elements.sport.value);

sportsEl.addEventListener('change', () => {
  const sport = currentSport();
  teamSection.hidden = !sport;
  if (!sport) return;
  $('#sport-title').textContent = sport.name;
  // Grow/shrink the list to fit the new sport's squad limits.
  const needed = sport.min - 1;
  while (playersEl.children.length < needed) addPlayer();
  while (playersEl.children.length > sport.max - 1) playersEl.lastElementChild.remove();
  refreshRoster();
  saveDraft();
});

// ── Players ──────────────────────────────────────────────

function addPlayer(values) {
  const li = $('#player-tpl').content.firstElementChild.cloneNode(true);
  mountIdField($('.id-field', li), 'Player');
  if (values) {
    $('[data-k="name"]', li).value = values.name || '';
    $('[data-k="collegeId"]', li).value = values.collegeId || '';
    $('.id-field input', li).value = values.idNumber || '';
    if (values.idType === 'passport') setIdType($('.id-field', li), 'passport');
  }
  playersEl.append(li);
  return li;
}

addBtn.addEventListener('click', () => {
  const li = addPlayer();
  refreshRoster();
  $('input', li).focus();
});

playersEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove');
  if (!btn || btn.disabled) return;
  btn.closest('.player').remove();
  refreshRoster();
  saveDraft();
});

function refreshRoster() {
  const sport = currentSport();
  if (!sport) return;
  const others = playersEl.children.length;
  const total = others + 1;
  [...playersEl.children].forEach((li, i) => {
    $('.num', li).textContent = String(i + 2).padStart(2, '0');
    $('.remove', li).disabled = others <= sport.min - 1;
  });
  addBtn.disabled = total >= sport.max;
  addBtn.hidden = sport.max === 1;
  const countEl = $('#roster-count');
  countEl.textContent = `${total} / ${sport.max} incl. captain · min ${sport.min}`;
  countEl.classList.toggle('ok', total >= sport.min);
}

// ── Collect / draft ──────────────────────────────────────

const capIdField = $('.id-field[data-prefix="cap"]');
mountIdField(capIdField, 'Captain');

function collect() {
  const f = form.elements;
  return {
    website: f.website.value,
    university: f.university.value,
    coordinator: { name: f.coordName.value, phone: f.coordPhone.value, email: f.coordEmail.value },
    sportId: f.sport.value,
    captain: {
      name: f.capName.value, phone: f.capPhone.value, email: f.capEmail.value,
      collegeId: f.capCollegeId.value, ...readId(capIdField),
    },
    players: [...playersEl.children].map((li) => ({
      name: $('[data-k="name"]', li).value,
      collegeId: $('[data-k="collegeId"]', li).value,
      ...readId($('.id-field', li)),
    })),
  };
}

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(collect())); } catch { /* storage unavailable */ }
}

function loadDraft() {
  let d;
  try { d = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return; }
  if (!d) return;
  const f = form.elements;
  f.university.value = d.university || '';
  f.coordName.value = d.coordinator?.name || '';
  f.coordPhone.value = d.coordinator?.phone || '';
  f.coordEmail.value = d.coordinator?.email || '';
  if (!sportById(d.sportId)) return;
  f.capName.value = d.captain?.name || '';
  f.capPhone.value = d.captain?.phone || '';
  f.capEmail.value = d.captain?.email || '';
  f.capCollegeId.value = d.captain?.collegeId || '';
  $('input', capIdField).value = d.captain?.idNumber || '';
  if (d.captain?.idType === 'passport') setIdType(capIdField, 'passport');
  (d.players || []).forEach((p) => addPlayer(p));
  form.querySelector(`input[name="sport"][value="${d.sportId}"]`).checked = true;
  sportsEl.dispatchEvent(new Event('change'));
}

let draftTimer;
form.addEventListener('input', (e) => {
  e.target.removeAttribute('aria-invalid');
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 400);
});

// ── Submit ───────────────────────────────────────────────

function showErrors(list) {
  errorsEl.hidden = !list.length;
  errorsEl.innerHTML = '';
  if (!list.length) return;
  const strong = document.createElement('strong');
  strong.textContent = list.length === 1 ? 'Please fix this:' : `Please fix these ${list.length} issues:`;
  const ul = document.createElement('ul');
  for (const msg of list.slice(0, 8)) {
    const li = document.createElement('li');
    li.textContent = msg;
    ul.append(li);
  }
  errorsEl.append(strong, ul);
  errorsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function markEmptyRequired() {
  let first = null;
  form.querySelectorAll('input[required]:not([type="radio"])').forEach((input) => {
    if (input.offsetParent === null) return; // hidden section
    const bad = !input.value.trim();
    if (bad) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (bad && !first) first = input;
  });
  return first;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = collect();
  const { errors } = validateRegistration(payload);
  const firstEmpty = markEmptyRequired();
  if (errors.length) {
    showErrors(errors);
    firstEmpty?.focus({ preventScroll: true });
    return;
  }
  showErrors([]);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({ ok: false, error: 'Unexpected server response.' }));
    if (!res.ok || !out.ok) throw new Error(out.error || 'Submission failed.');
    showSuccess(out, payload);
  } catch (err) {
    showErrors([err.message || 'Network error — please check your connection and try again.']);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit registration';
  }
});

function showSuccess(out, payload) {
  $('#success-title').textContent = `${sportById(payload.sportId).name} — ${payload.university.trim()}`;
  $('#success-ref').textContent = out.reference;
  $('#success-dup').hidden = !out.duplicate;
  form.hidden = true;
  $('#success').hidden = false;
  resetTeam();
  saveDraft(); // keeps university + coordinator only
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetTeam() {
  form.querySelectorAll('input[name="sport"]').forEach((r) => (r.checked = false));
  ['capName', 'capPhone', 'capEmail', 'capCollegeId'].forEach((n) => (form.elements[n].value = ''));
  $('input', capIdField).value = '';
  setIdType(capIdField, 'emirates');
  playersEl.innerHTML = '';
  teamSection.hidden = true;
}

$('#another').addEventListener('click', () => {
  $('#success').hidden = true;
  form.hidden = false;
  $('#s2').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

loadDraft();
