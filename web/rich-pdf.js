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
  const width = 595.28;
  const height = 841.89;
  const spacing = report.spacing ?? 1.45;
  const ink = rgb(.10,.12,.18);
  let letterhead;
  if (report.paper==='letterhead') {
    const response = await fetch('/assets/timbre-pericial.jpg');
    if (!response.ok) throw new Error('Não foi possível carregar o papel timbrado.');
    letterhead = await doc.embedJpg(await response.arrayBuffer());
  }
  const paper = rgb(...[1,3,5].map(index=>parseInt(report.color.slice(index,index+2),16)/255));
  const layout = document.createElement('div');
  layout.className = 'paper paged-paper'+(letterhead?' letterhead':'');
  const visibleEditor = document.querySelector('dialog[open] .report-body');
  const editorWidth = visibleEditor?.clientWidth || 794;
  layout.style.cssText = 'position:fixed;left:-20000px;top:0;width:'+(editorWidth+24)+'px;visibility:hidden;pointer-events:none';
  layout.style.fontFamily = fontFamilies[report.family];
  layout.style.setProperty('--sheet-color',report.color);
  const body = document.createElement('div');
  body.className = 'report-body';
  body.style.lineHeight = String(spacing);
  body.style.setProperty('--sheet-left',(report.left ?? 2)/21*100+'%');
  body.style.setProperty('--sheet-right',(report.right ?? 2)/21*100+'%');
  layout.append(body);
  document.body.append(layout);
  try {
    fillEditor(body,report.blocks);
    const settings = Object.fromEntries(Object.entries(report).map(([key,value])=>[key,{value}]));
    await Promise.all([...families].flatMap(family=>[
      document.fonts.load('16px '+fontFamilies[family]),
      document.fonts.load('bold 16px '+fontFamilies[family]),
      document.fonts.load('italic 16px '+fontFamilies[family]),
      document.fonts.load('bold italic 16px '+fontFamilies[family])
    ]));
    await Promise.all([...body.querySelectorAll('img')].map(async image=>{
      if (!image.complete) await new Promise((resolve,reject)=>{
        image.onload = resolve;
        image.onerror = ()=>reject(new Error('Não foi possível carregar uma imagem do laudo.'));
      });
      if (!image.naturalWidth) throw new Error('Não foi possível carregar uma imagem do laudo.');
    }));
    paginateEditor(body,settings);
    paginateEditor(body,settings);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    for (const sheet of body.children) {
      const page = doc.addPage([width,height]);
      const bounds = sheet.getBoundingClientRect();
      const scale = width/bounds.width;
      if (letterhead) page.drawImage(letterhead,{x:0,y:0,width,height});
      else page.drawRectangle({x:0,y:0,width,height,color:paper,borderWidth:0});
      const label = String(doc.getPageCount());
      page.drawText(label,{x:(width-fonts[0].widthOfTextAtSize(label,report.size))/2,y:height*.037,
        size:report.size,font:fonts[0],color:rgb(.40,.39,.30)});
      if (report.watermark) {
        const markSize = report.size*4;
        const mark = clean(report.watermark,fonts[1]);
        page.drawText(mark,{x:(width-fonts[1].widthOfTextAtSize(mark,markSize))/2,y:height*.5,
          size:markSize,font:fonts[1],color:ink,opacity:.12,rotate:PDFLib.degrees(30)});
      }
      for (const element of sheet.querySelectorAll('[data-table]')) {
        const box = element.getBoundingClientRect();
        page.drawRectangle({x:(box.left-bounds.left)*scale,y:height-(box.bottom-bounds.top)*scale,
          width:box.width*scale,height:box.height*scale,borderWidth:.55,borderColor:ink});
      }
      for (const element of sheet.querySelectorAll('[data-image]')) {
        const key = element.dataset.image;
        const response = await fetch('/api/imagens/'+key);
        if (!response.ok) throw new Error('Não foi possível carregar uma imagem do laudo.');
        const image = key.endsWith('.png') ? await doc.embedPng(await response.arrayBuffer()) : await doc.embedJpg(await response.arrayBuffer());
        const box = element.querySelector('img').getBoundingClientRect();
        page.drawImage(image,{x:(box.left-bounds.left)*scale,y:height-(box.bottom-bounds.top)*scale,
          width:box.width*scale,height:box.height*scale});
      }
      const walker = document.createTreeWalker(sheet,NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest('[data-image]')) continue;
        const css = getComputedStyle(node.parentElement);
        const chain = [];
        for (let element=node.parentElement;element && element!==sheet;element=element.parentElement) chain.unshift(element);
        const format = chain.reduce((value,element)=>inlineFormat(element,value),{style:0});
        const font = fontsByFamily[format.family || report.family][format.style&3];
        const pixelSize = parseFloat(css.fontSize);
        context.font = css.fontStyle+' '+css.fontWeight+' '+pixelSize+'px '+css.fontFamily;
        const metrics = context.measureText('Hg');
        const ascent = metrics.fontBoundingBoxAscent ?? pixelSize*.8;
        const descent = metrics.fontBoundingBoxDescent ?? pixelSize*.2;
        let offset = 0;
        for (const character of node.data) {
          const range = document.createRange();
          range.setStart(node,offset);
          offset += character.length;
          range.setEnd(node,offset);
          const box = range.getBoundingClientRect();
          if (!box.height || /[\r\n]/.test(character)) continue;
          const x = (box.left-bounds.left)*scale;
          const y = height-(box.top-bounds.top+(box.height-ascent-descent)/2+ascent)*scale;
          const textSize = pixelSize*scale;
          const marker = highlightColors[format.style&112];
          if (marker) {
            const channels = [1,3,5].map(index=>parseInt(marker.slice(index,index+2),16)/255);
            page.drawRectangle({x,y:height-(box.bottom-bounds.top)*scale,width:box.width*scale,
              height:box.height*scale,color:rgb(...channels),borderWidth:0});
          }
          page.drawText(clean(character,font),{x,y,size:textSize,font,color:ink});
          if (format.style&4) page.drawLine({start:{x,y:y-2},end:{x:x+box.width*scale,y:y-2},thickness:.6,color:ink});
          if (format.style&8) page.drawLine({start:{x,y:y+textSize*.32},end:{x:x+box.width*scale,y:y+textSize*.32},thickness:.55,color:ink});
        }
      }
    }
  } finally {
    layout.remove();
  }
  return new Blob([await doc.save()],{type:'application/pdf'});
}
