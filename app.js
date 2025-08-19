// Quick Cal File — client-side ICS generator

(function () {
  const form = document.getElementById('event-form');
  const bulkWrap = document.getElementById('bulkWrap');
  const bulkList = document.getElementById('bulkList');
  const bulkAddBtn = document.getElementById('bulkAddBtn');
  const bulkPaste = document.getElementById('bulkPaste');
  const bulkParseBtn = document.getElementById('bulkParseBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const resetBtn = document.getElementById('resetBtn');
  const errorEl = document.getElementById('error');
  const recapEl = document.getElementById('recap');
  const themeToggleBtn = document.getElementById('themeToggle');

  function showError(message) { errorEl.textContent = message; }
  function clearError() { showError(''); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function formatDateToBasic(date) { return date.getFullYear().toString() + pad2(date.getMonth() + 1) + pad2(date.getDate()); }
  function formatTimeToBasic(hours, minutes) { return pad2(hours) + pad2(minutes) + '00'; }
  function escapeICSText(value) { if (!value) return ''; return value.replace(/\\/g, '\\').replace(/\n/g, '\n').replace(/,/g, '\,').replace(/;/g, '\;'); }
  function foldICSLines(raw) { const maxLen = 75; const lines = raw.split('\r\n'); const out = []; for (const line of lines) { if (line.length <= maxLen) { out.push(line); continue; } let i = 0; while (i < line.length) { const chunk = line.slice(i, i + maxLen); out.push(i === 0 ? chunk : (' ' + chunk)); i += maxLen; } } return out.join('\r\n'); }

  function parseDateOnly(value) {
    if (!value) return null; const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) { const [y, m, d] = raw.split('-').map(Number); return new Date(y, m - 1, d); }
    const slash = raw.replace(/\s+/g, '');
    const mdymatch = slash.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdymatch) {
      let a = Number(mdymatch[1]);
      let b = Number(mdymatch[2]);
      const yy = Number(mdymatch[3]);
      // Prefer MM/DD/YYYY, but if first part > 12, treat as DD/MM/YYYY
      let mm = a;
      let dd = b;
      if (a > 12 && b <= 12) { mm = b; dd = a; }
      return new Date(yy, mm - 1, dd);
    }
    const cleaned = raw.replace(/^\s*(Monday|Mon|Tuesday|Tues|Tue|Wednesday|Wed|Thursday|Thurs|Thu|Friday|Fri|Saturday|Sat|Sunday|Sun)\s*,?\s*/i, '').replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
    const monthNames = { january:0,jan:0,february:1,feb:1,march:2,mar:2,april:3,apr:3,may:4,june:5,jun:5,july:6,jul:6,august:7,aug:7,september:8,sept:8,sep:8,october:9,oct:9,november:10,nov:10,december:11,dec:11 };
    const mdy2 = cleaned.match(/^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?$/i);
    if (mdy2) { const mi = monthNames[mdy2[1].toLowerCase()]; const day = Number(mdy2[2]); const ys = mdy2[3]; if (ys) return new Date(Number(ys), mi, day); const now = new Date(); const cand = new Date(now.getFullYear(), mi, day); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return cand < today ? new Date(now.getFullYear() + 1, mi, day) : cand; }
    return null;
  }

  function formatHumanDate(date) { const y = date.getFullYear(); const m = date.toLocaleString(undefined, { month: 'short' }); const d = date.getDate(); return `${m} ${d}, ${y}`; }
  function formatTimeHuman(hhmm) { if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return ''; const [h, m] = hhmm.split(':').map(Number); const ampm = h >= 12 ? 'PM' : 'AM'; let h12 = h % 12; if (h12 === 0) h12 = 12; return `${h12}:${pad2(m)} ${ampm}`; }

  function refreshRecap() {
    if (!recapEl) return; const rows = bulkList ? Array.from(bulkList.querySelectorAll('.bulk-row')) : []; const count = rows.length;
    if (count === 0) { recapEl.textContent = 'Paste dates and build your table to see a recap.'; return; }
    const dates = rows.map(r => parseDateOnly((r.querySelector('.bulk-date')||{}).value || '')).filter(Boolean).sort((a,b)=>a-b);
    if (dates.length === 0) { recapEl.textContent = `${count} row${count>1?'s':''} ready.`; return; }
    const first = dates[0]; const last = dates[dates.length - 1]; recapEl.textContent = count === 1 ? `1 event on ${formatHumanDate(first)}` : `${count} events (${formatHumanDate(first)} to ${formatHumanDate(last)})`;
  }

  function validate() { const rows = bulkList ? Array.from(bulkList.querySelectorAll('.bulk-row')) : []; if (rows.length === 0) return 'Add at least one row.'; for (const row of rows) { const title = (row.querySelector('.bulk-title') || {}).value?.trim?.() || ''; const date = (row.querySelector('.bulk-date') || {}).value || ''; const start = (row.querySelector('.bulk-start') || {}).value || ''; const end = (row.querySelector('.bulk-end') || {}).value || ''; const isTimed = row.classList.contains('is-times'); if (!title || !date) return 'Each row needs a title and date.'; if (isTimed) { if (!start || !end) return 'Provide start and end times or select All day.'; const [sh, sm] = start.split(':').map(Number); const [eh, em] = end.split(':').map(Number); if (eh * 60 + em <= sh * 60 + sm) return 'Row end time must be after start time.'; } } return ''; }

  function generateICS() { const now = new Date(); const dtStampUtc = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z'); const calLines = [ 'BEGIN:VCALENDAR', 'PRODID:-//Quick Cal File//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Quick Cal File', 'X-WR-CALDESC:Generated with Quick Cal File' ]; const baseUid = Math.random().toString(36).slice(2); const rows = bulkList ? Array.from(bulkList.querySelectorAll('.bulk-row')) : []; rows.forEach((row, i) => { const titleRaw = (row.querySelector('.bulk-title') || {}).value || ''; const dateVal = (row.querySelector('.bulk-date') || {}).value || ''; const startVal = (row.querySelector('.bulk-start') || {}).value || ''; const endVal = (row.querySelector('.bulk-end') || {}).value || ''; const locRaw = (row.querySelector('.bulk-loc') || {}).value || ''; const isTimed = row.classList.contains('is-times'); const date = parseDateOnly(dateVal); if (!date || isNaN(date.getTime())) return; const dateBasic = formatDateToBasic(date); let dtStartLine = ''; let dtEndLine = ''; if (!isTimed || (!startVal && !endVal)) { const endAllDay = new Date(date); endAllDay.setDate(endAllDay.getDate() + 1); dtStartLine = `DTSTART;VALUE=DATE:${dateBasic}`; dtEndLine = `DTEND;VALUE=DATE:${formatDateToBasic(endAllDay)}`; } else { const [lsh, lsm] = (startVal || '00:00').split(':').map(Number); const [leh, lem] = (endVal || '00:00').split(':').map(Number); const dtStart = `${dateBasic}T${formatTimeToBasic(lsh, lsm)}`; const dtEnd = `${dateBasic}T${formatTimeToBasic(leh, lem)}`; dtStartLine = `DTSTART:${dtStart}`; dtEndLine = `DTEND:${dtEnd}`; } const uid = `${dateBasic}-${i}-${baseUid}@quickcalfile.local`; const title = escapeICSText(titleRaw.trim() || 'Event'); const loc = escapeICSText(locRaw.trim()); calLines.push('BEGIN:VEVENT'); calLines.push(`UID:${uid}`); calLines.push(`DTSTAMP:${dtStampUtc}`); calLines.push(dtStartLine); calLines.push(dtEndLine); calLines.push(`SUMMARY:${title}`); if (loc) calLines.push(`LOCATION:${loc}`); calLines.push('END:VEVENT'); }); calLines.push('END:VCALENDAR'); const raw = calLines.join('\r\n') + '\r\n'; return foldICSLines(raw); }

  downloadBtn.addEventListener('click', () => { clearError(); const error = validate(); if (error) { showError(error); return; } const ics = generateICS(); let baseName = 'events'; const firstTitle = (bulkList.querySelector('.bulk-title') || {}).value || ''; if (firstTitle.trim()) baseName = firstTitle.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, ''); const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${baseName || 'quick-cal-file'}.ics`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });

  function closeTimePopover() { document.querySelectorAll('.time-popover, .time-popover-overlay').forEach(el => el.remove()); }
  function updatePill(pill, row) { const display = row.querySelector('.time-display'); if (!row.classList.contains('is-times')) { pill.textContent = 'All day'; if (display) display.textContent = ''; return; } const s = (row.querySelector('.bulk-start') || {}).value || ''; const e = (row.querySelector('.bulk-end') || {}).value || ''; const text = s && e ? `${formatTimeHuman(s)} – ${formatTimeHuman(e)}` : 'Time'; pill.textContent = text; if (display) display.textContent = s && e ? text : ''; }

  function openTimePopover(pill, row) { closeTimePopover(); const overlay = document.createElement('div'); overlay.className = 'time-popover-overlay'; const pop = document.createElement('div'); pop.className = 'time-popover'; pop.innerHTML = `
      <div class="row"><span class="label">All day</span> <label class="all-day-label"><input class="pp-all-day" type="checkbox" ${row.classList.contains('is-times') ? '' : 'checked'} /> All day</label></div>
      <div class="row"><span class="label">Start</span> <input class="pp-start" type="time" /></div>
      <div class="row"><span class="label">End</span> <input class="pp-end" type="time" /></div>
      <div class="actions"><button class="btn btn-ghost pp-cancel" type="button">Cancel</button><button class="btn btn-primary pp-apply" type="button">Apply</button></div>
    `; document.body.appendChild(overlay); document.body.appendChild(pop); overlay.style.display = 'block'; const rect = pill.getBoundingClientRect(); pop.style.top = `${rect.bottom + 8 + window.scrollY}px`; pop.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 320)}px`; const allDay = pop.querySelector('.pp-all-day'); const start = pop.querySelector('.pp-start'); const end = pop.querySelector('.pp-end'); const applyBtn = pop.querySelector('.pp-apply'); const startVal = (row.querySelector('.bulk-start') || {}).value || ''; const endVal = (row.querySelector('.bulk-end') || {}).value || ''; if (startVal) start.value = startVal; if (endVal) end.value = endVal; function syncState() { const timed = !allDay.checked; start.disabled = !timed; end.disabled = !timed; if (!timed) { applyBtn.disabled = false; return; } const ok = !!start.value && !!end.value && (end.value > start.value); applyBtn.disabled = !ok; } function apply() { if (allDay.checked) { switchToAllDay(row); updatePill(pill, row); closeTimePopover(); return; } switchToTimes(row); const s = row.querySelector('.bulk-start'); const e = row.querySelector('.bulk-end'); s.value = start.value; e.value = end.value; updatePill(pill, row); closeTimePopover(); } pop.querySelector('.pp-apply').addEventListener('click', apply); pop.querySelector('.pp-cancel').addEventListener('click', () => closeTimePopover()); allDay.addEventListener('change', syncState); start.addEventListener('input', syncState); end.addEventListener('input', syncState); syncState(); }

  function switchToTimes(row) { row.classList.add('is-times'); const cell = row.querySelector('.time-group'); cell.innerHTML = `
      <div>
        <button type="button" class="time-pill" aria-haspopup="dialog">Time</button>
        <div class="time-display"></div>
      </div>
      <input class="bulk-start" type="time" style="display:none" />
      <input class="bulk-end" type="time" style="display:none" />
    `; const pill = cell.querySelector('.time-pill'); pill.addEventListener('click', () => openTimePopover(pill, row)); updatePill(pill, row); }

  function switchToAllDay(row) { row.classList.remove('is-times'); const cell = row.querySelector('.time-group'); cell.innerHTML = `<div><button type="button" class="time-pill" aria-haspopup="dialog">All day</button><div class="time-display"></div></div><input class="bulk-start" type="time" style="display:none" /><input class="bulk-end" type="time" style="display:none" />`; const pill = cell.querySelector('.time-pill'); pill.addEventListener('click', () => openTimePopover(pill, row)); }

  function createBulkRow() { const row = document.createElement('div'); row.className = 'bulk-row'; row.innerHTML = `
      <div><input class="bulk-date" type="date" /></div>
      <div><input class="bulk-title" type="text" placeholder="Title"/></div>
      <div class="time-group"></div>
      <div><input class="bulk-loc" type="text" placeholder="Location"/></div>
      <div class="bulk-actions"><button type="button" class="btn btn-ghost remove">Remove</button></div>
    `; row.querySelector('.remove').addEventListener('click', () => { row.remove(); refreshRecap(); }); ['input','change'].forEach(evt => { row.querySelectorAll('input').forEach(el => el.addEventListener(evt, refreshRecap)); }); switchToAllDay(row); return row; }

  if (bulkAddBtn && bulkList) { bulkAddBtn.addEventListener('click', () => { bulkList.appendChild(createBulkRow()); refreshRecap(); }); }

  function parseManyDates(text) { const lines = (text || '').split(/\n|\r|,|;|\t/).map(s => s.trim()).filter(Boolean); const dates = []; for (const token of lines) { const d = parseDateOnly(token); if (d && !isNaN(d.getTime())) dates.push(d); } const unique = Array.from(new Map(dates.map(d => [formatDateToBasic(d), d])).values()); unique.sort((a,b) => a - b); return unique; }

  if (bulkParseBtn && bulkList && bulkPaste) { bulkParseBtn.addEventListener('click', () => { const dates = parseManyDates(bulkPaste.value); if (dates.length === 0) { showError('No valid dates found. Use D/M/YYYY or Month Day (optional weekday/year).'); return; } clearError(); dates.forEach(d => { const row = createBulkRow(); const dateInput = row.querySelector('.bulk-date'); const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); dateInput.value = `${y}-${m}-${day}`; bulkList.appendChild(row); }); refreshRecap(); }); }

  function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); if (themeToggleBtn) { if (theme === 'dark') { themeToggleBtn.textContent = '☀️ Light'; themeToggleBtn.setAttribute('aria-label', 'Switch to light mode'); } else { themeToggleBtn.textContent = '🌙 Dark'; themeToggleBtn.setAttribute('aria-label', 'Switch to dark mode'); } } }
  function initTheme() { const stored = localStorage.getItem('qcf-theme'); const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; const theme = stored || (prefersDark ? 'dark' : 'light'); applyTheme(theme); }
  if (themeToggleBtn) { themeToggleBtn.addEventListener('click', () => { const current = document.documentElement.getAttribute('data-theme') || 'light'; const next = current === 'dark' ? 'light' : 'dark'; applyTheme(next); try { localStorage.setItem('qcf-theme', next); } catch (_) {} }); }

  ['input','change'].forEach(evt => { [bulkList, bulkPaste].filter(Boolean).forEach(el => el.addEventListener(evt, refreshRecap)); });

  (function initDefaults() { refreshRecap(); initTheme(); const details = document.getElementById('extractSection'); if (details && details.hasAttribute('open')) details.removeAttribute('open'); })();

  // Extract dates from free text
  const extractInput = document.getElementById('extractInput');
  const extractBtn = document.getElementById('extractBtn');
  const extractReset = document.getElementById('extractReset');
  const extractOutput = document.getElementById('extractOutput');
  const extractCopy = document.getElementById('extractCopy');
  const extractError = document.getElementById('extractError');

  function extractDatesFromText(text) { const tokens = []; const parts = String(text || '').split(/\s+|,|;|\n|\r|\t/).filter(Boolean); for (let i = 0; i < parts.length; i++) { const one = parts[i]; const two = parts[i + 1] || ''; const three = parts[i + 2] || ''; const cand2 = `${one} ${two}`; const cand3 = `${one} ${two} ${three}`; const slash = one; [slash, cand2, cand3].forEach(c => tokens.push(c.replace(/\s+/g, ' ').trim())); } const dates = []; for (const t of tokens) { const clean = t.replace(/\s*,\s*(?=\d{4}\b)/, ', '); const d = parseDateOnly(clean); if (d && !isNaN(d.getTime())) dates.push(d); } const unique = Array.from(new Map(dates.map(d => [formatDateToBasic(d), d])).values()); unique.sort((a,b) => a - b); return unique.map(d => `${pad2(d.getMonth()+1)}/${pad2(d.getDate())}/${d.getFullYear()}`).join('\n'); }

  if (extractBtn) extractBtn.addEventListener('click', () => { if (!extractInput || !extractOutput) return; extractError.textContent = ''; try { const out = extractDatesFromText(extractInput.value || ''); if (!out) extractError.textContent = 'No dates found.'; extractOutput.value = out; } catch (e) { extractError.textContent = 'Could not extract dates.'; } });
  if (extractReset) extractReset.addEventListener('click', () => { if (extractInput) extractInput.value = ''; if (extractOutput) extractOutput.value = ''; if (extractError) extractError.textContent = ''; });
  if (extractCopy) extractCopy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(extractOutput?.value || ''); } catch {} });
})();


