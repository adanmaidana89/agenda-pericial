const encode = value => JSON.stringify(value);

function caseSummary({text,format,history,...item}) { return item; }

async function readAgenda(db,ids=[]) {
  const filter = JSON.stringify(ids);

  const [config,records,versions,templates] = await db.batch([
    db.prepare('SELECT * FROM agenda WHERE id=1'),
    db.prepare('SELECT id,summary,CASE WHEN id IN (SELECT value FROM json_each(?)) THEN payload END AS payload FROM laudos ORDER BY rowid').bind(filter),
    db.prepare('SELECT laudo_id,payload FROM historico WHERE laudo_id IN (SELECT value FROM json_each(?)) ORDER BY laudo_id,pos').bind(filter),
    db.prepare('SELECT payload FROM modelos ORDER BY rowid')
  ]);
  const histories = new Map();
  for (const row of versions.results) {
    if (!histories.has(row.laudo_id)) histories.set(row.laudo_id,[]);
    histories.get(row.laudo_id).push(JSON.parse(row.payload));
  }
  return {
    row:config.results[0],
    state:{...JSON.parse(config.results[0].metadata),
      cases:records.results.map(row=>row.payload ? {...JSON.parse(row.payload),history:histories.get(row.id) || []} : JSON.parse(row.summary)),
      models:templates.results.map(row=>JSON.parse(row.payload))}
  };
}

function changesById(before,after) {
  const previous = new Map(before.map(item=>[item.id,item]));
  const changed = after.filter(item=>encode(item)!==encode(previous.get(item.id)));
  const remaining = new Set(after.map(item=>item.id));
  return {changed,removed:before.filter(item=>!remaining.has(item.id)).map(item=>item.id)};
}

function chunks(items) {
  const result = [];
  let group = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const item of items) {
    const size = encoder.encode(encode(item)).length+1;
    if (size>1_750_000) throw new RangeError('Um laudo ou modelo ultrapassou o limite individual do banco.');
    if (group.length && bytes+size>1_750_000) {
      result.push(encode(group));
      group = [];
      bytes = 0;
    }
    group.push(item);
    bytes += size;
  }
  if (group.length) result.push(encode(group));
  return result;
}

async function writeAgenda(db,row,before,after,reviewer) {
  const stamp = crypto.randomUUID();
  const {cases,models,...metadata} = after;
  const certificate = 'EXISTS (SELECT 1 FROM agenda WHERE id=1 AND stamp=?)';
  const statements = [db.prepare('UPDATE agenda SET metadata=?,reviewer=?,revision=revision+1,stamp=? WHERE id=1 AND revision=?')
    .bind(encode(metadata),reviewer,stamp,row.revision)];
  const casesDiff = changesById(before.cases,cases);
  const modelsDiff = changesById(before.models,models);
  function add(sql,items) {
    for (const chunk of chunks(items)) statements.push(db.prepare(sql).bind(chunk,stamp));
  }
  add('DELETE FROM laudos WHERE id IN (SELECT value FROM json_each(?)) AND '+certificate,casesDiff.removed);
  add('DELETE FROM modelos WHERE id IN (SELECT value FROM json_each(?)) AND '+certificate,modelsDiff.removed);
  add('INSERT INTO laudos (id,payload,summary) SELECT json_extract(value,\'$.record.id\'),json_extract(value,\'$.record\'),json_extract(value,\'$.summary\') FROM json_each(?) WHERE '+certificate+
      ' ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,summary=excluded.summary',
      casesDiff.changed.map(({history,...record})=>({record,summary:caseSummary(record)})));
  add('DELETE FROM historico WHERE laudo_id IN (SELECT value FROM json_each(?)) AND '+certificate,casesDiff.changed.map(item=>item.id));
  add('INSERT INTO historico (laudo_id,pos,payload) SELECT json_extract(value,\'$.id\'),json_extract(value,\'$.pos\'),json_extract(value,\'$.entry\') FROM json_each(?) WHERE '+certificate,
      casesDiff.changed.flatMap(item=>item.history.map((entry,pos)=>({id:item.id,pos,entry}))));
  add('INSERT INTO modelos (id,payload) SELECT json_extract(value,\'$.id\'),json(value) FROM json_each(?) WHERE '+certificate+
      ' ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',modelsDiff.changed);
  const result = await db.batch(statements);
  return Boolean(result[0].meta.changes);
}
