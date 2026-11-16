function authSettings(env) {
  const url = env.AGENDA_SUPABASE_URL?.trim().replace(/\/$/,'');
  const key = env.AGENDA_SUPABASE_KEY?.trim();
  return /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url || '') && key ? {url,key} : null;
}

async function supabase(settings,path,token,body) {
  return fetch(settings.url+'/auth/v1/'+path,{
    method:body ? 'POST' : 'GET',
    headers:{apikey:settings.key,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    redirect:'error'
  });
}

function sessionCookie(name,value,age) {
  return '__Host-agenda-'+name+'='+encodeURIComponent(value)+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age;
}

function sessionResponse(response,session) {
  response.headers.append('Set-Cookie',sessionCookie('access',session?.access_token || '',session?86400:0));
  response.headers.append('Set-Cookie',sessionCookie('refresh',session?.refresh_token || '',session?86400:0));
  return response;
}

function authUser(user) {
  const email = user?.email?.trim().toLowerCase();
  return user?.id && email && user.email_confirmed_at ? {identity:user.id,email} : null;
}

async function allowedAccount(env,user) {
  const owner = env.AGENDA_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner || !user) return false;
  if (user.email===owner) return true;
  const row = await env.DB.prepare('SELECT reviewer FROM agenda WHERE id=1').first();
  return user.email===(row?.reviewer || env.AGENDA_INITIAL_REVIEWER_EMAIL?.trim().toLowerCase());
}

async function authAction(request,env,settings,path) {
  if (request.method!=='POST' || request.headers.get('origin')!==new URL(request.url).origin) return problem('Requisição inválida.',405);
  if (path==='/auth/sair') {
    const token = readSession(request).access;
    if (token) {
      try {await fetch(settings.url+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:settings.key,Authorization:'Bearer '+token},redirect:'error'});}
      catch { /* Clear the local session even if Supabase is unavailable. */ }
    }
    return sessionResponse(new Response(null,{status:303,headers:{...headers,Location:'/entrar'}}),null);
  }
  if (path!=='/auth/entrar') return problem('Página inexistente.',404);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return problem('Requisição inválida.',415);
  let body;
  try {body=await request.json();} catch {return problem('Dados inválidos.');}
  if (!string(body?.email,254) || !string(body?.password,1024) || !body.password) return problem('Informe seu e-mail e sua senha.');
    if (path !== '/auth/entrar') return problem('Página inexistente.', 404);
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return problem('Requisição inválida.', 415);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return problem('Dados inválidos.');
  }

  if (!string(body?.email, 254) || !string(body?.password, 1024) || !body.password) {
    return problem('Informe seu e-mail e sua senha.');
  }

  let response;
  try {
    response = await supabase(settings, 'token?grant_type=password', null, {
      email: body.email.trim().toLowerCase(),
      password: body.password
    });
  } catch {
    return problem('A Agenda não conseguiu conectar ao Supabase.', 503);
  }

  if (response.status === 429) {
    return problem('Muitas tentativas. Aguarde e tente novamente.', 429);
  }
  if (response.status >= 500) {
    return problem('O Supabase respondeu com erro HTTP ' + response.status + '.', 503);
  }

  const session = response.ok ? await response.json() : null;
  if (!session?.access_token || !session.refresh_token || !await allowedAccount(env, authUser(session.user))) {
    return problem('E-mail ou senha inválidos, ou conta sem acesso.', 401);
  }
  return sessionResponse(json({ok: true}), session);
});
  if (response.status===429) return problem('Muitas tentativas. Aguarde e tente novamente.',429);
  if (response.status>=500) return problem('O login está temporariamente indisponível.',503);
  const session = response.ok ? await response.json() : null;
  if (!session?.access_token || !session.refresh_token || !await allowedAccount(env,authUser(session.user))) return problem('E-mail ou senha inválidos, ou conta sem acesso.',401);
  return sessionResponse(json({ok:true}),session);
}

function readSession(request) {
  const cookies = request.headers.get('Cookie') || '';
  const read = name => {
    const prefix = '__Host-agenda-'+name+'=';
    const value = cookies.split(';').map(part=>part.trim()).find(part=>part.startsWith(prefix));
    try {return value ? decodeURIComponent(value.slice(prefix.length)) : '';} catch {return '';}
  };
  return {access:read('access'),refresh:read('refresh')};
}

async function appSession(request,settings) {
  const {access,refresh} = readSession(request);
  if (access) {
    const response = await supabase(settings,'user',access);
    if (response.ok) return {user:authUser(await response.json())};
    if (![401,403].includes(response.status)) throw new Error('Falha ao validar a sessão.');
  }
  if (!refresh) return {};
  const response = await supabase(settings,'token?grant_type=refresh_token',null,{refresh_token:refresh});
  if (response.status>=500 || response.status===429) throw new Error('Falha ao renovar a sessão.');
  if (!response.ok) return {session:null};
  const session = await response.json();
  return {user:authUser(session.user),session};
}
