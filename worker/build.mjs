import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
const assets = {};
for (const name of readdirSync('web').filter(name => /\.(html|css|js)$/.test(name))) {
  assets['/'+name] = readFileSync('web/'+name,'utf8');
}
for (const name of readdirSync('web/assets').filter(name => /\.(ttf|jpg|png|js)$/.test(name))) {
  assets['/assets/'+name] = readFileSync('web/assets/'+name,/\.(ttf|jpg|png)$/.test(name)?'base64':'utf8');
}
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js','const assets = '+JSON.stringify(assets)+';\n'+['access','auth','storage','server'].map(name=>readFileSync('worker/'+name+'.mjs','utf8')).join('\n'));
