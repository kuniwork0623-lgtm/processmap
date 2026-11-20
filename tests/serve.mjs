// Minimal static server for local checks (no dependencies).
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json'};
export function serve(port=4173){return new Promise(r=>{const s=http.createServer((q,w)=>{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);if(p==='/')p='/index.html';const f=path.join(root,path.normalize(p));if(!f.startsWith(root)||!['/index.html','/config.js','/sync.js'].includes(p)){w.writeHead(404);return w.end()}fs.readFile(f,(e,b)=>{if(e){w.writeHead(404);return w.end()}w.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});w.end(b)})});s.listen(port,'127.0.0.1',()=>r(s))})}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=+process.env.PORT||4173;await serve(port);console.log('http://127.0.0.1:'+port)}
