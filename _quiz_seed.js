const fs=require('fs'),path=require('path'),crypto=require('crypto');
const qDir='public/data/quizzes';
function sig(file){
  let h=fs.readFileSync(file,'utf8');
  const i=h.indexOf('<body'); h=i>=0?h.slice(i):h;
  h=h.replace(/<span class="chip">[^<]*<\/span>/g,'').replace(/<title>[^<]*<\/title>/g,'');
  h=h.replace(/\s+/g,' ').trim();
  return crypto.createHash('sha1').update(h).digest('hex');
}
// charger tous les quiz existants + signature de leur fiche
const byClass={};
const sigMap={};
for(const cls of fs.readdirSync(qDir)){
  byClass[cls]={};
  for(const m of fs.readdirSync(path.join(qDir,cls))){
    const sub=m.replace('.json','');
    const data=JSON.parse(fs.readFileSync(path.join(qDir,cls,m)));
    for(const[k,v]of Object.entries(data)){
      const f='Fiches_Resume/'+cls+'/'+sub+'/'+k+'.html';
      if(fs.existsSync(f)) sigMap[sig(f)]=v;
    }
  }
}
// créer les JSON cibles : réutilisable par signature
let reused=0;
for(const cls of['4eme','Premiere_A','Premiere_C']){
  const outDir=path.join(qDir,cls);
  fs.mkdirSync(outDir,{recursive:true});
  for(const sub of fs.readdirSync('Fiches_Resume/'+cls)){
    const outFile=path.join(outDir,sub+'.json');
    const out=fs.existsSync(outFile)?JSON.parse(fs.readFileSync(outFile)):{};
    for(const f of fs.readdirSync('Fiches_Resume/'+cls+'/'+sub)){
      const key=f.replace(/\.html$/,'');
      if(out[key])continue;
      const s=sig('Fiches_Resume/'+cls+'/'+sub+'/'+f);
      if(sigMap[s]){out[key]=sigMap[s];reused++;}
    }
    fs.writeFileSync(outFile,JSON.stringify(out,null,2));
  }
}
console.log('Quiz reutilises:',reused);
