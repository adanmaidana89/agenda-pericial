const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json = (data,status=200) => Response.json(data,{status,headers});
const problem = (error,status=400) => json({error},status);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const string = (value,limit) => typeof value === 'string' && value.length <= limit;

function validRun(run) {
  return run && string(run.text,50000) &&
    (run.family==null || ['garamond','times','arial'].includes(run.family)) &&
    (run.size==null || [10,11,12,13,14,16,18].includes(run.size)) &&
    Number.isInteger(run.style) && run.style>=0 && run.style<=79 && [0,16,32,64].includes(run.style & 112);
}

function cleanRun({text,style,size,family}) {
  return {text,style,...(size?{size}:{}),...(family?{family}:{})};
}

function listContinuation(value) {
  if (!value || !Number.isFinite(value.width) || value.width<0 || value.width>21 ||
      !Number.isFinite(value.offset) || value.offset < -5 || value.offset>8 ||
      !Array.isArray(value.runs) || !value.runs.every(validRun) ||
      value.runs.reduce((length,run)=>length+run.text.length,0)>100) return null;
  return {width:value.width,offset:value.offset,runs:value.runs.map(cleanRun)};
}

function reportFormat(value) {
  if (value == null) return null;
  if (!['garamond','times','arial'].includes(value.family) || ![10,11,12,13,14,16,18].includes(value.size) ||
      !/^#[a-f0-9]{6}$/.test(value.color) || !string(value.watermark,55) ||
      (value.paper!=null && !['simple','letterhead'].includes(value.paper)) || !Array.isArray(value.blocks) || value.blocks.length > 1500) return false;
  const layout = {};
  for (const [key,accepts] of Object.entries({
    left:n=>Number.isFinite(n)&&n>=1&&n<=5,
    right:n=>Number.isFinite(n)&&n>=1&&n<=5,
    spacing:n=>[1,1.15,1.45,1.5,2].includes(n),
    after:n=>[0,6,12].includes(n)
  })) {
    if (value[key]==null) continue;
    if (!accepts(value[key])) return false;
    layout[key] = value[key];
  }
  const blocks = [];
  for (const block of value.blocks) {
    if (!['left','center','right','justify'].includes(block?.align) || (block.indent!=null && (!Number.isFinite(block.indent) || block.indent<0 || block.indent>5)) || (block.first!=null && (!Number.isFinite(block.first) || block.first < -5 || block.first>5)) || !Array.isArray(block.runs) ||
        !block.runs.every(validRun)) return false;
    const continuation = listContinuation(block.continuation);
    const image = block.image;
    if (image!=null && (typeof image!=='string' || !/^([a-f0-9-]{36})\.(png|jpg)$/.test(image))) return false;
    blocks.push({align:block.align,runs:block.runs.map(cleanRun),...(block.page===true?{page:true}:{}),...(block.table===true?{table:true}:{}),...(block.indent?{indent:block.indent}:{}),...(block.first?{first:block.first}:{}),...(['number','letter','parenthesis'].includes(block.list)?{list:block.list}:{}),...([1,1.15,1.45,1.5,2].includes(block.spacing)?{spacing:block.spacing}:{}),...([0,6,12].includes(block.after)?{after:block.after}:{}),...(Number.isFinite(block.gap)&&block.gap>0&&block.gap<=3?{gap:block.gap}:{}),...(continuation?{continuation}:{}),...(image?{image}:{})});
  }
  return {family:value.family,size:value.size,color:value.color,watermark:value.watermark,...(value.paper?{paper:value.paper}:{}),...layout,blocks};
}

function validCaseLink(value) {
  if (!string(value,2048)) return false;
  try {
    const url = new URL(value);
    return ['https:','http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {return false;}
}

function clean(next, previous, role) {
  if (!Array.isArray(next?.dates) || !Array.isArray(next.cases) || next.dates.length > 5000 ||
      next.cases.length > 10000 || !next.dates.every(date)) return null;
  const dates = [...new Set(next.dates)];
  const prior = new Map(previous.cases.map(item=>[item.id,item]));
  const ids = new Set();
  const numbers = new Set();
  const cases = [];
  for (const value of next.cases) {
    if (!value || !/^[a-f0-9-]{36}$/.test(value.id) || ids.has(value.id) ||
        !string(value.number,100) || !value.number.trim() || numbers.has(value.number) || !dates.includes(value.date) ||
        !(value.due === '' || date(value.due)) || !string(value.vara,250) ||
        !Number.isInteger(value.stage) || value.stage < 0 || value.stage > 6) return null;
    const old = prior.get(value.id);
    if (value===old) {
      cases.push(old);
      ids.add(value.id);
      numbers.add(value.number);
      continue;
    }
    const link = value.link ?? old?.link ?? '';
    if (!string(value.text,50000) || (link!=='' && !validCaseLink(link))) return null;
    const format = reportFormat(value.format);
    if (format === false) return null;
    const {id,number,date:exam,due,vara,text,stage} = value;
    const textChanged = old && (old.text !== text || JSON.stringify(reportFormat(old.format))!==JSON.stringify(format) || old.vara !== vara || old.date !== exam);
    if (old && old.number !== number) return null;
    const converted = value.converted === true && [4,5].includes(stage) &&
      [4,5].includes(old?.stage) && !textChanged;
    const history = [...(old?.history ?? [])];
    if (!old || textChanged || old.stage !== stage || old.due !== due) {
      history.unshift({stage,role,at:new Date().toISOString(),text});
    }
    cases.push({id,number,date:exam,due,vara,text,format,stage,converted,downloaded:old?.downloaded===true || (converted && value.downloaded===true),...(link?{link}:{}),history:history.slice(0,8)});
    ids.add(id);
    numbers.add(number);
  }
  if (previous.cases.some(item=>!ids.has(item.id))) return null;
  const dateDetails = {};
  for (const value of dates) {
    const details = previous.dateDetails?.[value] ?? next.dateDetails?.[value];
    if (details===undefined) continue;
    if (!details || !string(details.vara,250) || !(details.due==='' || date(details.due))) return null;
    dateDetails[value] = {vara:details.vara,due:details.due};
  }
  return {dates,cases,...(previous.archivedDates?{archivedDates:previous.archivedDates}:{}),...(Object.keys(dateDetails).length?{dateDetails}:{}),...(previous.models?{models:previous.models}:{}),...(previous.defaultModel?{defaultModel:previous.defaultModel}:{})};
}

async function api(request,env,path,user) {
  const {identity,email} = user;
  const ownerEmail = env.AGENDA_OWNER_EMAIL?.trim().toLowerCase();
  const initialReviewer = env.AGENDA_INITIAL_REVIEWER_EMAIL?.trim().toLowerCase() || '';
  if (!ownerEmail) return problem('A configuração de acesso ainda não está disponível.',503);
  let row = await env.DB.prepare('SELECT * FROM agenda WHERE id=1').first();
  if (!row && email === ownerEmail && request.method === 'GET' && path === '/api/agenda') {
    await env.DB.prepare('INSERT OR IGNORE INTO agenda (id,owner,reviewer) VALUES (1,?,?)').bind(identity,initialReviewer).run();
    row = await env.DB.prepare('SELECT * FROM agenda WHERE id=1').first();
  }
  const configuredReviewer = row?.reviewer || initialReviewer;
  const role = row && email === ownerEmail && (env.AGENDA_SUPABASE_URL || row.owner === identity) ? 'responsavel' :
    row && email && configuredReviewer === email && email !== ownerEmail ? 'perita' : null;
  if (!role) return problem('Esta conta ainda não tem acesso à agenda.',403);
  const get = request.method==='GET';
  if (path.startsWith('/api/imagens')) return imageApi(request,env,path);
  const url = new URL(request.url);
  if (get && path==='/api/laudo') {
    if (url.searchParams.get('revision')!==String(row.revision)) return problem('Atualize a agenda antes de abrir o laudo.',409);
    const key = url.searchParams.get('id') || '';
    if (!/^[a-f0-9-]{36}$/.test(key)) return problem('Laudo inválido.');
    const [config,record,history] = await env.DB.batch([
      env.DB.prepare('SELECT revision FROM agenda WHERE id=1'),
      env.DB.prepare('SELECT payload FROM laudos WHERE id=?').bind(key),
      env.DB.prepare('SELECT payload FROM historico WHERE laudo_id=? ORDER BY pos').bind(key)
    ]);
    if (config.results[0].revision!==row.revision) return problem('Atualize a agenda antes de abrir o laudo.',409);
    if (!record.results.length) return problem('Laudo não encontrado.',404);
    return json({...JSON.parse(record.results[0].payload),history:history.results.map(entry=>JSON.parse(entry.payload))});
  }
  const isRead = get && path==='/api/agenda';
  if (isRead && url.searchParams.get('since')===String(row.revision)) return new Response(null,{status:304,headers});
  let body;
  if (!isRead) {
    if (request.method!=='PUT' || !request.headers.get('content-type')?.startsWith('application/json') ||
        request.headers.get('origin')!==url.origin) return problem('Requisição inválida.',405);
    const raw = await request.text();
    if (raw.length>16_000_000) return problem('A alteração excede o limite de tamanho.',413);
    try {body=JSON.parse(raw);} catch {return problem('Dados inválidos.');}
    if (!body || typeof body!=='object') return problem('Dados inválidos.');
    if (body.revision!==row.revision) return problem('A agenda mudou em outra sessão. Atualize o painel antes de tentar novamente.',409);
  }
  const touched = Array.isArray(body?.patch?.cases) ? body.patch.cases.map(item=>item?.id).filter(id=>typeof id==='string') : [];
  if (path === '/api/processos/editar' && typeof body?.id==='string') touched.push(body.id);
  const snapshot = await readAgenda(env.DB,touched);
  if (snapshot.row.revision!==row.revision) return problem('A agenda mudou em outra sessão. Atualize o painel antes de tentar novamente.',409);
  const previous = snapshot.state;
  if (isRead) return json({role,reviewer:role==='responsavel'?configuredReviewer:'',revision:row.revision,state:previous});
  let agenda = structuredClone(previous);
  let reviewer = row.reviewer;
  if (path === '/api/perita') {
    if (role !== 'responsavel') return problem('Apenas o titular pode configurar a perita.',403);
    if (!string(body.email,254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.toLowerCase() === email) return problem('Informe o e-mail da conta da perita.');
    reviewer = body.email.toLowerCase();
  } else if (path === '/api/processos/editar') {
    const item = agenda.cases.find(entry=>entry.id===body.id);
    if (!item) return problem('Processo não encontrado.',404);
    const number = typeof body.number==='string' ? body.number.trim() : '';
    if (!number || !string(number,100) || /[\r\n]/.test(number)) return problem('Informe um número de processo válido.');
    if (body.link!=='' && !validCaseLink(body.link)) return problem('Informe um link válido para os autos.');
    if (agenda.cases.some(entry=>entry.id!==item.id && entry.number===number)) return problem('Este número já está cadastrado.',409);
    if (item.number!==number) {
      item.number = number;
      item.converted = false;
    }
    if (body.link) item.link = body.link;
    else delete item.link;
  } else if (path === '/api/laudos/excluir') {
    if (role !== 'responsavel') return problem('Apenas o responsável pode excluir laudos.',403);
    if (typeof body.id!=='string') return problem('Informe qual laudo será excluído.');
    const index = agenda.cases.findIndex(item=>item.id===body.id);
    if (index===-1) return problem('Laudo não encontrado.',404);
    agenda.cases.splice(index,1);
  } else if (path === '/api/datas/arquivar' || path === '/api/datas/restaurar') {
    if (role !== 'responsavel') return problem('Apenas o responsável pode arquivar ou restaurar datas.',403);
    if (!date(body.date) || !agenda.dates.includes(body.date)) return problem('Data não encontrada.',404);
    const archived = new Set(agenda.archivedDates ?? []);
    if (path === '/api/datas/arquivar') archived.add(body.date);
    else archived.delete(body.date);
    agenda.archivedDates = [...archived];
  } else if (path === '/api/datas/excluir') {
    if (role !== 'responsavel') return problem('Apenas o responsável pode excluir datas.',403);
    if (!date(body.date)) return problem('Informe qual data será excluída.');
    if (!agenda.dates.includes(body.date)) return problem('Data não encontrada.',404);
    agenda.dates = agenda.dates.filter(value=>value!==body.date);
    if (agenda.dateDetails) delete agenda.dateDetails[body.date];
    if (agenda.archivedDates) agenda.archivedDates = agenda.archivedDates.filter(value=>value!==body.date);
    agenda.cases = agenda.cases.filter(item=>item.date!==body.date);
  } else if (path === '/api/configuracoes/importar') {
    if (role!=='responsavel') return problem('Apenas o responsável pode importar as configurações.',403);
    if (agenda.cases.length || agenda.models.length || agenda.dates.length) return problem('A importação precisa de uma agenda vazia.',409);
    const config = body.config;
    if (config?.version!==1 || !Array.isArray(config.models)) return problem('Arquivo de configurações inválido.');
    const normalized = clean({dates:config.dates,dateDetails:config.dateDetails,cases:[]},previous,role);
    if (!normalized || typeof normalized==='string') return problem('As datas do arquivo são inválidas.');
    const models = [];
    const ids = new Set();
    const names = new Set();
    for (const model of config.models) {
      if (!model || typeof model.id!=='string' || !/^[a-f0-9-]{36}$/.test(model.id) || ids.has(model.id) ||
          !string(model.name,100) || !model.name.trim() || names.has(model.name.toLocaleLowerCase('pt-BR'))) return problem('Modelos inválidos no arquivo.');
      const format = reportFormat(model.format);
      if (!format) return problem('Formatação de modelo inválida.');
      models.push({id:model.id,name:model.name,format});
      ids.add(model.id);
      names.add(model.name.toLocaleLowerCase('pt-BR'));
    }
    if (config.defaultModel && !ids.has(config.defaultModel)) return problem('O modelo de abertura não consta no arquivo.');
    agenda = {...normalized,models,...(config.defaultModel?{defaultModel:config.defaultModel}:{})};
  } else if (path === '/api/modelos/padrao' || path === '/api/modelos/excluir') {
    const models = agenda.models ?? [];
    const model = models.find(item=>item.id===body.id);
    if (!model && (path==='/api/modelos/excluir' || body.id!=='')) return problem('Modelo não encontrado.',404);
    if (path==='/api/modelos/padrao') {
      if (model) agenda.defaultModel = model.id;
      else delete agenda.defaultModel;
    } else {
      agenda.models = models.filter(item=>item.id!==model.id);
      if (agenda.defaultModel===model.id) delete agenda.defaultModel;
    }
  } else if (path === '/api/modelos/atualizar') {
    const model = agenda.models?.find(entry=>entry.id===body.id);
    if (!model) return problem('Modelo não encontrado.',404);
    const format = reportFormat(body.format);
    if (!format || !format.blocks.some(block=>block.image || block.runs.some(run=>run.text.trim()))) return problem('Informe um modelo válido.');
    model.format = format;
  } else if (path === '/api/modelos') {
    if (!string(body.name,100) || !body.name.trim()) return problem('Informe um nome de até 100 caracteres.');
    const name = body.name.trim();
    const format = reportFormat(body.format);
    if (!format || !format.blocks.some(block=>block.runs.some(run=>run.text.trim()))) return problem('O modelo precisa de um texto válido.');
    const models = agenda.models ?? [];
    if (models.some(model=>model.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'))) return problem('Já existe um modelo com esse nome.',409);
    agenda.models = [...models,{id:crypto.randomUUID(),name,format}];
  } else if (path === '/api/agenda') {
    const patch = body.patch;
    if (!patch || !Array.isArray(patch.cases)) return problem('Dados inválidos.');
    const byId = new Map(previous.cases.map(item=>[item.id,item]));
    for (const item of patch.cases) {
      if (!item || typeof item.id!=='string') return problem('Dados inválidos.');
      const old = byId.get(item.id);
      if (agenda.archivedDates?.includes(item.date) && old?.date!==item.date) {
        return problem('Restaure a data antes de cadastrar processos nela.',409);
      }
      byId.set(item.id,item);
    }
    const result = clean({dates:patch.dates,dateDetails:patch.dateDetails,cases:[...byId.values()]},previous,role);
    if (!result || typeof result === 'string') return problem(result || 'Os dados enviados são inválidos.');
    agenda = {...result,models:result.models || []};
  } else return problem('Página inexistente.',404);
  try {
    if (!await writeAgenda(env.DB,row,previous,agenda,reviewer)) return problem('A agenda mudou em outra sessão. Atualize o painel antes de tentar novamente.',409);
  } catch (error) {
    if (error instanceof RangeError) return problem(error.message,413);
    throw error;
  }
  return json({role,reviewer:role==='responsavel'?(reviewer||initialReviewer):'',revision:row.revision+1,state:{...agenda,cases:agenda.cases.map(caseSummary)},documents:agenda.cases.filter(item=>touched.includes(item.id))});
}

async function imageApi(request,env,path) {
  if (!env.IMAGES) return problem('O armazenamento de imagens ainda não foi configurado.',503);
  if (request.method==='GET') {
    const key = path.match(/^\/api\/imagens\/([a-f0-9-]{36}\.(?:png|jpg))$/)?.[1];
    if (!key) return problem('Imagem não encontrada.',404);
    const object = await env.IMAGES.get(key);
    if (!object) return problem('Imagem não encontrada.',404);
    return new Response(object.body,{headers:{...headers,'Content-Type':key.endsWith('.png')?'image/png':'image/jpeg'}});
  }
  if (request.method!=='POST' || path!=='/api/imagens' || request.headers.get('origin')!==new URL(request.url).origin) return problem('Requisição inválida.',405);
  const limit = 5*1024*1024;
  if (Number(request.headers.get('content-length'))>limit) return problem('A imagem ultrapassa 5 MB.',413);
  const reader = request.body?.getReader();
  if (!reader) return problem('Imagem ausente.');
  const parts = [];
  let length = 0;
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    length += value.length;
    if (length>limit) {await reader.cancel();return problem('A imagem ultrapassa 5 MB.',413);}
    parts.push(value);
  }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {data.set(part,offset);offset += part.length;}
  const png = [137,80,78,71,13,10,26,10].every((byte,index)=>data[index]===byte);
  const jpeg = data[0]===255 && data[1]===216 && data[2]===255;
  if (!png && !jpeg) return problem('Cole uma imagem PNG ou JPEG.',415);
  const key = crypto.randomUUID()+(png?'.png':'.jpg');
  await env.IMAGES.put(key,data);
  return json({key},201);
}

export default {
  async fetch(request,env) {
    const path = new URL(request.url).pathname;
    const settings = authSettings(env);
    const supabaseMode = Boolean(env.AGENDA_SUPABASE_URL || env.AGENDA_SUPABASE_KEY);
    if (supabaseMode && !settings) return problem('A configuração de login está incompleta.',503);
    if (!settings) {
      const user = await accessIdentity(request,env);
      if (!user) return problem('Entre pelo endereço protegido pelo Cloudflare Access.',401);
      return serveAgenda(request,env,path,user);
    }
    try {
      if (path.startsWith('/auth/') && path!=='/auth/status') return await authAction(request,env,settings,path);
      if (['/entrar','/login.js','/style.css'].includes(path)) return serveAsset(path==='/entrar'?'/login.html':path);
      const {user,session} = await appSession(request,settings);
      const response = user && await allowedAccount(env,user)
        ? await serveAgenda(request,env,path,user)
        : path.startsWith('/api/')
          ? problem('Sessão encerrada. Entre novamente para continuar.',401)
          : new Response(null,{status:302,headers:{...headers,Location:'/entrar'}});
      return session===undefined ? response : sessionResponse(response,session);
    } catch {return problem('O login está temporariamente indisponível.',503);}
  }
};

async function serveAgenda(request,env,path,user) {
    if (path.startsWith('/api/')) {
      try { return await api(request,env,path,user); }
      catch { return problem('A agenda está temporariamente indisponível.',503); }
    }
    if (path==='/auth/status') return json({passwordLogin:Boolean(authSettings(env))});
    return serveAsset(path === '/' ? '/index.html' : path);
}

function serveAsset(name) {
    if (!Object.hasOwn(assets,name)) return new Response('Página inexistente.',{status:404,headers});
    const font = name.endsWith('.ttf');
    const photo = /\.(jpg|png)$/.test(name);
    const type = font ? 'font/ttf' : photo ? (name.endsWith('.png')?'image/png':'image/jpeg') : name.endsWith('.js') ? 'text/javascript; charset=utf-8' :
      name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
    const body = font || photo ? Uint8Array.from(atob(assets[name]), character => character.charCodeAt(0)) : assets[name];
    return new Response(body,{headers:{...headers,'Content-Type':type,
      'Content-Security-Policy':"default-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"}});
}
