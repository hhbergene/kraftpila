/**
 * PDF report ("Generer rapport"): one section per task with a picture of the
 * canvas, score, feedback and the student's comment.
 * Contains a minimal dependency-free PDF writer (Helvetica + JPEG images).
 */
(function(){
  const PAGE_W = 595, PAGE_H = 842, MARGIN = 40;
  const CONTENT_W = PAGE_W - 2 * MARGIN;
  const IMAGE_W = CONTENT_W;

  // Characters outside Latin-1 that exist in WinAnsi, otherwise replaced by '?'
  const WIN_ANSI = { '–': 0x96, '—': 0x97, '•': 0x95, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '…': 0x85 };
  function toBytes(str){
    const out = new Uint8Array(str.length);
    for(let i = 0; i < str.length; i++){
      const c = str.charCodeAt(i);
      out[i] = c < 256 ? c : (WIN_ANSI[str[i]] || 63);
    }
    return out;
  }
  function pdfEscape(s){
    return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
  function cleanText(s){
    // Replace characters the PDF font cannot show (arrows, emoji, ...)
    return String(s).replace(/→/g, '->').replace(/[\r\t]/g, ' ')
      .replace(/[^\n\u0020-\u00FF–—•’‘“”…]/g, '?');
  }

  const measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(text, size, bold){
    measureCtx.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`;
    return measureCtx.measureText(text).width;
  }
  function wrapText(text, size, maxWidth, bold){
    const lines = [];
    for(const para of cleanText(text).split('\n')){
      let line = '';
      for(const word of para.split(' ')){
        const test = line ? line + ' ' + word : word;
        if(line && textWidth(test, size, bold) > maxWidth){
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  class PdfWriter {
    constructor(){
      this.pages = [];   // {ops: string[], images: Set<number>}
      this.images = [];  // {bytes, w, h}
      this.newPage();
    }
    newPage(){
      this.page = { ops: [], images: new Set() };
      this.pages.push(this.page);
      this.y = PAGE_H - MARGIN;
    }
    ensureSpace(h){
      if(this.y - h < MARGIN) this.newPage();
    }
    // Draws one line of text with its top at the current y and moves y down
    line(text, size, opts = {}){
      const lead = size * 1.3;
      this.ensureSpace(lead);
      const x = MARGIN + (opts.indent || 0);
      const c = opts.color || [0, 0, 0];
      this.page.ops.push(`BT /${opts.bold ? 'F2' : 'F1'} ${size} Tf ${c.join(' ')} rg ${x} ${(this.y - size).toFixed(2)} Td (${pdfEscape(text)}) Tj ET`);
      this.y -= lead;
    }
    paragraph(text, size, opts = {}){
      const maxW = CONTENT_W - (opts.indent || 0);
      for(const l of wrapText(text, size, maxW, opts.bold)) this.line(l, size, opts);
    }
    gap(h){ this.y -= h; }
    rule(){
      this.ensureSpace(6);
      this.page.ops.push(`0.7 G 0.5 w ${MARGIN} ${this.y - 2} m ${PAGE_W - MARGIN} ${this.y - 2} l S`);
      this.y -= 6;
    }
    // jpegBytes: Uint8Array of a JPEG; drawn at IMAGE_W width
    image(jpegBytes, w, h){
      const drawW = IMAGE_W, drawH = IMAGE_W * h / w;
      this.ensureSpace(drawH);
      this.images.push({ bytes: jpegBytes, w, h });
      const id = this.images.length;
      this.page.images.add(id);
      const x = MARGIN, y = this.y - drawH;
      this.page.ops.push(`q ${drawW} 0 0 ${drawH} ${x} ${y} cm /Im${id} Do Q`);
      this.page.ops.push(`0.6 G 0.5 w ${x} ${y} ${drawW} ${drawH} re S`);
      this.y = y - 6;
    }
    build(){
      const chunks = [];
      const offsets = [];
      let length = 0;
      const push = (data) => {
        const b = typeof data === 'string' ? toBytes(data) : data;
        chunks.push(b); length += b.length;
      };
      const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };

      // Object numbering: 1 catalog, 2 pages, 3 F1, 4 F2, then images, then page+content pairs
      const imgBase = 5;
      const pageBase = imgBase + this.images.length;
      push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      const kids = this.pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(' ');
      obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`);
      obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      this.images.forEach((img, i) => {
        const n = imgBase + i;
        offsets[n] = length;
        push(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
        push(img.bytes);
        push('\nendstream\nendobj\n');
      });
      this.pages.forEach((pg, i) => {
        const pn = pageBase + i * 2, cn = pn + 1;
        const xobjs = [...pg.images].map(id => `/Im${id} ${imgBase + id - 1} 0 R`).join(' ');
        obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobjs} >> >> /Contents ${cn} 0 R >>`);
        const content = toBytes(pg.ops.join('\n'));
        offsets[cn] = length;
        push(`${cn} 0 obj\n<< /Length ${content.length} >>\nstream\n`);
        push(content);
        push('\nendstream\nendobj\n');
      });
      const total = pageBase + this.pages.length * 2;
      const xref = length;
      push(`xref\n0 ${total}\n0000000000 65535 f \n`);
      for(let n = 1; n < total; n++) push(String(offsets[n]).padStart(10, '0') + ' 00000 n \n');
      push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
      return new Blob(chunks, { type: 'application/pdf' });
    }
  }
  window.PdfWriter = PdfWriter;

  function dataUrlToBytes(url){
    const bin = atob(url.split(',')[1]);
    const out = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const nextFrames = () => new Promise(res => {
    let done = false;
    const finish = () => { if(!done){ done = true; res(); } };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 300); // rAF is throttled in background tabs
  });

  const REPORT_SCALE = 1;

  // Renders the grid area (no margins) with the normal scene renderer on a separate
  // canvas at REPORT_SCALE resolution; line widths are compensated so strokes keep their pixel thickness.
  function captureCanvas(){
    const c = document.createElement('canvas');
    c.width = Math.round(window.WIDTH * REPORT_SCALE);
    c.height = Math.round(window.HEIGHT * REPORT_SCALE);
    const g = c.getContext('2d');
    const lw = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'lineWidth');
    Object.defineProperty(g, 'lineWidth', {
      get(){ return lw.get.call(g) * REPORT_SCALE; },
      set(v){ lw.set.call(g, v / REPORT_SCALE); }
    });
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.scale(REPORT_SCALE, REPORT_SCALE);
    g.translate(-window.offsetX, -window.offsetY);
    const guides = window.currentGuidelines;
    window.currentGuidelines = null; // interactive snap guides do not belong in the report
    try { window.renderTo(g); } finally { window.currentGuidelines = guides; }
    return { bytes: dataUrlToBytes(c.toDataURL('image/jpeg', 0.85)), w: c.width, h: c.height };
  }

  // Student-facing feedback lines: no debug blocks and no measured error values
  function feedbackLines(raw){
    if(!raw) return [];
    return String(raw).split(' | ')
      .filter(p => p.trim() && !p.includes('\n') && !p.includes('═'))
      .map(p => p.replace(/\s*\(-?\d+(\.\d+)?\s*(°|px)\)/g, '').trim())
      .filter(Boolean);
  }

  function hasUserForces(){
    return !!(window.fm && window.fm.forces.some(f => f.moveable !== false && (f.arrowBase || f.arrowTip || f.anchor)));
  }

  window.generateReport = async function(onProgress){
    const tasks = window.tasks || [];
    if(!tasks.length) return;
    const origIndex = window.currentTaskIndex || 0;
    const pdf = new PdfWriter();
    const entries = [];

    try {
      for(let i = 0; i < tasks.length; i++){
        if(onProgress) onProgress(i + 1, tasks.length);
        window.reportApi.loadTask(i);
        await nextFrames();
        const task = window.currentTask;
        const id = task.id;
        const drawn = hasUserForces();
        // Run the normal check if the student has not pressed "Sjekk"
        if(!window.taskScores[id] && drawn){
          window.reportApi.checkCurrent();
        }
        window.reportApi.clearFeedback();
        await nextFrames();
        if(window.renderNow) window.renderNow();
        entries.push({
          title: task.title && task.title !== task.taskTitle ? `${task.taskTitle || id}: ${task.title}` : String(task.taskTitle || id),
          image: captureCanvas(),
          drawn,
          score: window.taskScores[id],
          comment: (task.comment || '').trim()
        });
      }
    } finally {
      window.reportApi.loadTask(origIndex);
    }

    const solved = entries.filter(e => e.score && e.score.score >= 0.9).length;
    const user = (window.settings && window.settings.username) || 'User';
    const date = new Date().toLocaleDateString('nb-NO', { year: 'numeric', month: 'long', day: 'numeric' });
    pdf.line('Rapport - Tegne Krefter', 20, { bold: true });
    pdf.line(`${user}  |  ${date}`, 11);
    pdf.line(`Løste oppgaver: ${solved} av ${entries.length}`, 11);
    pdf.gap(6);

    entries.forEach(e => {
      // Keep the heading and picture together on one page
      pdf.ensureSpace(IMAGE_W * e.image.h / e.image.w + 90);
      pdf.rule();
      pdf.paragraph(e.title, 13, { bold: true });
      pdf.gap(2);
      pdf.image(e.image.bytes, e.image.w, e.image.h);
      if(e.score){
        const pct = Math.round(e.score.score * 100);
        const solvedTask = e.score.score >= 0.9;
        pdf.line(`Poeng: ${pct} %  (${solvedTask ? 'Løst' : 'Ikke løst'})`, 11, { bold: true, color: solvedTask ? [0.1, 0.5, 0.1] : [0.7, 0.2, 0.1] });
        const lines = feedbackLines(e.score.feedback);
        if(lines.length){
          pdf.line('Tilbakemelding:', 10, { bold: true });
          lines.forEach(l => pdf.paragraph('- ' + l, 10, { indent: 8 }));
        }
      } else {
        pdf.line(e.drawn ? 'Ikke løst' : 'Ikke løst - ingen krefter tegnet', 11, { bold: true, color: [0.7, 0.2, 0.1] });
      }
      if(e.comment){
        pdf.gap(2);
        pdf.line('Kommentar:', 10, { bold: true });
        pdf.paragraph(e.comment, 10, { indent: 8 });
      }
      pdf.gap(8);
    });

    const blob = pdf.build();
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Rapport_${user.replace(/[^\wæøåÆØÅ-]+/g, '_')}_${stamp}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return blob;
  };

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('settings-report');
    if(!btn) return;
    btn.addEventListener('click', async () => {
      const label = btn.textContent;
      btn.disabled = true;
      try {
        await window.generateReport((i, n) => { btn.textContent = `Lager rapport ${i}/${n}...`; });
      } catch(err){
        console.error('Rapport feilet:', err);
        alert('Kunne ikke lage rapport: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  });
})();
