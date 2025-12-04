// text_render.js - formatted text with sub/sup similar to Python version
(function(){
  const SUBSCALE = 0.8;      // scale factor for sub/sup font size
  const DY_FACTOR = 0.50;    // fraction of base font size for vertical offset
  
  // LaTeX to Unicode symbol mapping
  const LATEX_SYMBOLS = {
    '\\sum': 'Σ',
    '\\int': '∫',
    '\\cdot': '·',
    '\\pi': 'π',
    '\\theta': 'θ',
    '\\alpha': 'α',
    '\\beta': 'β',
    '\\gamma': 'γ',
    '\\delta': 'δ',
    '\\epsilon': 'ε',
    '\\zeta': 'ζ',
    '\\eta': 'η',
    '\\iota': 'ι',
    '\\kappa': 'κ',
    '\\lambda': 'λ',
    '\\mu': 'μ',
    '\\nu': 'ν',
    '\\xi': 'ξ',
    '\\omicron': 'ο',
    '\\rho': 'ρ',
    '\\sigma': 'σ',
    '\\tau': 'τ',
    '\\upsilon': 'υ',
    '\\phi': 'φ',
    '\\chi': 'χ',
    '\\psi': 'ψ',
    '\\omega': 'ω',
    '\\Delta': 'Δ',
    '\\Sigma': 'Σ',
    '\\Omega': 'Ω',
    '\\infty': '∞',
    '\\pm': '±',
    '\\times': '×',
    '\\div': '÷',
    '\\neq': '≠',
    '\\leq': '≤',
    '\\geq': '≥',
    '\\approx': '≈',
    '\\sqrt': '√',
    '\\degree': '°'
  };

  function drawFormattedText(ctx, text, x, y, options={}){
    const baseSize = options.size || 16;
    const color = options.color || '#000';
    const align = options.align || 'center'; // left|center
    
    // Replace LaTeX codes with Unicode symbols
    let processedText = text;
    for(const [latex, symbol] of Object.entries(LATEX_SYMBOLS)) {
      processedText = processedText.split(latex).join(symbol);
    }
    
    // Parse into glyph tokens: {mode:'normal'|'sub'|'sup', text:'...'}
    const tokens = [];
    let i = 0; let mode='normal'; let single=false; let buffer='';

    function flush(){ if(buffer){ tokens.push({mode, text:buffer}); buffer=''; } }

    while(i < processedText.length){
      const ch = processedText[i];
      if(ch === '_' || ch === '^'){
        flush();
        mode = (ch === '_') ? 'sub' : 'sup';
        i++;
        if(i < processedText.length && processedText[i] === '{'){ // multi-char block
          single = false; i++; // skip '{'
          // accumulate until closing '}'
          let block='';
          while(i < processedText.length && processedText[i] !== '}'){ block += processedText[i++]; }
          if(i < processedText.length && processedText[i] === '}') i++; // skip '}'
          tokens.push({mode, text:block});
          mode='normal';
        } else { // single char
          single = true;
          if(i < processedText.length){
            tokens.push({mode, text:processedText[i]});
            i++;
          }
          mode='normal'; single=false;
        }
        continue;
      }
      // spaces always normal mode boundary
      if(ch === ' '){ flush(); tokens.push({mode:'normal', text:' '}); mode='normal'; single=false; i++; continue; }
      buffer += ch; i++;
    }
    flush();

    // Measure total width to support center alignment
    let totalWidth = 0;
    const segments = tokens.map(t => {
      const size = (t.mode === 'normal') ? baseSize : Math.round(baseSize*SUBSCALE);
      ctx.font = size + 'px Arial';
      const w = ctx.measureText(t.text).width;
      const yoff = (t.mode === 'sub') ? (DY_FACTOR*baseSize) : (t.mode === 'sup' ? (-DY_FACTOR*baseSize) : 0);
      totalWidth += w;
      return {text:t.text, mode:t.mode, size, width:w, yoff};
    });

    let cursorX = x;
    if(align === 'center') cursorX = x - totalWidth/2;
    else if(align === 'right') cursorX = x - totalWidth;

    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;

    for(const seg of segments){
      ctx.font = seg.size + 'px Arial';
      ctx.fillText(seg.text, cursorX, y + seg.yoff);
      cursorX += seg.width;
    }
  }

  window.drawFormattedText = drawFormattedText;
})();
