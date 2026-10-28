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
    '\\degree': '°',
    '\\deg': '°',
    '\\Leftrightarrow': '⇔'
  };

  function layoutFormattedText(ctx, text, x, y, options={}){
    const baseSize = options.size || 16;
    const color = options.color || '#000';
    const align = options.align || 'center'; // left|center
    const fontFamily = options.fontFamily || 'Arial';
    
    // Replace LaTeX codes with Unicode symbols
    let processedText = text.replace(/\\sum\s+/g,'\\sum');
    for(const [latex, symbol] of Object.entries(LATEX_SYMBOLS)) {
      processedText = processedText.split(latex).join(symbol);
    }
    
    // Parse into glyph tokens with inherited bold/italic styles.
    const tokens = [];
    function parseRange(start, style, mode, stopAtBrace=false){
      let i = start;
      let buffer = '';
      let currentStyle = style;
      function flush(){
        if(buffer){
          tokens.push({mode, bold:currentStyle.bold, italic:currentStyle.italic, text:buffer});
          buffer = '';
        }
      }

      while(i < processedText.length){
        const ch = processedText[i];
        if(ch === '}' && stopAtBrace){
          flush();
          return i + 1;
        }

        const styleCommand = processedText.startsWith('\\textbf{', i) ? 'bold'
          : processedText.startsWith('\\textit{', i) ? 'italic' : null;
        if(styleCommand){
          flush();
          const nestedStyle = {...currentStyle, [styleCommand]:true};
          i = parseRange(i + 8, nestedStyle, mode, true);
          continue;
        }

        if(ch === '_' || ch === '^'){
          flush();
          const scriptMode = ch === '_' ? 'sub' : 'sup';
          i++;
          if(processedText[i] === '{'){
            i = parseRange(i + 1, currentStyle, scriptMode, true);
          } else if(i < processedText.length){
            tokens.push({
              mode:scriptMode,
              bold:currentStyle.bold,
              italic:currentStyle.italic,
              text:processedText[i++]
            });
          }
          continue;
        }

        if(ch === ' '){
          flush();
          tokens.push({mode:'normal', bold:currentStyle.bold, italic:currentStyle.italic, text:' '});
          i++;
          continue;
        }

        buffer += ch;
        i++;
      }
      flush();
      return i;
    }
    parseRange(0, {bold:false, italic:false}, 'normal');

    // Measure total width to support center alignment
    let totalWidth = 0;
    const segments = tokens.map(t => {
      const size = (t.mode === 'normal') ? baseSize : Math.round(baseSize*SUBSCALE);
      ctx.font = `${t.bold ? 'bold ' : ''}${t.italic ? 'italic ' : ''}${size}px ${fontFamily}`;
      const metrics = ctx.measureText(t.text);
      const w = metrics.width;
      const yoff = (t.mode === 'sub') ? (DY_FACTOR*baseSize) : (t.mode === 'sup' ? (-DY_FACTOR*baseSize) : 0);
      totalWidth += w;
      const ascent=Number.isFinite(metrics.actualBoundingBoxAscent)
        ? metrics.actualBoundingBoxAscent : size*0.6;
      const descent=Number.isFinite(metrics.actualBoundingBoxDescent)
        ? metrics.actualBoundingBoxDescent : size*0.6;
      return {text:t.text, mode:t.mode, size, bold:t.bold, italic:t.italic,
        width:w, yoff, ascent, descent};
    });

    let cursorX = x;
    if(align === 'center') cursorX = x - totalWidth/2;
    else if(align === 'right') cursorX = x - totalWidth;

    let top=0,bottom=0;
    const positionedSegments=segments.map(seg=>{
      const localX=cursorX;
      cursorX+=seg.width;
      const height=Math.max(seg.size,seg.ascent+seg.descent);
      top=Math.min(top,seg.yoff-height/2);
      bottom=Math.max(bottom,seg.yoff+height/2);
      return {...seg,x:localX};
    });
    return {
      x,y,width:totalWidth,height:bottom-top,left:align==='center'?-totalWidth/2:
        (align==='right'?-totalWidth:0),right:align==='center'?totalWidth/2:
        (align==='right'?0:totalWidth),top,bottom,segments:positionedSegments
    };
  }

  function drawFormattedText(ctx, text, x, y, options={}){
    const layout=options.layout || layoutFormattedText(ctx,text,x,y,options);
    const color=options.color || '#000';
    const fontFamily=options.fontFamily || 'Arial';

    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';

    for(const seg of layout.segments){
      ctx.font = `${seg.bold ? 'bold ' : ''}${seg.italic ? 'italic ' : ''}${seg.size}px ${fontFamily}`;
      ctx.fillText(seg.text, seg.x, y + seg.yoff);
    }
    return layout;
  }

  window.layoutFormattedText = layoutFormattedText;
  window.drawFormattedText = drawFormattedText;
})();
