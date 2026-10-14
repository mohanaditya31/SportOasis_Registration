/**
 * SportOasis 2026 — registration receiver.
 *
 * Paste this into the Apps Script editor of your Google Sheet
 * (Extensions → Apps Script), set the SHARED_SECRET script property,
 * then Deploy → New deployment → Web app (Execute as: Me, Access: Anyone).
 * See README.md for the full steps.
 *
 * It writes to two tabs, creating them on first use:
 *   Teams   – one row per team registration
 *   Players – one row per player (captain first), linked by Reference
 */

const TEAMS_SHEET = 'Teams';
const PLAYERS_SHEET = 'Players';

const TEAMS_HEADERS = [
  'Submitted at', 'Reference', 'University', 'Sport',
  'Coordinator name', 'Coordinator mobile', 'Coordinator email',
  'Captain name', 'Captain mobile', 'Captain email',
  'Players (incl. captain)', 'Team list', 'Possible duplicate',
];

const PLAYERS_HEADERS = [
  'Reference', 'University', 'Sport', '#', 'Role',
  'Full name', 'College ID', 'ID type', 'ID number',
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
    if (!secret || body.secret !== secret) return json_({ ok: false, error: 'Unauthorised.' });

    const r = body.registration;
    if (!r || !r.university || !r.sportName || !r.captain) {
      return json_({ ok: false, error: 'Incomplete registration.' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const teams = sheet_(ss, TEAMS_SHEET, TEAMS_HEADERS);
      const players = sheet_(ss, PLAYERS_SHEET, PLAYERS_HEADERS);

      const reference = 'SO26-' + Utilities.getUuid().slice(0, 6).toUpperCase();
      const roster = [r.captain].concat(r.players || []);
      const duplicate = isDuplicate_(teams, r.university, r.sportName);

      const teamList = roster
        .map((p, i) => (i + 1) + '. ' + p.name + ' / ' + p.collegeId + ' / ' + p.idNumber +
          (p.idType === 'passport' ? ' (passport)' : ''))
        .join('\n');

      teams.appendRow([
        new Date(), reference, safe_(r.university), r.sportName,
        safe_(r.coordinator.name), safe_(r.coordinator.phone), safe_(r.coordinator.email),
        safe_(r.captain.name), safe_(r.captain.phone), safe_(r.captain.email),
        roster.length, safe_(teamList), duplicate ? 'YES' : '',
      ]);

      const rows = roster.map((p, i) => [
        reference, safe_(r.university), r.sportName, i + 1, i === 0 ? 'Captain' : 'Player',
        safe_(p.name), safe_(p.collegeId), p.idType === 'passport' ? 'Passport' : 'Emirates ID', safe_(p.idNumber),
      ]);
      players.getRange(players.getLastRow() + 1, 1, rows.length, PLAYERS_HEADERS.length).setValues(rows);

      return json_({ ok: true, reference: reference, duplicate: duplicate });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Server error while saving.' });
  }
}

// Lets you open the /exec URL in a browser to check the deployment is live.
function doGet() {
  return json_({ ok: true, service: 'SportOasis registration' });
}

function sheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function isDuplicate_(teams, university, sportName) {
  const last = teams.getLastRow();
  if (last < 2) return false;
  const values = teams.getRange(2, 3, last - 1, 2).getValues(); // University, Sport
  const u = String(university).trim().toLowerCase();
  return values.some((row) => String(row[0]).trim().toLowerCase() === u && row[1] === sportName);
}

// Stop values like "=IMPORTXML(...)" or "+971..." being interpreted as formulas.
function safe_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
