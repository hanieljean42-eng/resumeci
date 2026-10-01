/* ==================== ENHANCEMENTS RESUMECI ==================== */
(function(){
  'use strict';

  // ==================== ABONNEMENTS & VÉRIFICATION DES DROITS ====================
  window.userHasFeature = function(featureName) {
    if (!window.USER_PROFILE) {
      try {
        const raw = localStorage.getItem('resumeci_profile');
        if (raw) window.USER_PROFILE = JSON.parse(raw);
      } catch(e) {}
    }
    if (!window.USER_PROFILE) return false;
    
    // Vérification de la validité de l'abonnement
    const isPremium = !!window.USER_PROFILE.isPremium;
    const expiresAt = Number(window.USER_PROFILE.premiumExpiresAt) || 0;
    if (!isPremium || (expiresAt > 0 && expiresAt < Date.now())) {
      return false; // Pas d'abonnement actif
    }

    const plan = (window.USER_PROFILE.premiumPlan || 'free').toLowerCase();
    const fn = String(featureName || '').toLowerCase();

    // Fonctionnalités incluses dès le Pass Starter (500 F/mois) :
    const isStarterFeature = 
      fn.includes('hors-ligne') || 
      fn.includes('pack') || 
      fn.includes('pdf') || 
      fn.includes('surlign') || 
      fn.includes('note') || 
      fn.includes('stat');

    // Fonctionnalités réservées au Pass Pro (1 000 F/mois) :
    const isProFeature = 
      fn.includes('récitation') || 
      fn.includes('recitation') || 
      fn.includes('recall') || 
      fn.includes('piège') || 
      fn.includes('piege') || 
      fn.includes('audio') || 
      fn.includes('podcast') || 
      fn.includes('flashcard') || 
      fn.includes('quiz') ||
      fn.includes('plan') ||
      fn.includes('planning');

    // Fonctionnalités réservées au Pass Élite (2 000 F/mois) :
    const isEliteFeature = 
      fn.includes('professeur') || 
      fn.includes('ia') || 
      fn.includes('sujet') || 
      fn.includes('examen') || 
      fn.includes('annale') || 
      fn.includes('simulateur');

    if (plan === 'starter') return isStarterFeature;
    if (plan === 'pro') return isStarterFeature || isProFeature;
    if (plan === 'elite') return isStarterFeature || isProFeature || isEliteFeature;

    return false;
  };

  // Fallback redirection de paiement si appelée hors de la SPA principale
  if (typeof window.initiatePremiumPayment !== 'function') {
    window.initiatePremiumPayment = function(btn, tierKey = 'pro') {
      window.location.href = '/?openPass=' + encodeURIComponent(tierKey);
    };
  }

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
    if (document.getElementById('toolsFab')) return;
    const fab=document.createElement('button');
    fab.className='tools-fab';fab.id='toolsFab';
    fab.innerHTML='<i class="fas fa-toolbox"></i>';
    fab.setAttribute('aria-label','Boîte à outils de révision');
    fab.setAttribute('title','Outils (Calculatrice, Pomodoro, Notes, Planning)');
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
  window.initToolsFab = initToolsFab;

  // ==================== MODAL HELPER ====================
  let _modalPreviousFocus = null;

  window.openModal = function(title, bodyHtml, id='genModal') {
    let m=document.getElementById(id);
    if(!m){
      m=document.createElement('div');m.id=id;m.className='rci-modal';
      m.setAttribute('role','dialog');
      m.setAttribute('aria-modal','true');
      m.setAttribute('aria-labelledby', id+'Title');
      m.innerHTML=`<div class="rci-modal-content"><button class="rci-modal-close" aria-label="Fermer"><i class="fas fa-times" aria-hidden="true"></i></button><h3 id="${id}Title"></h3><div id="${id}Body"></div></div>`;
      document.body.appendChild(m);
      m.querySelector('.rci-modal-close').addEventListener('click',()=>closeModal(id));
      m.addEventListener('click',e=>{if(e.target===m)closeModal(id);});
      // Escape key to close
      m.addEventListener('keydown', e => {
        if(e.key === 'Escape') { closeModal(id); return; }
        // Focus trap: Tab/Shift+Tab cycle within modal
        if(e.key === 'Tab') {
          const focusable = m.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
          if(focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if(e.shiftKey) {
            if(document.activeElement === first) { e.preventDefault(); last.focus(); }
          } else {
            if(document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        }
      });
    }
    document.getElementById(id+'Title').textContent=title;
    document.getElementById(id+'Body').innerHTML=bodyHtml;
    _modalPreviousFocus = document.activeElement;
    m.classList.add('show');
    // Focus first focusable element
    requestAnimationFrame(() => {
      const firstFocusable = m.querySelector('button, input, select, textarea, a[href]');
      if(firstFocusable) firstFocusable.focus();
    });
    return m;
  };
  window.closeModal=function(id='rciModal'){
    const m=document.getElementById(id);
    if(m) m.classList.remove('show');
    // Restore focus
    if(_modalPreviousFocus && typeof _modalPreviousFocus.focus === 'function') {
      _modalPreviousFocus.focus();
      _modalPreviousFocus = null;
    }
  };

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
      // Basic math evaluator to avoid Function/eval for CSP compliance
      const evalMath = (expr) => {
        let t = expr.replace(/\s+/g, '').match(/[+\-*/()]|\d+\.\d+|\d+/g) || [];
        while(t.includes(')')) {
          let c = t.indexOf(')'), o = t.lastIndexOf('(', c);
          let s = t.slice(o + 1, c);
          for(let i=1; i<s.length; i+=2) if(s[i]==='*' || s[i]==='/') { s.splice(i-1, 3, s[i]==='*' ? Number(s[i-1])*Number(s[i+1]) : Number(s[i-1])/Number(s[i+1])); i-=2; }
          let r = Number(s[0]); for(let i=1; i<s.length; i+=2) r += s[i]==='+' ? Number(s[i+1]) : -Number(s[i+1]);
          t.splice(o, c - o + 1, r);
        }
        for(let i=1; i<t.length; i+=2) if(t[i]==='*' || t[i]==='/') { t.splice(i-1, 3, t[i]==='*' ? Number(t[i-1])*Number(t[i+1]) : Number(t[i-1])/Number(t[i+1])); i-=2; }
        let res = Number(t[0]); for(let i=1; i<t.length; i+=2) res += t[i]==='+' ? Number(t[i+1]) : -Number(t[i+1]);
        return res;
      };
      calcExpr=String(evalMath(calcExpr));
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
  window.openNotes = function(){
    if (!window.userHasFeature || !window.userHasFeature('Mes Notes Personnelles')) {
      if (typeof window.openPremiumTeaser === 'function') {
        window.openPremiumTeaser('Mes Notes Personnelles');
      } else if (typeof window.openElitePassModal === 'function') {
        window.openElitePassModal('Pass Starter');
      }
      return;
    }
    const saved = localStorage.getItem('rci-notes') || '';
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
  window.openActualPlanner = function(){
    const saved = JSON.parse(localStorage.getItem('rci-planner') || 'null');
    const today = new Date().toISOString().split('T')[0];
    let html = `
      <p style="color:#64748b;font-size:13px;margin-bottom:14px">Saisis la date de ton examen, l'heure de début, le site génère un plan de révision quotidien avec rappels.</p>
      <label style="font-size:12px;color:#475569;font-weight:600">📆 Date d'examen</label>
      <input type="date" id="plannerDate" class="planner-input" value="${saved ? saved.date : ''}" min="${today}">
      <label style="font-size:12px;color:#475569;font-weight:600">⏰ Heure de début quotidienne</label>
      <input type="time" id="plannerTime" class="planner-input" value="${saved && saved.time ? saved.time : '17:00'}">
      <label style="font-size:12px;color:#475569;font-weight:600">🎓 Classe</label>
      <select id="plannerClass" class="planner-input">
        <option value="6eme">6ème</option>
        <option value="5eme">5ème</option>
        <option value="4eme">4ème</option>
        <option value="3eme">3ème (BEPC)</option>
        <option value="2nde_A">Seconde A</option>
        <option value="2nde_C">Seconde C</option>
        <option value="1ere_A">Première A</option>
        <option value="1ere_D">Première D</option>
        <option value="Terminale_A">Terminale A (BAC)</option>
        <option value="Terminale_C">Terminale C (BAC)</option>
        <option value="Terminale_D">Terminale D (BAC)</option>
      </select>
      <label style="font-size:12px;color:#475569;font-weight:600">⏱️ Minutes/jour</label>
      <input type="number" id="plannerMin" class="planner-input" value="${saved ? saved.minutes : 45}" min="15" max="240">
      <label style="font-size:12px;color:#475569;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:8px"><input type="checkbox" id="plannerNotif" ${saved && saved.notif !== false ? 'checked' : ''}> 🔔 Activer les rappels (notifications)</label>
      <button onclick="generatePlan()" style="width:100%;padding:12px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;margin-bottom:14px"><i class="fas fa-wand-magic-sparkles"></i> Générer mon plan</button>
      <button onclick="testNotif()" style="width:100%;padding:8px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;cursor:pointer;margin-bottom:14px"><i class="fas fa-bell"></i> Tester une notification</button>
      <div id="plannerResult"></div>`;
    openModal('📅 Plan de révision', html, 'plannerModal');
    if (saved && saved.plan) renderPlan(saved.plan, saved);
    if (saved && saved.classe) document.getElementById('plannerClass').value = saved.classe;
  };

  window.openPlanner = function(){
    if (window.userHasFeature && window.userHasFeature('Planning d\'Examen')) {
      window.openActualPlanner();
      return;
    }
    if (typeof window.openPremiumTeaser === 'function') {
      window.openPremiumTeaser('Planning d\'Examen');
      return;
    }
    if (typeof window.openElitePassModal === 'function') {
      window.openElitePassModal('Pass Pro');
      return;
    }
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
    const url='https://resumeci.me/inscription.html';
    const msg=encodeURIComponent('🚀 La nouvelle mise à jour de ResumeCI est enfin disponible ! Retrouve 714 fiches de cours gratuites, résumés officiels et outils d\'élite pour réussir ton année scolaire au BEPC et au BAC. Inscris-toi dès maintenant via : https://resumeci.me/inscription.html');
    const html=`
      <p style="color:#64748b;font-size:13px;margin-bottom:14px">Partage la mise à jour avec tes camarades :</p>
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
    b.innerHTML=`<p>🍪 ResumeCI utilise des cookies et le stockage local pour mémoriser tes cours favoris, ton avancement et t'offrir la meilleure expérience d'apprentissage. Aucune donnée n'est cédée à des tiers. <a href="/privacy.html" style="color:#93c5fd;text-decoration:underline">En savoir plus</a></p>
      <button onclick="cookieAccept()">Accepter & Continuer</button>`;
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
    // Service Worker registration & aggressive update checking
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(reg => {
          reg.update();
        }).catch(e => {});

        navigator.serviceWorker.addEventListener('message', e => {
          if (e.data && (e.data.type === 'SW_UPDATED' || e.data.type === 'FORCE_REFRESH_NEW_VERSION')) {
            console.log("Mise à jour v2.2.0 détectée, actualisation...");
            if (!sessionStorage.getItem('resumeci_reloaded_220')) {
              sessionStorage.setItem('resumeci_reloaded_220', '1');
              window.location.reload();
            }
          }
        });
      }
    } catch(e) {}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();

// ==================== PASS RÉUSSITE & LISTE D'ATTENTE ====================
window.handlePhoneInput = function(el) {
  if (!el) return;
  let raw = el.value.replace(/\D/g, '');
  if (raw.startsWith('225') && raw.length > 10) {
    raw = raw.slice(3);
  }
  raw = raw.slice(0, 10);
  
  // Formatage aéré : 07 12 34 56 78
  let formatted = '';
  for (let i = 0; i < raw.length; i++) {
    if (i > 0 && i % 2 === 0) formatted += ' ';
    formatted += raw[i];
  }
  el.value = formatted;
  
  const count = raw.length;
  const counter = document.getElementById('digitCounter');
  const wrapper = document.getElementById('phoneWrapper');
  const errBox = document.getElementById('phoneErrorFeedback');
  
  if (counter) {
    if (count === 10) {
      counter.textContent = "✅ 10/10 (Valide)";
      counter.className = "digit-counter valid";
    } else {
      counter.textContent = count + " / 10 chiffres";
      counter.className = "digit-counter";
    }
  }
  
  if (wrapper) {
    if (count === 10) {
      wrapper.classList.add('is-valid');
      wrapper.classList.remove('is-invalid');
      if (errBox) errBox.classList.remove('show');
    } else {
      wrapper.classList.remove('is-valid');
    }
  }
};

// ==================== COMPTE À REBOURS OFFICIEL 01 OCTOBRE 2026 ====================
window.TARGET_LAUNCH_TS = new Date('2026-10-01T00:00:00Z').getTime();

window.getCountdownData = function() {
  const now = Date.now();
  const diff = Math.max(0, window.TARGET_LAUNCH_TS - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return {
    diff,
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0')
  };
};

window.updateAllCountdowns = function() {
  const data = window.getCountdownData();
  document.querySelectorAll('.rci-cd-days').forEach(el => { el.textContent = data.days; });
  document.querySelectorAll('.rci-cd-hours').forEach(el => { el.textContent = data.hours; });
  document.querySelectorAll('.rci-cd-minutes').forEach(el => { el.textContent = data.minutes; });
  document.querySelectorAll('.rci-cd-seconds').forEach(el => { el.textContent = data.seconds; });
  
  const tickerText = `${data.days}j ${data.hours}h ${data.minutes}m ${data.seconds}s`;
  document.querySelectorAll('.rci-cd-ticker-text').forEach(el => { el.textContent = tickerText; });
};

// Démarrage de l'intervalle de décompte chaque seconde
setInterval(() => {
  if (typeof window.updateAllCountdowns === 'function') {
    window.updateAllCountdowns();
  }
}, 1000);

window.submitCountdownWaitlist = async function(btnEl) {
  const container = btnEl.closest('.rci-cd-cta-box') || document;
  const input = container.querySelector('.rci-cd-input');
  if (!input) return;
  
  let raw = input.value.replace(/\D/g, '');
  if (raw.startsWith('225') && raw.length > 10) raw = raw.slice(3);
  
  if (raw.length !== 10) {
    if (window.haptic) window.haptic([50, 50, 50]);
    if (window.toast) {
      window.toast("⚠️ Veuillez saisir votre numéro WhatsApp à 10 chiffres (ex: 0104911010)", "warn", 4000);
    } else {
      alert("Veuillez saisir votre numéro WhatsApp à 10 chiffres (ex: 0104911010)");
    }
    input.focus();
    return;
  }
  
  const oldText = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
  
  try {
    if (typeof window.joinWaitlist === 'function') {
      await window.joinWaitlist(raw, 'Compte à Rebours 01 Octobre');
    }
    if (window.haptic) window.haptic([100, 50, 100]);
    if (window.confetti) window.confetti();
    if (window.toast) {
      window.toast("🎉 Félicitations ! Tu es inscrit sur la liste VIP. Tu seras contacté le 01 Octobre à 00h00 pile !", "success", 6000);
    }
    container.innerHTML = `
      <div style="background: rgba(16, 185, 129, 0.2); border: 1.5px solid #10b981; border-radius: 12px; padding: 16px; text-align: center;">
        <div style="font-size: 24px; margin-bottom: 4px;">✅</div>
        <strong style="color: #6ee7b7; font-size: 15px;">Numéro VIP enregistré avec succès !</strong>
        <p style="margin: 6px 0 0; font-size: 12.5px; color: #e2e8f0; line-height: 1.5;">Tu recevras ton accès prioritaire le <strong>01 Octobre 2026 à 00h00</strong> sur le <strong>+225 ${raw}</strong>.</p>
      </div>
    `;
  } catch (err) {
    btnEl.disabled = false;
    btnEl.innerHTML = oldText;
    if (window.toast) window.toast("Une erreur est survenue, réessayez.", "error");
  }
};

window.renderPassReussiteBanner = function() {
  return '';
};

window.initStickyCountdownTicker = function() {
  const existing = document.getElementById('rciStickyCountdownTicker');
  if (existing) existing.remove();
};

window.openVipModal = function(titleContext = 'Pass Réussite') {
  if (typeof window.openElitePassModal === 'function') {
    window.openElitePassModal(titleContext);
  }
};

window.openPremiumTeaser = async function(featureName) {
  // Redirection directe vers les Pass Réussite
  if (!featureName || featureName.includes('01 Octobre') || featureName.includes('VIP') || featureName.includes('Compte à Rebours') || featureName.includes('Mise à jour')) {
    if (typeof window.openElitePassModal === 'function') {
      window.openElitePassModal('Pass Pro');
      return;
    }
  }

  // Si l'utilisateur clique directement sur l'IA, les annales, le simulateur ou le pass élite
  if (featureName === 'Professeur IA' || featureName === 'Anciens Sujets & Corrigés' || (featureName && featureName.includes('Simulateur')) || featureName === 'Pass Élite' || featureName === 'Élite' || featureName === 'elite') {
    if (typeof window.openElitePassModal === 'function') {
      window.openElitePassModal(featureName);
    } else if (typeof window.showActionNotice === 'function') {
      window.showActionNotice({
        type: 'vip',
        icon: '👑',
        title: 'Pass Élite en préparation',
        subtitle: 'Professeur IA & Examens Blancs',
        message: "Le Professeur IA 24/7, les Anciens Sujets & Corrigés et les Simulateurs d'Examens sont actuellement en cours de finalisation par nos professeurs partenaires.\n\n👉 Pour réviser dès maintenant sans limite, choisis le Pack Starter (500 FCFA/mois) ou le Pack Pro (1000 FCFA/mois) !",
        primaryBtnText: '👑 Découvrir les Pass Disponibles',
        primaryBtnAction: () => {
          openPremiumTeaser('Pass Réussite Pro');
        },
        secondaryBtnText: 'Continuer la lecture'
      });
    } else if (window.toast) {
      toast("🚧 Professeur IA & Examens bientôt disponibles. Découvre nos Pass Starter et Pro !", "info", 5000);
    }
    return;
  }

  // --- DEBLOCAGE PAR FORFAIT ---
  if (window.userHasFeature && window.userHasFeature(featureName)) {
    const fnCheck = String(featureName).toLowerCase();
    if (fnCheck.includes('audio') || fnCheck.includes('podcast')) {
      if (typeof window.executeTtsStart === 'function') window.executeTtsStart();
      return;
    }
    if (fnCheck.includes('pdf') || fnCheck.includes('téléchargement')) {
      if (window.CURRENT_FICHE) {
        if (typeof window.downloadCurrentFichePdf === 'function') {
          if (window.toast) toast('Génération de votre PDF...', 'info');
          window.downloadCurrentFichePdf();
          return;
        }
        if (window.toast) toast('Recharge la page pour activer le téléchargement PDF.', 'warn');
      } else {
        if (window.toast) toast("Veuillez ouvrir une fiche d'abord.", 'warn');
      }
      return;
    }
    if (fnCheck.includes('flashcard')) {
      if (typeof window.startFlashcards === 'function') window.startFlashcards();
      return;
    }
    if (fnCheck.includes('quiz')) {
      if (typeof window.startQuiz === 'function' && window.CURRENT_FICHE) {
        window.startQuiz(window.CURRENT_FICHE.cls, window.CURRENT_FICHE.sub, window.CURRENT_FICHE.file);
      }
      return;
    }
    if (fnCheck.includes('hors-ligne') || fnCheck.includes('hors ligne') || fnCheck.includes('sans connexion')) {
      const match = String(featureName).match(/\((.*?)\)/);
      const clsTarget = match && match[1] ? match[1].trim() : (window.CURRENT_FICHE?.cls || window.USER_PROFILE?.selectedClass || '');
      if (typeof window.downloadClassOffline === 'function') {
        window.downloadClassOffline(clsTarget);
        return;
      }
    }
    if (fnCheck.includes('stat')) {
      if (typeof window.openStatistiquesModal === 'function') {
        window.openStatistiquesModal();
        return;
      }
    }
    if (fnCheck.includes('recitation') || fnCheck.includes('récitation') || fnCheck.includes('recall')) {
      if (typeof window.toggleActiveRecall === 'function') {
        window.toggleActiveRecall();
        return;
      }
    }
    if (fnCheck.includes('surlign') || fnCheck.includes('highlighter')) {
      if (typeof window.toggleHighlighterMode === 'function') {
        window.toggleHighlighterMode();
        return;
      }
    }
    if (fnCheck.includes('note')) {
      if (typeof window.toggleFicheNotes === 'function') {
        window.toggleFicheNotes();
        return;
      }
    }
    if (fnCheck.includes('piege') || fnCheck.includes('piège') || fnCheck.includes('astuce')) {
      const trapsEl = document.getElementById('examTrapsCard');
      if (trapsEl) {
        trapsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    if (fnCheck.includes('plan') || fnCheck.includes('planning')) {
      if (typeof window.openActualPlanner === 'function') {
        window.openActualPlanner();
        return;
      }
    }
    if (window.toast) toast(`🔓 ${featureName} : Débloqué !`, 'success');
    return;
  }
  // -------------------------

  if (window.trackPremiumClick) window.trackPremiumClick(featureName);

  const plans = window.PREMIUM_PLANS || {
    starter: { name: 'Starter', price: 500, emoji: '🥉' },
    pro: { name: 'Pro', price: 1000, emoji: '🥈' },
    elite: { name: 'Élite', price: 2000, emoji: '🥇' }
  };

  const fnLower = String(featureName || '').toLowerCase();
  let featureTitle = 'Cette fonctionnalité';
  let featureIcon = '🔒';
  let featureDesc = 'Abonne-toi à un Pass Réussite pour débloquer cette option sans restriction.';
  let minTier = 'starter';
  let includedText = '';

  if (fnLower.includes('hors-ligne') || fnLower.includes('hors ligne') || fnLower.includes('sans connexion')) {
    featureTitle = 'Pack Révision Hors-Ligne (Sans Connexion)';
    featureIcon = '📱';
    minTier = 'starter';
    featureDesc = 'Télécharge toutes les fiches de cours directement sur ton téléphone pour réviser partout sans connexion Internet et sans forfait données mobiles.';
    includedText = 'Inclus dès le <strong>Pass Starter (500 FCFA / mois)</strong> et dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>.';
  } else if (fnLower.includes('pdf') || fnLower.includes('téléchargement')) {
    featureTitle = 'Téléchargement PDF Officiel';
    featureIcon = '📑';
    minTier = 'starter';
    featureDesc = 'Télécharge et imprime tes fiches officielles avec ton filigrane anti-fraude certifié pour réviser sur papier.';
    includedText = 'Inclus dès le <strong>Pass Starter (500 FCFA / mois)</strong> et dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>.';
  } else if (fnLower.includes('stat')) {
    featureTitle = 'Statistiques, Progression & Données en Cache';
    featureIcon = '📊';
    minTier = 'starter';
    featureDesc = 'Suis ta progression par matière, mesure ton assiduité avec ta flamme, analyse ton activité sur 7 jours et gère la mémoire en cache de ton téléphone.';
    includedText = 'Inclus dès le <strong>Pass Starter (500 FCFA / mois)</strong> et dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>.';
  } else if (fnLower.includes('surlign') || fnLower.includes('highlighter')) {
    featureTitle = 'Surlignage Multi-couleurs & Mode Tap';
    featureIcon = '🖍️';
    minTier = 'starter';
    featureDesc = 'Surligne tes cours en 4 couleurs (jaune, vert, bleu, rose) sur smartphone et ordinateur avec sauvegarde automatique pour retrouver tes passages clés à chaque révision.';
    includedText = 'Inclus dès le <strong>Pass Starter (500 FCFA / mois)</strong> et dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>.';
  } else if (fnLower.includes('note')) {
    featureTitle = 'Mes Notes Personnelles de Cours';
    featureIcon = '📝';
    minTier = 'starter';
    featureDesc = 'Note tes propres résumés, formules mnémotechniques et remarques du prof directement sous chaque fiche de cours, sauvegardés dans ton espace.';
    includedText = 'Inclus dès le <strong>Pass Starter (500 FCFA / mois)</strong> et dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>.';
  } else if (fnLower.includes('recitation') || fnLower.includes('récitation') || fnLower.includes('recall')) {
    featureTitle = 'Récitation Active (Active Recall)';
    featureIcon = '🧠';
    minTier = 'pro';
    featureDesc = 'Masque toute la leçon et entraîne-toi à la réciter bloc par bloc. Touche un paragraphe pour vérifier si tu as juste. La méthode n°1 pour mémoriser 3x plus vite avant un devoir !';
    includedText = 'Inclus dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>. Le Pass Starter à 500 F ne comprend pas la récitation active.';
  } else if (fnLower.includes('piege') || fnLower.includes('piège') || fnLower.includes('astuce')) {
    featureTitle = 'Pièges Fréquents d\'Examen & Astuces du Correcteur';
    featureIcon = '⚠️';
    minTier = 'pro';
    featureDesc = 'Ne perds plus de points bêtement ! Découvre les erreurs types commises par 80% des élèves aux examens du BAC/BEPC et les conseils directs des correcteurs officiels.';
    includedText = 'Inclus dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>. Le Pass Starter à 500 F ne comprend pas les pièges d\'examen.';
  } else if (fnLower.includes('audio') || fnLower.includes('podcast')) {
    featureTitle = 'Podcasts Audio (Lecture Vocale)';
    featureIcon = '🎧';
    minTier = 'pro';
    featureDesc = 'Écoute tes cours lus à voix haute avec réglage du rythme et mise en veille automatique.';
    includedText = 'Inclus dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>. Le Pass Starter à 500 F ne comprend pas les podcasts.';
  } else if (fnLower.includes('flashcard')) {
    featureTitle = 'Flashcards de Mémorisation Espacée';
    featureIcon = '🃏';
    minTier = 'pro';
    featureDesc = 'Mémorise rapidement les définitions et formules clés grâce à la méthode scientifique de répétition espacée.';
    includedText = 'Inclus dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>. Le Pass Starter à 500 F ne comprend pas les flashcards.';
  } else if (fnLower.includes('quiz')) {
    featureTitle = 'Quiz Interactifs Complets';
    featureIcon = '🎮';
    minTier = 'pro';
    featureDesc = 'Entraîne-toi avec des QCM et questions de révision pour valider tes connaissances avant chaque devoir.';
    includedText = 'Inclus dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>. Le Pass Starter à 500 F ne comprend pas les quiz.';
  } else if (fnLower.includes('plan') || fnLower.includes('planning')) {
    featureTitle = 'Planning d\'Examen & Programme Personnalisé';
    featureIcon = '📅';
    minTier = 'pro';
    featureDesc = 'Génère automatiquement un calendrier de révision sur mesure jour après jour jusqu\'à la date de ton examen avec rappels et répartition par matière.';
    includedText = 'Inclus dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>. Le Pass Starter à 500 F ne comprend pas le planning personnalisé.';
  } else {
    featureTitle = featureName || 'Fonctionnalité Premium';
    featureIcon = '👑';
    minTier = window.getMinPlanForFeature ? window.getMinPlanForFeature(featureName) : 'starter';
    includedText = minTier === 'starter'
      ? 'Inclus dès le <strong>Pass Starter (500 FCFA / mois)</strong> et dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>.'
      : 'Inclus dans le <strong>Pass Pro (1 000 FCFA / mois)</strong>.';
  }

  const renderPlanCard = (tierKey) => {
    const plan = plans[tierKey];

    // Le pack Élite est présenté dans son panneau de prestige
    if (tierKey === 'elite') {
      return `
        <div class="pricing-card" style="border: 2px dashed #a855f7; border-radius: 14px; padding: 15px; margin-bottom: 12px; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); position: relative; box-shadow: 0 4px 15px rgba(168, 85, 247, 0.12);">
          <div style="position: absolute; top: -10px; right: 10px; background: linear-gradient(135deg, #7c3aed, #9333ea); color: white; padding: 2px 10px; border-radius: 10px; font-size: 10px; font-weight: 800; letter-spacing: 0.4px;">🥇 FORMULE SUPRÊME</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="font-size: 16px; color: #581c87;">${plan.emoji} Pass ${plan.name}</strong>
            <span style="font-weight: 800; color: #7e22ce;">${plan.price} FCFA <span style="font-size:10px;font-weight:normal;color:#9333ea">/ mois</span></span>
          </div>
          <ul style="list-style: none; padding: 0; margin: 0 0 12px 0; font-size: 12px; color: #6b21a8; line-height: 1.6;">
            <li>✔️ <b>Tout le Pass Pro inclus +</b></li>
            <li>🤖 <b>Professeur IA Personnel 24h/24</b> (Questions illimitées)</li>
            <li>📜 <b>Annales & Sujets BAC/BEPC</b> avec corrigés types officiels</li>
            <li>⏱️ <b>Simulateurs d'Examens Blancs</b> en conditions réelles</li>
          </ul>
          <button onclick="if(typeof window.openElitePassModal==='function'){window.openElitePassModal('elite');}else if(typeof window.showActionNotice==='function'){window.showActionNotice({type:'vip',icon:'👑',title:'Pass Élite',subtitle:'Bientôt disponible',message:'Cette formule suprême sera activée très prochainement !'});}" class="btn-submit-waitlist" style="background: linear-gradient(135deg, #7c3aed, #9333ea); color: white; width: 100%; padding: 11px; font-size: 13px; font-weight: 800; border-radius: 10px; cursor: pointer; border: none; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);">
            👑 Découvrir les fonctionnalités Élite
          </button>
        </div>
      `;
    }

    const TIER_LEVELS = { starter: 1, pro: 2, elite: 3 };
    const activeSub = window.hasActiveSubscription ? window.hasActiveSubscription() : null;
    const currentLevel = activeSub ? (TIER_LEVELS[activeSub.tier] || 0) : 0;
    const targetLevel = TIER_LEVELS[tierKey] || 0;
    const isCurrentPlan = activeSub && activeSub.tier === tierKey;
    const isUpgrade = activeSub && (targetLevel > currentLevel);
    const isDowngrade = activeSub && (targetLevel < currentLevel);

    const isRecommended = !activeSub && (tierKey === minTier);
    const isLocked = !activeSub && (tierKey === 'starter' && minTier === 'pro');
    const isFullIncluded = !activeSub && (tierKey === 'pro' && minTier === 'starter');

    let cardBadge = '';
    let cardBorderColor = '#e2e8f0';
    let cardBg = '#fff';

    if (isCurrentPlan) {
      cardBadge = '<div style="position: absolute; top: -10px; right: 10px; background: #10b981; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">Ton Forfait Actuel</div>';
      cardBorderColor = '#10b981';
      cardBg = '#ecfdf5';
    } else if (isUpgrade) {
      cardBadge = '<div style="position: absolute; top: -10px; right: 10px; background: linear-gradient(135deg, #c026d3, #9333ea); color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">🚀 Évolution Conseillée</div>';
      cardBorderColor = '#c026d3';
      cardBg = '#fdf4ff';
    } else if (isRecommended) {
      cardBadge = '<div style="position: absolute; top: -10px; right: 10px; background: #10b981; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">✨ Débloque cette option</div>';
      cardBorderColor = '#10b981';
      cardBg = '#ecfdf5';
    } else if (isFullIncluded) {
      cardBadge = '<div style="position: absolute; top: -10px; right: 10px; background: #2563eb; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">🌟 Formule Complète</div>';
      cardBorderColor = '#93c5fd';
      cardBg = '#eff6ff';
    } else if (isLocked) {
      cardBadge = '<div style="position: absolute; top: -10px; right: 10px; background: #94a3b8; color: white; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold;">⚠️ Non inclus dans Starter</div>';
      cardBorderColor = '#e2e8f0';
      cardBg = '#f8fafc';
    }

    return `
      <div class="pricing-card" style="border: 2px solid ${cardBorderColor}; border-radius: 12px; padding: 15px; margin-bottom: 12px; background: ${cardBg}; position: relative;">
        ${cardBadge}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="font-size: 16px;">${plan.emoji} Pass ${plan.name}</strong>
          <span style="font-weight: bold; color: #1e293b;">${plan.price} FCFA <span style="font-size:10px;font-weight:normal;color:#64748b">/ mois</span></span>
        </div>
        <ul style="list-style: none; padding: 0; margin: 0 0 12px 0; font-size: 12px; color: #475569; line-height: 1.6;">
          ${tierKey === 'starter' ? `
            <li>✔️ <b>Pack Hors-Ligne</b> complet dans l'App (sans connexion)</li>
            <li>✔️ <b>Téléchargement PDF</b> officiel (3 fiches / mois)</li>
            <li>✔️ <b>Statistiques</b> de révision & flamme streak</li>
            <li>🖍️ <b>Surligneur multi-couleurs</b> & Mode Tap</li>
            <li>📝 <b>Mes Notes Personnelles</b> sur chaque fiche</li>
          ` : ''}
          ${tierKey === 'pro' ? `
            <li>✔️ <b>Tout le Pass Starter inclus +</b></li>
            <li>🧠 <b>Récitation Active</b> (Floutage intelligent de cours)</li>
            <li>⚠️ <b>Pièges d'Examen & Astuces</b> du correcteur</li>
            <li>🎧 <b>Podcasts Audio</b> (Lecture vocale illimitée)</li>
            <li>🃏 <b>Flashcards</b> (Mémorisation espacée) & <b>Quiz</b></li>
            <li>📅 <b>Plan de Révision Intelligent</b></li>
          ` : ''}
        </ul>
        ${isCurrentPlan ? `
          <button onclick="window.showActiveSubscriptionModal()" class="btn-submit-waitlist" style="background: #10b981; color: white; width: 100%; padding: 10px; font-size: 13px; font-weight: 800; border-radius: 10px; cursor: pointer; border: none; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
            <i class="fas fa-check-circle"></i> Ton forfait actif (Gérer / Résilier)
          </button>
        ` : (isUpgrade ? `
          <button onclick="initiatePremiumPayment(this, '${tierKey}')" class="btn-submit-waitlist" style="background: linear-gradient(135deg, #c026d3, #9333ea); color: white; width: 100%; padding: 11px; font-size: 13px; font-weight: 800; border-radius: 10px; cursor: pointer; border: none; box-shadow: 0 4px 14px rgba(192, 38, 211, 0.4);">
            <i class="fas fa-bolt" style="color:#fde047;"></i> Passer au Pass ${plan.name} (${plan.price} F / mois)
          </button>
        ` : (isDowngrade ? `
          <button onclick="window.showActiveSubscriptionModal()" class="btn-submit-waitlist" style="background: #94a3b8; color: white; width: 100%; padding: 10px; font-size: 12px; border-radius: 10px; cursor: pointer; border: none;">
            ✔️ Inclus dans ton Pass ${activeSub.tier.toUpperCase()}
          </button>
        ` : `
          <button onclick="initiatePremiumPayment(this, '${tierKey}')" class="btn-submit-waitlist" style="background: ${isLocked ? '#94a3b8' : (isRecommended ? 'linear-gradient(135deg, #10b981, #059669)' : (isFullIncluded ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#3b82f6'))}; width: 100%; padding: 11px; font-size: 13px; font-weight: 800; border-radius: 10px; border: none; color: white; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; box-shadow: ${isLocked ? 'none' : '0 4px 12px rgba(0,0,0,0.12)'};" ${isLocked ? 'disabled title="Ce forfait ne débloque pas cette fonctionnalité"' : ''}>
            ${isLocked ? '<i class="fas fa-lock"></i> Requiert le Pass Pro (1 000 F)' : (isRecommended ? `<i class="fas fa-bolt" style="color:#fef08a"></i> Choisir ${plan.name} (${plan.price} F / mois)` : `<i class="fas fa-crown" style="color:#fde047"></i> Choisir ${plan.name} (${plan.price} F / mois)`)}
          </button>
        `))}
      </div>
    `;
  };

  const html = `
    <div class="teaser-container" style="text-align: left; padding: 4px 0;">
      <!-- Hero Bannière d'Explication de la Fonctionnalité Cliquée -->
      <div class="teaser-feature-header" style="background: ${minTier === 'starter' ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'}; border: 1.5px solid ${minTier === 'starter' ? '#10b981' : '#3b82f6'}; border-radius: 14px; padding: 13px 15px; margin-bottom: 14px; text-align: left; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="font-size: 26px; line-height: 1; flex-shrink: 0; background: #ffffff; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">${featureIcon}</div>
          <div style="flex: 1;">
            <div style="font-size: 10.5px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: ${minTier === 'starter' ? '#047857' : '#1d4ed8'}; margin-bottom: 2px;">
              🔒 FONCTIONNALITÉ AVEC CADENAS
            </div>
            <h4 style="margin: 0 0 3px 0; font-size: 15px; font-weight: 800; color: #0f172a;">${featureTitle}</h4>
            <div style="font-size: 12px; font-weight: 700; color: ${minTier === 'starter' ? '#065f46' : '#1e40af'}; margin-bottom: 4px;">
              👉 ${includedText}
            </div>
            <div style="font-size: 11.5px; color: #475569; line-height: 1.4;">${featureDesc}</div>
          </div>
        </div>
      </div>
      
      <p style="font-size:12.5px;color:#475569;margin:0 0 14px;text-align:center;font-weight:600;">
        Choisis ton abonnement mensuel renouvelable sans engagement :
      </p>

      <div class="pricing-tiers">
        ${renderPlanCard('starter')}
        ${renderPlanCard('pro')}
        ${renderPlanCard('elite')}
      </div>

      <div class="teaser-guarantee" style="text-align: center; margin-top: 14px; font-size: 12px; color: #64748b; line-height: 1.6;">
        <div style="font-weight: 700; color: #1e293b;">🔒 Paiement sécurisé via GeniusPay (Wave, Orange, MTN, Moov)</div>
        <div style="margin-top: 6px; font-size: 11px; color: #475569;">
          💬 Tu préfères régler directement par Wave ou Orange Money ? <a href="https://wa.me/2250150252467?text=Bonjour%20Haniel_dev,%20je%20souhaite%20r%C3%A9gler%20mon%20Pass%20par%20Wave%20ou%20Orange%20Money%20direct." target="_blank" rel="noopener" style="color: #2563eb; font-weight: 800; text-decoration: underline;">Assistance WhatsApp directe</a>
        </div>
      </div>
    </div>
  `;

  if (typeof window.openModal === 'function') {
    window.openModal('👑 Débloquer mon Pass Réussite', html, 'premiumModal');
  } else if (typeof openModal === 'function') {
    openModal('👑 Débloquer mon Pass Réussite', html, 'premiumModal');
  } else if (typeof window.showActionNotice === 'function') {
    window.showActionNotice({
      type: 'vip',
      icon: '👑',
      title: 'Pass Réussite',
      subtitle: 'Bientôt disponible',
      message: 'Le Pass Réussite sera activable directement depuis l\'application très prochainement.',
      primaryBtnText: 'Compris'
    });
  } else if (window.toast) {
    toast("Pass Réussite disponible très bientôt !", "info");
  }
};

window.submitWaitlist = async function(featureName) {
  const input = document.getElementById('waitlistContact');
  const btn = document.getElementById('waitlistBtn');
  const wrapper = document.getElementById('phoneWrapper');
  const errBox = document.getElementById('phoneErrorFeedback');
  const errMsg = document.getElementById('phoneErrorText');
  
  if (!input || !btn) return;
  
  let raw = input.value.replace(/\D/g, '');
  if (raw.startsWith('225') && raw.length > 10) {
    raw = raw.slice(3);
  }
  
  // Validation stricte : exactement 10 chiffres !
  if (raw.length !== 10) {
    if (wrapper) {
      wrapper.classList.remove('shake');
      void wrapper.offsetWidth; // Trigger reflow for animation restart
      wrapper.classList.add('is-invalid', 'shake');
    }
    
    let msg = "";
    if (raw.length === 0) {
      msg = "⚠️ Veuillez entrer votre numéro WhatsApp.";
    } else if (raw.length < 10) {
      msg = `⚠️ Numéro incomplet (${raw.length}/10 chiffres). Les numéros en Côte d'Ivoire comportent exactement 10 chiffres (ex: 07 12 34 56 78).`;
    } else {
      msg = `⚠️ Numéro trop long (${raw.length}/10 chiffres). Veuillez vérifier et ne saisir que 10 chiffres.`;
    }
    
    if (errMsg) errMsg.textContent = msg;
    if (errBox) errBox.classList.add('show');
    input.focus();
    if (window.navigator && window.navigator.vibrate) {
      try { window.navigator.vibrate([60, 40, 60]); } catch(e){}
    }
    return;
  }
  
  // Valide : feedback immédiat ultra-réactif
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Inscription en cours...`;
  
  const fullContact = "+225 " + raw;
  
  try {
    if (window.trackPremiumClick) window.trackPremiumClick('Waitlist_Submit_' + (featureName || 'General'));
    if (window.joinWaitlist) {
      await window.joinWaitlist(fullContact, featureName);
    }
  } catch(err) {
    console.warn("Waitlist join catch:", err);
  }
  
  // Affichage du succès sans attente
  const formEl = document.getElementById('waitlistFormArea');
  if (formEl) formEl.style.display = 'none';
  
  const successEl = document.getElementById('waitlistSuccess');
  if (successEl) {
    successEl.innerHTML = `
      <div style="background:#ecfdf5;border:2px solid #10b981;border-radius:14px;padding:22px 18px;text-align:center;margin-top:14px;animation:toast-in .3s ease">
        <div style="font-size:48px;margin-bottom:8px">🎉</div>
        <h4 style="color:#065f46;font-size:18px;font-weight:800;margin:0 0 6px">Inscription Réussie !</h4>
        <p style="color:#047857;font-size:13.5px;line-height:1.5;margin:0">
          Félicitations ! Tu es désormais sur la <strong>liste VIP prioritaire</strong> du Pass Réussite.<br><br>
          📱 Tu recevras une alerte WhatsApp exclusive au <strong>${fullContact}</strong> pour profiter de ton <strong>accès VIP privilégié</strong> dès le lancement !
        </p>
      </div>
    `;
    successEl.style.display = 'block';
  }
  
  if (typeof toast === 'function') {
    toast("🎉 Inscription au Pass Réussite confirmée !", "success", 5000);
  }
  
  setTimeout(() => {
    const modal = document.getElementById('premiumModal');
    if (modal) modal.classList.remove('show');
  }, 4000);
};

/* ==================== 1 A, 1 B, 1 C: NOUVELLES FONCTIONNALITÉS PREMIUM DE RÉVISION ==================== */

// Base de connaissances des Pièges Fréquents d'Examen (BEPC & BAC Côte d'Ivoire)
const EXAM_TRAPS_DATA = {
  'Mathematiques': {
    general: [
      { text: "<strong>Oubli du domaine de validité :</strong> Écris toujours l'ensemble de définition Df avant de simplifier, dériver ou résoudre une équation (dénominateur non nul, expression sous la racine positive, x > 0 pour ln).", icon: "fa-ban" },
      { text: "<strong>Confusion Dérivée vs Primitive :</strong> N'oublie jamais d'ajouter la constante <em>+ C (C ∈ ℝ)</em> lors du calcul d'une primitive indéfinie.", icon: "fa-rotate-left" },
      { text: "<strong>Développement et signes :</strong> Une erreur classique sur le signe '-' devant une parenthèse ou lors du produit remarquable (a - b)² = a² - 2ab + b² (et non - b²).", icon: "fa-calculator" }
    ],
    specific: {
      'limite': "<strong>Formes Indéterminées :</strong> En cas de 0/0 ou ∞/∞, ne conclus jamais directement. Factorise par le terme prépondérant ou utilise le nombre dérivé.",
      'derive': "<strong>Dérivée composée :</strong> N'oublie pas de multiplier par u'(x) dans la dérivée de (u^n)' = n·u'·u^(n-1) et (e^u)' = u'·e^u.",
      'probabilite': "<strong>Équiprobabilité :</strong> Vérifie toujours si les tirages sont successifs sans remise (arrangements), simultanés (combinaisons) ou avec remise (p-listes).",
      'complexe': "<strong>Module et Argument :</strong> Ne confonds pas |z| = √(a² + b²) avec a² + b². Fais attention au quadrant pour trouver le bon argument θ.",
      'suite': "<strong>Premier terme :</strong> Vérifie attentivement si la suite commence à n=0 ou n=1 dans la formule de la somme des termes.",
      'integrale': "<strong>Intégration par parties :</strong> Formule ∫u·v' = [u·v] - ∫u'·v. Choisis judicieusement la fonction à dériver (règle ALPES)."
    },
    tip: "Les correcteurs du BAC et BEPC accordent souvent la moitié des points à la démarche et à la justification de la méthode, même si le calcul final comporte une étourderie. Rédige toujours avec rigueur !"
  },
  'Physique - Chimie': {
    general: [
      { text: "<strong>Unités non converties :</strong> Le piège n°1 ! Convertis toujours tes grandeurs dans le Système International : volumes en Litres (L) ou m³, masses en kilogrammes (kg), distances en mètres (m).", icon: "fa-scale-balanced" },
      { text: "<strong>Réactif limitant :</strong> N'oublie jamais de diviser les quantités de matière initiales par les coefficients stœchiométriques respectifs pour identifier le réactif limitant.", icon: "fa-flask-vial" },
      { text: "<strong>Chiffres significatifs :</strong> N'arrondis pas exagérément les résultats intermédiaires et exprime le résultat final avec le même nombre de chiffres significatifs que la donnée la moins précise.", icon: "fa-chart-pie" }
    ],
    specific: {
      'acide': "<strong>Dosage acido-basique :</strong> À l'équivalence, la relation n_A = n_B n'est vraie que pour des coefficients 1:1. Pour un polyacide, n_A / a = n_B / b.",
      'mouvement': "<strong>2ème Loi de Newton :</strong> Précise impérativement le Système, le Référentiel (Galiléen) et le bilan complet des forces extérieures avant d'écrire ∑F_ext = m·a.",
      'champ': "<strong>Signe de la projection :</strong> Fais attention à l'orientation de l'axe vertical (Oz) : le poids s'exprime P_z = -m·g si l'axe est orienté vers le haut !",
      'induction': "<strong>Loi de Lenz :</strong> Le courant induit crée un champ qui s'oppose à la cause qui lui donne naissance. Justifie toujours clairement son sens.",
      'chimie': "<strong>Formules brutes et semi-développées :</strong> Vérifie que chaque atome de carbone respecte sa tétravalence (exactement 4 liaisons)."
    },
    tip: "Au BAC et au BEPC, une réponse chiffrée sans unité est systématiquement sanctionnée par 0 point pour la question. Note toujours l'unité !"
  },
  'SVT': {
    general: [
      { text: "<strong>Confondre Décrire et Expliquer :</strong> « Décrire » consiste à relever les variations observables sur un graphe (« la quantité passe de 2 à 8 »). « Expliquer » exige de donner les causes et mécanismes biologiques.", icon: "fa-microscope" },
      { text: "<strong>Schémas non conformes :</strong> Tout schéma de SVT doit comporter obligatoirement : un Titre souligné, une Échelle/Orientation, et des Flèches tracées à la règle pointant précisément l'élément.", icon: "fa-pen-ruler" },
      { text: "<strong>Vocabulaire scientifique rigoureux :</strong> Ne remplace jamais un terme technique par une expression vague (ex: écris « antigène » et non « microbe », « leucocyte » et non « globule blanc »).", icon: "fa-dna" }
    ],
    specific: {
      'meiose': "<strong>Mitose vs Méiose :</strong> La mitose produit 2 cellules identiques (2n → 2n). La méiose produit 4 gamètes génétiquement différents (2n → n) grâce aux brassages inter et intrachromosomiques.",
      'nerveux': "<strong>Message nerveux :</strong> Le potentiel d'action obéit à la loi du « tout ou rien » au niveau d'une fibre isolée, mais le potentiel global du nerf dépend du recrutement des fibres.",
      'immun': "<strong>Anticorps vs Lymphocytes :</strong> Les anticorps sont des protéines (molécules solubles), alors que les lymphocytes B et T sont des cellules vivantes.",
      'genetique': "<strong>Caractères héréditaires :</strong> Précise toujours si les allèles sont portés par un autosome ou un gonosome (chromosome sexuel X ou Y)."
    },
    tip: "Structure toujours ton exploitation de document selon la méthode MENA : 1. Constat/Analyse (« Je vois que... ») 2. Déduction/Interprétation (« J'en déduis que... ») 3. Conclusion."
  },
  'Francais': {
    general: [
      { text: "<strong>Situation d'évaluation APC :</strong> Réponds impérativement à chacune des 3 consignes de la situation d'évaluation. Chaque consigne correspond à un tiers des points de l'épreuve.", icon: "fa-feather" },
      { text: "<strong>Citations textuelles :</strong> Toute affirmation dans le commentaire doit être appuyée par une citation entre guillemets extraite du texte avec le numéro de ligne.", icon: "fa-quote-left" },
      { text: "<strong>Transitions négligées :</strong> Ne passe jamais d'une partie à une autre sans phrase de bilan et de transition pour assurer la fluidité de ton argumentation.", icon: "fa-arrows-split-up-and-left" }
    ],
    specific: {
      'dissertation': "<strong>Introduction en 3 temps :</strong> Amorce / Définition, Problématique clairement formulée, et Annonce du plan. Ne commence jamais directement par la thèse.",
      'commentaire': "<strong>Figures de style :</strong> Identifier une métaphore ne suffit pas. Tu dois obligatoirement analyser l'effet produit sur le lecteur et le sens qu'elle apporte au texte.",
      'resume': "<strong>Contraction de texte :</strong> Ne copie aucune phrase du texte original et respecte scrupuleusement la marge de ±10% du nombre de mots exigé."
    },
    tip: "Soigne ton écriture et la ponctuation : 5 fautes d'orthographe ou d'accord peuvent te faire perdre jusqu'à 2 points précieux sur la copie."
  },
  'Histoire - Geographie': {
    general: [
      { text: "<strong>Anachronismes et confusion des dates :</strong> Ne confonds pas les dates charnières (1947, 1960 pour les indépendances africaines, 1989/1991 pour la chute du bloc soviétique).", icon: "fa-landmark" },
      { text: "<strong>Commentaire de document :</strong> Présente toujours le document selon les 5 règles d'or : Nature, Auteur, Date, Contexte historique et Thème central.", icon: "fa-file-lines" },
      { text: "<strong>Croquis de géographie :</strong> Un croquis sans Titre, sans Orientation (flèche du Nord), sans Nomenclature et sans Légende ordonnée ne peut pas obtenir la moyenne.", icon: "fa-map-location-dot" }
    ],
    specific: {
      'bipolarisation': "<strong>Guerre Froide :</strong> Ne confonds pas le Plan Marshall (économique), l'OTAN (militaire) et la Doctrine Truman (politique d'endiguement).",
      'independance': "<strong>Décolonisation :</strong> Distingue clairement les décolonisations pacifiques (Loi-cadre Defferre, Communauté de 1958) et les décolonisations violentes (Guerre d'Algérie, Indochine).",
      'cote d\'ivoire': "<strong>Économie ivoirienne :</strong> Cite des atouts et des vulnérabilités réels (dépendance aux cours des matières premières agricoles, industrialisation en cours)."
    },
    tip: "En Histoire-Géo, n'écris jamais de phrases vagues comme « l'Afrique est un pays » ou « l'économie est bonne ». Utilise des termes précis, des dates et des chiffres clés."
  },
  'Philosophie': {
    general: [
      { text: "<strong>Le piège du relativisme :</strong> Évite impérativement les formules comme « chacun a son avis » ou « la vérité dépend de chacun ». La philosophie exige une recherche rationnelle et universelle.", icon: "fa-brain" },
      { text: "<strong>Le catalogue d'auteurs sans réflexion :</strong> Ne juxtapose pas des citations d'auteurs apprises par cœur. Chaque référence doit servir à répondre à la question posée.", icon: "fa-book-open" },
      { text: "<strong>Définition des concepts :</strong> Définis systématiquement les termes clés du sujet dès l'introduction (ex: liberté, devoir, technique, inconscient, justice).", icon: "fa-spell-check" }
    ],
    specific: {
      'dissertation': "<strong>Problématisation :</strong> Montre pourquoi la question pose problème en dégageant le paradoxe ou la contradiction sous-jacente.",
      'commentaire': "<strong>Paraphrase interdite :</strong> Ne répète pas le texte avec d'autres mots. Explique la thèse de l'auteur, sa démarche argumentative et ses enjeux philosophiques."
    },
    tip: "L'introduction représente 30% de la première impression du correcteur. Soigne particulièrement la formulation de la problématique et le questionnement !"
  },
  'Anglais': {
    general: [
      { text: "<strong>Accord à la 3ème personne :</strong> N'oublie jamais le '-s' final au Présent Simple pour He / She / It (« He works », « She explains »).", icon: "fa-language" },
      { text: "<strong>Confusion Prétérit vs Present Perfect :</strong> Utilise le Prétérit pour une action datée et terminée dans le passé (yesterday, in 2020), et le Present Perfect pour une action liée au présent (already, never, yet).", icon: "fa-clock" },
      { text: "<strong>Faux-amis fréquents :</strong> Attention : « actually » = en fait / en réalité (et non actuellement), « library » = bibliothèque (et non librairie), « pretend » = faire semblant (et non prétendre).", icon: "fa-triangle-exclamation" }
    ],
    tip: "En expression écrite d'anglais au BAC/BEPC, structure tes paragraphes avec des connecteurs logiques : Firstly, Furthermore, In addition, However, To conclude."
  }
};

// 1 C : Générateur HTML des Pièges Fréquents d'Examen
window.getExamTrapsHtml = function(cls, sub, file) {
  const normSub = (sub || '').trim();
  let subjectData = EXAM_TRAPS_DATA[normSub];
  
  if (!subjectData) {
    // Recherche par mot clé dans la matière
    for (let s in EXAM_TRAPS_DATA) {
      if (normSub.toLowerCase().includes(s.toLowerCase().substring(0, 5))) {
        subjectData = EXAM_TRAPS_DATA[s];
        break;
      }
    }
  }
  
  if (!subjectData) {
    subjectData = {
      general: [
        { text: "<strong>Rigueur de la méthode :</strong> Lis l'intégralité du sujet avant de commencer pour bien gérer ton temps et éviter le hors-sujet.", icon: "fa-clock" },
        { text: "<strong>Justification systématique :</strong> En examen, toute affirmation sans justification ou sans référence au cours perd la moitié de ses points.", icon: "fa-circle-check" },
        { text: "<strong>Relecture finale :</strong> Consacre impérativement les 10 dernières minutes à vérifier l'orthographe, les calculs et la numérotation des questions.", icon: "fa-check-double" }
      ],
      tip: "Présente ta copie avec propreté : saute des lignes entre les exercices et souligne les résultats finaux à la règle pour faciliter le travail du correcteur."
    };
  }

  // Sélection des pièges généraux + éventuel piège spécifique au nom du fichier
  const traps = [...subjectData.general];
  const fileLower = (file || '').toLowerCase();
  
  if (subjectData.specific) {
    for (let key in subjectData.specific) {
      if (fileLower.includes(key)) {
        traps.unshift({
          text: subjectData.specific[key],
          icon: "fa-bullseye"
        });
        break;
      }
    }
  }

  const itemsHtml = traps.slice(0, 3).map(t => `
    <li class="exam-trap-item">
      <i class="fas ${t.icon || 'fa-triangle-exclamation'} exam-trap-icon"></i>
      <div>${t.text}</div>
    </li>
  `).join('');

  const tipHtml = subjectData.tip ? `
    <div class="exam-traps-tip">
      <i class="fas fa-lightbulb exam-traps-tip-icon"></i>
      <div><strong>Astuce du correcteur officiel :</strong> ${subjectData.tip}</div>
    </div>
  ` : '';

  const examTag = (cls && (cls.toLowerCase().includes('terminale') || cls.toLowerCase().includes('premiere'))) ? 'Épreuve BAC CI' : 'Épreuve BEPC & Devoirs';

  const hasTraps = window.userHasFeature ? window.userHasFeature('Pièges d\'Examen') : false;
  if (!hasTraps) {
    return `
      <div class="exam-traps-card exam-traps-locked" id="examTrapsCard" onclick="openPremiumTeaser('Pièges Fréquents d\'Examen & Astuces')">
        <div class="exam-traps-badge-row">
          <span class="exam-traps-pill" style="background:#dc2626;"><i class="fas fa-lock"></i> Exclusivité Pass Pro</span>
          <span class="exam-traps-tag">${examTag}</span>
        </div>
        <h4 class="exam-traps-title">⚠️ Les erreurs qui coûtent cher le jour J 🔒</h4>
        <div class="exam-traps-intro">Découvre les <strong>3 erreurs éliminatoires</strong> les plus fréquentes et l'<strong>astuce officielle du correcteur</strong> sur ce chapitre pour ne plus perdre de points bêtement.</div>
        <div class="exam-traps-blur-preview">
          <div class="exam-traps-blur-overlay">
            <button class="exam-traps-unlock-btn" onclick="event.stopPropagation();openPremiumTeaser('Pièges Fréquents d\'Examen & Astuces')">
              <i class="fas fa-lock"></i> Débloquer les Pièges & Astuces (Pass Pro 1 000 F)
            </button>
          </div>
          <ul class="exam-traps-list" style="filter:blur(5px);pointer-events:none;user-select:none;opacity:0.4;">
            ${itemsHtml}
          </ul>
        </div>
      </div>
    `;
  }

  return `
    <div class="exam-traps-card" id="examTrapsCard">
      <div class="exam-traps-badge-row">
        <span class="exam-traps-pill"><i class="fas fa-triangle-exclamation"></i> Pièges Fréquents d'Examen</span>
        <span class="exam-traps-tag">${examTag}</span>
      </div>
      <h4 class="exam-traps-title">⚠️ Les erreurs qui coûtent cher le jour J</h4>
      <div class="exam-traps-intro">Voici ce que <strong>80% des élèves ratent ou négligent</strong> sur ce chapitre lors des compositions et examens nationaux :</div>
      <ul class="exam-traps-list">
        ${itemsHtml}
      </ul>
      ${tipHtml}
    </div>
  `;
};

// 1 A & 1 B : Barre d'Outils d'Étude sous la fiche
window.getFicheStudyBarHtml = function(cls, sub, file) {
  const hasRecall = window.userHasFeature ? window.userHasFeature('Récitation Active') : false;
  const hasHl = window.userHasFeature ? window.userHasFeature('Surligneur de Fiche') : false;
  const hasNotes = window.userHasFeature ? window.userHasFeature('Mes Notes Personnelles') : false;

  const recallBtn = hasRecall
    ? `<button id="btnStudyRecall" class="study-btn" onclick="toggleActiveRecall()" title="Masquer les formules et définitions pour tester ta mémoire">
        <i class="fas fa-eye-slash"></i> <span>Récitation Active</span>
      </button>`
    : `<button id="btnStudyRecall" class="study-btn locked" onclick="openPremiumTeaser('Récitation Active (Active Recall)')" title="Récitation Active (Inclus dans le Pass Pro 1 000 F)">
        <i class="fas fa-lock" style="color:#d97706"></i> <span>Récitation Active 🔒</span>
      </button>`;

  const hlBtn = hasHl
    ? `<button id="btnStudyHl" class="study-btn" onclick="toggleHighlighterMode()" title="Surligner les passages clés de cette leçon">
        <i class="fas fa-highlighter"></i> <span>Surligner</span>
      </button>`
    : `<button id="btnStudyHl" class="study-btn locked" onclick="openPremiumTeaser('Surligneur de Fiche')" title="Surligneur (Inclus dès le Pass Starter 500 F)">
        <i class="fas fa-lock" style="color:#059669"></i> <span>Surligner 🔒</span>
      </button>`;

  const notesBtn = hasNotes
    ? `<button id="btnStudyNotes" class="study-btn" onclick="toggleFicheNotes()" title="Prendre des notes personnelles sur cette fiche">
        <i class="fas fa-pen-to-square"></i> <span>Mes Notes</span>
        <span id="ficheNotesBadge" class="study-badge-count" style="display:none">1</span>
      </button>`
    : `<button id="btnStudyNotes" class="study-btn locked" onclick="openPremiumTeaser('Mes Notes Personnelles')" title="Mes Notes (Inclus dès le Pass Starter 500 F)">
        <i class="fas fa-lock" style="color:#2563eb"></i> <span>Mes Notes 🔒</span>
      </button>`;

  return `
    <div class="fiche-study-bar" id="ficheStudyBar">
      <div class="study-bar-title"><i class="fas fa-graduation-cap"></i> Mode Révision :</div>
      ${recallBtn}
      ${hlBtn}
      ${notesBtn}
    </div>
  `;
};

// Initialisation globale après affichage de la fiche
window.initFicheStudyFeatures = function(cls, sub, file) {
  window.__currentFicheKey = `${cls}__${sub}__${file}`;
  window.__activeRecallOn = false;
  window.__highlighterMode = false;
  window.__currentHlColor = 'yellow';

  // Mise à jour du badge des notes si une note existe
  const savedNote = localStorage.getItem('rci_note_' + window.__currentFicheKey);
  const badgeEl = document.getElementById('ficheNotesBadge');
  if (badgeEl) {
    if (savedNote && savedNote.trim().length > 0) {
      badgeEl.style.display = 'inline-block';
      badgeEl.textContent = '1';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  // Restauration des surlignages sauvegardés
  restoreFicheHighlights(cls, sub, file);

  // Écouteur pour surligner au tap ou sélection de texte
  initHighlighterEventListeners();

  // Écouteur pour dévoiler temporairement une section touchée en Mode Récitation
  initRecallBlockTapListener();
};

/* ==================== 1 A: IMPLÉMENTATION RÉCITATION ACTIVE (TOUTE LA LEÇON) ==================== */
window.toggleActiveRecall = function() {
  const hasRecall = window.userHasFeature ? window.userHasFeature('Récitation Active') : false;
  if (!hasRecall) {
    if (typeof window.openPremiumTeaser === 'function') {
      window.openPremiumTeaser('Récitation Active (Active Recall)');
    }
    return;
  }

  window.__activeRecallOn = !window.__activeRecallOn;
  const btn = document.getElementById('btnStudyRecall');
  const ficheEl = document.querySelector('.fiche-content');
  if (!ficheEl) return;

  if (window.haptic) window.haptic(25);

  if (window.__activeRecallOn) {
    if (btn) {
      btn.classList.add('active', 'recall-active');
      btn.innerHTML = `<i class="fas fa-eye"></i> <span>Révéler la Leçon</span>`;
      btn.title = "Appuie pour révéler toute la leçon";
    }

    // Flouter l'intégralité du cours
    ficheEl.classList.add('active-recall-all-blur');

    // Afficher bannière flottante de contrôle
    let banner = document.getElementById('recallFloatingBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'recallFloatingBanner';
      banner.className = 'recall-floating-banner';
      ficheEl.parentNode.insertBefore(banner, ficheEl);
    }
    banner.innerHTML = `
      <div class="recall-banner-text">
        <i class="fas fa-brain" style="font-size:18px;color:#d97706"></i>
        <span><strong>Toute la leçon est masquée !</strong> Récite de mémoire. Touche un paragraphe pour vérifier un détail ou appuie ci-contre pour tout révéler.</span>
      </div>
      <div class="recall-banner-actions">
        <button class="recall-banner-btn" onclick="toggleActiveRecall()" style="background:#10b981;color:#fff;border-color:transparent;font-weight:800;padding:6px 12px;font-size:12px">
          <i class="fas fa-eye"></i> Révéler toute la leçon
        </button>
      </div>
    `;
    banner.style.display = 'flex';

    if (window.toast) window.toast("🧠 Récitation Active : toute la leçon est masquée. Récite sans regarder !", "info", 3500);
  } else {
    if (btn) {
      btn.classList.remove('active', 'recall-active');
      btn.innerHTML = `<i class="fas fa-eye-slash"></i> <span>Récitation Active</span>`;
      btn.title = "Masquer toute la leçon pour tester ta mémoire";
    }
    
    // Retirer le flou sur toute la leçon
    ficheEl.classList.remove('active-recall-all-blur');
    ficheEl.querySelectorAll('*').forEach(el => {
      el.classList.remove('recall-block-revealed');
      el.style.removeProperty('filter');
      el.style.removeProperty('opacity');
    });

    const banner = document.getElementById('recallFloatingBanner');
    if (banner) banner.remove();

    if (window.toast) window.toast("✨ Leçon révélée ! Vérifie ce que tu as récité.", "success", 2500);
  }
};

function initRecallBlockTapListener() {
  const ficheEl = document.querySelector('.fiche-content');
  if (!ficheEl || ficheEl.__recallListening) return;
  ficheEl.__recallListening = true;

  let touchMoved = false;
  ficheEl.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
  ficheEl.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });

  const handleTap = (e) => {
    if (!window.__activeRecallOn) return;
    if (touchMoved) return;
    
    // Remonter pour trouver le premier élément enfant direct de .fiche-content
    let block = e.target;
    while (block && block.parentNode && block.parentNode !== ficheEl) {
      block = block.parentNode;
    }
    
    if (block && block.parentNode === ficheEl) {
      // Ignorer les éléments utilitaires hors cours
      if (block.closest('.exam-traps-card, .fiche-study-bar, #recallFloatingBanner, #highlighterBar, .fiche-notes-box, .fiche-actions, .resume-ci-whatsapp-qr') ||
          block.classList.contains('exam-traps-card') ||
          block.classList.contains('fiche-study-bar') ||
          block.id === 'recallFloatingBanner' ||
          block.id === 'highlighterBar' ||
          block.id === 'ficheNotesBox') {
        return;
      }
      
      e.stopPropagation();
      e.preventDefault();
      
      const isRevealed = block.classList.toggle('recall-block-revealed');
      if (isRevealed) {
        block.style.setProperty('filter', 'none', 'important');
        block.style.setProperty('opacity', '1', 'important');
      } else {
        block.style.removeProperty('filter');
        block.style.removeProperty('opacity');
      }
      if (window.haptic) window.haptic(20);
    }
  };

  ficheEl.addEventListener('click', handleTap);
}

/* ==================== 1 B: IMPLÉMENTATION SURLIGNAGE (HIGHLIGHTER MOBILE & DESKTOP) ==================== */
window.__savedSelectionRange = null;

window.toggleHighlighterMode = function() {
  const hasHl = window.userHasFeature ? window.userHasFeature('Surligneur de Fiche') : false;
  if (!hasHl) {
    if (typeof window.openPremiumTeaser === 'function') {
      window.openPremiumTeaser('Surligneur de Fiche');
    }
    return;
  }

  window.__highlighterMode = !window.__highlighterMode;
  const btn = document.getElementById('btnStudyHl');
  const ficheEl = document.querySelector('.fiche-content');
  if (!ficheEl) return;

  if (window.haptic) window.haptic(20);

  let bar = document.getElementById('highlighterBar');
  if (window.__highlighterMode) {
    if (btn) btn.classList.add('active', 'highlighter-active');

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'highlighterBar';
      bar.className = 'highlighter-floating-bar';
      ficheEl.parentNode.insertBefore(bar, ficheEl);
    }
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span id="hlHint" style="font-size:12px;font-weight:700;color:#047857;display:flex;align-items:center;gap:5px">
          <i class="fas fa-highlighter"></i> Touche le texte ou sélectionne :
        </span>
        <button id="hlApplyBtn" class="hl-apply-btn" style="display:none">
          <i class="fas fa-check"></i> Surligner la sélection
        </button>
      </div>
      <div class="hl-palette">
        <button type="button" class="hl-color-pill hl-pill-yellow ${window.__currentHlColor === 'yellow' ? 'active' : ''}" data-color="yellow" title="Jaune">🟡</button>
        <button type="button" class="hl-color-pill hl-pill-green ${window.__currentHlColor === 'green' ? 'active' : ''}" data-color="green" title="Vert">🟢</button>
        <button type="button" class="hl-color-pill hl-pill-blue ${window.__currentHlColor === 'blue' ? 'active' : ''}" data-color="blue" title="Bleu">🔵</button>
        <button type="button" class="hl-color-pill hl-pill-pink ${window.__currentHlColor === 'pink' ? 'active' : ''}" data-color="pink" title="Rose">🌸</button>
        <button type="button" class="hl-color-pill hl-pill-eraser ${window.__currentHlColor === 'eraser' ? 'active' : ''}" data-color="eraser" title="Gomme">🧹</button>
      </div>
      <button id="hlCloseBtn" style="padding:6px 12px;border-radius:8px;border:none;background:#e2e8f0;font-size:11.5px;font-weight:700;cursor:pointer">Fermer</button>
    `;
    bar.style.display = 'flex';

    // Attacher les écouteurs sur chaque bouton de la palette (sans preventDefault qui casse le tap mobile)
    let lastBtnTap = 0;
    bar.querySelectorAll('.hl-color-pill').forEach(pill => {
      const color = pill.getAttribute('data-color');
      const handleSelect = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - lastBtnTap < 200) return;
        lastBtnTap = now;
        setHlColor(color);
      };
      pill.addEventListener('pointerdown', handleSelect);
      pill.addEventListener('click', handleSelect);
    });

    const applyBtn = bar.querySelector('#hlApplyBtn');
    if (applyBtn) {
      const handleApply = (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyHighlightToActiveSelection();
      };
      applyBtn.addEventListener('pointerdown', handleApply);
      applyBtn.addEventListener('click', handleApply);
    }

    const closeBtn = bar.querySelector('#hlCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleHighlighterMode();
      });
    }

    if (window.toast) window.toast("🖍️ Surligneur actif : choisis une couleur et touche le texte !", "info", 2500);
  } else {
    if (btn) btn.classList.remove('active', 'highlighter-active');
    if (bar) bar.remove();
  }
};

window.setHlColor = function(color) {
  window.__currentHlColor = color;
  if (window.haptic) window.haptic(15);
  
  document.querySelectorAll('.hl-color-pill').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-color') === color);
  });

  if (color === 'eraser') {
    if (window.toast) toast("🧹 Gomme activée : touche n'importe quel surlignage pour l'effacer.", "info", 2500);
    return;
  }

  // Vérifier si une sélection de texte existe déjà
  const sel = window.getSelection();
  let hasSelection = false;
  if (sel && !sel.isCollapsed && sel.toString().trim().length >= 2) {
    hasSelection = true;
  } else if (window.__savedSelectionRange && window.__savedSelectionRange.toString().trim().length >= 2) {
    hasSelection = true;
  }

  if (hasSelection) {
    applyHighlightToActiveSelection();
  } else {
    const colorNames = { yellow: 'jaune', green: 'vert', blue: 'bleu', pink: 'rose' };
    if (window.toast) toast(`🖍️ Surligneur ${colorNames[color] || ''} prêt : touche le texte à surligner.`, "info", 1800);
  }
};

window.applyHighlightToActiveSelection = function() {
  const sel = window.getSelection();
  let range = null;

  if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
    range = sel.getRangeAt(0);
  } else if (window.__savedSelectionRange) {
    range = window.__savedSelectionRange;
  }

  if (!range) {
    if (window.toast) window.toast("Touche directement un mot ou une phrase dans la fiche.", "info", 2000);
    return;
  }

  const ficheEl = document.querySelector('.fiche-content');
  if (!ficheEl || !ficheEl.contains(range.commonAncestorContainer)) {
    if (window.toast) window.toast("La sélection doit se trouver dans la fiche de cours.", "warn", 2500);
    return;
  }

  applyHighlightToRange(range, window.__currentHlColor || 'yellow');
  
  // Réinitialiser la sélection
  window.__savedSelectionRange = null;
  const applyBtn = document.getElementById('hlApplyBtn');
  if (applyBtn) applyBtn.style.display = 'none';
  if (sel) sel.removeAllRanges();
};

function initHighlighterEventListeners() {
  const ficheEl = document.querySelector('.fiche-content');
  if (!ficheEl || ficheEl.__hlListening) return;
  ficheEl.__hlListening = true;

  let touchMoved = false;
  let touchStartX = 0;
  let touchStartY = 0;

  ficheEl.addEventListener('touchstart', (e) => {
    touchMoved = false;
    if (e.touches && e.touches[0]) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  ficheEl.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
      const dx = Math.abs(e.touches[0].clientX - touchStartX);
      const dy = Math.abs(e.touches[0].clientY - touchStartY);
      if (dx > 10 || dy > 10) {
        touchMoved = true;
      }
    }
  }, { passive: true });

  // Détection continue de la sélection de texte (mobile & desktop)
  const onSelectionChange = () => {
    if (!window.__highlighterMode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const text = sel.toString().trim();
    if (text.length < 2) return;

    const range = sel.getRangeAt(0);
    if (!ficheEl.contains(range.commonAncestorContainer)) return;

    window.__savedSelectionRange = range.cloneRange();

    const applyBtn = document.getElementById('hlApplyBtn');
    if (applyBtn) {
      applyBtn.style.display = 'inline-flex';
      const preview = text.length > 15 ? text.slice(0, 15) + '…' : text;
      applyBtn.innerHTML = `<i class="fas fa-check"></i> Surligner « ${preview} »`;
    }
  };

  document.addEventListener('selectionchange', onSelectionChange);

  let lastTapTime = 0;

  // Gestionnaire unifié de tap direct (mobile & desktop)
  const handleTapOrClick = (e) => {
    if (!window.__highlighterMode) return;
    if (touchMoved) return; // Ignore le défilement de l'écran

    const now = Date.now();
    if (now - lastTapTime < 250) return; // Anti-rebond
    lastTapTime = now;

    // 1. Clic sur boutons, liens ou barres utilitaires
    if (e.target.closest('.exam-traps-card, .fiche-study-bar, #recallFloatingBanner, #highlighterBar, .fiche-notes-box, .fiche-actions, .resume-ci-whatsapp-qr, button, a, input, textarea')) {
      return;
    }

    // 2. Clic sur un élément déjà surligné -> l'effacer immédiatement
    const existing = e.target.closest('mark.rci-hl, .rci-hl-block, .rci-hl-inline');
    if (existing) {
      e.preventDefault();
      e.stopPropagation();
      removeSingleMark(existing);
      return;
    }

    // 3. Si la gomme est active
    if (window.__currentHlColor === 'eraser') {
      if (window.toast) window.toast("🧹 Touche un passage surligné pour l'effacer.", "info", 1800);
      return;
    }

    // 4. Si une sélection de texte est active
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length >= 2) {
      const range = sel.getRangeAt(0);
      if (ficheEl.contains(range.commonAncestorContainer)) {
        applyHighlightToRange(range, window.__currentHlColor || 'yellow');
        sel.removeAllRanges();
        return;
      }
    }

    // 5. Mode Tap Direct : Surlignage instantané de l'élément touché
    let target = e.target;
    if (!target || target === ficheEl) return;

    e.preventDefault();
    e.stopPropagation();

    const color = window.__currentHlColor || 'yellow';

    // Distinguer tag inline vs tag de bloc
    const isInline = ['STRONG', 'EM', 'SPAN', 'B', 'I', 'CODE'].includes(target.tagName);
    const hlClass = isInline ? 'rci-hl-inline' : 'rci-hl-block';

    target.classList.add(hlClass, `hl-${color}`);
    target.setAttribute('data-color', color);
    target.title = "Surligné (touche pour effacer)";

    if (window.haptic) window.haptic(25);
    if (window.toast) window.toast("✨ Surligné ! (Touche à nouveau pour effacer)", "success", 1800);

    saveFicheHighlights();
  };

  ficheEl.addEventListener('click', handleTapOrClick);
  ficheEl.addEventListener('touchend', handleTapOrClick);
}

function applyHighlightToRange(range, color) {
  try {
    if (!range || range.collapsed || range.toString().trim().length === 0) return false;

    const mark = document.createElement('mark');
    mark.className = `rci-hl hl-${color}`;
    mark.setAttribute('data-color', color);
    mark.title = "Surligné (touche pour effacer)";

    // Extraction propre
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);

    if (window.haptic) window.haptic(25);
    if (window.toast) window.toast("✨ Passage surligné et mémorisé !", "success", 1800);

    saveFicheHighlights();
    return true;
  } catch(e) {
    console.warn("Échec surlignage extractContents, essai fallback:", e);
    try {
      range.surroundContents(mark);
      saveFicheHighlights();
      return true;
    } catch(err2) {
      if (window.toast) window.toast("Sélectionne le texte à l'intérieur d'un même paragraphe.", "warn", 2500);
      return false;
    }
  }
}

function removeSingleMark(el) {
  if (window.haptic) window.haptic(20);

  if (el.classList.contains('rci-hl-block')) {
    el.classList.remove('rci-hl-block', 'hl-yellow', 'hl-green', 'hl-blue', 'hl-pink');
    el.removeAttribute('data-color');
    el.removeAttribute('title');
    saveFicheHighlights();
    if (window.toast) window.toast("Surlignage effacé.", "info", 1500);
    return;
  }

  if (el.classList.contains('rci-hl-inline')) {
    el.classList.remove('rci-hl-inline', 'hl-yellow', 'hl-green', 'hl-blue', 'hl-pink');
    el.removeAttribute('data-color');
    el.removeAttribute('title');
    saveFicheHighlights();
    if (window.toast) window.toast("Surlignage effacé.", "info", 1500);
    return;
  }

  const mark = el.closest('mark.rci-hl') || el;
  const parent = mark.parentNode;
  if (!parent) return;

  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark);
  }
  mark.remove();
  parent.normalize();
  saveFicheHighlights();
  if (window.toast) window.toast("Surlignage effacé.", "info", 1500);
}

function saveFicheHighlights() {
  if (!window.__currentFicheKey) return;
  const ficheEl = document.querySelector('.fiche-content');
  if (!ficheEl) return;

  const data = [];

  // 1. Surlignages spécifiques par sélection (<mark.rci-hl>)
  ficheEl.querySelectorAll('mark.rci-hl').forEach(m => {
    const text = m.textContent.trim();
    const color = m.getAttribute('data-color') || 'yellow';
    if (text) data.push({ type: 'text', text, color });
  });

  // 2. Surlignages de blocs / paragraphes (.rci-hl-block)
  ficheEl.querySelectorAll('.rci-hl-block').forEach(b => {
    const text = b.textContent.trim();
    const color = b.getAttribute('data-color') || 'yellow';
    if (text) data.push({ type: 'block', text, color });
  });

  // 3. Surlignages de tags inline (.rci-hl-inline)
  ficheEl.querySelectorAll('.rci-hl-inline').forEach(i => {
    const text = i.textContent.trim();
    const color = i.getAttribute('data-color') || 'yellow';
    if (text) data.push({ type: 'inline', text, color });
  });

  localStorage.setItem('rci_hl_' + window.__currentFicheKey, JSON.stringify(data));
}

function restoreFicheHighlights(cls, sub, file) {
  const key = `${cls}__${sub}__${file}`;
  const raw = localStorage.getItem('rci_hl_' + key);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return;

    const ficheEl = document.querySelector('.fiche-content');
    if (!ficheEl) return;

    data.forEach(item => {
      if (!item || !item.text || !item.color) return;

      if (item.type === 'block' || item.type === 'inline') {
        const clsName = item.type === 'block' ? 'rci-hl-block' : 'rci-hl-inline';
        const candidates = ficheEl.querySelectorAll('p, li, h1, h2, h3, h4, blockquote, dt, dd, strong, em, span, code, .definition, .important, .schema');
        for (const el of candidates) {
          if (el.textContent.trim() === item.text && !el.classList.contains('rci-hl-block') && !el.classList.contains('rci-hl-inline')) {
            el.classList.add(clsName, `hl-${item.color}`);
            el.setAttribute('data-color', item.color);
            el.title = "Surligné (touche pour effacer)";
            break;
          }
        }
      } else {
        const found = wrapTextWithMark(ficheEl, item.text, item.color);
        if (!found) {
          const candidates = ficheEl.querySelectorAll('p, li, h1, h2, h3, h4, blockquote, strong, em, span');
          for (const el of candidates) {
            if (el.textContent.trim() === item.text && !el.classList.contains('rci-hl-block')) {
              el.classList.add('rci-hl-block', `hl-${item.color}`);
              el.setAttribute('data-color', item.color);
              break;
            }
          }
        }
      }
    });
  } catch(e) {
    console.warn("Erreur restauration surlignages:", e);
  }
}

function wrapTextWithMark(rootEl, searchText, color) {
  if (!searchText || searchText.length < 2) return false;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null, false);
  let node;
  let found = false;
  while ((node = walker.nextNode())) {
    if (node.parentNode && (node.parentNode.nodeName === 'MARK' || node.parentNode.classList.contains('rci-hl-block') || node.parentNode.classList.contains('rci-hl-inline'))) continue;
    if (node.parentNode && node.parentNode.closest('.exam-traps-card, .fiche-notes-box, .fiche-study-bar')) continue;

    const idx = node.nodeValue.indexOf(searchText);
    if (idx !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + searchText.length);
      const mark = document.createElement('mark');
      mark.className = `rci-hl hl-${color}`;
      mark.setAttribute('data-color', color);
      mark.title = "Surligné (touche pour effacer)";
      try {
        const fragment = range.extractContents();
        mark.appendChild(fragment);
        range.insertNode(mark);
        found = true;
        break;
      } catch(e) {}
    }
  }
  return found;
}

/* ==================== 1 B: MES NOTES PERSONNELLES SUR LA FICHE ==================== */
window.toggleFicheNotes = function() {
  const hasNotes = window.userHasFeature ? window.userHasFeature('Mes Notes Personnelles') : false;
  if (!hasNotes) {
    if (typeof window.openPremiumTeaser === 'function') {
      window.openPremiumTeaser('Mes Notes Personnelles');
    }
    return;
  }

  const ficheEl = document.querySelector('.fiche-content');
  if (!ficheEl) return;

  if (window.haptic) window.haptic(20);

  let box = document.getElementById('ficheNotesBox');
  if (box) {
    box.remove();
    return;
  }

  box = document.createElement('div');
  box.id = 'ficheNotesBox';
  box.className = 'fiche-notes-box';

  const savedNote = localStorage.getItem('rci_note_' + (window.__currentFicheKey || '')) || '';

  box.innerHTML = `
    <div class="fiche-notes-header">
      <div class="fiche-notes-title">
        <i class="fas fa-pen-to-square" style="color:#3b82f6"></i> Mes Notes Personnelles
      </div>
      <div class="fiche-notes-status" id="ficheNotesStatus">${savedNote ? 'Sauvegardé ✓' : 'Prêt'}</div>
    </div>
    <textarea id="ficheNotesTextarea" class="fiche-notes-input" placeholder="Écris ici tes remarques, formules clés, astuces du professeur pour cette leçon...">${escHtml(savedNote)}</textarea>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px">
      <span style="font-size:11px;color:#64748b"><i class="fas fa-shield-halved"></i> Notes privées stockées sur ton appareil</span>
      <div style="display:flex;gap:6px">
        <button onclick="clearFicheNotes()" style="background:#fee2e2;border:none;color:#dc2626;padding:5px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer"><i class="fas fa-trash"></i> Effacer</button>
        <button onclick="toggleFicheNotes()" style="background:#f1f5f9;border:none;color:#475569;padding:5px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">Fermer</button>
      </div>
    </div>
  `;

  // Insérer juste avant les boutons d'action Quizz/Flashcards
  ficheEl.parentNode.insertBefore(box, document.querySelector('.fiche-actions') || ficheEl.nextSibling);

  const textarea = document.getElementById('ficheNotesTextarea');
  if (textarea) {
    textarea.focus();
    let saveTimeout;
    textarea.addEventListener('input', () => {
      const statusEl = document.getElementById('ficheNotesStatus');
      if (statusEl) statusEl.textContent = 'Enregistrement...';
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (window.__currentFicheKey) {
          const val = textarea.value;
          localStorage.setItem('rci_note_' + window.__currentFicheKey, val);
          if (statusEl) statusEl.textContent = 'Sauvegardé ✓';

          // Mise à jour badge
          const badgeEl = document.getElementById('ficheNotesBadge');
          if (badgeEl) {
            if (val.trim().length > 0) {
              badgeEl.style.display = 'inline-block';
              badgeEl.textContent = '1';
            } else {
              badgeEl.style.display = 'none';
            }
          }
        }
      }, 350);
    });
  }
};

window.clearFicheNotes = function() {
  if (!confirm("Voulez-vous vraiment effacer vos notes sur cette fiche ?")) return;
  if (!window.__currentFicheKey) return;
  localStorage.removeItem('rci_note_' + window.__currentFicheKey);
  const textarea = document.getElementById('ficheNotesTextarea');
  if (textarea) textarea.value = '';
  const statusEl = document.getElementById('ficheNotesStatus');
  if (statusEl) statusEl.textContent = 'Effacé';
  const badgeEl = document.getElementById('ficheNotesBadge');
  if (badgeEl) badgeEl.style.display = 'none';
  if (window.toast) window.toast("Notes effacées.", "info", 2000);
};

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


