const accessKeys = new Map();

function bytes(value) {
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),character=>character.charCodeAt(0));
}
function decodeSection(value) {
  return JSON.parse(new TextDecoder().decode(bytes(value)));
}

async function getKey(issuer,kid) {
  const cached = accessKeys.get(issuer);
  let keys = cached?.keys;
  if (!keys || Date.now()>cached.expires || (!keys.some(key=>key.kid===kid) && Date.now()-cached.fetched>60_000)) {
    const response = await fetch(issuer+'/cdn-cgi/access/certs');
    if (!response.ok) return null;
    ({keys} = await response.json());
    if (!Array.isArray(keys)) return null;
    const fetched = Date.now();
    accessKeys.set(issuer,{keys,fetched,expires:fetched+300_000});
  }
  const jwk = keys.find(key=>key.kid===kid && key.kty==='RSA');
  return jwk ? crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']) : null;
}

async function accessIdentity(request,env) {
  const team = env.AGENDA_ACCESS_TEAM_DOMAIN?.trim().toLowerCase().replace(/^https:\/\//,'').replace(/\/$/,'');
  const issuer = 'https://'+team;
  const audience = env.AGENDA_ACCESS_AUD?.trim();
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!audience || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team || '') || !token || token.length>16384) return null;
  try {
    const [header,body,signature,...rest] = token.split('.');
    if (!header || !body || !signature || rest.length) return null;
    const metadata = decodeSection(header);
    const claims = decodeSection(body);
    const now = Date.now()/1000;
    if (metadata.alg!=='RS256' || typeof metadata.kid!=='string' ||
        claims.iss!==issuer || !Array.isArray(claims.aud) || !claims.aud.includes(audience) ||
        !Number.isFinite(claims.exp) || claims.exp<=now || (claims.nbf!=null && (!Number.isFinite(claims.nbf) || claims.nbf>now)) ||
        typeof claims.sub!=='string' || !claims.sub || typeof claims.email!=='string') return null;
    const key = await getKey(issuer,metadata.kid);
    if (!key || !await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(signature),new TextEncoder().encode(header+'.'+body))) return null;
    return {identity:claims.sub,email:claims.email.trim().toLowerCase()};
  } catch {return null;}
}
