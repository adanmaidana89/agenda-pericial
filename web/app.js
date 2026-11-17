const stageColors = {1:"exam",2:"questions",3:"review",4:"ready",5:"filed",6:"absent"};
const labels = ['1 · Preparar minuta','2 · Exame médico','3 · Quesitos','4 · Revisão médica','5 · Pronto para entrega','Juntado','Faltou'];
const stageFilters = {adan:[0,2,4,5,6],wes:[1,3,6]};
const owners = ['Com você','Com a perita','Com você','Com a perita','Com você'];
const $ = id => document.getElementById(id);
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Cuiaba'}).format(new Date());
const display = date => date.split('-').reverse().join('/');
const hasBlankReport = item => !item.format && (!item.text.trim() || item.text.trim()===template(item.text.split('\n')[2]?.slice('Processo: '.length)).trim());
const template = number => ['LAUDO MÉDICO PERICIAL','','Processo: '+number,'','I. Identificação','','II. Histórico e exame pericial','','III. Discussão e conclusão','','IV. Respostas aos quesitos',''].join(String.fromCharCode(10));
let state = {dates:[],cases:[]};
let revision;
let committed = new Map();
const documents = new Map();
let role;
let reviewer = '';
let pending = false;
let generated;
let archiveView = false;
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
    const previousRole = role;
    ({state,revision,role,reviewer} = data);
    if (role!==previousRole) $('stage-filter').value = role==='perita' ? 'wes' : 'adan';
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
$('archive-view').onclick = () => {
  archiveView = !archiveView;
  $('urgent').checked = false;
  render();
};
function render() {
  const query = $('search').value.trim().toLowerCase();
  const urgent = $('urgent').checked;
  const stages = stageFilters[$('stage-filter').value];
  const archived = new Set(state.archivedDates ?? []);
  const activeCases = state.cases.filter(item=>!archived.has(item.date));
  $('board-title').textContent = archiveView ? 'Perícias arquivadas' : 'Perícias por data';
  $('archive-view').textContent = archiveView ? 'Voltar às perícias ativas' : 'Consultar arquivados';
  $('archive-view').setAttribute('aria-pressed',String(archiveView));
  $('stats').innerHTML = [
    ['Processos cadastrados',state.cases.length],
    ['Prazos próximos ou atrasados',activeCases.filter(item => daysLeft(item)<=3).length],
    ['Laudos juntados',state.cases.filter(item => item.stage===5).length]
  ].map(([label,value]) => '<div class="stat">'+label+'<strong>'+value+'</strong></div>').join('');
  $('board').innerHTML = state.dates.filter(date=>archived.has(date)===archiveView).sort().map(date => {
    const cases = state.cases.filter(item => item.date===date);
    const visible = cases.filter(item => (!stages || stages.includes(item.stage)) && (!urgent || daysLeft(item)<=3) && (item.number+' '+item.vara).toLowerCase().includes(query));
    if ((urgent || query) && !visible.length) return '';
    const addButton = archiveView ? '' : '<button data-add="'+date+'">＋ Processo</button>';
    const archiveButton = role!=='responsavel' ? '' : archiveView
      ? '<button data-restore-date="'+date+'">Restaurar</button>'
      : '<button data-archive-date="'+date+'">Arquivar</button>';
    const deleteButton = role==='responsavel' && !archiveView ? '<button class="danger" data-delete-date="'+date+'">Excluir data</button>' : '';
    return '<section class="column"><div class="column-head"><div><h3>'+display(date)+'</h3><p>'+visible.length+' processo(s)</p></div><div class="actions">'+addButton+archiveButton+deleteButton+'</div></div>'+
      (visible.map(card).join('') || '<p class="empty">'+(cases.length ? 'Nenhum processo no filtro selecionado.' : 'Nenhum processo nesta data.')+'</p>')+'</section>';
  }).join('') || '<p class="empty">'+(archiveView ? 'Nenhum processo arquivado encontrado.' : 'Nenhum processo encontrado.')+'</p>';
}
function card(item) {
  const days = archiveView ? Infinity : daysLeft(item);
  const status = days < 0 ? 'Atrasado' : days === 0 ? 'Vence hoje' : days <= 3 ? 'Vence em '+days+' dia(s)' : '';
  const assigned = (role==='perita' ? ['Com o responsável','Com você','Com o responsável','Com você','Com o responsável'] : owners)[item.stage];
  const remove = role==='responsavel' && !archiveView ? '<button type="button" class="danger card-delete" data-delete="'+item.id+'" aria-label="Excluir laudo" title="Excluir laudo">×</button>' : '';
  const link = caseLink(item.link);
  const openCase = link ? '<a class="case-link" href="'+sanitize(link)+'" target="_blank" rel="noopener noreferrer" aria-label="Abrir autos do processo" title="Abrir autos do processo"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 8l3-3a4 4 0 0 1 6 6l-3 3M14 16l-3 3a4 4 0 0 1-6-6l3-3m1 5 6-6"/></svg></a>' : '';
  const editCaseButton = '<button type="button" class="case-link" data-edit-case="'+item.id+'" aria-label="Editar processo" title="Editar processo"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/><path d="m10 14 1-4 7-7 3 3-7 7-4 1z"/></svg></button>';
  return '<article class="card process-card"><div class="process-card-title"><div><strong>'+sanitize(item.number)+'</strong>'+
    '<p class="meta">'+sanitize(item.vara || 'Vara a informar')+'</p></div><div class="process-card-tools">'+openCase+editCaseButton+remove+'</div></div>'+
    '<div class="process-card-status"><span class="tag stage-'+(stageColors[item.stage]||'normal')+'">'+labels[item.stage]+'</span>'+(assigned?'<span class="meta">'+assigned+'</span>':'')+'</div>'+
    '<p class="deadline '+(days<0?'late':days<=3?'soon':'')+'">'+(item.due ? 'Entrega em '+display(item.due) : 'Prazo a definir')+(status?' · '+status:'')+'</p>'+
    '<div class="actions"><button type="button" data-edit="'+item.id+'">Editar laudo</button>'+
    ([4,5].includes(item.stage)?'<button type="button" data-convert="'+item.id+'">Converter em PDF</button>':'')+
    (item.converted?'<button type="button" data-download="'+item.id+'">Baixar PDF</button>':'')+'</div></article>';
}
function form(title, fields, submitLabel, submit, {stayOpen=false,toolbarClose=false,canClose=()=>true,canSubmit=()=>true,onSubmitEnd}={}) {
  const close = toolbarClose ? '' : '<button type="button" data-dialog-close aria-label="Fechar">✕</button>';
  $('panel').innerHTML = '<form><div class="formhead"><h2>'+sanitize(title)+'</h2>'+close+'</div>'+fields+
    '<p class="error" role="alert"></p><div><button class="primary">'+submitLabel+'</button></div></form>';
  const element = $('panel').querySelector('form');
  const dialog = $('dialog');
  element.querySelector('[data-dialog-close]').onclick = () => {
    if (canClose()) dialog.close();
  };
  dialog.oncancel = event => {
    if (!canClose()) event.preventDefault();
  };
  let submitting = false;
  const savedStatus = element.querySelector('#editor-save-status');
  if (savedStatus) element.addEventListener('input',()=>{savedStatus.textContent = '';});
  element.onsubmit = async event => {
    event.preventDefault();
    const submitButtons = [...element.querySelectorAll('.primary, .editor-save')];
    if (submitting || !canSubmit()) return;
    submitting = true;
    const before = structuredClone(state);
    const toolbarError = element.querySelector('#editor-save-error');
    element.querySelector('.error').textContent = '';
    if (toolbarError) toolbarError.hidden = true;
    if (savedStatus) savedStatus.textContent = '';
    for (const button of submitButtons) button.disabled = true;
    let saved = false;
    try {
      const error = await submit(new FormData(element));
      if (error) throw new Error(error);
      saved = true;
    } catch (error) {
      state = before;
      element.querySelector('.error').textContent = error.message;
      if (toolbarError && event.submitter?.classList.contains('editor-save')) {
        toolbarError.textContent = error.message;
        toolbarError.hidden = false;
      }
      return;
    } finally {
      submitting = false;
      for (const button of submitButtons) button.disabled = false;
      onSubmitEnd?.(saved);
    }
    if (!stayOpen) $('dialog').close();
    render();
  };
  dialog.showModal();
  return element;
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
function caseLink(value) {
  if (!value || typeof value!=='string') return '';
  try {
    const url = new URL(value);
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {return '';}
}
function addCases(date) {
  form('Processos de '+display(date),'<label>Números dos processos, um por linha<textarea name="numbers" rows="6" required placeholder="EXEMPLO-006"></textarea></label><label>Link dos autos (opcional)<input type="url" name="link" maxlength="2048" placeholder="https://"></label><p class="meta">Para vincular um endereço, cadastre um processo por vez.</p>','Cadastrar processos', async data => {
    const numbers = [...new Set(data.get('numbers').split(/\r?\n/).map(line=>line.trim()).filter(Boolean))];
    if (!numbers.length) return 'Informe ao menos um número de processo.';
    const enteredLink = data.get('link').trim();
    const link = caseLink(enteredLink);
    if (enteredLink && (!link || link.length>2048)) return 'Informe um endereço válido começando com http:// ou https://.';
    if (link && numbers.length!==1) return 'Para adicionar um link, informe apenas um número de processo.';
    const duplicated = numbers.find(number => state.cases.some(item=>item.number===number));
    if (duplicated) return 'O processo '+duplicated+' já foi cadastrado.';
    const {vara,due} = detailsForDate(date);
    state.cases.push(...numbers.map(number=>({number,id:crypto.randomUUID(),date,vara,due,stage:0,text:template(number),converted:false,...(link?{link}:{})})));
    await save();
  });
}
function editCase(item) {
  form('Editar processo',
    '<label>Número do processo<input name="number" maxlength="100" value="'+sanitize(item.number)+'" required></label>'+
    '<label>Link dos autos (opcional)<input type="url" name="link" maxlength="2048" value="'+sanitize(item.link || '')+'" placeholder="https://"></label>'+
    '<p class="meta">Se alterar o número, confira também a identificação no texto do laudo.</p>',
    'Salvar processo', async data => {
      const number = data.get('number').trim();
      const enteredLink = data.get('link').trim();
      const link = caseLink(enteredLink);
      if (!number) return 'Informe o número do processo.';
      if (enteredLink && (!link || link.length>2048)) return 'Informe um endereço válido começando com http:// ou https://.';
      await sync('/api/processos/editar',{id:item.id,number,link});
      notice('Processo atualizado.');
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
  let saving = false;
  let firstSave = hasBlankReport(item);
  const editorSnapshot = () => JSON.stringify(readEditor());
  const hasUnsavedChanges = () => editorSnapshot()!==savedFormat ||
    Number(element.elements.stage.value)!==savedStage || Boolean(editable.dataset.uploading);
  const allowClose = () => {
    if (saving) {
      notice('Aguarde o salvamento do laudo.');
      return false;
    }
    return !hasUnsavedChanges() || window.confirm('Há alterações não salvas no laudo. Fechar sem salvar?');
  };
  const element = form(item.number,reportDetails+editorFields(options)+history,'Salvar laudo', async data => {
    if ($('panel').querySelector('.report-body')?.dataset.uploading) return 'Aguarde o envio da imagem.';
    saving = true;
    const index = state.cases.findIndex(entry=>entry.id===item.id);
    const record = {...item,...documents.get(item.id),...state.cases[index]};
    state.cases[index] = record;
    const edited = readEditor();
    const snapshot = JSON.stringify(edited);
    const format = !firstSave && snapshot===savedFormat ? record.format : edited;
    const text = format ? reportText(format) : record.text;
    if (!text.trim() && !format?.blocks.some(block=>block.image)) return 'Digite o texto do laudo.';
    const formattingChanged = JSON.stringify(format ?? null)!==JSON.stringify(record.format ?? null);
    const stage = Number(data.get('stage'));
    const changed = formattingChanged || record.text!==text || record.date!==data.get('date') || record.vara!==data.get('vara').trim();
    if (changed || stage<4 || stage===6) record.converted = false;
    record.stage = stage;
    record.text = text;
    record.format = format;
    record.date = data.get('date');
    record.due = data.get('due');
    record.vara = data.get('vara').trim();
    if (!state.dates.includes(record.date)) state.dates.push(record.date);
    await save();
    savedFormat = snapshot;
    savedStage = stage;
    firstSave = false;
    item = documents.get(record.id) || record;
    $('report-versions').innerHTML = versions(item);
  },{
    stayOpen:true,toolbarClose:true,
    canClose:allowClose,
    canSubmit:()=>!saving && (firstSave || hasUnsavedChanges()),
    onSubmitEnd:saved=>{
      saving = false;
      const dirty = updateSaveButtons();
      if (saved && !dirty) $('editor-save-status').textContent = 'Laudo salvo.';
    }
  });
  const readEditor = initEditor(item);
  const editable = element.querySelector('.report-body');
  const buttons = element.querySelectorAll('.editor-save, .primary');
  let savedFormat = editorSnapshot();
  let savedStage = item.stage;
  function updateSaveButtons() {
    const dirty = hasUnsavedChanges();
    for (const button of buttons) button.disabled = saving || (!firstSave && !dirty);
    if (dirty) $('editor-save-status').textContent = '';
    return dirty;
  }
  let frame = 0;
  const scheduleUpdate = () => {
    if (frame) return;
    frame = requestAnimationFrame(()=>{
      frame = 0;
      updateSaveButtons();
    });
  };
  for (const event of ['input','change','click']) element.addEventListener(event,scheduleUpdate);
  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(editable,{childList:true,subtree:true,characterData:true,attributes:true});
  $('dialog').addEventListener('close',()=>{
    observer.disconnect();
    cancelAnimationFrame(frame);
  },{once:true});
  updateSaveButtons();
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
  const {add,edit:editId,editCase:editCaseId,convert,download,delete:deleteId,deleteDate,archiveDate,restoreDate} = button.dataset;
  if (add) return addCases(add);
  if ((archiveDate || restoreDate) && role==='responsavel') {
    const date = archiveDate || restoreDate;
    const action = archiveDate ? 'Arquivar' : 'Restaurar';
    return form(action+' data',
      '<p>'+action+' a coluna de <strong>'+display(date)+'</strong> com todos os seus processos?</p>',
      action, async () => {
        await sync('/api/datas/'+(archiveDate?'arquivar':'restaurar'),{date});
        notice(archiveDate?'Data arquivada.':'Data restaurada.');
      });
  }
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
  let item = state.cases.find(entry=>entry.id===(editId || editCaseId || convert || download || deleteId));
  if (!item) return;
  if (editCaseId) return editCase(item);
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
    const fileName = item.number.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'');
    link.download = (fileName || 'processo')+'.pdf';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
};
$('search').addEventListener('input',render);
$('urgent').addEventListener('change',render);
$('stage-filter').addEventListener('change',render);
render();
refresh(false);
setInterval(()=>refresh(false),30000);

fetch('/auth/status').then(response=>response.ok ? response.json() : null).then(status=>{
  if (status?.passwordLogin) $('sign-out').hidden = false;
}).catch(()=>{});
$('sign-out').onsubmit = async event => {
  event.preventDefault();
  if (($('dialog').open || pending) && !confirm('Alterações ainda não salvas podem ser perdidas. Sair da Agenda?')) return;
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/auth/sair',{
      method:'POST',
      referrerPolicy:'same-origin'
    });
    if (!response.ok || !response.redirected || new URL(response.url).pathname!=='/entrar') {
      throw new Error('A sessão não pôde ser encerrada.');
    }
    window.location.replace('/entrar');
  } catch {
    notice('Não foi possível sair. Tente novamente.');
    button.disabled = false;
  }
};
