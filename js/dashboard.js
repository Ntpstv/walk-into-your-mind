/**
 * Dashboard — fetches the team's response Sheet (published to the web as
 * CSV) and renders it as a corkboard grouped by question. No backend: the
 * Sheet itself is the only data source, refetched on load and on demand.
 */
(() => {
  'use strict';

  // Fill in after: Google Sheet > File > Share > Publish to web > select the
  // responses tab > CSV format > Publish > copy the resulting URL here.
  const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSUv1AI7iR6jZn1gFoatSsfcSXCteWT3FLwPXPHIt1fva_tssOCn7r1qHYfzkbey3ndV9T_i-xT9SC4/pub?gid=988729758&single=true&output=csv';

  const SKIP_HEADERS = ['Timestamp', 'Email Address'];
  const GRAPH_DATA_URL_PREFIX = 'data:image/png;base64,';

  /** Minimal RFC4180-style CSV parser — handles quoted fields containing commas/newlines. */
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          field += '"';
          i += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\r') {
        // ignored; line breaks are handled on \n below (covers \r\n endings)
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.length > 1 || r[0] !== '');
  }

  /** Finds the graph column by content (a base64 PNG prefix), not by header text — stays correct even if the question is renamed. */
  function findGraphColumn(headers, dataRows) {
    for (let c = 0; c < headers.length; c += 1) {
      for (const row of dataRows) {
        if (row[c] && row[c].indexOf(GRAPH_DATA_URL_PREFIX) === 0) return c;
      }
    }
    return -1;
  }

  function groupResponses(rows) {
    if (rows.length === 0) return { groups: [], total: 0 };
    const headers = rows[0];
    const dataRows = rows.slice(1);
    const graphCol = findGraphColumn(headers, dataRows);

    const groups = headers
      .map((header, index) => ({
        header,
        isGraph: index === graphCol,
        answers: dataRows.map((row) => (row[index] || '').trim()).filter(Boolean),
      }))
      .filter((g) => !SKIP_HEADERS.includes(g.header));

    return { groups, total: dataRows.length };
  }

  function buildNote(text) {
    const note = document.createElement('div');
    note.className = 'dash-note';
    note.textContent = text;
    return note;
  }

  function buildImageCard(dataUrl) {
    const card = document.createElement('div');
    card.className = 'dash-image-card';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'เส้นกราฟความรู้สึกที่วาดไว้';
    img.loading = 'lazy';
    card.appendChild(img);
    return card;
  }

  function renderDashboard(rows) {
    const { groups, total } = groupResponses(rows);
    const content = document.getElementById('dashContent');
    const countEl = document.getElementById('dashCount');

    countEl.textContent = `ทั้งหมด ${total} คำตอบ`;
    content.innerHTML = '';

    if (total === 0) {
      content.innerHTML = '<p class="dash-status">ยังไม่มีคำตอบเข้ามาเลยตอนนี้</p>';
      return;
    }

    groups.forEach((group) => {
      const section = document.createElement('section');
      section.className = 'dash-section';

      const heading = document.createElement('h2');
      heading.className = 'dash-question';
      heading.textContent = group.header;
      section.appendChild(heading);

      const board = document.createElement('div');
      board.className = 'dash-board';

      if (group.answers.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'dash-empty';
        empty.textContent = 'ยังไม่มีใครตอบข้อนี้เลย';
        board.appendChild(empty);
      } else if (group.isGraph) {
        group.answers.forEach((dataUrl) => board.appendChild(buildImageCard(dataUrl)));
      } else {
        group.answers.forEach((text) => board.appendChild(buildNote(text)));
      }

      section.appendChild(board);
      content.appendChild(section);
    });
  }

  function showError(message) {
    document.getElementById('dashContent').innerHTML = `<div class="dash-error">${message}</div>`;
    document.getElementById('dashCount').textContent = '';
  }

  async function loadDashboard() {
    const content = document.getElementById('dashContent');

    if (!SHEET_CSV_URL) {
      showError('ยังไม่ได้ตั้งค่าลิงก์ Google Sheet สำหรับ dashboard นี้');
      return;
    }

    content.innerHTML = '<p class="dash-status">กำลังโหลดคำตอบ...</p>';

    try {
      // A cache-busting param so the Refresh button actually fetches fresh data.
      const url = `${SHEET_CSV_URL}${SHEET_CSV_URL.includes('?') ? '&' : '?'}_=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      renderDashboard(parseCSV(text));
    } catch (err) {
      showError('โหลดคำตอบไม่สำเร็จ ลองกดรีเฟรชอีกครั้ง หรือเช็คว่า Sheet ได้ Publish to web แล้วหรือยัง');
    }
  }

  document.getElementById('dashRefreshBtn').addEventListener('click', loadDashboard);
  loadDashboard();
})();
