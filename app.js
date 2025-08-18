// Quick Cal File — client-side ICS generator

(function () {
  const form = document.getElementById('event-form');
  const summaryInput = document.getElementById('summary');
  const locationInput = document.getElementById('location');
  const descriptionInput = document.getElementById('description');
  const isAllDayInput = document.getElementById('isAllDay');
  const isRecurringInput = document.getElementById('isRecurring');
  const isSpecificInput = document.getElementById('isSpecific');
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const startTimeInput = document.getElementById('startTime');
  const endTimeInput = document.getElementById('endTime');
  const weekdayWrap = document.getElementById('weekdayWrap');
  const specificDatesWrap = document.getElementById('specificDatesWrap');
  const specificDatesInput = document.getElementById('specificDates');
  const startTimeWrap = document.getElementById('startTimeWrap');
  const endTimeWrap = document.getElementById('endTimeWrap');
  const endDateWrap = document.getElementById('endDateWrap');
  const startDateWrap = document.getElementById('startDateWrap');
  const downloadBtn = document.getElementById('downloadBtn');
  const resetBtn = document.getElementById('resetBtn');
  const errorEl = document.getElementById('error');
  const recapEl = document.getElementById('recap');
  const themeToggleBtn = document.getElementById('themeToggle');

  function setControlsVisibility() {
    const isAllDay = isAllDayInput.checked;
    const isRecurring = isRecurringInput.checked;
    const isSpecific = isSpecificInput && isSpecificInput.checked;

    startTimeWrap.style.display = isAllDay ? 'none' : '';
    endTimeWrap.style.display = isAllDay ? 'none' : '';
    weekdayWrap.style.display = (!isSpecific && isRecurring) ? '' : 'none';
    endDateWrap.style.display = (!isSpecific && isRecurring) ? '' : 'none';
    specificDatesWrap.style.display = isSpecific ? '' : 'none';
    startDateWrap.style.display = isSpecific ? 'none' : '';

    endDateInput.required = (!isSpecific && isRecurring);
    if (!isRecurring || isSpecific) {
      // If not recurring, end date should mirror start date (single-day event)
      endDateInput.value = '';
    }
  }

  isAllDayInput.addEventListener('change', setControlsVisibility);
  isRecurringInput.addEventListener('change', setControlsVisibility);
  if (isSpecificInput) isSpecificInput.addEventListener('change', setControlsVisibility);

  resetBtn.addEventListener('click', () => {
    form.reset();
    isRecurringInput.checked = true;
    setControlsVisibility();
    errorEl.textContent = '';
    refreshRecap();
  });

  function showError(message) {
    errorEl.textContent = message;
  }

  function clearError() {
    showError('');
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatDateToBasic(date) {
    return (
      date.getFullYear().toString() +
      pad2(date.getMonth() + 1) +
      pad2(date.getDate())
    );
  }

  function formatTimeToBasic(hours, minutes) {
    return pad2(hours) + pad2(minutes) + '00';
  }

  function escapeICSText(value) {
    if (!value) return '';
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function foldICSLines(raw) {
    // Fold lines to 75 octets (approximate by characters). Add CRLF + space for continuation.
    const maxLen = 75;
    const lines = raw.split('\r\n');
    const folded = [];
    for (const line of lines) {
      if (line.length <= maxLen) {
        folded.push(line);
        continue;
      }
      let start = 0;
      while (start < line.length) {
        const chunk = line.slice(start, start + maxLen);
        if (start === 0) {
          folded.push(chunk);
        } else {
          folded.push(' ' + chunk);
        }
        start += maxLen;
      }
    }
    return folded.join('\r\n');
  }

  function getSelectedWeekdays() {
    const checks = weekdayWrap.querySelectorAll('input[type="checkbox"]');
    const result = [];
    checks.forEach(ch => { if (ch.checked) result.push(Number(ch.value)); });
    return result;
  }

  function parseDateOnly(value) {
    // Supports YYYY-MM-DD, M/D/YY, M/D/YYYY
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const mdy = value.replace(/\s+/g, '');
    const mdyMatch = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (mdyMatch) {
      const mm = Number(mdyMatch[1]);
      const dd = Number(mdyMatch[2]);
      let yy = Number(mdyMatch[3]);
      if (yy < 100) yy += 2000;
      return new Date(yy, mm - 1, dd);
    }
    return null;
  }

  function buildOccurrences() {
    const isRecurring = isRecurringInput.checked;
    const isSpecific = isSpecificInput && isSpecificInput.checked;
    const startDateStr = startDateInput.value;

    if (isSpecific) {
      const lines = (specificDatesInput.value || '').split(/\n|\r/).map(s => s.trim()).filter(Boolean);
      const dates = [];
      for (const line of lines) {
        const d = parseDateOnly(line);
        if (d && !isNaN(d.getTime())) {
          dates.push(d);
        }
      }
      // Deduplicate and sort
      const unique = Array.from(new Map(dates.map(d => [formatDateToBasic(d), d])).values());
      unique.sort((a, b) => a - b);
      return unique;
    }

    if (!startDateStr) return [];
    const startDate = parseDateOnly(startDateStr);

    if (!isRecurring) {
      return [startDate];
    }

    const endDateStr = endDateInput.value;
    if (!endDateStr) return [];
    const endDate = parseDateOnly(endDateStr);

    const selectedDays = getSelectedWeekdays();
    if (selectedDays.length === 0) return [];

    const days = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (selectedDays.includes(d.getDay())) {
        days.push(new Date(d));
      }
    }
    return days;
  }

  function formatHumanDate(date) {
    const y = date.getFullYear();
    const m = date.toLocaleString(undefined, { month: 'short' });
    const d = date.getDate();
    return `${m} ${d}, ${y}`;
  }

  function formatHumanTime(hh, mm) {
    const date = new Date();
    date.setHours(hh, mm, 0, 0);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function refreshRecap() {
    if (!recapEl) return;
    const name = summaryInput.value.trim() || 'Untitled event';
    const place = locationInput.value.trim();
    const isSpecific = isSpecificInput && isSpecificInput.checked;
    const isRecurring = isRecurringInput.checked;
    const isAllDay = isAllDayInput.checked;

    const occurrences = buildOccurrences();
    const count = occurrences.length;

    let datePart = '';
    if (isSpecific && count > 0) {
      const first = occurrences[0];
      const last = occurrences[occurrences.length - 1];
      if (count === 1) {
        datePart = `on ${formatHumanDate(first)}`;
      } else {
        datePart = `on ${count} specific date${count > 1 ? 's' : ''} (${formatHumanDate(first)} to ${formatHumanDate(last)})`;
      }
    } else if (!isSpecific) {
      const startStr = startDateInput.value;
      const endStr = endDateInput.value;
      if (startStr) {
        const start = parseDateOnly(startStr);
        if (isRecurring && endStr) {
          const end = parseDateOnly(endStr);
          datePart = `from ${formatHumanDate(start)} to ${formatHumanDate(end)}`;
        } else {
          datePart = `on ${formatHumanDate(start)}`;
        }
      }
    }

    let daysPart = '';
    if (!isSpecific && isRecurring) {
      const map = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const days = getSelectedWeekdays().map(i => map[i]).join('/');
      if (days) daysPart = ` on ${days}`;
    }

    let timePart = '';
    if (!isAllDay) {
      const [sh, sm] = (startTimeInput.value || '00:00').split(':').map(Number);
      const [eh, em] = (endTimeInput.value || '00:00').split(':').map(Number);
      timePart = ` from ${formatHumanTime(sh, sm)} to ${formatHumanTime(eh, em)}`;
    } else {
      timePart = ' (all day)';
    }

    const wherePart = place ? ` at ${place}` : '';
    const totalPart = count > 1 ? ` • ${count} event${count>1?'s':''}` : '';

    recapEl.textContent = `${name}${daysPart} ${datePart}${timePart}${wherePart}${totalPart}`.trim();
  }

  function validate() {
    if (!summaryInput.value.trim()) return 'Please enter an event name.';

    const isSpecific = isSpecificInput && isSpecificInput.checked;
    const isRecurring = isRecurringInput.checked;
    const isAllDay = isAllDayInput.checked;

    if (isSpecific) {
      const oc = buildOccurrences();
      if (oc.length === 0) return 'Enter at least one valid date (YYYY-MM-DD or M/D/YYYY).';
    } else {
      if (!startDateInput.value) return 'Please choose a start date.';
      if (isRecurring) {
        if (!endDateInput.value) return 'Please choose an end date for the repeating events.';
        const selectedDays = getSelectedWeekdays();
        if (selectedDays.length === 0) return 'Select at least one weekday.';
        const start = parseDateOnly(startDateInput.value);
        const end = parseDateOnly(endDateInput.value);
        if (end < start) return 'End date must be after start date.';
      }
    }

    if (!isAllDay) {
      if (!startTimeInput.value || !endTimeInput.value) return 'Please provide start and end times or mark as All-day.';
      const [sh, sm] = startTimeInput.value.split(':').map(Number);
      const [eh, em] = endTimeInput.value.split(':').map(Number);
      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;
      if (endMinutes <= startMinutes) return 'End time must be after start time.';
    }
    return '';
  }

  function generateICS() {
    const now = new Date();
    const dtStampUtc = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, 'Z');

    const isAllDay = isAllDayInput.checked;
    const isRecurring = isRecurringInput.checked;
    const occurrences = buildOccurrences();
    const [sh, sm] = (startTimeInput.value || '00:00').split(':').map(Number);
    const [eh, em] = (endTimeInput.value || '00:00').split(':').map(Number);

    const summary = escapeICSText(summaryInput.value.trim());
    const location = escapeICSText(locationInput.value.trim());
    const description = escapeICSText(descriptionInput.value.trim());

    const calLines = [
      'BEGIN:VCALENDAR',
      'PRODID:-//Quick Cal File//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Quick Cal File',
      'X-WR-CALDESC:Generated with Quick Cal File',
    ];

    const baseUid = Math.random().toString(36).slice(2);

    for (let i = 0; i < occurrences.length; i++) {
      const d = occurrences[i];
      const dateBasic = formatDateToBasic(d);
      let dtStartLine = '';
      let dtEndLine = '';

      if (isAllDay) {
        const endAllDay = new Date(d);
        endAllDay.setDate(endAllDay.getDate() + 1); // Non-inclusive end
        dtStartLine = `DTSTART;VALUE=DATE:${dateBasic}`;
        dtEndLine = `DTEND;VALUE=DATE:${formatDateToBasic(endAllDay)}`;
      } else {
        const dtStart = `${dateBasic}T${formatTimeToBasic(sh, sm)}`;
        const dtEnd = `${dateBasic}T${formatTimeToBasic(eh, em)}`;
        dtStartLine = `DTSTART:${dtStart}`; // Floating local time (no TZ)
        dtEndLine = `DTEND:${dtEnd}`;
      }

      const uid = `${dateBasic}-${i}-${baseUid}@quickcalfile.local`;

      calLines.push('BEGIN:VEVENT');
      calLines.push(`UID:${uid}`);
      calLines.push(`DTSTAMP:${dtStampUtc}`);
      calLines.push(dtStartLine);
      calLines.push(dtEndLine);
      calLines.push(`SUMMARY:${summary}`);
      if (location) calLines.push(`LOCATION:${location}`);
      if (description) calLines.push(`DESCRIPTION:${description}`);
      calLines.push('END:VEVENT');
    }

    calLines.push('END:VCALENDAR');

    const raw = calLines.join('\r\n') + '\r\n';
    return foldICSLines(raw);
  }

  function downloadICS(content) {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const baseName = (summaryInput.value.trim() || 'event').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
    a.href = url;
    a.download = `${baseName || 'quick-cal-file'}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  downloadBtn.addEventListener('click', () => {
    clearError();
    const error = validate();
    if (error) {
      showError(error);
      return;
    }
    const ics = generateICS();
    downloadICS(ics);
  });

  // Theme toggle and persistence
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeToggleBtn) {
      if (theme === 'dark') {
        themeToggleBtn.textContent = '☀️ Light';
        themeToggleBtn.setAttribute('aria-label', 'Switch to light mode');
      } else {
        themeToggleBtn.textContent = '🌙 Dark';
        themeToggleBtn.setAttribute('aria-label', 'Switch to dark mode');
      }
    }
  }

  function initTheme() {
    const stored = localStorage.getItem('qcf-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem('qcf-theme', next); } catch (_) {}
    });
  }

  // Live recap updates
  ['input','change'].forEach(evt => {
    [summaryInput, locationInput, descriptionInput, isAllDayInput, isRecurringInput, startDateInput, endDateInput, startTimeInput, endTimeInput, specificDatesInput, isSpecificInput]
      .filter(Boolean)
      .forEach(el => el.addEventListener(evt, refreshRecap));
  });

  // Prefill some helpful defaults
  (function initDefaults() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    startDateInput.value = `${y}-${m}-${d}`;

    // Preselect Tue/Thu for convenience
    const chips = weekdayWrap.querySelectorAll('input[type="checkbox"]');
    chips.forEach(ch => {
      if (ch.value === '2' || ch.value === '4') ch.checked = true;
    });

    setControlsVisibility();
    refreshRecap();
    initTheme();
  })();
})();


