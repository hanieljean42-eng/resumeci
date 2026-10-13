const fs=require('fs'),path=require('path'),crypto=require('crypto');
const qDir='public/data/quizzes';
// signature = corps de fiche normalisé (sans chips classe/titre)
function sig(file){
  let h=fs.readFileSync(file,'utf8');
  const i=h.indexOf('<body');
  h=i>=0?h.slice(i):h;
  // retirer les chips (diffèrent selon la classe)
  h=h.replace(/<span class="chip">[^<]*<\/span>/g,'').replace(/<title>[^<]*<\/title>/g,'');
  h=h.replace(/\s+/g,' ').trim();
  return crypto.createHash('sha1').update(h).digest('hex');
}
const sigMap={},keyMap={};
for(const cls of fs.readdirSync(qDir)){
  for(const m of fs.readdirSync(path.join(qDir,cls))){
    const sub=m.replace('.json','');
    if(!fs.existsSync('Fiches_Resume/'+cls+'/'+sub)) continue;
    const data=JSON.parse(fs.readFileSync(path.join(qDir,cls,m)));
    for(const[k,v]of Object.entries(data)){
      const f='Fiches_Resume/'+cls+'/'+sub+'/'+k+'.html';
      if(fs.existsSync(f)){sigMap[sig(f)]={cls,sub,key:k};keyMap[k]=v;}
    }
  }
}
const missing={},found={};
for(const cls of['4eme','Premiere_A','Premiere_C']){
  missing[cls]={};found[cls]={};
  for(const sub of fs.readdirSync('Fiches_Resume/'+cls)){
    for(const f of fs.readdirSync('Fiches_Resume/'+cls+'/'+sub)){
      const key=f.replace(/\.html$/,'');
      const s=sig('Fiches_Resume/'+cls+'/'+sub+'/'+f);
      if(sigMap[s])(found[cls][sub]=found[cls][sub]||[]).push(key);
      else (missing[cls][sub]=missing[cls][sub]||[]).push(key);
    }
  }
}
let n=0,m=0;
for(const cls in missing){for(const sub in missing[cls]){console.log(cls,'/',sub,'=>',missing[cls][sub].length,'manquants');n+=missing[cls][sub].length;}}
for(const cls in found){for(const sub in found[cls]){m+=found[cls][sub].length;console.log('  +',cls,'/',sub,'=>',found[cls][sub].length,'reutilisables');}}
console.log('TOTAL a creer:',n,'| reutilisables:',m);
fs.writeFileSync('_quiz_missing.json',JSON.stringify({missing,found,sigMapKeys:Object.keys(sigMap).length},null,1));
