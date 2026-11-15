const stageColors = {3:"review",4:"ready",5:"filed",6:"absent"};
const labels = ['1 · Preparar minuta','2 · Exame médico','3 · Quesitos','4 · Revisão médica','5 · Pronto para entrega','Juntado','Faltou'];
const owners = ['Com você','Com a perita','Com você','Com a perita','Com você'];
const $ = id => document.getElementById(id);
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Cuiaba'}).format(new Date());
const display = date => date.split('-').reverse().join('/');
const hasBlankReport = item => !item.format && (!item.text.trim() || item.text.trim()===template(item.number).trim());
const template = number => ['LAUDO MÉDICO PERICIAL','','Processo: '+number,'','I. Identificação','','II. Histórico e exame pericial','','III. Discussão e conclusão','','IV. Respostas aos quesitos',''].join(String.fromCharCode(10));
let state = {dates:[],cases:[]};
let revision;
let committed = new Map();
const documents = new Map();
let role;
let reviewer = '';
let pending = false;
let generated;
const sanitize = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const daysLeft = item => item.due && item.stage !== 5 && item.stage !== 6 ? (Date.parse(item.due)-Date.parse(today()))/86400000 : Infinity;
let noticeTimer;
function notice(message) {
  $('notice').textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('notice').textContent = '',3500);
}
async function sync(path='/api/agenda',body) {
  if (pending) throw new Error('Aguarde a atualização em andamento.');
  pending = true;
  try {
    const url = !body && path==='/api/agenda' && revision!==undefined ? path+'?since='+revision : path;
    const response = await fetch(url,body ? {
      method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,...body})
    } : undefined);
    if (response.status===304) return;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha na comunicação com a agenda.');
    ({state,revision,role,reviewer} = data);
    documents.clear();
    for (const document of data.documents || []) documents.set(document.id,document);
    committed = new Map(state.cases.map(item=>[item.id,serialCase(item)]));
    $('account').textContent = role==='perita' ? 'Conta da perita' : 'Conta do responsável';
    $('perita').hidden = role!=='responsavel';
    $('import-config').hidden = role!=='responsavel';
    $('new-date').disabled = false;
    render();
  } finally {
    pending = false;
  }
}
async function refresh(announce=true) {
  if ($('dialog').open || pending) return;
  try {
    await sync();
    if (announce) notice('Painel atualizado.');
  } catch (error) {
    notice(error.message);
  }
}
function serialCase({history,...item}) {
  return JSON.stringify(item);
}
async function save() {
  const cases = state.cases.filter(item=>serialCase(item)!==committed.get(item.id)).map(item=>{const {history,...record} = {...documents.get(item.id),...item};return record;});
  await sync('/api/agenda',{patch:{dates:state.dates,dateDetails:state.dateDetails,cases}});
}
$('import-config').onclick = () => $('config-file').click();
$('config-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const config = JSON.parse(await file.text());
    await sync('/api/configuracoes/importar',{config});
    notice('Configurações e modelos importados.');
  } catch (error) {notice(error instanceof SyntaxError?'Arquivo de configurações inválido.':error.message);}
  finally {event.target.value = '';}
};
$('refresh').onclick = () => refresh();
$('perita').onclick = () => form('Conta da perita',
  '<label>E-mail da conta autorizada da perita<input name="email" type="email" value="'+sanitize(reviewer)+'" required></label><p class="meta">O e-mail também precisa ter acesso ao site.</p>',
  'Salvar e-mail', async data => {
    await sync('/api/perita',{email:data.get('email').trim()});
    notice('E-mail da perita salvo.');
  });
function render() {
  const query = $('search').value.trim().toLowerCase();
  const urgent = $('urgent').checked;
  $('stats').innerHTML = [
    ['Processos cadastrados',state.cases.length],
    ['Prazos próximos ou atrasados',state.cases.filter(item => daysLeft(item)<=3).length],
    ['Laudos juntados',state.cases.filter(item => item.stage===5).length]
  ].map(([label,value]) => '<div class="stat">'+label+'<strong>'+value+'</strong></div>').join('');
  $('board').innerHTML = [...state.dates].sort().map(date => {
    const cases = state.cases.filter(item => item.date===date);
    const visible = cases.filter(item => (!urgent || daysLeft(item)<=3) && (item.number+' '+item.vara).toLowerCase().includes(query));
    if ((urgent || query) && !visible.length) return '';
    return '<section class="column"><div class="column-head"><div><h3>'+display(date)+'</h3><p>'+cases.length+' processo(s)</p></div><div class="actions"><button data-add="'+date+'">＋ Processo</button>'+(role==='responsavel' ? '<button class="danger" data-delete-date="'+date+'">Excluir data</button>' : '')+'</div></div>'+
      (visible.map(card).join('') || '<p class="empty">Nenhum processo nesta data.</p>')+'</section>';
  }).join('') || '<p class="empty">Nenhum processo encontrado.</p>';
}
function card(item) {
  const days = daysLeft(item);
  const status = days < 0 ? 'Atrasado' : days === 0 ? 'Vence hoje' : days <= 3 ? 'Vence em '+days+' dia(s)' : '';
  const assigned = (role==='perita' ? ['Com o responsável','Com você','Com o responsável','Com você','Com o responsável'] : owners)[item.stage];
  const remove = role==='responsavel' ? '<button type="button" class="danger card-delete" data-delete="'+item.id+'" aria-label="Excluir laudo" title="Excluir laudo">×</button>' : '';
  return '<article class="card process-card"><div class="process-card-title"><div><strong>'+sanitize(item.number)+'</strong>'+
    '<p class="meta">'+sanitize(item.vara || 'Vara a informar')+'</p></div>'+remove+'</div>'+
    '<div class="process-card-status"><span class="tag stage-'+(stageColors[item.stage]||'normal')+'">'+labels[item.stage]+'</span>'+(assigned?'<span class="meta">'+assigned+'</span>':'')+'</div>'+
    '<p class="deadline '+(days<0?'late':days<=3?'soon':'')+'">'+(item.due ? 'Entrega em '+display(item.due) : 'Prazo a definir')+(status?' · '+status:'')+'</p>'+
    '<div class="actions"><button type="button" data-edit="'+item.id+'">Editar laudo</button>'+
    ([4,5].includes(item.stage)?'<button type="button" data-convert="'+item.id+'">Converter em PDF</button>':'')+
    (item.converted?'<button type="button" data-download="'+item.id+'">Baixar PDF</button>':'')+'</div></article>';
}
function form(title, fields, submitLabel, submit, {stayOpen=false,toolbarClose=false}={}) {
  const close = toolbarClose ? '' : '<button type="button" data-dialog-close aria-label="Fechar">✕</button>';
  $('panel').innerHTML = '<form><div class="formhead"><h2>'+sanitize(title)+'</h2>'+close+'</div>'+fields+
    '<p class="error" role="alert"></p><div><button class="primary">'+submitLabel+'</button></div></form>';
  const element = $('panel').querySelector('form');
  element.querySelector('[data-dialog-close]').onclick = () => $('dialog').close();
  const savedStatus = element.querySelector('#editor-save-status');
  if (savedStatus) element.addEventListener('input',()=>{savedStatus.textContent = '';});
  element.onsubmit = async event => {
    event.preventDefault();
    const submitButtons = [...element.querySelectorAll('.primary, .editor-save')];
    if (submitButtons.some(button=>button.disabled)) return;
    const before = structuredClone(state);
    const toolbarError = element.querySelector('#editor-save-error');
    element.querySelector('.error').textContent = '';
    if (toolbarError) toolbarError.hidden = true;
    if (savedStatus) savedStatus.textContent = '';
    for (const button of submitButtons) button.disabled = true;
    try {
      const error = await submit(new FormData(element));
      if (error) throw new Error(error);
    } catch (error) {
      state = before;
      element.querySelector('.error').textContent = error.message;
      if (toolbarError && event.submitter?.classList.contains('editor-save')) {
        toolbarError.textContent = error.message;
        toolbarError.hidden = false;
      }
      return;
    } finally {
      for (const button of submitButtons) button.disabled = false;
    }
    if (!stayOpen) $('dialog').close();
    if (savedStatus) savedStatus.textContent = 'Laudo salvo.';
    render();
  };
  $('dialog').showModal();
}
$('new-date').onclick = () => form('Nova data','<label>Data da perícia<input type="date" name="date" value="'+today()+'" required></label><div class="row"><label>Comarca e vara<select name="vara"><option value="">Selecione a comarca e vara</option><option>Pontes e Lacerda - 1 Vara</option><option>Pontes e Lacerda - 2 Vara</option><option>Jauru</option><option>Vila Bela da Ssª. Trindade</option></select></label><label>Prazo de entrega<input type="date" name="due"></label></div>','Criar coluna', async data => {
  const date = data.get('date');
  if (state.dates.includes(date)) return 'Já existe uma coluna com essa data.';
  state.dates.push(date);
  (state.dateDetails ??= {})[date] = {vara:data.get('vara').trim(),due:data.get('due')};
  await save();
});
function detailsForDate(date) {
  const saved = state.dateDetails?.[date];
  if (saved) return saved;
  const cases = state.cases.filter(item=>item.date===date);
  const common = key => cases.length && cases.every(item=>item[key]===cases[0][key]) ? cases[0][key] : '';
  return {vara:common('vara'),due:common('due')};
}
function addCases(date) {
  form('Processos de '+display(date),'<label>Números dos processos, um por linha<textarea name="numbers" rows="6" required placeholder="EXEMPLO-006"></textarea></label>','Cadastrar processos', async data => {
    const numbers = [...new Set(data.get('numbers').split(/\r?\n/).map(line=>line.trim()).filter(Boolean))];
    if (!numbers.length) return 'Informe ao menos um número de processo.';
    const duplicated = numbers.find(number => state.cases.some(item=>item.number===number));
    if (duplicated) return 'O processo '+duplicated+' já foi cadastrado.';
    const {vara,due} = detailsForDate(date);
    state.cases.push(...numbers.map(number=>({number,id:crypto.randomUUID(),date,vara,due,stage:0,text:template(number),converted:false})));
    await save();
  });
}
async function loadReport(id) {
  const response = await fetch('/api/laudo?'+new URLSearchParams({id,revision}));
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível abrir o laudo.');
  documents.set(id,data);
  return data;
}

function edit(item) {
  const versions = entry => (entry.history || []).map(version => '<details><summary>'+
    sanitize(new Date(version.at).toLocaleString('pt-BR',{timeZone:'America/Cuiaba'}))+' · '+labels[version.stage]+' · '+version.role+
    '</summary><pre class="version">'+sanitize(version.text)+'</pre></details>').join('');
  const history = '<details><summary>Histórico de versões</summary><div id="report-versions">'+versions(item)+'</div></details>';
  const options = labels.map((label,index)=>'<option value="'+index+'" '+(index===item.stage?'selected':'')+'>'+label+'</option>').join('');
  const reportDetails = '<input type="hidden" name="date" value="'+sanitize(item.date)+'">'+
    '<input type="hidden" name="due" value="'+sanitize(item.due)+'">'+
    '<input type="hidden" name="vara" value="'+sanitize(item.vara)+'">';
  form(item.number,reportDetails+editorFields(options)+history,'Salvar laudo', async data => {
    if ($('panel').querySelector('.report-body')?.dataset.uploading) return 'Aguarde o envio da imagem.';
    const index = state.cases.findIndex(entry=>entry.id===item.id);
    item = {...item,...documents.get(item.id),...state.cases[index]};
    state.cases[index] = item;
    const edited = readEditor();
    const format = JSON.stringify(edited)===original ? item.format : edited;
    const text = format ? reportText(format) : item.text;
    if (!text.trim() && !format?.blocks.some(block=>block.image)) return 'Digite o texto do laudo.';
    const formattingChanged = JSON.stringify(format ?? null)!==JSON.stringify(item.format ?? null);
    const stage = Number(data.get('stage'));
    const changed = formattingChanged || item.text!==text || item.date!==data.get('date') || item.vara!==data.get('vara').trim();
    if (changed || stage<4 || stage===6) item.converted = false;
    item.stage = stage;
    item.text = text;
    item.format = format;
    item.date = data.get('date');
    item.due = data.get('due');
    item.vara = data.get('vara').trim();
    if (!state.dates.includes(item.date)) state.dates.push(item.date);
    await save();
    original = JSON.stringify(edited);
    item = documents.get(item.id) || item;
    $('report-versions').innerHTML = versions(item);
  },{stayOpen:true,toolbarClose:true});
  const readEditor = initEditor(item);
  let original = hasBlankReport(item) ? null : JSON.stringify(readEditor());
}
function confirmDeletion(title, message, submit) {
  form(title,message,'Excluir definitivamente',submit);
  $('panel').querySelector('.primary').classList.add('danger');
  $('panel').querySelector('form').insertAdjacentHTML('beforeend','<div><button type="button" id="cancel-delete">Cancelar</button></div>');
  $('cancel-delete').onclick = () => $('dialog').close();
  $('cancel-delete').focus();
}
$('board').onclick = async event => {
  const button = event.target.closest('button');
  if (!button || pending) return;
  const {add,edit:editId,convert,download,delete:deleteId,deleteDate} = button.dataset;
  if (add) return addCases(add);
  if (deleteDate && role==='responsavel') {
    const count = state.cases.filter(entry=>entry.date===deleteDate).length;
    const detail = count===0 ? 'A coluna está vazia.' :
      'A exclusão é definitiva e inclui '+count+(count===1 ? ' laudo e seu histórico.' : ' laudos e seus históricos.');
    return confirmDeletion('Excluir data',
      '<p>Excluir a coluna de <strong>'+display(deleteDate)+'</strong>? '+detail+'</p>',
      async () => {
        await sync('/api/datas/excluir',{date:deleteDate});
        generated = undefined;
        notice('Data excluída.');
      });
  }
  let item = state.cases.find(entry=>entry.id===(editId || convert || download || deleteId));
  if (!item) return;
  if (editId || convert || download) {
    const start = revision;
    button.disabled = true;
    try {
      item = await loadReport(item.id);
      if (revision!==start) throw new Error('A agenda mudou. Abra o laudo novamente.');
    } catch (error) {notice(error.message);return;}
    finally {button.disabled = false;}
  }
  if (editId) return edit(item);
  if (deleteId && role==='responsavel') {
    return confirmDeletion('Excluir laudo',
      '<p>Excluir o laudo do processo <strong>'+sanitize(item.number)+'</strong>? O cadastro deste processo e seu histórico serão apagados da agenda.</p>',
      async () => {
        await sync('/api/laudos/excluir',{id:item.id});
        if (generated?.id===item.id) generated = undefined;
        notice('Laudo excluído.');
      });
  }
  if (convert && [4,5].includes(item.stage)) {
    const sourceRevision = revision;
    const previouslyConverted = item.converted;
    button.disabled = true;
    try {
      const blob = await createFormattedPdf(getReport(item));
      if (revision!==sourceRevision || pending) throw new Error('O painel foi atualizado. Clique em Converter em PDF novamente.');
      state.cases.find(entry=>entry.id===item.id).converted = true;
      await save();
      generated = {id:item.id, revision, blob};
      notice('PDF pronto para baixar.');
    } catch (error) {
      if (revision===sourceRevision) {
        const latest = state.cases.find(entry=>entry.id===item.id);
        if (latest) latest.converted = previouslyConverted;
      }
      notice(error.message);
    }
    render();
  }
  if (download && item.converted) {
    const link = document.createElement('a');
    button.disabled = true;
    try {
      const blob = generated?.id===item.id && generated.revision===revision ? generated.blob : await createFormattedPdf(getReport(item));
      link.href = URL.createObjectURL(blob);
    } catch (error) {
      notice(error.message);
      return;
    } finally {
      button.disabled = false;
    }
    link.download = 'laudo-'+item.number.replace(/[^a-zA-Z0-9.-]/g,'_')+'.pdf';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
};
$('search').addEventListener('input',render);
$('urgent').addEventListener('change',render);
render();
refresh(false);
setInterval(()=>refresh(false),30000);
