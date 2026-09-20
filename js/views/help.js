// Help & FAQ: renders GUIDE.md (the same file that's in the repo) so there's only one copy to keep current.
// Each "##" section becomes a collapsible card, which is easier to scan on a phone.
import { esc } from '../util.js';
import { page } from '../ui.js';

// A small Markdown renderer: headings, tables, lists, quotes, paragraphs, and inline formatting.
// Only what GUIDE.md actually uses — no library.
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => (/^https?:\/\//.test(href) ? `<a href="${href}" target="_blank" rel="noopener">${label}</a>` : label))
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<i>$2</i>');
}

const cells = row => row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());

function renderBlocks(lines) {
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim() || /^---+$/.test(line.trim())) { i++; continue; }

    if (line.startsWith('### ')) { html.push(`<h4>${inline(line.slice(4))}</h4>`); i++; continue; }

    // table: header row, divider, then rows
    if (line.trim().startsWith('|') && lines[i + 1]?.includes('---')) {
      const head = cells(line.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++].trim()));
      html.push(`<div class="table-wrap"><table>
        <thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`);
      continue;
    }

    // list (bullet or numbered); continuation lines are indented
    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (m) { items.push(m[3]); i++; continue; }
        if (/^\s+\S/.test(lines[i]) && items.length) { items[items.length - 1] += ` ${lines[i].trim()}`; i++; continue; }
        break;
      }
      html.push(`<${ordered ? 'ol' : 'ul'}>${items.map(t => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    if (line.startsWith('> ')) { html.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); i++; continue; }

    // paragraph: run of plain lines
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|>|\||\s*([-*]|\d+\.)\s)/.test(lines[i]) && !/^---+$/.test(lines[i].trim())) {
      para.push(lines[i++]);
    }
    if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`);
    else i++; // nothing matched: don't get stuck
  }
  return html.join('');
}

export async function helpView() {
  const view = page({
    title: 'Help & FAQ',
    back: '#/settings',
    body: '<div class="muted small">Loading the guide…</div>',
  });

  let markdown;
  try {
    const res = await fetch('GUIDE.md');
    if (!res.ok) throw new Error(res.status);
    markdown = await res.text();
  } catch {
    view.innerHTML = `<div class="empty"><div class="empty-icon">📖</div><h3>Guide unavailable</h3>
      <p>Couldn't load the guide. It'll be here next time you're online.</p></div>`;
    return;
  }

  // Split on "## " headings; everything before the first one is the intro.
  // Windows checkouts have CRLF endings; drop the carriage returns so line matching works.
  const lines = markdown.split(/\r?\n/).filter(l => !l.startsWith('# '));
  const sections = [];
  let current = { title: null, lines: [] };
  for (const line of lines) {
    if (line.startsWith('## ')) {
      sections.push(current);
      current = { title: line.slice(3).trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  const intro = sections.shift();
  view.innerHTML = `
    <div class="help">
      ${renderBlocks(intro.lines)}
      ${sections.map(s => `
        <details class="card help-section">
          <summary>${esc(s.title)}</summary>
          ${renderBlocks(s.lines)}
        </details>`).join('')}
    </div>`;

  // Deep links like #/help?open=FAQ open that section straight away.
  const wanted = new URLSearchParams(location.hash.split('?')[1] || '').get('open');
  if (wanted) {
    const match = [...view.querySelectorAll('.help-section')].find(d => d.querySelector('summary').textContent.toLowerCase().startsWith(wanted.toLowerCase()));
    if (match) { match.open = true; match.scrollIntoView({ block: 'start' }); }
  }
}
