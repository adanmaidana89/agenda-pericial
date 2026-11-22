async function createFormattedPdf(report) {
  const {PDFDocument,StandardFonts,rgb} = PDFLib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const names = ['regular','bold','italic','bolditalic'];
  const standard = {
    arial:[StandardFonts.Helvetica,StandardFonts.HelveticaBold,StandardFonts.HelveticaOblique,StandardFonts.HelveticaBoldOblique],
    times:[StandardFonts.TimesRoman,StandardFonts.TimesRomanBold,StandardFonts.TimesRomanItalic,StandardFonts.TimesRomanBoldItalic]
  };
  const families = new Set([report.family,...report.blocks.flatMap(block=>[...block.runs,...(block.continuation?.runs ?? [])].map(run=>run.family).filter(Boolean))]);
  const fontsByFamily = {};
  await Promise.all([...families].map(async family=>{
    fontsByFamily[family] = await Promise.all(names.map(async (name,index)=>{
      if (family!=='garamond') return doc.embedFont(standard[family][index]);
      const response = await fetch('/assets/garamond-'+name+'.ttf');
      if (!response.ok) throw new Error('Não foi possível carregar a fonte EB Garamond.');
      return doc.embedFont(await response.arrayBuffer(),{subset:true});
    }));
  }));
  const fonts = fontsByFamily[report.family];
  const characterSets = new Map();
  function clean(text,font) {
    if (!characterSets.has(font)) characterSets.set(font,new Set(font.getCharacterSet()));
    const set = characterSets.get(font);
    return Array.from(text.replace(/\t/g,'    ').normalize('NFC'),ch=>set.has(ch.codePointAt(0)) ? ch : '?').join('');
  }
  function runWidth(run,text=run.text) {
    const font = fontsByFamily[run.family || report.family][run.style&3];
    return font.widthOfTextAtSize(clean(text.replace(/\u00a0/g,' '),font),run.size ?? report.size);
  }
  const width = 595.28;
  const height = 841.89;
  const margin = 56.7;
  const left = (report.left ?? 2)*72/2.54;
  const right = (report.right ?? 2)*72/2.54;
  const usable = width-left-right;
  const {size} = report;
  const spacing = report.spacing ?? 1.45;
  let previousLineSize;
  const ink = rgb(.10,.12,.18);
  let letterhead;
  if (report.paper==='letterhead') {
    const response = await fetch('/assets/timbre-pericial.jpg');
    if (!response.ok) throw new Error('Não foi possível carregar o papel timbrado.');
    letterhead = await doc.embedJpg(await response.arrayBuffer());
  }
  const paper = rgb(...[1,3,5].map(index=>parseInt(report.color.slice(index,index+2),16)/255));
  let page;
  let y;
  function nextPage() {
    page = doc.addPage([width,height]);
    y = height-(letterhead?116:margin);
    previousLineSize = 0;
    if (letterhead) {
      page.drawImage(letterhead,{x:0,y:0,width,height});
      const label = String(doc.getPageCount());
      page.drawText(label,{x:(width-fonts[0].widthOfTextAtSize(label,14))/2,y:35,size:14,font:fonts[0],color:rgb(.45,.42,.33)});
    } else page.drawRectangle({x:0,y:0,width,height,color:paper,borderWidth:0});
    const watermark = clean(report.watermark,fonts[1]);
    if (watermark) {
      const font = fonts[1];
      const markSize = Math.min(54,54*usable/font.widthOfTextAtSize(watermark,54));
      const angle = Math.PI/6;
      const length = font.widthOfTextAtSize(watermark,markSize);
      page.drawText(watermark,{x:(width-length*Math.cos(angle))/2,y:(height-length*Math.sin(angle))/2,
        size:markSize,font,color:ink,opacity:.12,rotate:PDFLib.degrees(30)});
    }
  }
  nextPage();
  for (const [index,block] of report.blocks.entries()) {
    if (block.page && index>0) nextPage();
    if (block.image) {
      const response = await fetch('/api/imagens/'+block.image);
      if (!response.ok) throw new Error('Não foi possível baixar uma imagem do laudo.');
      const bytes = await response.arrayBuffer();
      const image = block.image.endsWith('.png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const bottom = letterhead ? 68 : margin;
      const maxHeight = height-(letterhead?116:margin)-bottom-12;
      const ratio = Math.min(1,usable/image.width,maxHeight/image.height);
      const w = image.width*ratio, h = image.height*ratio;
      if (y-h<bottom) nextPage();
      page.drawImage(image,{x:left+(usable-w)/2,y:y-h,width:w,height:h});
      y -= h+12;
      previousLineSize = 0;
      continue;
    }
    const tableWidth = usable * .57;
    const continuation = block.continuation;
    const continuationIndent = continuation && !block.table ?
      continuation.offset*72/2.54 + continuation.runs.reduce((width,run)=>width+runWidth(run),0) : 0;
    const indent = (block.indent ?? 0)*72/2.54+continuationIndent;
    const firstIndent = block.table ? 0 : (block.first ?? 0)*72/2.54;
    const fullWidth = block.table ? tableWidth-12 : usable-indent;
    let textWidth = fullWidth-firstIndent;
    let offset = firstIndent;
    let line = [];
    let lineWidth = 0;
    const listPattern = block.list ? /^\s*(\d+[.]|[a-z]{1,4}[.)])([ \u00a0]+)/u : /^\s*(\d+[.]|[a-z][.)])([ \u00a0]+)/u;
    const prefix = block.runs.map(run=>run.text).join('').match(listPattern);
    const hanging = prefix && !block.table && ['left','justify'].includes(block.align);
    const markerEnd = prefix ? prefix[0].length-prefix[2].length : -1;
    const prefixLength = prefix?.[0].length ?? 0;
    const gapWidth = (block.gap ?? 0)*72/2.54;
    let hangingOffset = 0;
    if (hanging) {
      let remaining = prefixLength;
      for (const run of block.runs) {
        if (!remaining) break;
        const part = run.text.slice(0,remaining);
        hangingOffset += runWidth(run,part);
        remaining -= part.length;
      }
      hangingOffset += firstIndent+gapWidth;
    }
    let consumed = 0;
    function flush(continued=false) {
      while (line.length && /^ +$/.test(line.at(-1).text)) lineWidth -= line.pop().width;
      const gaps = line.filter(part=>!part.prefix && /^ +$/.test(part.text)).length;
      const stretch = continued && block.align==='justify' && !block.table && gaps ? (textWidth-lineWidth)/gaps : 0;
      const largest = line.reduce((largest,part)=>Math.max(largest,part.size),line.length ? 0 : size);
      let rise = Math.max(0,largest-previousLineSize);
      if (y-rise<(letterhead?68:margin)) {
        nextPage();
        rise = largest;
      }
      y -= rise;
      const lineHeight = largest*(block.spacing ?? spacing);
      if (block.table) {
        const left = (width-tableWidth)/2;
        page.drawRectangle({x:left,y:y-lineHeight*.25,width:tableWidth,height:lineHeight,borderWidth:.55,borderColor:ink});
      }
      let x = block.table ? (width-tableWidth)/2+6 : left + indent + offset + (block.align==='center' ? (textWidth-lineWidth)/2 : block.align==='right' ? textWidth-lineWidth : 0);
      for (const part of line) {
        const size = part.size;
        const inkWidth = part.width-(part.extra || 0);
        const marker = highlightColors[part.style & 112];
        if (marker) {
          const channels = [1,3,5].map(index=>parseInt(marker.slice(index,index+2),16)/255);
          page.drawRectangle({x,y:y-size*.18,width:inkWidth,height:size*.96,color:rgb(...channels)});
        }
        if (part.style&8) page.drawLine({start:{x,y:y+size*.32},end:{x:x+inkWidth,y:y+size*.32},thickness:.55,color:ink});
        page.drawText(part.text,{x,y,size,font:part.font,color:ink});
        if (part.style&4) page.drawLine({start:{x,y:y-2},end:{x:x+inkWidth,y:y-2},thickness:.6,color:ink});
        x += part.width + (!part.prefix && /^ +$/.test(part.text)?stretch:0);
      }
      y -= lineHeight;
      previousLineSize = largest;
      offset = hangingOffset;
      textWidth = fullWidth-hangingOffset;
      line = [];
      lineWidth = 0;
    }
    for (const run of block.runs) {
      const index = run.style&3;
      const font = fontsByFamily[run.family || report.family][index];
      const size = run.size ?? report.size;
      for (const match of run.text.matchAll(/[^ \u00a0]+|[ \u00a0]+/gu)) {
        const token = clean(match[0].replace(/\u00a0/g,' '),font);
        const position = consumed+match.index;
        const extra = position===markerEnd ? gapWidth : 0;
        const tokenWidth = font.widthOfTextAtSize(token,size)+extra;
        if (lineWidth && tokenWidth+lineWidth>textWidth) flush(true);
        if (!lineWidth && token.trim()==='' && !line.length) continue;
        if (tokenWidth<=textWidth) {
          line.push({text:token,width:tokenWidth,font,size,style:run.style,extra,prefix:position<prefixLength});
          lineWidth += tokenWidth;
          continue;
        }
        for (const character of token) {
          const charWidth = font.widthOfTextAtSize(character,size);
          if (lineWidth+charWidth>textWidth) flush(true);
          line.push({text:character,width:charWidth,font,size,style:run.style});
          lineWidth += charWidth;
        }
      }
      consumed += run.text.length;
    }
    flush();
    if (!block.table) y -= block.after ?? report.after ?? 0;
  }
  return new Blob([await doc.save()],{type:'application/pdf'});
}
