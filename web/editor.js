const highlightColors = {16:'#fff176',32:'#a6e6a1',64:'#ffabab'};
const highlightNames = {16:'amarelo',32:'verde',64:'vermelho'};
const fontFamilies = {garamond:'"EB Garamond", serif', times:'"Times New Roman", serif', arial:'Arial, sans-serif'};
const inlineShortcuts = {b:'bold',u:'underline',i:'italic'};
const fontSizes = [10,11,12,13,14,16,18];
const defaultPaper = {family:'garamond',size:12,color:'#ffffff',watermark:'',paper:'simple',left:2,right:2,spacing:1.45,after:0};
const textBlocks = text => text.split(/\r?\n/).map(line=>({align:'left',runs:line?[{text:line,style:0}]:[]}));
const getReport = item => item.format ? {...defaultPaper,...item.format} : {...defaultPaper,blocks:textBlocks(item.text)};
function reportFromModel(item, form, model) {
  const vara = form.elements.vara.value.trim() || '[Vara e comarca]';
  const date = form.elements.date.value;
  const fields = {PROCESSO:item.number,VARA:vara,DATA:date?display(date):'[Data da perícia]'};
  const format = model?.format ?? {...defaultPaper,paper:'letterhead',blocks:standardReportBlocks};
  const blocks = format.blocks.map(block=>({...block,runs:block.runs.map(run=>({...run,
    text:run.text.replace(/\{\{(PROCESSO|VARA|DATA)\}\}/g,(_,key)=>fields[key])
  }))}));
  return {...defaultPaper,...format,blocks};
}
const reportText = report => report.blocks.map(block=>block.runs.map(run=>run.text).join('')).join('\n');

function editorFields(stageOptions) {
  return '<section class="report-editor" aria-label="Editor do laudo">'+
    '<div class="editor-toolbar-sticky"><div class="editor-controls-toggle"><button type="button" id="editor-controls-toggle" aria-controls="editor-controls" aria-expanded="false">Mostrar ferramentas de edição</button><button type="submit" class="editor-save">Salvar laudo</button><button type="button" id="report-expand" aria-pressed="false">Expandir editor</button><label class="editor-stage">Etapa <select name="stage">'+stageOptions+'</select></label><button type="button" data-dialog-close class="editor-close" aria-label="Fechar laudo" title="Fechar laudo">✕</button></div><p id="editor-save-error" class="error" role="alert" hidden></p><p id="editor-save-status" class="editor-save-status" role="status"></p>'+
    '<div id="editor-controls" hidden>'+
    '<div class="row editor-template"><label>Modelos salvos<span class="model-picker"><select id="saved-models"></select><button type="button" id="delete-model" class="danger" aria-label="Excluir modelo selecionado" title="Excluir modelo selecionado">×</button></span></label>'+
    '<div class="actions"><button type="button" id="load-model">Carregar modelo</button><button type="button" id="default-model">Usar na abertura</button><button type="button" id="save-model">Salvar como modelo</button></div></div>'+
    '<div class="row paper-settings">'+
    '<label>Papel<select id="report-paper"><option value="simple">Liso</option><option value="letterhead">Timbrado</option></select></label>'+
    '<input type="hidden" id="report-family"><label>Fonte<select id="selection-family"><option value="">Selecione a fonte</option><option value="garamond">EB Garamond</option><option value="times">Times New Roman</option><option value="arial">Arial</option></select></label>'+
    '<input type="hidden" id="report-size"><label>Tamanho da seleção (pt)<select id="selection-size"><option value="">Selecione o tamanho</option>'+
    fontSizes.map(size=>'<option>'+size+'</option>').join('')+'</select></label>'+
    '<input type="hidden" id="report-color"><input type="hidden" id="report-watermark"></div>'+
    '<div class="editor-tools" aria-label="Formatação">'+
    [['bold','Negrito','<b>N</b>'],['italic','Itálico','<i>I</i>'],['underline','Sublinhado','<u>S</u>'],
    ['justifyLeft','Alinhar à esquerda','Esquerda'],['justifyCenter','Centralizar','Centralizar'],['justifyRight','Alinhar à direita','Direita'],['justifyFull','Justificar','Justificar'],
    ['strikeThrough','Tachado','<s>S</s>'],
    ['undo','Desfazer','Desfazer'],['redo','Refazer','Refazer']].map(([command,label,content])=>
      '<button type="button" data-command="'+command+'" aria-label="'+label+'" title="'+label+'">'+content+'</button>').join('')+
    '<details class="editor-tool-menu"><summary>Marca-texto ▾</summary><div class="editor-tool-options">'+
    [0,...Object.keys(highlightColors)].map(bit=>'<button type="button" class="highlight-button" data-highlight="'+bit+'">'+(bit===0?'Sem cor':highlightNames[bit])+'</button>').join('')+
    '</div></details><button type="button" id="format-brush" aria-pressed="false" aria-label="Pincel de formatação" title="Pincel de formatação"><img src="/assets/pincel-formatacao.png" alt=""></button>'+
    '<details class="editor-tool-menu"><summary>Numeração ▾</summary><div class="editor-tool-options">'+
    '<button type="button" data-list="number" aria-label="Numerar com 1, 2, 3">1.</button><button type="button" data-list="letter" aria-label="Enumerar com a, b, c">a.</button><button type="button" data-list="parenthesis" aria-label="Enumerar com a), b), c)">a)</button><button type="button" data-list="clear">Limpar numeração</button></div><label>Distância até o texto <output id="list-gap-value">0 cm</output><input id="list-gap" type="range" min="0" max="3" step=".25" value="0"></label></details></div>'+
    '<div class="editor-tools layout-tools" aria-label="Layout">'+
    '<button type="button" id="report-break">Quebra de página</button><button type="button" id="report-indent">Aumentar recuo</button><button type="button" id="report-outdent">Diminuir recuo</button>'+
    '<input type="hidden" id="report-spacing"><input type="hidden" id="report-after"><label>Entrelinhas<select id="paragraph-spacing"><option value="1">Simples</option><option value="1.15">1,15</option><option value="1.45">1,45</option><option value="1.5">1,5</option><option value="2">Duplo</option></select></label>'+
    '<label>Após parágrafo<select id="paragraph-after"><option value="0">0 pt</option><option value="6">6 pt</option><option value="12">12 pt</option></select></label></div>'+
    '<div class="report-ruler" aria-label="Régua em centímetros">'+Array.from({length:22},(_,index)=>'<span>'+index+'</span>').join('')+
    '<button type="button" id="ruler-marker" class="ruler-handle" role="slider" aria-label="Posição da numeração" title="Arraste a numeração" aria-valuemin="0" aria-valuemax="21" aria-valuenow="0" hidden></button>'+
    '<button type="button" id="ruler-text" class="ruler-handle" role="slider" aria-label="Início do texto numerado" title="Arraste o início do texto" aria-valuemin="0" aria-valuemax="21" aria-valuenow="0" hidden></button></div>'+
    '<label class="first-indent">Recuo da primeira linha <output id="first-indent-value">0 cm</output><input type="range" id="first-indent" min="0" max="5" step=".25" value="0"></label>'+
    '<div class="row report-margins">'+['left','right'].map((side,index)=>'<label>Margem '+(index?'direita':'esquerda')+' <output id="report-'+side+'-value"></output><input type="range" id="report-'+side+'" min="1" max="5" step=".25"></label>').join('')+'</div>'+
    '</div></div><div class="paper paged-paper">'+
    '<div class="report-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Texto do laudo" lang="pt-BR" spellcheck="false" autocorrect="off"></div></div></section>';
}
function renderRun(run) {
  let content = document.createTextNode(run.text);
  for (const [bit,tag] of [[1,'b'],[2,'i'],[4,'u'],[8,'s']]) {
    if (!(run.style & bit)) continue;
    const wrapper = document.createElement(tag);
    wrapper.append(content);
    content = wrapper;
  }
  const highlight = run.style & 112;
  if (highlightColors[highlight]) {
    const mark = document.createElement('mark');
    mark.dataset.highlight = highlight;
    mark.append(content);
    content = mark;
  }
  if (run.size || run.family) {
    const span = document.createElement('span');
    if (run.size) setRunSize(span,run.size);
    if (run.family) setRunFamily(span,run.family);
    span.append(content);
    content = span;
  }
  return content;
}
function imageBlock(key) {
  const block = document.createElement('div');
  block.dataset.image = key;
  block.contentEditable = 'false';
  block.setAttribute('contenteditable','false');
  const image = document.createElement('img');
  image.src = '/api/imagens/'+key;
  image.alt = 'Imagem inserida no laudo';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.dataset.removeImage = '';
  remove.textContent = '×';
  remove.setAttribute('aria-label','Remover imagem do laudo');
  remove.title = 'Remover imagem do laudo';
  block.append(image,remove);
  return block;
}
function fillEditor(editable, blocks) {
  const page = makeSheet();
  page.append(...blocks.map(block=>{
    if (block.image) return imageBlock(block.image);
    const paragraph = document.createElement('div');
    paragraph.style.textAlign = block.align;
    if (block.page) paragraph.dataset.page = 'true';
    if (block.table) paragraph.dataset.table = 'true';
    if (block.indent) setIndent(paragraph,block.indent);
    if (block.first) setFirstIndent(paragraph,block.first);
    if (block.list) paragraph.dataset.list = block.list;
    if (block.gap) setListGap(paragraph,block.gap);
    if (block.continuation) setListContinuation(paragraph,block.continuation);
    setParagraphSpacing(paragraph,block.spacing,block.after);
    for (const run of block.runs) {
      paragraph.append(renderRun(run));
    }
    decorateListPrefix(paragraph);
    if (!paragraph.childNodes.length) paragraph.append(document.createElement('br'));
    return paragraph;
  }));
  editable.replaceChildren(page);
}
function inlineFormat(node,format) {
  let {style,size,family} = format;
  if (node.dataset.formatStyle!==undefined) {
    style = Number(node.dataset.formatStyle);
    size = Number(node.dataset.formatSize) || undefined;
    family = node.dataset.formatFamily || undefined;
  }
  const tag = node.tagName;
  const css = node.style;
  if (fontSizes.includes(Number(node.dataset.size))) size = Number(node.dataset.size);
  if (Object.hasOwn(fontFamilies,node.dataset.family)) family = node.dataset.family;
  const weight = css.fontWeight;
  if (['B','STRONG'].includes(tag) || weight==='bold' || Number(weight)>=600) style |= 1;
  if (['I','EM'].includes(tag) || css.fontStyle==='italic') style |= 2;
  if (tag==='U' || css.textDecorationLine.includes('underline') || css.textDecoration.includes('underline')) style |= 4;
  if (['S','STRIKE','DEL'].includes(tag) || css.textDecoration.includes('line-through')) style |= 8;
  const backgrounds = {'rgb(255,241,118)':16,'rgb(166,230,161)':32,'rgb(255,171,171)':64};
  const color = node.dataset.highlight!==undefined ? Number(node.dataset.highlight) :
    tag==='MARK' ? 16 : backgrounds[css.backgroundColor.replace(/\s/g,'')];
  if (color===0 || highlightColors[color]) style = (style & 15) | color;
  return {style,size,family};
}

function alphabeticNumber(index) {
  let label = '';
  for (let n = index+1; n>0; n=Math.floor((n-1)/26)) label = String.fromCharCode(97+(n-1)%26)+label;
  return label;
}

function listPrefix(paragraph) {
  const text = paragraph.textContent;
  const known = Boolean(paragraph.dataset.list);
  const match = known ? text.match(/^\s*(\d+|[a-z]{1,4})([.)])[ \u00a0]+/u) :
    text.match(/^\s*(\d+|[a-z])([.)])[ \u00a0]+/u);
  if (!match) return null;
  const [,label,punctuation] = match;
  const bounds = {start:match[0].indexOf(label),markerLength:label.length+1,length:match[0].length};
  if (/^\d+$/.test(label)) {
    const ordinal = Number(label);
    return punctuation==='.' && Number.isSafeInteger(ordinal) && ordinal<Number.MAX_SAFE_INTEGER ?
      {type:'number',index:ordinal-1,...bounds} : null;
  }
  let ordinal = 0;
  for (const letter of label) ordinal = ordinal*26+letter.charCodeAt(0)-96;
  return {type:punctuation===')'?'parenthesis':'letter',index:ordinal-1,...bounds};
}

function setListGap(paragraph,gap) {
  if (gap) paragraph.dataset.gap = gap;
  else delete paragraph.dataset.gap;
  paragraph.style.setProperty('--list-gap',String(gap));
}

function markerRange(paragraph,prefix) {
  const range = document.createRange();
  const walker = document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
  const end = prefix.start+prefix.markerLength;
  let offset = 0;
  let started = false;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!started && offset+node.length>prefix.start) {
      range.setStart(node,prefix.start-offset);
      started = true;
    }
    if (started && offset+node.length>=end) {
      range.setEnd(node,end-offset);
      return range;
    }
    offset += node.length;
  }
  return null;
}

function decorateListPrefix(paragraph) {
  if (paragraph.querySelector('[data-list-marker]')) return;
  const prefix = listPrefix(paragraph);
  const range = prefix && markerRange(paragraph,{start:0,markerLength:prefix.length});
  if (!range) return;
  const marker = document.createElement('span');
  marker.dataset.listMarker = '';
  marker.append(range.extractContents());
  range.insertNode(marker);
}

function markerFormat(paragraph) {
  const prefix = listPrefix(paragraph);
  const range = prefix && markerRange(paragraph,prefix);
  const chain = [];
  for (let node=range?.startContainer.parentElement;node && node!==paragraph;node=node.parentElement) chain.unshift(node);
  return chain.reduce((format,node)=>inlineFormat(node,format),{style:0});
}

function clearNumbering(paragraph) {
  let left = listPrefix(paragraph)?.length || 0;
  const walker = document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
  while (left && walker.nextNode()) {
    const node = walker.currentNode;
    const count = Math.min(left,node.length);
    node.deleteData(0,count);
    left -= count;
  }
  delete paragraph.dataset.list;
  setListGap(paragraph,0);
  for (const marker of paragraph.querySelectorAll('[data-list-marker]')) marker.replaceWith(...marker.childNodes);
}

function numberParagraph(paragraph,type,index,replace=true,format) {
  const gap = Number(paragraph.dataset.gap || 0);
  const style = format ?? (replace ? markerFormat(paragraph) : {style:0});
  if (replace) clearNumbering(paragraph);
  setListContinuation(paragraph,null);
  const label = type==='number' ? String(index+1) : alphabeticNumber(index);
  const marker = document.createElement('span');
  marker.dataset.listMarker = '';
  marker.append(renderRun({text:label+(type==='parenthesis'?')':'.'),...style}));
  const separator = document.createTextNode(' ');
  marker.append(separator);
  paragraph.prepend(marker);
  paragraph.dataset.list = type;
  setListGap(paragraph,gap);
  return separator;
}

function readBlocks(editor) {
  const blocks = [];
  let block = {align:'left',runs:[]};

  const finish = (align='left', empty=false) => {
    if (empty || block.runs.length) blocks.push(block);
    block = {align,runs:[]};
  };
  const write = (text,style,size,family) => {
    if (!text) return;
    const run = block.runs.at(-1);
    if (run?.style===style && run.size===size && run.family===family) run.text += text;
    else block.runs.push({text,style,...(size?{size}:{}),...(family?{family}:{})});
  };
  function visit(node,style,align,size,family) {
    if (node.nodeType===3) {
      const lines = node.textContent.replace(/\u00a0/g,' ').split(/\r?\n/);
      lines.forEach((line,index)=>{
        if (index) finish(align,true);
        write(line,style,size,family);
      });
      return;
    }
    if (node.nodeType!==1) return;
    if (node.dataset.image) {
      finish();
      blocks.push({align:'left',runs:[],image:node.dataset.image});
      return;
    }
    const tag = node.tagName;
    if (tag==='BR') {
      if (node.parentNode.childNodes.length>1) finish(align,true);
      return;
    }
    if (['SCRIPT','STYLE','IMG'].includes(tag)) return;
    ({style,size,family} = inlineFormat(node,{style,size,family}));
    const css = node.style;
    const nextAlign = css.textAlign || node.getAttribute('align');
    if (['left','center','right','justify'].includes(nextAlign)) align = nextAlign;
    const paragraph = ['DIV','P','H1','H2','H3','LI'].includes(tag);
    if (paragraph) {
      finish(align);
      if (node.dataset.table==='true') block.table = true;
      if (node.dataset.page==='true') block.page = true;
      if (Number(node.dataset.indent)>0) block.indent = Number(node.dataset.indent);
      if (Number(node.dataset.first)) block.first = Number(node.dataset.first);
      if (node.dataset.list && listPrefix(node)) block.list = node.dataset.list;
      if (node.dataset.gap && listPrefix(node)) block.gap = Number(node.dataset.gap);
      if (node.dataset.listContinuation) block.continuation = JSON.parse(node.dataset.listContinuation);
      if (node.dataset.spacing) block.spacing = Number(node.dataset.spacing);
      if (node.dataset.after) block.after = Number(node.dataset.after);
    }
    const start = blocks.length;
    for (const child of node.childNodes) visit(child,style,align,size,family);
    if (paragraph) finish(align,blocks.length===start);
  }
  for (const child of sheetNodes(editor)) visit(child,0,'left');
  finish();
  return blocks.length ? blocks : [{align:'left',runs:[]}];
}
function makeSheet() {
  const page = document.createElement('div');
  page.className = 'report-sheet';
  return page;
}

function sheetNodes(editor) {
  return Array.from(editor.childNodes).flatMap(node=>
    node.classList?.contains('report-sheet') ? [...node.childNodes] : [node]);
}

function paginateEditor(editor, settings) {
  if (!editor.clientWidth) return;
  const width = editor.clientWidth;
  const scale = width/595.28;
  const letterhead = settings.paper.value==='letterhead';
  const top = (letterhead ? 116 : 56.7)*scale;
  const bottom = (letterhead ? 68 : 56.7)*scale;
  const height = width*297/210;
  editor.style.fontSize = Number(settings.size.value)*scale+'px';
  editor.style.setProperty('--centimeter',(width/21)+'px');
  editor.style.setProperty('--point',scale+'px');
  editor.style.setProperty('--sheet-height',height+'px');
  editor.style.setProperty('--sheet-top',top+'px');
  editor.style.setProperty('--sheet-bottom',bottom+'px');
  editor.style.setProperty('--after-paragraph',Number(settings.after.value)*scale+'px');
  const pages = [...editor.children].filter(child=>child.classList.contains('report-sheet'));
  const nodes = sheetNodes(editor);
  for (const paragraph of nodes) {
    if (paragraph.nodeType!==1) continue;
    const prefix = listPrefix(paragraph);
    const marker = prefix && paragraph.querySelector('[data-list-marker]');
    const applies = marker && !paragraph.dataset.table && (!paragraph.style.textAlign || ['left','justify'].includes(paragraph.style.textAlign));
    paragraph.toggleAttribute('data-list-hanging',Boolean(applies));
    if (applies) {
      const markerWidth = marker.getBoundingClientRect().width;
      const gap = Number(paragraph.dataset.gap || 0)*width/21;
      const firstIndent = Number(paragraph.dataset.first || 0)*width/21;
      paragraph.style.setProperty('--hanging-width',(markerWidth+gap)+'px');
      paragraph.style.setProperty('--hanging-first',firstIndent+'px');
    }
  }
  const allPages = [];
  let group = [];
  let used = 0;
  const available = height-top-bottom;
  for (const node of nodes) {
    const element = node.nodeType===1;
    const css = element ? getComputedStyle(node) : null;
    const blockHeight = element ? node.getBoundingClientRect().height+
      (parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0) :
      parseFloat(getComputedStyle(editor).lineHeight);
    if (group.length && ((element && node.dataset.page==='true') || used+blockHeight>available+.5)) {
      allPages.push(group);
      group = [];
      used = 0;
    }
    group.push(node);
    used += blockHeight;
  }
  allPages.push(group);

  const selection = window.getSelection();
  const saved = selection?.anchorNode && selection.focusNode &&
    editor.contains(selection.anchorNode) && editor.contains(selection.focusNode) ?
    [selection.anchorNode,selection.anchorOffset,selection.focusNode,selection.focusOffset] : null;
  let moved = false;
  allPages.forEach((blocks,index)=>{
    let page = pages[index];
    if (!page) {
      page = makeSheet();
      editor.append(page);
    }
    page.dataset.number = String(index+1);
    page.dataset.watermark = settings.watermark.value;
    if (!blocks.length) {
      const paragraph = document.createElement('div');
      paragraph.append(document.createElement('br'));
      blocks.push(paragraph);
    }
    if (page.childNodes.length===blocks.length && blocks.every((node,index)=>page.childNodes[index]===node)) return;
    for (const [index,node] of blocks.entries()) {
      if (page.childNodes[index]!==node) page.insertBefore(node,page.childNodes[index] || null);
    }
    moved = true;
  });
  pages.slice(allPages.length).forEach(page=>page.remove());
  if (moved && saved && editor.contains(saved[0]) && editor.contains(saved[2])) {
    try {selection.setBaseAndExtent(...saved);} catch {}
  }
}

function updateParagraphIndent(paragraph) {
  const indent = Number(paragraph.dataset.indent || 0)/21*100;
  const continuation = paragraph.dataset.listContinuation && JSON.parse(paragraph.dataset.listContinuation);
  paragraph.style.marginLeft = continuation ?
    'calc('+indent+'% + var(--centimeter,37.8px) * '+(continuation.width+continuation.offset)+')' : indent+'%';
}

function setListContinuation(paragraph,continuation) {
  if (continuation) paragraph.dataset.listContinuation = JSON.stringify(continuation);
  else delete paragraph.dataset.listContinuation;
  updateParagraphIndent(paragraph);
}

function setIndent(paragraph,amount) {
  paragraph.dataset.indent = amount;
  updateParagraphIndent(paragraph);
}

function setFirstIndent(paragraph,amount) {
  paragraph.dataset.first = amount;
  paragraph.style.textIndent = 'calc(var(--centimeter) * '+amount+')';
}

function setParagraphSpacing(paragraph,spacing,after) {
  if (spacing!==undefined) {
    paragraph.dataset.spacing = spacing;
    paragraph.style.lineHeight = String(spacing);
  }
  if (after!==undefined) {
    paragraph.dataset.after = after;
    paragraph.style.marginBottom = 'calc(var(--point,1.333px) * '+after+')';
  }
}

function setRunSize(span,size) {
  span.dataset.size = size;
  span.style.fontSize = 'calc(var(--point,1.333px) * '+size+')';
}

function setRunFamily(span,family) {
  span.dataset.family = family;
  span.style.fontFamily = fontFamilies[family];
}

function applyToTextSelection(editable,range,makeWrapper) {
  if (!range || range.collapsed || !editable.contains(range.startContainer) || !editable.contains(range.endContainer)) return false;
  const walker = document.createTreeWalker(editable,NodeFilter.SHOW_TEXT);
  const fragments = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!range.intersectsNode(node)) continue;
    const start = range.startContainer===node ? range.startOffset : 0;
    const end = range.endContainer===node ? range.endOffset : node.length;
    if (start<end) fragments.push({node,start,end});
  }
  const marked = [];
  for (const {node,start,end} of fragments) {
    const segment = document.createRange();
    segment.setStart(node,start);
    segment.setEnd(node,end);
    const wrapper = makeWrapper();
    segment.surroundContents(wrapper);
    marked.push(wrapper.firstChild);
  }
  if (!marked.length) return false;
  const last = marked.at(-1);
  window.getSelection().setBaseAndExtent(marked[0],0,last,last.length);
  return true;
}

function editorSelection(editable) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const paragraphs = sheetNodes(editable);
  function locate(node,offset) {
    const index = paragraphs.findIndex(paragraph=>paragraph.contains(node));
    if (index===-1) return null;
    const range = document.createRange();
    range.selectNodeContents(paragraphs[index]);
    range.setEnd(node,offset);
    return {index,offset:range.toString().length};
  }
  const anchor = locate(selection.anchorNode,selection.anchorOffset);
  const focus = locate(selection.focusNode,selection.focusOffset);
  return anchor && focus ? {anchor,focus} : null;
}

function editorSelectionPoints(editable,saved) {
  const paragraphs = sheetNodes(editable);
  function locate(position) {
    const paragraph = paragraphs[position.index];
    if (!paragraph) return null;
    const walker = document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT);
    let offset = position.offset;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (offset<=node.length) return [node,offset];
      offset -= node.length;
    }
    return [paragraph,paragraph.childNodes.length];
  }
  const anchor = locate(saved.anchor);
  const focus = locate(saved.focus);
  return anchor && focus ? [...anchor,...focus] : null;
}

function restoreEditorSelection(editable,saved) {
  const points = saved && editorSelectionPoints(editable,saved);
  if (points) window.getSelection().setBaseAndExtent(...points);
}

function editorHistory(read,restore,selection) {
  const snapshots = [{value:JSON.stringify(read()),selection:null}];
  let current = 0;
  let group;
  let before;
  function rememberBefore() {
    before = selection();
    if (before) snapshots[current].selection = before;
  }
  function record(type) {
    const value = JSON.stringify(read());
    if (snapshots[current].value===value) return;
    const after = selection();
    const now = Date.now();
    const canMerge = type && group?.type===type && current===snapshots.length-1 &&
      (type.startsWith('slider:') || (now-group.at<=750 && JSON.stringify(before)===JSON.stringify(group.after)));
    if (canMerge) snapshots[current] = {value,selection:after};
    else {
      snapshots.splice(current+1);
      snapshots.push({value,selection:after});
      if (snapshots.length>81) snapshots.shift();
      current = snapshots.length-1;
    }
    group = type ? {type,at:now,after} : undefined;
    before = null;
  }
  function step(direction) {
    const next = current+direction;
    if (next<0 || next>=snapshots.length) return;
    const cursor = selection();
    if (cursor) snapshots[current].selection = cursor;
    current = next;
    group = undefined;
    before = null;
    const snapshot = snapshots[current];
    restore(JSON.parse(snapshot.value),snapshot.selection);
  }
  return {record,step,rememberBefore,endGroup(){group=undefined;}};
}

function initEditor(item) {
  const dialogForm = $('panel').querySelector('form');
  const openingModel = (state.models||[]).find(model=>model.id===state.defaultModel);
  const report = hasBlankReport(item) ? reportFromModel(item,dialogForm,openingModel) : getReport(item);
  const root = document.querySelector('.report-editor');
  const editable = root.querySelector('.report-body');
  const paper = root.querySelector('.paper');

  const settings = {family:$('report-family'),size:$('report-size'),color:$('report-color'),watermark:$('report-watermark'),paper:$('report-paper'),left:$('report-left'),right:$('report-right'),spacing:$('report-spacing'),after:$('report-after')};
  for (const key of Object.keys(settings)) settings[key].value = report[key];
  fillEditor(editable,report.blocks);
  const toolsToggle = $('editor-controls-toggle');
  const controls = $('editor-controls');
  toolsToggle.onclick = () => {
    controls.hidden = !controls.hidden;
    toolsToggle.setAttribute('aria-expanded',String(!controls.hidden));
    toolsToggle.textContent = controls.hidden ? 'Mostrar ferramentas de edição' : 'Ocultar ferramentas de edição';
  };
  let frame = 0;
  let composing = false;
  const schedulePages = () => {
    if (frame || composing || !root.isConnected) return;
    frame = requestAnimationFrame(()=>{
      frame = 0;
      paginateEditor(editable,settings);
      updateRuler();
      paintExtraSelections();
    });
  };
  const style = () => {
    paper.style.setProperty('--sheet-color',settings.color.value);
    paper.classList.toggle('letterhead',settings.paper.value==='letterhead');
    paper.style.fontFamily = fontFamilies[settings.family.value];

    editable.style.lineHeight = settings.spacing.value;
    editable.style.setProperty('--sheet-left',settings.left.value/21*100+'%');
    editable.style.setProperty('--sheet-right',settings.right.value/21*100+'%');

    for (const side of ['left','right']) {
      const margin = Number(settings[side].value);
      $('report-'+side+'-value').textContent = margin.toLocaleString('pt-BR')+' cm';
      root.querySelector('.report-ruler').style.setProperty('--margin-'+side,margin/21*100+'%');
    }
    schedulePages();
  };
  root.addEventListener('input',()=>{style();updateRuler();});
  root.addEventListener('change',()=>{style();updateRuler();});
  for (const button of root.querySelectorAll('[data-command]')) {
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => {
      const command = button.dataset.command;
      if (command==='undo' || command==='redo') {
        history.step(command==='undo'?-1:1);
        return;
      }
      const alignment = {justifyLeft:'left',justifyCenter:'center',justifyRight:'right',justifyFull:'justify'}[command];
      if (alignment) {
        for (const paragraph of selectedParagraphs()) paragraph.style.textAlign = alignment;
      } else {
        applyInlineCommand(command);
      }
      schedulePages();
    };
  }
  const extraSelections = [];
  const highlightKey = 'laudo-selecao-multipla';
  const comparePoints = (a,b) => a.index-b.index || a.offset-b.offset;
  function selectedText() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed ||
        !editable.contains(selection.anchorNode) || !editable.contains(selection.focusNode)) return null;
    const saved = editorSelection(editable);
    if (!saved) return null;
    const {anchor,focus} = saved;
    return comparePoints(anchor,focus)<=0 ? saved : {anchor:focus,focus:anchor};
  }
  function combinedSelections() {
    const active = selectedText();
    const sorted = (active ? [...extraSelections,active] : [...extraSelections])
      .sort((a,b)=>comparePoints(a.anchor,b.anchor));
    const merged = [];
    for (const selection of sorted) {
      const last = merged.at(-1);
      if (!last || comparePoints(selection.anchor,last.focus)>0) merged.push({...selection});
      else if (comparePoints(selection.focus,last.focus)>0) last.focus = selection.focus;
    }
    return merged;
  }
  editable.addEventListener('copy',event=>{
    if (!extraSelections.length || !event.clipboardData) return;
    const paragraphs = sheetNodes(editable);
    const text = combinedSelections().map(selection=>{
      const points = editorSelectionPoints(editable,selection);
      if (!points) return '';
      const [startNode,startOffset,endNode,endOffset] = points;
      return paragraphs.slice(selection.anchor.index,selection.focus.index+1).map((paragraph,index,group)=>{
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        if (index===0) range.setStart(startNode,startOffset);
        if (index===group.length-1) range.setEnd(endNode,endOffset);
        return range.toString();
      }).join('\n');
    }).filter(Boolean).join('\n');
    if (!text) return;
    event.clipboardData.setData('text/plain',text);
    event.preventDefault();
  });
  function paintExtraSelections() {
    if (!window.CSS?.highlights || typeof Highlight!=='function') return;
    const ranges = [];
    for (const selection of extraSelections) {
      const points = editorSelectionPoints(editable,selection);
      if (!points) continue;
      const range = document.createRange();
      range.setStart(points[0],points[1]);
      range.setEnd(points[2],points[3]);
      ranges.push(range);
    }
    if (ranges.length) CSS.highlights.set(highlightKey,new Highlight(...ranges));
    else CSS.highlights.delete(highlightKey);
  }
  function clearExtraSelections() {
    extraSelections.length = 0;
    window.CSS?.highlights?.delete(highlightKey);
  }
  function applyInlineCommand(command) {
    const selections = extraSelections.length ? combinedSelections() : [];
    editable.focus({preventScroll:true});
    if (!selections.length) {
      document.execCommand(command,false);
      return;
    }
    const enabled = selections.every(selection=>{
      restoreEditorSelection(editable,selection);
      return document.queryCommandState(command);
    });
    for (const selection of selections.toReversed()) {
      restoreEditorSelection(editable,selection);
      if (document.queryCommandState(command)===enabled) document.execCommand(command,false);
    }
    extraSelections.splice(0,extraSelections.length,...selections.slice(0,-1));
    restoreEditorSelection(editable,selections.at(-1));
    paintExtraSelections();
  }
  editable.addEventListener('pointerdown',event=>{
    if (event.button!==0) return;
    if (!event.ctrlKey && !event.metaKey) {
      clearExtraSelections();
      return;
    }
    const previous = selectedText();
    if (previous) extraSelections.push(previous);
    paintExtraSelections();
  });
  editable.addEventListener('mouseup',event=>{
    if (event.button!==0 || (!event.ctrlKey && !event.metaKey)) return;
    requestAnimationFrame(()=>{
      if (!root.isConnected || !root.closest('dialog')?.open) return;
      const selection = window.getSelection();
      const node = selection?.anchorNode;
      if (selection?.isCollapsed && node?.nodeType===3 && editable.contains(node)) {
        const offset = selection.anchorOffset;
        const word = [...node.data.matchAll(/[\p{L}\p{M}\p{N}_]+/gu)]
          .find(match=>offset>=match.index && offset<=match.index+match[0].length);
        if (word) selection.setBaseAndExtent(node,word.index,node,word.index+word[0].length);
      }
      paintExtraSelections();
    });
  });
  editable.addEventListener('beforeinput',event=>{
    if (!event.inputType?.startsWith('format')) clearExtraSelections();
  });
  editable.addEventListener('keydown',event=>{
    if (event.key==='Escape' && extraSelections.length) {
      event.preventDefault();
      clearExtraSelections();
    } else if (event.key.startsWith('Arrow') && !event.ctrlKey && !event.metaKey) clearExtraSelections();
  });
  let remembered = [];
  let lastTextRange = null;
  function selectedParagraphs() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editable.contains(selection.anchorNode) || !editable.contains(selection.focusNode)) {
      return remembered.filter(paragraph=>editable.contains(paragraph));
    }
    const range = selection.getRangeAt(0);
    const paragraphs = sheetNodes(editable).filter(node=>node.nodeType===1 && node.tagName!=='BR');
    if (range.collapsed) return paragraphs.filter(node=>node.contains(range.startContainer));
    return paragraphs.filter(node=>range.intersectsNode(node));
  }
  const firstIndent = $('first-indent');
  const ruler = root.querySelector('.report-ruler');
  const markerHandle = $('ruler-marker');
  const textHandle = $('ruler-text');
  const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
  const centimeters = value => Number(value.toFixed(3));
  function numberedLayout(paragraph) {
    return paragraph && !paragraph.dataset.table && (!paragraph.style.textAlign || ['left','justify'].includes(paragraph.style.textAlign)) &&
      listPrefix(paragraph) && paragraph.querySelector('[data-list-marker]');
  }
  function rulerPositions(paragraph) {
    const marker = numberedLayout(paragraph);
    if (!marker) return null;
    const gap = Number(paragraph.dataset.gap || 0);
    const base = Number(settings.left.value)+Number(paragraph.dataset.indent || 0);
    const first = Number(paragraph.dataset.first || 0);
    const width = editable.clientWidth ? marker.getBoundingClientRect().width*21/editable.clientWidth : 0;
    return {paragraph,gap,base,first,width};
  }
  function updateRuler() {
    const amount = Number(firstIndent.value);
    $('first-indent-value').textContent = amount.toLocaleString('pt-BR')+' cm';
    const base = Number(settings.left.value)+Number(remembered[0]?.dataset.indent||0);
    ruler.style.setProperty('--first-position',(base+amount)/21*100+'%');
    const position = rulerPositions(remembered[0]);
    markerHandle.hidden = textHandle.hidden = !position;
    ruler.classList.toggle('has-list-handles',Boolean(position));
    if (!position) return;
    const marker = clamp(position.base+position.first,0,21);
    const body = clamp(marker+position.width+position.gap,marker,21);
    for (const [handle,value] of [[markerHandle,marker],[textHandle,body]]) {
      handle.style.left = value/21*100+'%';
      handle.setAttribute('aria-valuenow',String(centimeters(value)));
      handle.setAttribute('aria-valuetext',centimeters(value).toLocaleString('pt-BR')+' cm');
    }
  }
  function moveListHandles(targets,moveMarker,delta) {
    for (const target of targets) {
      const {paragraph,base,first,gap,width} = target;
      if (!editable.contains(paragraph)) continue;
      if (moveMarker) {
        const change = clamp(delta,Math.max(-5-first,-base-first,gap-3),Math.min(5-first,gap));
        setFirstIndent(paragraph,centimeters(first+change));
        setListGap(paragraph,centimeters(gap-change));
      } else {
        const available = 21-Number(settings.right.value)-base-first-width;
        setListGap(paragraph,centimeters(clamp(gap+delta,0,Math.max(0,Math.min(3,available)))));
      }
    }
    firstIndent.value = remembered[0]?.dataset.first || 0;
    $('list-gap').value = remembered[0]?.dataset.gap || 0;
    showGap();
    updateRuler();
    schedulePages();
  }
  for (const handle of [markerHandle,textHandle]) {
    const moveMarker = handle===markerHandle;
    let drag;
    handle.addEventListener('pointerdown',event=>{
      if (event.button!==0) return;
      const targets = selectedParagraphs().map(rulerPositions).filter(Boolean);
      const width = ruler.getBoundingClientRect().width;
      if (!targets.length || !width) return;
      event.preventDefault();
      drag = {targets,width,x:event.clientX,id:event.pointerId};
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove',event=>{
      if (!drag || event.pointerId!==drag.id) return;
      moveListHandles(drag.targets,moveMarker,(event.clientX-drag.x)*21/drag.width);
      history.record('slider:'+handle.id);
    });
    for (const name of ['pointerup','pointercancel','lostpointercapture']) handle.addEventListener(name,()=>{
      drag = null;
      history.endGroup();
    });
    handle.addEventListener('keydown',event=>{
      if (event.key!=='ArrowLeft' && event.key!=='ArrowRight') return;
      const targets = selectedParagraphs().map(rulerPositions).filter(Boolean);
      if (!targets.length) return;
      event.preventDefault();
      history.rememberBefore();
      moveListHandles(targets,moveMarker,event.key==='ArrowRight'?.25:-.25);
      history.record();
    });
  }
  function trackSelection() {
    const selection = window.getSelection();
    if (!editable.contains(selection?.anchorNode)) return;
    remembered = selectedParagraphs();
    if (selection.rangeCount) lastTextRange = selection.isCollapsed ? null : selection.getRangeAt(0).cloneRange();
    firstIndent.min = listPrefix(remembered[0] ?? editable) ? '-5' : '0';
    firstIndent.value = remembered[0]?.dataset.first || 0;
    for (const key of ['spacing','after']) $('paragraph-'+key).value = remembered[0]?.dataset[key] ?? settings[key].value;
    $('list-gap').value = remembered[0]?.dataset.gap || 0;
    showGap();
    updateRuler();
  }
  document.addEventListener('selectionchange',trackSelection);
  editable.addEventListener('dblclick',event=>{
    const marker = event.target.closest?.('[data-list-marker]');
    if (!marker || !editable.contains(marker)) return;
    const paragraph = sheetNodes(editable).find(node=>node.contains(marker));
    const prefix = paragraph && listPrefix(paragraph);
    const range = prefix && markerRange(paragraph,prefix);
    if (!range) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    trackSelection();
  });
  const listGap = $('list-gap');
  const showGap = () => $('list-gap-value').textContent = Number(listGap.value).toLocaleString('pt-BR')+' cm';
  listGap.onfocus = () => {
    listGap.value = selectedParagraphs()[0]?.dataset.gap || 0;
    showGap();
  };
  listGap.oninput = () => {
    const paragraphs = selectedParagraphs().filter(listPrefix);
    if (!paragraphs.length) return;
    for (const paragraph of paragraphs) {
      setListGap(paragraph,Number(listGap.value));
      decorateListPrefix(paragraph);
    }
    showGap();
    schedulePages();
  };
  firstIndent.onfocus = ()=>{remembered = selectedParagraphs();updateRuler();};
  firstIndent.oninput = () => {
    for (const paragraph of remembered) if (editable.contains(paragraph)) setFirstIndent(paragraph,Number(firstIndent.value));
    updateRuler();
    schedulePages();
  };
  for (const key of ['spacing','after']) {
    const control = $('paragraph-'+key);
    control.value = settings[key].value;
    control.onmousedown = trackSelection;
    control.onchange = ()=>{
      const selected = selectedParagraphs();
      if (selected.length) {
        for (const paragraph of selected) setParagraphSpacing(paragraph,
          key==='spacing'?Number(control.value):undefined,key==='after'?Number(control.value):undefined);
      } else settings[key].value = control.value;
      style();
    };
  }
  function currentTextRange() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editable.contains(selection.anchorNode) && editable.contains(selection.focusNode)) return selection.getRangeAt(0);
    return lastTextRange;
  }
  function formatSelection(makeWrapper,normalize=false,afterWrap) {
    if (!applyToTextSelection(editable,currentTextRange(),makeWrapper)) {
      notice('Selecione o trecho que deseja formatar.');
      return false;
    }
    if (afterWrap) afterWrap();
    if (normalize) {
      const selected = window.getSelection().getRangeAt(0);
      const prefix = document.createRange();
      prefix.selectNodeContents(editable);
      prefix.setEnd(selected.startContainer,selected.startOffset);
      const start = prefix.toString().length;
      const end = start+selected.toString().length;
      fillEditor(editable,readBlocks(editable));
      const walker = document.createTreeWalker(editable,NodeFilter.SHOW_TEXT);
      let offset = 0;
      let first;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!first && start<offset+node.length) first = [node,start-offset];
        if (first && end<=offset+node.length) {
          window.getSelection().setBaseAndExtent(...first,node,end-offset);
          break;
        }
        offset += node.length;
      }
    }
    lastTextRange = window.getSelection()?.rangeCount && editable.contains(window.getSelection().anchorNode) ?
      window.getSelection().getRangeAt(0).cloneRange() : null;
    schedulePages();
    return true;
  }
  const selectionFamily = $('selection-family');
  selectionFamily.addEventListener('pointerdown',trackSelection);
  selectionFamily.onchange = () => {
    const family = selectionFamily.value;
    if (!Object.hasOwn(fontFamilies,family)) return;
    const range = currentTextRange();
    if (range && !range.collapsed) formatSelection(()=>{
      const span = document.createElement('span');
      setRunFamily(span,family);
      return span;
    });
    else {
      settings.family.value = family;
      style();
    }
    selectionFamily.value = '';
  };
  const selectionSize = $('selection-size');
  selectionSize.addEventListener('pointerdown',trackSelection);
  selectionSize.onchange = () => {
    const size = Number(selectionSize.value);
    if (!fontSizes.includes(size)) return;
    formatSelection(()=>{
      const span = document.createElement('span');
      setRunSize(span,size);
      return span;
    });
    selectionSize.value = '';
  };
  for (const menu of root.querySelectorAll('.editor-tool-menu')) {
    menu.querySelector('summary').onmousedown = () => trackSelection();
    menu.addEventListener('toggle',()=>{
      if (!menu.open) return;
      for (const other of root.querySelectorAll('.editor-tool-menu[open]')) if (other!==menu) other.open = false;
    });
  }
  for (const button of root.querySelectorAll('button[data-highlight]')) {
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => {
      const clear = button.dataset.highlight==='0';
      if (formatSelection(()=>{
        const mark = document.createElement(clear?'span':'mark');
        mark.dataset.highlight = button.dataset.highlight;
        return mark;
      },clear)) button.closest('details').open = false;
    };
  }
  function removeListMarker(paragraph) {
    const prefix = listPrefix(paragraph);
    if (!prefix) return false;
    decorateListPrefix(paragraph);
    const marker = paragraph.querySelector('[data-list-marker]');
    const preservingIndent = marker && editable.clientWidth && !paragraph.dataset.table &&
      (!paragraph.style.textAlign || ['left','justify'].includes(paragraph.style.textAlign));
    let continuation;
    if (preservingIndent) {
      let remaining = prefix.length;
      const runs = [];
      for (const run of readBlocks({childNodes:[paragraph]})[0].runs) {
        const text = run.text.slice(0,remaining);
        if (text) runs.push({...run,text});
        remaining -= text.length;
        if (!remaining) break;
      }
      continuation = {
        width:marker.getBoundingClientRect().width*21/editable.clientWidth,
        offset:Number(paragraph.dataset.first || 0)+Number(paragraph.dataset.gap || 0),
        runs
      };
    }
    const nodes = sheetNodes(editable);
    clearNumbering(paragraph);
    paragraph.removeAttribute('data-list-hanging');
    if (continuation) {
      setFirstIndent(paragraph,0);
      setListContinuation(paragraph,continuation);
    }
    if (!paragraph.textContent.trim() && !paragraph.querySelector('br')) paragraph.append(document.createElement('br'));
    let expected = prefix.index+1;
    for (const next of nodes.slice(nodes.indexOf(paragraph)+1)) {
      if (next.nodeType!==1) continue;
      const following = listPrefix(next);
      if (!following) continue;
      if (following.type!==prefix.type || following.index!==expected) break;
      numberParagraph(next,prefix.type,expected-1);
      expected++;
    }
    return true;
  }
  for (const button of root.querySelectorAll('button[data-list]')) {
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => {
      const paragraphs = selectedParagraphs().filter(paragraph=>paragraph.textContent.trim());
      if (!paragraphs.length) return notice('Selecione os parágrafos que deseja enumerar.');
      const type = button.dataset.list;
      if (type==='clear') paragraphs.reverse().forEach(removeListMarker);
      else paragraphs.forEach((paragraph,index)=>numberParagraph(paragraph,type,index));
      button.closest('details').open = false;
      schedulePages();
    };
  }
  const brush = $('format-brush');
  let copiedFormat = null;
  brush.onmousedown = event => event.preventDefault();
  brush.onclick = () => {
    if (copiedFormat) {
      copiedFormat = null;
      brush.setAttribute('aria-pressed','false');
      brush.title = 'Pincel de formatação';
      return;
    }
    const range = currentTextRange();
    const source = range?.startContainer;
    if (!source || !editable.contains(source)) return notice('Selecione o trecho cuja formatação deseja copiar.');
    const chain = [];
    let node = source.nodeType===1 ? source : source.parentElement;
    for (;node && node!==editable;node=node.parentElement) chain.unshift(node);
    const paragraph = sheetNodes(editable).find(node=>node.nodeType===1 && node.contains(source));
    const paragraphFormat = paragraph ? {
      align:paragraph.style.textAlign || 'left',
      indent:Number(paragraph.dataset.indent || 0),
      first:Number(paragraph.dataset.first || 0),
      spacing:Number(paragraph.dataset.spacing ?? settings.spacing.value),
      after:Number(paragraph.dataset.after ?? settings.after.value),
      list:listPrefix(paragraph)?.type,
      gap:Number(paragraph.dataset.gap || 0)
    } : null;
    copiedFormat = {...chain.reduce((format,element)=>inlineFormat(element,format),{style:0}),paragraph:paragraphFormat};
    brush.setAttribute('aria-pressed','true');
    brush.title = 'Cancelar pincel';
    notice('Selecione o trecho de destino para aplicar a formatação.');
  };
  function applyFormatBrush() {
    if (!copiedFormat) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const format = copiedFormat;
    const paragraphs = selectedParagraphs();
    if (formatSelection(()=>{
      const span = document.createElement('span');
      span.dataset.formatStyle = format.style;
      span.dataset.formatSize = format.size || 0;
      span.dataset.formatFamily = format.family || '';
      return span;
    },true,()=>{
      const layout = format.paragraph;
      if (!layout) return;
      const order = sheetNodes(editable);
      const previous = order[order.indexOf(paragraphs[0])-1];
      const marker = previous?.nodeType===1 ? listPrefix(previous) : null;
      let index = marker?.type===layout.list && marker ? marker.index+1 : 0;
      for (const paragraph of paragraphs) {
        paragraph.style.textAlign = layout.align;
        setIndent(paragraph,layout.indent);
        setFirstIndent(paragraph,layout.first);
        setParagraphSpacing(paragraph,layout.spacing,layout.after);
        if (layout.list && paragraph.textContent.trim()) {
          numberParagraph(paragraph,layout.list,index++);
          setListGap(paragraph,layout.gap);
        }
        else clearNumbering(paragraph);
      }
    })) {
      copiedFormat = null;
      brush.setAttribute('aria-pressed','false');
      brush.title = 'Pincel de formatação';
    }
  }
  editable.addEventListener('pointerup',applyFormatBrush);
  editable.addEventListener('keyup',event=>{
    if (event.shiftKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) applyFormatBrush();
  });
  const activeParagraph = () => selectedParagraphs()[0] ?? null;
  function toggleBreak() {
    const paragraph = activeParagraph();
    if (!paragraph) return;
    if (paragraph.dataset.page) delete paragraph.dataset.page;
    else paragraph.dataset.page = 'true';
    schedulePages();
  }
  const features = {
    'report-break':toggleBreak,
    'report-indent':()=>{const p=activeParagraph();if(p) setIndent(p,Math.min(5,Number(p.dataset.indent||0)+.5));},
    'report-outdent':()=>{const p=activeParagraph();if(p) setIndent(p,Math.max(0,Number(p.dataset.indent||0)-.5));}
  };
  for (const [id,action] of Object.entries(features)) {
    $(id).onmousedown = event => event.preventDefault();
    $(id).onclick = () => {action();schedulePages();};
  }
  function continueNumbering(event) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const paragraph = activeParagraph();
    if (!paragraph || !paragraph.contains(range.startContainer) || !paragraph.contains(range.endContainer)) return;
    const current = listPrefix(paragraph);
    if (!current) return;

    const before = document.createRange();
    before.selectNodeContents(paragraph);
    before.setEnd(range.startContainer,range.startOffset);
    if (before.toString().length<current.length) return;

    event.preventDefault();
    range.deleteContents();
    const tail = document.createRange();
    tail.selectNodeContents(paragraph);
    tail.setStart(range.startContainer,range.startOffset);
    const next = paragraph.cloneNode(false);
    delete next.dataset.page;
    delete next.dataset.list;
    next.append(tail.extractContents());
    const hasTail = next.textContent.trim();
    const prefix = numberParagraph(next,current.type,current.index+1,false,markerFormat(paragraph));
    if (!hasTail) next.append(document.createElement('br'));

    const siblings = sheetNodes(editable);
    let expected = current.index+1;
    for (const later of siblings.slice(siblings.indexOf(paragraph)+1)) {
      if (later.nodeType!==1) break;
      const marker = listPrefix(later);
      if (!marker || marker.type!==current.type || marker.index!==expected) break;
      numberParagraph(later,current.type,expected+1);
      expected++;
    }
    paragraph.after(next);
    selection.collapse(prefix,prefix.length);
    schedulePages();
  }
  function deleteNumbering(event) {
    const type = event.inputType;
    if (!type.startsWith('delete')) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const paragraph = activeParagraph();
    if (!paragraph || !paragraph.contains(range.startContainer) || !paragraph.contains(range.endContainer)) return;
    const prefix = listPrefix(paragraph);
    if (!prefix) return;
    const before = document.createRange();
    before.selectNodeContents(paragraph);
    before.setEnd(range.startContainer,range.startOffset);
    const start = before.toString().length;
    const end = start+range.toString().length;
    const markerEnd = prefix.start+prefix.markerLength;
    const selectedMarker = !range.collapsed && start<=prefix.start && end>=markerEnd && end<=prefix.length;
    const backspaceAtText = range.collapsed && type==='deleteContentBackward' && start>=markerEnd && start<=prefix.length;
    const deleteAtMark = range.collapsed && type==='deleteContentForward' && start>=prefix.start && start<markerEnd;
    if (!(selectedMarker || backspaceAtText || deleteAtMark)) return;
    event.preventDefault();
    removeListMarker(paragraph);
    const cursor = document.createRange();
    cursor.selectNodeContents(paragraph);
    cursor.collapse(true);
    selection.removeAllRanges();
    selection.addRange(cursor);
    schedulePages();
  }
  editable.addEventListener('beforeinput',event=>{
    if (!event.cancelable || event.isComposing) return;
    if (event.inputType==='insertParagraph') continueNumbering(event);
    else deleteNumbering(event);
  });
  editable.addEventListener('keydown',event=>{
    if (event.key!=='Enter' || event.isComposing) return;
    if (event.ctrlKey||event.metaKey) {
      event.preventDefault();
      toggleBreak();
    } else if (!event.shiftKey && !event.altKey) continueNumbering(event);
  });
  const expand = $('report-expand');
  expand.onclick = () => {
    const large = root.closest('dialog').classList.toggle('expanded-editor');
    expand.setAttribute('aria-pressed',String(large));
    expand.textContent = large?'Voltar ao tamanho padrão':'Expandir editor';
  };
  let priorWidth;
  const observer = new ResizeObserver(()=>{
    if (editable.clientWidth===priorWidth) return;
    priorWidth = editable.clientWidth;
    schedulePages();
  });
  observer.observe(editable);
  document.fonts.ready.then(schedulePages);
  editable.addEventListener('compositionstart',()=>{composing=true;});
  editable.addEventListener('compositionend',()=>{composing=false;schedulePages();});
  root.closest('dialog').addEventListener('close',()=>{
    root.closest('dialog')?.classList.remove('expanded-editor');
    observer.disconnect();
    clearExtraSelections();
    document.removeEventListener('selectionchange',trackSelection);
    cancelAnimationFrame(frame);
  },{once:true});
  editable.addEventListener('click',event=>{
    const button = event.target.closest?.('[data-remove-image]');
    if (!button) return;
    button.closest('[data-image]').remove();
    schedulePages();
  });
  editable.addEventListener('load',event=>{
    if (event.target.tagName==='IMG') schedulePages();
  },true);
  editable.onpaste = async event => {
    event.preventDefault();
    const files = [...(event.clipboardData?.files || [])];
    const image = files.find(file=>file.type.startsWith('image/')) ||
      [...(event.clipboardData?.items || [])].find(item=>item.kind==='file' && item.type.startsWith('image/'))?.getAsFile();
    if (!image) {
      document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));
      return;
    }
    if (editable.dataset.uploading) return;
    const status = $('editor-save-error');
    status.hidden = false;
    status.textContent = 'Enviando imagem…';
    editable.dataset.uploading = 'true';
    const paragraph = activeParagraph();
    try {
      if (!['image/png','image/jpeg'].includes(image.type)) throw new Error('Cole uma imagem PNG ou JPEG.');
      if (image.size>5*1024*1024) throw new Error('A imagem ultrapassa 5 MB.');
      const response = await fetch('/api/imagens',{method:'POST',headers:{'Content-Type':image.type},body:image});
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Falha ao enviar a imagem.');
      if (!editable.isConnected || !root.closest('dialog')?.open) return;
      const block = imageBlock(body.key);
      const next = document.createElement('div');
      next.append(document.createElement('br'));
      if (paragraph && editable.contains(paragraph)) paragraph.after(block,next);
      else (editable.querySelector('.report-sheet:last-child') || editable).append(block,next);
      window.getSelection().collapse(next,0);
      schedulePages();
      history.record();
      status.hidden = true;
    } catch (error) {
      status.textContent = error.message;
    } finally {delete editable.dataset.uploading;}
  };
  editable.ondrop = event => event.preventDefault();
  const readEditor = () => ({
    family:settings.family.value,size:Number(settings.size.value),color:settings.color.value,
    watermark:settings.watermark.value.trim(),paper:settings.paper.value,left:Number(settings.left.value),right:Number(settings.right.value),spacing:Number(settings.spacing.value),after:Number(settings.after.value),blocks:readBlocks(editable)
  });
  const selectModel = $('saved-models');
  const loadModel = $('load-model');
  const saveModel = $('save-model');
  const deleteModel = $('delete-model');
  const defaultModel = $('default-model');
  function updateModelButtons() {
    loadModel.disabled = deleteModel.disabled = defaultModel.disabled = !selectModel.value;
    defaultModel.textContent = selectModel.value && selectModel.value===state.defaultModel ? 'Remover da abertura' : 'Usar na abertura';
  }
  function listModels(selected=selectModel.value || state.defaultModel) {
    selectModel.replaceChildren(new Option('Selecione um modelo',''));
    for (const model of state.models || []) {
      selectModel.add(new Option(model.name+(model.id===state.defaultModel?' · padrão':''),model.id));
    }
    selectModel.value = (state.models||[]).some(model=>model.id===selected) ? selected : '';
    updateModelButtons();
  }
  selectModel.onchange = updateModelButtons;
  loadModel.onclick = () => {
    const model = (state.models||[]).find(model=>model.id===selectModel.value);
    if (!model) return;
    if (reportText(readEditor()).trim() && !window.confirm('Carregar este modelo no laudo aberto? Salve o laudo para aplicar a troca.')) return;
    const format = reportFromModel(item,dialogForm,model);
    for (const key of Object.keys(settings)) settings[key].value = format[key];
    for (const key of ['spacing','after']) $('paragraph-'+key).value = settings[key].value;
    fillEditor(editable,format.blocks);
    clearExtraSelections();
    lastTextRange = null;
    style();
    editable.focus();
  };
  defaultModel.onclick = async () => {
    const id = selectModel.value;
    if (!id) return;
    const clear = id===state.defaultModel;
    defaultModel.disabled = true;
    try {
      await sync('/api/modelos/padrao',{id:clear?'':id});
      listModels(id);
      notice(clear?'Modelo removido da abertura.':'Modelo definido para a abertura de laudos em branco.');
    } catch (error) {notice(error.message);}
    finally {updateModelButtons();}
  };
  deleteModel.onclick = async () => {
    const model = (state.models||[]).find(model=>model.id===selectModel.value);
    if (!model || !window.confirm('Excluir o modelo "'+model.name+'"?')) return;
    deleteModel.disabled = true;
    try {
      await sync('/api/modelos/excluir',{id:model.id});
      listModels('');
      notice('Modelo excluído.');
    } catch (error) {notice(error.message);}
    finally {updateModelButtons();}
  };
  saveModel.onclick = async () => {
    const format = readEditor();
    const vara = dialogForm.elements.vara.value.trim();
    const date = dialogForm.elements.date.value;
    for (const block of format.blocks) for (const run of block.runs) {
      run.text = run.text.replaceAll('Autos n. '+item.number,'Autos n. {{PROCESSO}}');
      if (vara) run.text = run.text.replaceAll('Juízo: '+vara,'Juízo: {{VARA}}').replaceAll('AO JUÍZO — '+vara,'AO JUÍZO — {{VARA}}');
      if (date) run.text = run.text.replaceAll('Perícia médica realizada em '+display(date),'Perícia médica realizada em {{DATA}}');
    }
    if (!reportText(format).trim()) return notice('Preencha o texto antes de salvar como modelo.');
    const name = window.prompt('Nome do novo modelo. Use texto reaproveitável e retire dados específicos do caso.');
    if (!name?.trim()) return;
    saveModel.disabled = true;
    try {
      await sync('/api/modelos',{name:name.trim(),format});
      listModels();
      notice('Modelo salvo.');
    } catch (error) {notice(error.message);}
    finally {saveModel.disabled = false;}
  };
  const history = editorHistory(readEditor,(format,selection)=>{
    for (const key of Object.keys(settings)) settings[key].value = format[key];
    for (const key of ['spacing','after']) $('paragraph-'+key).value = settings[key].value;
    fillEditor(editable,format.blocks);
    remembered = [];
    clearExtraSelections();
    lastTextRange = null;
    editable.focus({preventScroll:true});
    restoreEditorSelection(editable,selection);
    trackSelection();
    style();
    updateRuler();
  },()=>editorSelection(editable));
  root.addEventListener('keydown',event=>{
    if (!(event.ctrlKey||event.metaKey) || event.altKey || event.isComposing) return;
    const key = event.key.toLowerCase();
    const command = inlineShortcuts[key];
    if (command && !event.shiftKey && editable.contains(event.target)) {
      event.preventDefault();
      history.rememberBefore();
      applyInlineCommand(command);
      history.record();
      schedulePages();
      return;
    }
    if (key!=='z' && key!=='y') return;
    event.preventDefault();
    history.step(key==='y' || event.shiftKey?1:-1);
  },true);
  root.addEventListener('beforeinput',event=>{
    const type = event.inputType;
    if ((type==='historyUndo' || type==='historyRedo') && event.cancelable) {
      event.preventDefault();
      history.step(type==='historyUndo'?-1:1);
    } else history.rememberBefore();
  },true);
  root.addEventListener('pointerdown',()=>{history.endGroup();history.rememberBefore();},true);
  root.addEventListener('keydown',event=>{
    if (event.key==='Enter' || event.shiftKey) history.rememberBefore();
  },true);
  root.addEventListener('input',event=>{
    const type = event.inputType;
    const typing = editable.contains(event.target) && ['insertText','deleteContentBackward','deleteContentForward'].includes(type);
    const slider = event.target.type==='range' ? 'slider:'+event.target.id : null;
    if (!composing && !event.isComposing) history.record(typing?type:slider);
  });
  root.addEventListener('change',()=>{history.record();history.endGroup();});
  root.addEventListener('click',()=>history.record());
  editable.addEventListener('compositionend',()=>history.record());
  editable.addEventListener('pointerup',()=>history.record());
  editable.addEventListener('keyup',event=>{
    if (event.shiftKey) history.record();
  });
  editable.addEventListener('keydown',event=>{
    if (event.key==='Enter' && event.defaultPrevented) history.record();
  });
  editable.addEventListener('beforeinput',event=>{
    if (event.defaultPrevented && (event.inputType==='insertParagraph' || event.inputType.startsWith('delete'))) history.record();
  });
  listModels();
  style();
  updateRuler();
  return readEditor;
}
