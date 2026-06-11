/* ==================== ENHANCEMENTS RESUMECI ==================== */
(function(){
  'use strict';

  // ==================== TOAST SYSTEM ====================
  function ensureToastContainer(){
    let c=document.getElementById('toastContainer');
    if(!c){c=document.createElement('div');c.id='toastContainer';c.className='toast-container';c.setAttribute('aria-live','polite');document.body.appendChild(c);}
    return c;
  }
  window.toast=function(msg,type='info',duration=3500){
    const c=ensureToastContainer();
    const t=document.createElement('div');
    t.className='toast '+type;
    const icons={info:'fa-circle-info',success:'fa-circle-check',error:'fa-circle-exclamation',warn:'fa-triangle-exclamation'};
    t.innerHTML=`<i class="fas ${icons[type]||icons.info} toast-icon"></i><span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(()=>{t.classList.add('fade-out');setTimeout(()=>t.remove(),300);},duration);
  };

  // ==================== HAPTIC FEEDBACK ====================
  window.haptic=function(pattern=20){if(navigator.vibrate)navigator.vibrate(pattern);};

  // ==================== CONFETTI ====================
  window.confetti=function(){
    const c=document.createElement('div');c.className='confetti-container';
    const colors=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
    for(let i=0;i<60;i++){
      const p=document.createElement('div');p.className='confetti-piece';
      p.style.left=Math.random()*100+'%';
      p.style.background=colors[Math.floor(Math.random()*colors.length)];
      p.style.animationDelay=Math.random()*0.5+'s';
      p.style.animationDuration=(2+Math.random()*2)+'s';
      c.appendChild(p);
    }
    document.body.appendChild(c);
    setTimeout(()=>c.remove(),4000);
    haptic([100,50,100]);
  };

  // ==================== SCROLL-TO-TOP ====================
  function initScrollTop(){
    const btn=document.createElement('button');
    btn.className='scroll-top-btn';btn.id='scrollTopBtn';
    btn.innerHTML='<i class="fas fa-arrow-up"></i>';
    btn.setAttribute('aria-label','Retour en haut');
    btn.addEventListener('click',()=>{window.scrollTo({top:0,behavior:'smooth'});haptic(15);});
    document.body.appendChild(btn);
    window.addEventListener('scroll',()=>{
      btn.classList.toggle('show',window.scrollY>400);
    },{passive:true});
  }

  // ==================== NETWORK STATUS ====================
  function initNetworkStatus(){
    const bar=document.createElement('div');
    bar.className='net-status';bar.id='netStatus';
    document.body.appendChild(bar);
    let wasOffline=false;
    function update(){
      if(!navigator.onLine){
        bar.className='net-status offline';
        bar.innerHTML='<i class="fas fa-wifi-slash"></i> Mode hors-ligne — les fiches téléchargées restent accessibles';
        wasOffline=true;
      }else if(wasOffline){
        bar.className='net-status back-online';
        bar.innerHTML='<i class="fas fa-wifi"></i> Connexion rétablie';
        setTimeout(()=>{bar.className='net-status';bar.innerHTML='';},2500);
        wasOffline=false;
      }
    }
    window.addEventListener('online',update);
    window.addEventListener('offline',update);
    update();
  }

  // ==================== TOOLS FAB MENU ====================
  function initToolsFab(){
    const fab=document.createElement('button');
    fab.className='tools-fab';fab.id='toolsFab';
    fab.innerHTML='<i class="fas fa-toolbox"></i>';
    fab.setAttribute('aria-label','Outils');
    document.body.appendChild(fab);
    const menu=document.createElement('div');
    menu.className='tools-menu';menu.id='toolsMenu';
    menu.innerHTML=`
      <button onclick="openCalculator()"><i class="fas fa-calculator"></i> Calculatrice</button>
      <button onclick="openPomodoro()"><i class="fas fa-clock"></i> Timer Pomodoro</button>
      <button onclick="openNotes()"><i class="fas fa-note-sticky"></i> Bloc-notes</button>
      <button onclick="openPlanner()"><i class="fas fa-calendar-days"></i> Plan de révision</button>
      <button onclick="toggleFocusMode()"><i class="fas fa-eye"></i> Mode Focus</button>
      <button onclick="togglePaperMode()"><i class="fas fa-book-open"></i> Mode Lecture papier</button>
      <button onclick="openShareMenu()"><i class="fas fa-share-nodes"></i> Partager</button>
    `;
    document.body.appendChild(menu);
    fab.addEventListener('click',e=>{e.stopPropagation();fab.classList.toggle('open');menu.classList.toggle('show');haptic(15);});
    document.addEventListener('click',e=>{if(!menu.contains(e.target)&&e.target!==fab){fab.classList.remove('open');menu.classList.remove('show');}});
  }

  // ==================== MODAL HELPER ====================
  window.openModal=function(title,bodyHtml,id='rciModal'){
    let m=document.getElementById(id);
    if(!m){
      m=document.createElement('div');m.id=id;m.className='rci-modal';
      m.innerHTML=`<div class="rci-modal-content"><button class="rci-modal-close" aria-label="Fermer"><i class="fas fa-times"></i></button><h3 id="${id}Title"></h3><div id="${id}Body"></div></div>`;
      document.body.appendChild(m);
      m.querySelector('.rci-modal-close').addEventListener('click',()=>closeModal(id));
      m.addEventListener('click',e=>{if(e.target===m)closeModal(id);});
    }
    document.getElementById(id+'Title').textContent=title;
    document.getElementById(id+'Body').innerHTML=bodyHtml;
    m.classList.add('show');
    return m;
  };
  window.closeModal=function(id='rciModal'){const m=document.getElementById(id);if(m)m.classList.remove('show');};

  // ==================== CALCULATRICE ====================
  let calcExpr='';
  window.openCalculator=function(){
    calcExpr='';
    const html=`
      <div class="calc-display" id="calcDisplay">0</div>
      <div class="calc-grid">
        <button class="clr" onclick="calcClear()">C</button>
        <button onclick="calcInput('(')">(</button>
        <button onclick="calcInput(')')">)</button>
        <button class="op" onclick="calcInput('/')">÷</button>
        <button onclick="calcInput('7')">7</button><button onclick="calcInput('8')">8</button><button onclick="calcInput('9')">9</button>
        <button class="op" onclick="calcInput('*')">×</button>
        <button onclick="calcInput('4')">4</button><button onclick="calcInput('5')">5</button><button onclick="calcInput('6')">6</button>
        <button class="op" onclick="calcInput('-')">−</button>
        <button onclick="calcInput('1')">1</button><button onclick="calcInput('2')">2</button><button onclick="calcInput('3')">3</button>
        <button class="op" onclick="calcInput('+')">+</button>
        <button onclick="calcInput('0')">0</button><button onclick="calcInput('.')">.</button>
        <button class="eq" onclick="calcEval()">=</button>
      </div>`;
    openModal('🧮 Calculatrice',html,'calcModal');
  };
  window.calcInput=function(v){calcExpr+=v;document.getElementById('calcDisplay').textContent=calcExpr||'0';haptic(10);};
  window.calcClear=function(){calcExpr='';document.getElementById('calcDisplay').textContent='0';};
  window.calcEval=function(){
    try{
      if(!/^[0-9+\-*/().\s]+$/.test(calcExpr))throw new Error('Invalide');
      const r=Function('"use strict";return ('+calcExpr+')')();
      calcExpr=String(r);
      document.getElementById('calcDisplay').textContent=calcExpr;
    }catch(e){document.getElementById('calcDisplay').textContent='Erreur';calcExpr='';}
    haptic([20,30,20]);
  };

  // ==================== POMODORO ====================
  let pomoState={remaining:1500,duration:1500,running:false,break:false,interval:null,cycles:0};
  window.openPomodoro=function(){
    const html=`
      <div class="pomo-status" id="pomoStatus">Prêt à travailler</div>
      <div class="pomo-display" id="pomoDisplay">25:00</div>
      <div class="pomo-controls">
        <button class="start" id="pomoStart" onclick="pomoStart()"><i class="fas fa-play"></i> Démarrer</button>
        <button class="pause" onclick="pomoPause()"><i class="fas fa-pause"></i> Pause</button>
        <button class="reset" onclick="pomoReset()"><i class="fas fa-rotate-left"></i> Reset</button>
      </div>
      <div class="pomo-presets">
        <button onclick="pomoSet(900)">15 min</button>
        <button class="active" onclick="pomoSet(1500)">25 min</button>
        <button onclick="pomoSet(2700)">45 min</button>
        <button onclick="pomoSet(3000)">50 min</button>
      </div>
      <p style="text-align:center;color:#64748b;font-size:12px;margin-top:14px">Cycles complétés : <strong id="pomoCycles">${pomoState.cycles}</strong></p>`;
    openModal('⏱️ Timer Pomodoro',html,'pomoModal');
    pomoUpdateDisplay();
  };
  function pomoUpdateDisplay(){
    const m=Math.floor(pomoState.remaining/60),s=pomoState.remaining%60;
    const txt=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    const d=document.getElementById('pomoDisplay');
    if(d){d.textContent=txt;d.classList.toggle('break',pomoState.break);}
    const st=document.getElementById('pomoStatus');
    if(st)st.textContent=pomoState.break?'☕ Pause méritée !':(pomoState.running?'📚 Concentration...':'Prêt à travailler');
    pomoUpdateMini(txt);
  }
  function pomoUpdateMini(txt){
    let mini=document.getElementById('pomoMini');
    if(pomoState.running){
      if(!mini){
        mini=document.createElement('div');mini.id='pomoMini';mini.className='pomo-mini';
        mini.innerHTML=`<div class="pomo-mini-icon"><i class="fas fa-clock"></i></div><span id="pomoMiniTxt"></span><button class="pomo-mini-stop" aria-label="Arrêter"><i class="fas fa-stop"></i></button>`;
        document.body.appendChild(mini);
        mini.addEventListener('click',e=>{if(!e.target.closest('.pomo-mini-stop'))openPomodoro();});
        mini.querySelector('.pomo-mini-stop').addEventListener('click',e=>{e.stopPropagation();pomoReset();});
      }
      mini.classList.add('show');
      mini.classList.toggle('break',pomoState.break);
      const sp=mini.querySelector('#pomoMiniTxt');if(sp)sp.textContent=(pomoState.break?'☕ ':'📚 ')+txt;
    }else if(mini){mini.classList.remove('show');setTimeout(()=>{if(!pomoState.running&&mini.parentNode)mini.remove();},400);}
    updateFabBadge();
  }
  window.pomoStart=function(){
    if(pomoState.running)return;
    pomoState.running=true;
    pomoState.interval=setInterval(()=>{
      pomoState.remaining--;
      if(pomoState.remaining<=0){
        clearInterval(pomoState.interval);pomoState.running=false;
        haptic([200,100,200,100,200]);
        if(!pomoState.break){
          pomoState.cycles++;pomoState.break=true;pomoState.remaining=300;pomoState.duration=300;
          toast('🎉 Bravo ! 5 minutes de pause méritée','success',5000);
        }else{
          pomoState.break=false;pomoState.remaining=1500;pomoState.duration=1500;
          toast('💪 Pause terminée. On repart !','info',4000);
        }
      }
      pomoUpdateDisplay();
      const cy=document.getElementById('pomoCycles');if(cy)cy.textContent=pomoState.cycles;
    },1000);
    haptic(15);
  };
  window.pomoPause=function(){pomoState.running=false;if(pomoState.interval)clearInterval(pomoState.interval);};
  window.pomoReset=function(){pomoPause();pomoState.remaining=pomoState.duration;pomoUpdateDisplay();};
  window.pomoSet=function(sec){
    pomoPause();pomoState.duration=sec;pomoState.remaining=sec;pomoState.break=false;pomoUpdateDisplay();
    document.querySelectorAll('.pomo-presets button').forEach(b=>b.classList.remove('active'));
    if(event&&event.target)event.target.classList.add('active');
  };

  // ==================== NOTES ====================
  window.openNotes=function(){
    const saved=localStorage.getItem('rci-notes')||'';
    const html=`
      <textarea class="notes-textarea" id="notesArea" placeholder="Écris ici tes notes... (sauvegarde automatique)">${saved.replace(/</g,'&lt;')}</textarea>
      <div class="notes-info" id="notesInfo">${saved.length} caractères • sauvegardé localement</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button onclick="notesExport()" style="flex:1;padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px"><i class="fas fa-download"></i> Exporter (.txt)</button>
        <button onclick="notesClear()" style="padding:10px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px"><i class="fas fa-trash"></i></button>
      </div>`;
    openModal('📝 Bloc-notes',html,'notesModal');
    const ta=document.getElementById('notesArea');
    let timer;
    ta.addEventListener('input',()=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        localStorage.setItem('rci-notes',ta.value);
        document.getElementById('notesInfo').textContent=ta.value.length+' caractères • sauvegardé';
      },400);
    });
  };
  window.notesExport=function(){
    const v=document.getElementById('notesArea').value;
    const blob=new Blob([v],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='notes-resumeci-'+Date.now()+'.txt';a.click();
    URL.revokeObjectURL(url);toast('Notes exportées','success');
  };
  window.notesClear=function(){
    if(!confirm('Effacer toutes les notes ?'))return;
    localStorage.removeItem('rci-notes');
    document.getElementById('notesArea').value='';
    document.getElementById('notesInfo').textContent='0 caractères • sauvegardé';
    toast('Notes effacées','info');
  };

  // ==================== PLAN DE RÉVISION ====================
  window.openPlanner=function(){
    const saved=JSON.parse(localStorage.getItem('rci-planner')||'null');
    const today=new Date().toISOString().split('T')[0];
    let html=`
      <p style="color:#64748b;font-size:13px;margin-bottom:14px">Saisis la date de ton examen, l'heure de début, le site génère un plan de révision quotidien avec rappels.</p>
      <label style="font-size:12px;color:#475569;font-weight:600">📆 Date d'examen</label>
      <input type="date" id="plannerDate" class="planner-input" value="${saved?saved.date:''}" min="${today}">
      <label style="font-size:12px;color:#475569;font-weight:600">⏰ Heure de début quotidienne</label>
      <input type="time" id="plannerTime" class="planner-input" value="${saved&&saved.time?saved.time:'17:00'}">
      <label style="font-size:12px;color:#475569;font-weight:600">🎓 Classe</label>
      <select id="plannerClass" class="planner-input">
        <option value="5eme">5ème</option>
        <option value="Terminale_A">Terminale A</option>
        <option value="Terminale_D">Terminale D</option>
      </select>
      <label style="font-size:12px;color:#475569;font-weight:600">⏱️ Minutes/jour</label>
      <input type="number" id="plannerMin" class="planner-input" value="${saved?saved.minutes:45}" min="15" max="240">
      <label style="font-size:12px;color:#475569;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:8px"><input type="checkbox" id="plannerNotif" ${saved&&saved.notif!==false?'checked':''}> 🔔 Activer les rappels (notifications)</label>
      <button onclick="generatePlan()" style="width:100%;padding:12px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;margin-bottom:14px"><i class="fas fa-wand-magic-sparkles"></i> Générer mon plan</button>
      <button onclick="testNotif()" style="width:100%;padding:8px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;cursor:pointer;margin-bottom:14px"><i class="fas fa-bell"></i> Tester une notification</button>
      <div id="plannerResult"></div>`;
    openModal('📅 Plan de révision',html,'plannerModal');
    if(saved&&saved.plan)renderPlan(saved.plan,saved);
    if(saved&&saved.classe)document.getElementById('plannerClass').value=saved.classe;
  };
  window.generatePlan=async function(){
    const date=document.getElementById('plannerDate').value;
    const time=document.getElementById('plannerTime').value||'17:00';
    const cls=document.getElementById('plannerClass').value;
    const minutes=parseInt(document.getElementById('plannerMin').value)||45;
    const notif=document.getElementById('plannerNotif').checked;
    if(!date){toast('Choisis une date d\'examen','warn');return;}
    const target=new Date(date),today=new Date();today.setHours(0,0,0,0);
    const days=Math.max(1,Math.ceil((target-today)/(1000*60*60*24)));
    const struct=window.DATA&&window.DATA.structure?window.DATA.structure[cls]:null;
    if(!struct){toast('Classe non disponible','error');return;}
    const subjects=Object.keys(struct);
    const plan=[];
    for(let d=0;d<Math.min(days,30);d++){
      const date2=new Date(today);date2.setDate(today.getDate()+d);
      const subj=subjects[d%subjects.length];
      const fiches=struct[subj]||[];
      const f=fiches[d%fiches.length];
      plan.push({day:d+1,dateISO:date2.toISOString().split('T')[0],date:date2.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'short'}),subject:subj,lesson:f?f.name:'Révision libre',file:f?f.file:null,minutes});
    }
    const data={date,time,classe:cls,minutes,notif,plan};
    localStorage.setItem('rci-planner',JSON.stringify(data));
    renderPlan(plan,data);
    toast('Plan de '+days+' jours généré — début quotidien à '+time,'success');
    if(notif){
      const ok=await requestNotifPermission();
      if(ok){scheduleNextReminder();toast('🔔 Rappels activés pour '+time,'success',4000);}
    }
  };
  async function requestNotifPermission(){
    if(!('Notification' in window))return false;
    if(Notification.permission==='granted')return true;
    if(Notification.permission==='denied'){toast('Notifications refusées. Active-les dans les paramètres du navigateur.','warn',5000);return false;}
    const r=await Notification.requestPermission();
    return r==='granted';
  }
  window.testNotif=async function(){
    const ok=await requestNotifPermission();
    if(!ok)return;
    showStudyNotification('Test de notification','Si tu vois ce message, les rappels fonctionnent ! 🎉');
  };
  function showStudyNotification(title,body){
    if(Notification.permission!=='granted')return;
    try{
      const n=new Notification(title,{body,icon:'/icon-192.png',badge:'/icon-192.png',tag:'rci-study',renotify:true,vibrate:[200,100,200]});
      n.onclick=()=>{window.focus();n.close();};
    }catch(e){
      // Fallback via SW
      navigator.serviceWorker?.ready.then(reg=>reg.showNotification(title,{body,icon:'/icon-192.png',vibrate:[200,100,200],tag:'rci-study'}));
    }
  }
  function getTodayPlanItem(){
    const data=JSON.parse(localStorage.getItem('rci-planner')||'null');if(!data||!data.plan)return null;
    const today=new Date().toISOString().split('T')[0];
    return{data,item:data.plan.find(p=>p.dateISO===today)};
  }
  function scheduleNextReminder(){
    if(window._rciReminderTimer)clearTimeout(window._rciReminderTimer);
    const r=getTodayPlanItem();if(!r||!r.data.notif||!r.item)return;
    const[h,m]=r.data.time.split(':').map(Number);
    const now=new Date();
    const target=new Date();target.setHours(h,m,0,0);
    const lastNotif=localStorage.getItem('rci-last-notif');
    if(lastNotif===r.item.dateISO)return; // déjà notifié aujourd'hui
    if(target<=now){
      // L'heure est passée — notifie tout de suite
      showStudyNotification('📚 Jour '+r.item.day+' — '+r.item.subject,r.item.lesson+' • '+r.item.minutes+' min');
      localStorage.setItem('rci-last-notif',r.item.dateISO);
      // Reprogramme pour demain
      const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(h,m,0,0);
      window._rciReminderTimer=setTimeout(scheduleNextReminder,tomorrow-now);
    }else{
      const wait=target-now;
      window._rciReminderTimer=setTimeout(()=>{
        showStudyNotification('📚 Jour '+r.item.day+' — '+r.item.subject,r.item.lesson+' • '+r.item.minutes+' min');
        localStorage.setItem('rci-last-notif',r.item.dateISO);
        scheduleNextReminder();
      },wait);
    }
  }
  function renderPlan(plan,data){
    const el=document.getElementById('plannerResult');
    const today=new Date().toISOString().split('T')[0];
    const timeInfo=data&&data.time?` — début quotidien <strong>${data.time}</strong>`:'';
    el.innerHTML='<h4 style="margin:8px 0 12px;font-size:14px">Tes prochains jours'+timeInfo+' :</h4>'+plan.slice(0,10).map(p=>{
      const isToday=p.dateISO===today;
      const todayBadge=isToday?'<span style="background:#10b981;color:#fff;font-size:10px;padding:2px 7px;border-radius:6px;font-weight:700;margin-left:6px">AUJOURD\'HUI</span>':'';
      return `<div class="planner-day" style="${isToday?'border-left-color:#10b981;background:#ecfdf5':''}"><strong>Jour ${p.day} — ${p.date}${todayBadge}</strong><span>${p.subject} • ${p.lesson} (${p.minutes} min)</span></div>`;
    }).join('');
  }

  // ==================== FOCUS MODE ====================
  function ensureFocusBanner(){
    let b=document.getElementById('focusBanner');
    if(!b){b=document.createElement('div');b.id='focusBanner';b.className='focus-banner';
      b.innerHTML='<i class="fas fa-eye"></i> Mode Focus actif<button aria-label="Quitter"><i class="fas fa-times"></i></button>';
      document.body.appendChild(b);
      b.querySelector('button').addEventListener('click',toggleFocusMode);
    }return b;
  }
  window.toggleFocusMode=function(){
    document.body.classList.toggle('focus-mode');
    const on=document.body.classList.contains('focus-mode');
    ensureFocusBanner().classList.toggle('show',on);
    toast(on?'👁️ Mode focus activé — zéro distraction':'Mode focus désactivé','info',2000);
    haptic(15);updateFabBadge();
  };

  // ==================== PAPER READING MODE ====================
  function ensurePaperBanner(){
    let b=document.getElementById('paperBanner');
    if(!b){b=document.createElement('div');b.id='paperBanner';b.className='paper-banner';
      b.innerHTML='<i class="fas fa-book-open"></i> Mode Lecture papier<button aria-label="Quitter"><i class="fas fa-times"></i></button>';
      document.body.appendChild(b);
      b.querySelector('button').addEventListener('click',togglePaperMode);
    }return b;
  }
  window.togglePaperMode=function(){
    document.body.classList.toggle('paper-mode');
    const on=document.body.classList.contains('paper-mode');
    localStorage.setItem('rci-paper',on?'1':'0');
    ensurePaperBanner().classList.toggle('show',on);
    toast(on?'📖 Mode lecture papier activé':'Mode lecture papier désactivé','info',2000);
    haptic(15);updateFabBadge();
  };
  if(localStorage.getItem('rci-paper')==='1'){
    document.body.classList.add('paper-mode');
    setTimeout(()=>{ensurePaperBanner().classList.add('show');},100);
  }

  // ==================== FAB BADGE (active tools count) ====================
  function updateFabBadge(){
    const fab=document.getElementById('toolsFab');if(!fab)return;
    let count=0;
    if(pomoState.running)count++;
    if(document.body.classList.contains('focus-mode'))count++;
    if(document.body.classList.contains('paper-mode'))count++;
    let badge=fab.querySelector('.fab-badge');
    if(count>0){
      if(!badge){badge=document.createElement('span');badge.className='fab-badge';fab.appendChild(badge);}
      badge.textContent=count;
    }else if(badge)badge.remove();
    // Update menu button labels
    const menu=document.getElementById('toolsMenu');if(!menu)return;
    menu.querySelectorAll('button').forEach(b=>{const ex=b.querySelector('.badge-active');if(ex)ex.remove();});
    function mark(idx){
      const btns=menu.querySelectorAll('button');if(!btns[idx])return;
      const s=document.createElement('span');s.className='badge-active';s.textContent='ON';btns[idx].appendChild(s);
    }
    if(pomoState.running)mark(1);
    if(document.body.classList.contains('focus-mode'))mark(4);
    if(document.body.classList.contains('paper-mode'))mark(5);
  }
  window.updateFabBadge=updateFabBadge;

  // ==================== SHARE MENU (WhatsApp + QR + Copy) ====================
  window.openShareMenu=function(){
    const url=location.href;
    const msg=encodeURIComponent('📚 Découvre ResumeCI pour réviser au Collège & Lycée : '+url);
    const html=`
      <p style="color:#64748b;font-size:13px;margin-bottom:14px">Partage cette page avec un ami :</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <a href="https://wa.me/?text=${msg}" target="_blank" rel="noopener" class="wa-btn" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px"><i class="fab fa-whatsapp"></i> Partager sur WhatsApp</a>
        <a href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${msg}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#0088cc;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px"><i class="fab fa-telegram"></i> Partager sur Telegram</a>
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#1877f2;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px"><i class="fab fa-facebook"></i> Partager sur Facebook</a>
        <button onclick="copyShareLink()" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#0f172a;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer"><i class="fas fa-link"></i> Copier le lien</button>
        <button onclick="showQR()" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer"><i class="fas fa-qrcode"></i> Afficher en QR Code</button>
      </div>
      <div id="qrZone" class="qr-canvas"></div>`;
    openModal('🔗 Partager',html,'shareModal');
  };
  window.copyShareLink=function(){
    navigator.clipboard.writeText(location.href).then(()=>toast('Lien copié dans le presse-papier','success')).catch(()=>toast('Impossible de copier','error'));
  };
  window.showQR=function(){
    const z=document.getElementById('qrZone');
    const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=300x300&data='+encodeURIComponent(location.href);
    z.innerHTML=`<img id="qrImg" src="${qrUrl}" alt="QR Code" loading="lazy" crossorigin="anonymous">`+
      `<div class="qr-actions"><button class="qr-share" onclick="shareQR()"><i class="fas fa-share"></i> Partager le QR</button>`+
      `<button class="qr-download" onclick="downloadQR()"><i class="fas fa-download"></i> Télécharger</button>`+
      `<button class="qr-copy" onclick="copyQR()"><i class="fas fa-copy"></i> Copier l'image</button></div>`;
  };
  async function fetchQRBlob(){
    const url='https://api.qrserver.com/v1/create-qr-code/?size=512x512&data='+encodeURIComponent(location.href);
    const r=await fetch(url);return await r.blob();
  }
  window.downloadQR=async function(){
    try{const blob=await fetchQRBlob();const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='qr-resumeci.png';a.click();URL.revokeObjectURL(u);toast('QR téléchargé','success');}catch(e){toast('Erreur téléchargement','error');}
  };
  window.shareQR=async function(){
    try{
      const blob=await fetchQRBlob();
      const file=new File([blob],'qr-resumeci.png',{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:'ResumeCI — QR Code',text:'Scanne ce QR pour ouvrir ResumeCI'});
        toast('QR partagé','success');
      }else if(navigator.share){
        await navigator.share({title:'ResumeCI',text:'Découvre ResumeCI',url:location.href});
      }else{
        downloadQR();toast('Partage non supporté — image téléchargée','info');
      }
    }catch(e){if(e.name!=='AbortError')toast('Erreur partage : '+e.message,'error');}
  };
  window.copyQR=async function(){
    try{
      const blob=await fetchQRBlob();
      if(navigator.clipboard&&window.ClipboardItem){
        await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
        toast('Image QR copiée','success');
      }else{toast('Copie image non supportée sur ce navigateur','warn');}
    }catch(e){toast('Erreur copie : '+e.message,'error');}
  };

  // ==================== COOKIE BANNER ====================
  function initCookieBanner(){
    if(localStorage.getItem('rci-cookie-ok')==='1')return;
    const b=document.createElement('div');b.className='cookie-banner';
    b.innerHTML=`<p>🍪 ResumeCI utilise uniquement le stockage local (localStorage) pour sauvegarder tes préférences, favoris et progrès. Aucun cookie de tracking. <a href="/privacy.html" style="color:#93c5fd;text-decoration:underline">En savoir plus</a></p>
      <button onclick="cookieAccept()">J'ai compris</button>`;
    document.body.appendChild(b);
    window.cookieAccept=function(){localStorage.setItem('rci-cookie-ok','1');b.remove();};
  }

  // ==================== ENHANCED SEARCH (autocomplete + history + fuzzy) ====================
  function getSearchHistory(){return JSON.parse(localStorage.getItem('rci-search-history')||'[]');}
  function addToHistory(q){
    if(!q||q.length<2)return;
    let h=getSearchHistory();
    h=h.filter(x=>x!==q);h.unshift(q);h=h.slice(0,8);
    localStorage.setItem('rci-search-history',JSON.stringify(h));
  }
  function fuzzyMatch(query,text){
    query=query.toLowerCase().trim();text=text.toLowerCase();
    if(text.includes(query))return true;
    // Tolerance: split query into words, all must be present (any order)
    const words=query.split(/\s+/);
    return words.every(w=>w.length<2||text.includes(w));
  }
  function initEnhancedSearch(){
    const input=document.getElementById('searchInput');
    if(!input)return;
    const box=input.parentElement;
    const sug=document.createElement('div');sug.className='search-suggestions';sug.id='searchSug';
    box.style.position='relative';box.appendChild(sug);

    function render(items,isHistory){
      if(!items.length){sug.classList.remove('show');return;}
      sug.innerHTML=items.map(it=>{
        if(isHistory)return `<div class="search-suggestion" data-q="${it.replace(/"/g,'&quot;')}"><i class="fas fa-clock-rotate-left recent-icon"></i><span>${it}</span></div>`;
        return `<div class="search-suggestion" data-cls="${it.cls}" data-sub="${it.subject}" data-file="${it.file}"><i class="fas fa-file-lines" style="color:#3b82f6"></i><span>${it.name}</span><span class="meta">${it.cls.replace('_',' ')} · ${it.subject}</span></div>`;
      }).join('');
      sug.classList.add('show');
      sug.querySelectorAll('.search-suggestion').forEach(el=>{
        el.addEventListener('click',()=>{
          if(el.dataset.q){input.value=el.dataset.q;input.dispatchEvent(new Event('input'));}
          else if(window.openSearchResult){
            window.openSearchResult(el.dataset.cls,el.dataset.sub,el.dataset.file);
            sug.classList.remove('show');
          }
        });
      });
    }
    input.addEventListener('focus',()=>{
      if(!input.value.trim()){
        const hist=getSearchHistory();
        if(hist.length)render(hist,true);
      }
    });
    input.addEventListener('input',async()=>{
      const q=input.value.trim();
      if(!q){sug.classList.remove('show');return;}
      if(window.loadSearchIndex)await window.loadSearchIndex();
      const idx=window.SEARCH_INDEX||[];
      const matches=idx.filter(it=>fuzzyMatch(q,it.name+' '+it.subject+' '+it.cls)).slice(0,8);
      render(matches,false);
    });
    input.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        const q=input.value.trim();if(q)addToHistory(q);
        sug.classList.remove('show');
      }else if(e.key==='Escape'){sug.classList.remove('show');}
    });
    document.addEventListener('click',e=>{if(!box.contains(e.target))sug.classList.remove('show');});
  }

  // ==================== SWIPE NAVIGATION (mobile) ====================
  function initSwipeNav(){
    let startX=0,startY=0;
    document.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;},{passive:true});
    document.addEventListener('touchend',e=>{
      if(!window.CURRENT_FICHE)return;
      const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;
      if(Math.abs(dx)<80||Math.abs(dy)>50)return;
      const{cls,sub,file}=window.CURRENT_FICHE;
      const fiches=window.DATA?.structure?.[cls]?.[sub];if(!fiches)return;
      const idx=fiches.findIndex(f=>f.file===file);if(idx===-1)return;
      if(dx<0&&idx<fiches.length-1){window.showFiche(cls,sub,fiches[idx+1].file);haptic(20);toast('Fiche suivante →','info',1500);}
      else if(dx>0&&idx>0){window.showFiche(cls,sub,fiches[idx-1].file);haptic(20);toast('← Fiche précédente','info',1500);}
    },{passive:true});
  }

  // ==================== CONFETTI HOOK ====================
  // Peut être appelé depuis quiz.html via window.confetti() à la fin d'un score parfait

  // ==================== INIT ====================
  function init(){
    initScrollTop();
    initNetworkStatus();
    initToolsFab();
    initCookieBanner();
    initEnhancedSearch();
    initSwipeNav();
    // Reschedule study reminders if planner exists
    try{scheduleNextReminder();}catch(e){}
    // Hook PWA install on landing
    if(localStorage.getItem('rci-welcome')!=='1'){
      setTimeout(()=>{
        toast('👋 Bienvenue ! Clique sur 🛠️ en bas à gauche pour découvrir tous les outils','info',6000);
        localStorage.setItem('rci-welcome','1');
      },2000);
    }
    // Service Worker registration (global)
    try{ if('serviceWorker' in navigator){ navigator.serviceWorker.register('/service-worker.js'); } }catch(e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
