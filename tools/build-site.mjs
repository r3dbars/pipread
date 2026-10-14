import {cp,mkdir} from 'node:fs/promises';
// No deployment, remote credentials, framework runtime or model is involved.
await mkdir('dist-site',{recursive:true});
await cp('website/public','dist-site',{recursive:true});
console.log('Static website copied to dist-site/');
