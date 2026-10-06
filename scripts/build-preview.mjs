// Rebuilds index.html and preview.html from src/. Needs `typescript` resolvable
// from this repo, or from the path in TYPESCRIPT_PATH (a node_modules directory).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.TYPESCRIPT_PATH ? join(process.env.TYPESCRIPT_PATH, 'x.js') : join(root, 'x.js'));
const ts = require('typescript');
const read = name => readFileSync(join(root, 'src', name), 'utf8');

const compile = name => ts.transpileModule(read(name), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, useDefineForClassFields: false },
}).outputText
  .replace(/^import .*$/gm, '')
  .replace(/^export (?=const|class|function|interface|type)/gm, '')
  .replace(/^export \{\};?$/gm, '');

const script = ['delivery-dash.assets.ts', 'delivery-dash.rewards.ts', 'delivery-dash.engine.ts', 'delivery-dash.leaderboard.ts', 'delivery-dash.game.ts'].map(compile).join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Gift&Go Delivery Dash</title><style>body{margin:0;padding:16px;background:#F4F6FB;font-family:system-ui} @media(max-width:400px){body{padding:0}}</style></head><body>
<div id="giftgo-delivery-dash-preview">
${read('delivery-dash.component.html')}
</div>
<style>
${read('delivery-dash.component.css').replace(/^:host.*$/m, '')}
</style>
<script>
(()=>{
${script}
const root=document.getElementById("giftgo-delivery-dash-preview").querySelector(".delivery-dash");
const game=new DeliveryDashGame(root,window);
root.deliveryDash=game;
window.addEventListener("pagehide",()=>game.destroy(),{once:true});
})();
</script>

</body></html>
`;
writeFileSync(join(root, 'preview.html'), html);
writeFileSync(join(root, 'index.html'), html);
console.log('Built preview.html and index.html');
