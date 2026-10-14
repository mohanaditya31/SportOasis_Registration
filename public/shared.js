// Shared between the browser form (public/app.js) and the server (api/register.js),
// so the same rules are enforced on both sides. Edit sports / squad sizes here.

export const SPORTS = [
  { id: 'football-men', name: 'Football (Men)', min: 11, max: 16 },
  { id: 'cricket-men', name: 'Cricket (Men)', min: 11, max: 15 },
  { id: 'volleyball-men', name: 'Volleyball (Men)', min: 6, max: 12 },
  { id: 'badminton-men', name: 'Badminton (Men)', min: 2, max: 5 },
  { id: 'table-tennis-men', name: 'Table Tennis (Men)', min: 2, max: 5 },
  { id: 'chess-men', name: 'Chess (Men)', min: 1, max: 5 },
  { id: 'volleyball-women', name: 'Volleyball (Women)', min: 6, max: 12 },
  { id: 'badminton-women', name: 'Badminton (Women)', min: 2, max: 5 },
];

export const sportById = (id) => SPORTS.find((s) => s.id === id);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSPORT_RE = /^[A-Z0-9]{5,20}$/;

const clean = (v, max = 200) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export function isValidPhone(v) {
  if (!/^\+?[\d\s\-()]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export const isValidEmail = (v) => EMAIL_RE.test(v);

// Emirates ID: 15 digits starting with 784. Normalised to 784-YYYY-NNNNNNN-N.
export function normaliseEmiratesId(v) {
  const d = String(v).replace(/\D/g, '');
  if (d.length !== 15 || !d.startsWith('784')) return null;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 14)}-${d.slice(14)}`;
}

export function normalisePassport(v) {
  const p = String(v).replace(/\s/g, '').toUpperCase();
  return PASSPORT_RE.test(p) ? p : null;
}

function cleanPlayer(p) {
  const idType = p?.idType === 'passport' ? 'passport' : 'emirates';
  return {
    name: clean(p?.name, 120),
    collegeId: clean(p?.collegeId, 40),
    idType,
    idNumber: clean(p?.idNumber, 40),
  };
}

function playerErrors(p, label) {
  const errs = [];
  if (!p.name) errs.push(`${label}: full name is required.`);
  if (!p.collegeId) errs.push(`${label}: college ID is required.`);
  if (!p.idNumber) {
    errs.push(`${label}: ${p.idType === 'passport' ? 'passport' : 'Emirates ID'} number is required.`);
  } else if (p.idType === 'emirates' && !normaliseEmiratesId(p.idNumber)) {
    errs.push(`${label}: Emirates ID must be 15 digits starting with 784 (e.g. 784-2003-1234567-1).`);
  } else if (p.idType === 'passport' && !normalisePassport(p.idNumber)) {
    errs.push(`${label}: passport number should be 5–20 letters/digits.`);
  }
  return errs;
}

/**
 * Cleans and validates a raw submission.
 * Returns { data, errors } — data is only meaningful when errors is empty.
 */
export function validateRegistration(raw) {
  const errors = [];
  const r = raw || {};

  const data = {
    university: clean(r.university, 150),
    coordinator: {
      name: clean(r.coordinator?.name, 120),
      phone: clean(r.coordinator?.phone, 30),
      email: clean(r.coordinator?.email, 150).toLowerCase(),
    },
    sportId: clean(r.sportId, 40),
    captain: {
      ...cleanPlayer(r.captain),
      phone: clean(r.captain?.phone, 30),
      email: clean(r.captain?.email, 150).toLowerCase(),
    },
    players: Array.isArray(r.players) ? r.players.slice(0, 40).map(cleanPlayer) : [],
  };

  if (!data.university) errors.push('University name is required.');
  if (!data.coordinator.name) errors.push('Coordinator name is required.');
  if (!isValidPhone(data.coordinator.phone)) errors.push('Coordinator mobile number looks invalid.');
  if (!isValidEmail(data.coordinator.email)) errors.push('Coordinator email looks invalid.');

  const sport = sportById(data.sportId);
  if (!sport) {
    errors.push('Please choose a sport.');
    return { data, errors };
  }

  errors.push(...playerErrors(data.captain, 'Captain'));
  if (!isValidPhone(data.captain.phone)) errors.push('Captain mobile number looks invalid.');
  if (!isValidEmail(data.captain.email)) errors.push('Captain email looks invalid.');

  data.players.forEach((p, i) => errors.push(...playerErrors(p, `Player ${i + 2}`)));

  const total = data.players.length + 1;
  if (total < sport.min || total > sport.max) {
    errors.push(`${sport.name} needs ${sport.min}–${sport.max} players including the captain (you have ${total}).`);
  }

  // Normalise ID numbers and catch the same person entered twice.
  const roster = [data.captain, ...data.players];
  for (const p of roster) {
    const n = p.idType === 'passport' ? normalisePassport(p.idNumber) : normaliseEmiratesId(p.idNumber);
    if (n) p.idNumber = n;
  }
  const seen = new Set();
  for (const p of roster) {
    if (!p.idNumber) continue;
    if (seen.has(p.idNumber)) errors.push(`ID number ${p.idNumber} is listed more than once.`);
    seen.add(p.idNumber);
  }

  data.sportName = sport.name;
  return { data, errors };
}
