// usage: node _split.js <fichier.txt> <outdir> name:debut-fin ...
const fs=require('fs');const [,,src,out,...ranges]=process.argv;
const t=fs.readFileSync(src,'utf8');const pages=t.split(/\n=== PAGE (\d+) ===\n/);
const map={};for(let i=1;i<pages.length;i+=2)map[+pages[i]]=pages[i+1];
fs.mkdirSync(out,{recursive:true});
for(const r of ranges){const [n,a]=r.split(':');const [d,f]=a.split('-').map(Number);
 let s='';for(let p=d;p<=f;p++)s+=(map[p]||'').split('\n').filter(l=>!/^Page \d+ of|Les manuels de l.IUA|^Droit constitutionnel 1 : Théorie générale$|^\d+$/.test(l.trim())).join('\n')+'\n';
 fs.writeFileSync(`${out}/${n}.txt`,s.replace(/\n{3,}/g,'\n\n'));console.log(n,d+'-'+f,s.length,'chars');}
