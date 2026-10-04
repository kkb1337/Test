/* FTracker v1.8.77 — Workout replacement/create state fix.
   Consolidated from the audited inline runtimes without changing their order. */

/* ===== CONSOLIDATED RUNTIME BLOCK 1 ===== */
/* ================================================================
   FTracker — unified modal stack: workspace + dialog
   One owner for stacking and interaction order. Two window types only.
   ================================================================ */
const modalStack = [];
let modalBodyScrollY = 0;
let modalStackInitialized = false;
let modalStackObserverStarted = false;

const FT_WINDOW_DIALOGS = new Set([
  'confirmExitModal','finishWorkoutConfirmModal','deleteConfirmModal',
  'importConfirmModal','autoBackupRestoreConfirmModal','measurementSaveConfirmModal',
  'foodCopyConfirmModal','systemConfirmModal','exerciseCreateConfirmModal'
]);
function classifyModal(modal) {
  if (modal?.id === 'fscoreCustomGoalModal') return 'goal-editor';
  return modal && FT_WINDOW_DIALOGS.has(modal.id) ? 'dialog' : 'workspace';
}
function isModalElement(el) {
  if (!(el instanceof Element)) return false;
  if (el.id && /Modal$/i.test(el.id)) return true;
  const cls = typeof el.className === 'string' ? el.className : '';
  return /(?:^|\s)[\w-]*modal(?:\s|$)/i.test(cls);
}
function getModalRoots() {
  return Array.from(document.querySelectorAll('[id$="Modal"],.theme-modal,.exercise-modal,.date-modal,.confirm-modal,.workout-detail-modal,.manual-workout-modal,.achievements-modal,.food-modal,.catalog-modal,.technique-modal'))
    .filter(isModalElement);
}
function getModalContent(modal) { return modal ? modal.firstElementChild : null; }
function ensureUnifiedModalHeader(modal) {
  if (!modal || FT_WINDOW_DIALOGS.has(modal.id)) return;
  const content = modal.firstElementChild;
  if (!(content instanceof Element)) return;
  if (content.querySelector(':scope > .unified-surface-header, :scope > .exercise-card-header, :scope > .ft-modal-header')) return;

  const close = content.querySelector(':scope > .close-btn, :scope > .modal-close-btn, :scope > .exercise-dup-close');
  if (!(close instanceof HTMLElement)) return;

  const titleMap = {
    themeModal: {text:'Настройки'},
    renameExerciseModal: {selector:'div[style*="font-size:21px"]'},
    directoryNewExerciseModal: {selector:'div[style*="font-size:21px"]'},
    workoutNewExerciseModal: {selector:'.workout-new-title'},
    replaceExerciseModal: {selector:'.replace-sheet-head'},
    exerciseModal: {text:'Карточка'},
    dateModal: {selector:'div[style*="font-size:20px"]'},
    workoutDetailModal: {selector:'.workout-detail-title-wrap'},
    techniqueModal: {text:'Карточка'},
    achievementsModal: {selector:'div[style*="font-size:22px"]'},
    manualWorkoutModal: {selector:'div[style*="font-size:22px"]'},
    copyDatePickerModal: {selector:'div[style*="font-size:20px"]'},
    workoutSummaryModal: {selector:'#workoutSummaryTitle'},
    measurementHistoryModal: {selector:'div[style*="font-size:21px"]'},
    exerciseDuplicateModal: {selector:'#exerciseDupTitle'},
    foodDuplicateModal: {selector:'#foodDupTitle'}
  };
  const spec = titleMap[modal.id] || {};
  let title = spec.selector ? content.querySelector(':scope > '+spec.selector) : null;
  // Exercise description card: keep the real exercise name in content and use a fixed header label.
  if (modal.id === 'techniqueModal') {
    const exerciseName = content.querySelector(':scope > .technique-title, :scope > .exercise-card-title, :scope > .exercise-card-heading');
    if (exerciseName instanceof HTMLElement) exerciseName.classList.add('exercise-card-exercise-name');
  }
  if (!(title instanceof HTMLElement) && spec.text) {
    title=document.createElement('div');
    title.className='surface-title';
    title.textContent=spec.text;
  }
  if (!(title instanceof HTMLElement)) {
    const candidate=Array.from(content.children).find(el=>{
      if (el===close) return false;
      const txt=(el.textContent||'').trim();
      const fs=parseFloat(getComputedStyle(el).fontSize||'0');
      return txt && fs>=20 && fs<=28 && !el.matches('input,button,label');
    });
    title=candidate instanceof HTMLElement ? candidate : null;
  }
  if (!(title instanceof HTMLElement)) return;

  const header=document.createElement('div');
  header.className='unified-surface-header ft-modal-header unified-surface-header-close';
  const spacer=document.createElement('div');
  spacer.className='surface-header-spacer';
  spacer.setAttribute('aria-hidden','true');
  const titleWrap=document.createElement('div');
  titleWrap.className='surface-title';
  // Keep existing title markup, including subtitle/current exercise information.
  titleWrap.appendChild(title);
  close.classList.add('ft-header-close-control');
  header.append(spacer,titleWrap,close);
  content.insertBefore(header,content.firstChild);
}

function prepareModalRoot(modal) {
  if (!modal) return;
  ensureUnifiedModalHeader(modal);
  modal.classList.add('ft-window-root');
  modal.classList.remove('ft-window-workspace','ft-window-dialog');
  const windowKind=classifyModal(modal);
  modal.classList.add('ft-window-'+windowKind);
  // Goal editor has its own full-screen shell. It must not inherit the generic
  // workspace shell because that shell has a different safe-area ownership model.
  if(windowKind==='goal-editor') {
    modal.classList.remove('ft-window-workspace');
    modal.classList.add('ft-window-goal-editor');
  }
  modal.setAttribute('aria-modal','true');
}
let modalPrevBodyOverflow = '';
let modalPrevHtmlOverflow = '';
function lockModalBody() {
  if (!modalStackInitialized) {
    modalBodyScrollY = window.scrollY || window.pageYOffset || 0;
    modalPrevBodyOverflow = document.body.style.overflow || '';
    modalPrevHtmlOverflow = document.documentElement.style.overflow || '';
    modalStackInitialized = true;
  }
  // Do NOT position:fixed the body. On iOS Safari a fixed modal that is a
  // direct child of body can inherit the body's top offset, producing the
  // exact vertical displacement/black lower band seen in the PWA.
  document.body.style.overflow='hidden';
  document.documentElement.style.overflow='hidden';
}
function unlockModalBody() {
  if (!modalStackInitialized) return;
  document.body.style.overflow=modalPrevBodyOverflow;
  document.documentElement.style.overflow=modalPrevHtmlOverflow;
  const y=modalBodyScrollY;
  modalBodyScrollY=0;
  modalPrevBodyOverflow='';
  modalPrevHtmlOverflow='';
  modalStackInitialized=false;
  // No scroll restoration is necessary: overflow locking does not move the
  // document, so the underlying screen keeps its exact scroll position.
  if (Number.isFinite(y) && Math.abs((window.scrollY||0)-y)>1) window.scrollTo(0,y);
}
function updateModalStackState() {
  const open=getModalRoots().filter(m=>!m.classList.contains('hidden'));
  modalStack.splice(0,modalStack.length,...modalStack.filter(m=>open.includes(m)));
  open.forEach(m=>{ prepareModalRoot(m); if(!modalStack.includes(m)) modalStack.push(m); });
  modalStack.forEach((m,i)=>{
    const active=i===modalStack.length-1;
    m.style.setProperty('z-index',String(1000+(i+1)*10),'important');
    m.classList.toggle('is-stack-active',active);
    m.classList.toggle('is-stack-inactive',!active);
    m.style.pointerEvents=active?'auto':'none';
  });
  modalStack.length ? lockModalBody() : unlockModalBody();
}
function openModal(modalElement) {
  if (!(modalElement instanceof Element)) return null;
  prepareModalRoot(modalElement);
  modalElement.classList.remove('hidden');
  modalElement.setAttribute('aria-hidden','false');
  const i=modalStack.indexOf(modalElement); if(i!==-1) modalStack.splice(i,1);
  modalStack.push(modalElement);
  updateModalStackState();
  return modalElement;
}
function closeModal() {
  const modalElement=modalStack[modalStack.length-1];
  if (!modalElement) { updateModalStackState(); return null; }
  modalElement.classList.add('hidden');
  modalElement.setAttribute('aria-hidden','true');
  updateModalStackState();
  return modalElement;
}
function closeModalElement(modalElement) {
  if (!(modalElement instanceof Element)) return null;
  modalElement.classList.add('hidden');
  modalElement.setAttribute('aria-hidden','true');
  updateModalStackState();
  return modalElement;
}
const modalStackObserver = new MutationObserver(mutations=>{
  let changed=false;
  for(const mutation of mutations){
    if(mutation.type==='attributes' && mutation.attributeName==='class' && isModalElement(mutation.target)){
      const modal=mutation.target;
      const open=!modal.classList.contains('hidden');
      const i=modalStack.indexOf(modal);
      if(open && i===-1){ prepareModalRoot(modal); modalStack.push(modal); changed=true; }
      else if(!open && i!==-1){ modalStack.splice(i,1); changed=true; }
    }
  }
  if(changed) updateModalStackState();
});
function initModalStack(){
  getModalRoots().forEach(m=>{ prepareModalRoot(m); if(!m.classList.contains('hidden') && !modalStack.includes(m)) modalStack.push(m); });
  updateModalStackState();
  if(!modalStackObserverStarted){ modalStackObserverStarted=true; modalStackObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']}); }
}
function lockModalScroll(){ updateModalStackState(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initModalStack,{once:true}); else initModalStack();


const STORAGE_KEY = 'ftracker_v23';
const DRAFT_KEY = 'ftracker_draft';
const LAST_EXPORT_KEY = 'ftracker_last_export';
const LAST_IMPORT_KEY = 'ftracker_last_import';
let pendingAutoBackupRestoreId = null;
const DEFAULT_MEASURE_FIELDS = [
    { key: 'weight', label: 'Вес' },
    { key: 'chest', label: 'Грудь' },
    { key: 'waist', label: 'Талия' },
    { key: 'hips', label: 'Бёдра' },
    { key: 'biceps', label: 'Бицепс' }
];
function getMeasurementFields() {
    if (!Array.isArray(data.measurementFields) || !data.measurementFields.length) {
        data.measurementFields = DEFAULT_MEASURE_FIELDS.map(f => ({...f}));
    }
    return data.measurementFields;
}
function getMeasurementFieldMap() {
    return Object.fromEntries(getMeasurementFields().map(f => [f.key, f.label]));
}

// ===== FTracker v1.3.2 — встроенная базовая база продуктов =====
// Усреднённые значения на 100 г. Пользовательские продукты не перезаписываются.
const BUILTIN_PRODUCT_CATALOG = [
['Куриная грудка',165,31,3.6,0],['Куриное бедро без кожи',177,24,8,0],['Индейка филе',135,29,1,0],['Говядина постная',187,26,10,0],['Свинина постная',242,27,14,0],['Фарш говяжий',250,26,15,0],
['Лосось',208,20,13,0],['Тунец консервированный в собственном соку',116,26,1,0],['Треска',82,18,0.7,0],['Креветки',99,24,0.3,0],
['Яйцо куриное',143,13,9.5,0.7],['Яичный белок',52,11,0.2,0.7],
['Творог 0%',72,16,0.5,1.8],['Творог 5%',121,17,5,3],['Творог 9%',159,16,9,3],['Греческий йогурт',73,9,2,4],['Йогурт натуральный',61,3.5,3.3,4.7],['Молоко 2.5%',52,2.8,2.5,4.7],['Кефир 2.5%',53,2.9,2.5,4],['Сыр твёрдый',350,25,27,0],
['Рис варёный',130,2.7,0.3,28],['Гречка варёная',110,4.2,1.1,21.3],['Макароны варёные',131,5,1.1,25],['Картофель варёный',82,2,0.4,17],['Овсянка сухая',366,12,6,60],['Булгур варёный',83,3.1,0.2,18.6],
['Хлеб пшеничный',265,8,3.2,49],['Хлеб цельнозерновой',247,13,4.2,41],['Лаваш',274,9,1.2,57],
['Банан',89,1.1,0.3,23],['Яблоко',52,0.3,0.2,14],['Апельсин',47,0.9,0.1,12],['Ягоды',50,1,0.5,10],
['Огурец',15,0.7,0.1,3.6],['Помидор',18,0.9,0.2,3.9],['Брокколи',34,2.8,0.4,7],['Морковь',41,0.9,0.2,10],['Перец сладкий',31,1,0.3,6],
['Арахис',567,26,49,16],['Миндаль',579,21,50,22],['Арахисовая паста',588,25,50,20],['Оливковое масло',884,0,100,0],['Сливочное масло',717,0.9,81,0.1],
['Шоколад молочный',535,7,30,59],['Шоколад тёмный',598,8,43,46],['Мёд',304,0.3,0,82],['Сахар',387,0,0,100]
].map(([name,cal100,protein100,fat100,carbs100])=>({
 id:'builtin_food_'+name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi,'_'),name,type:'per100',cal100,protein100,fat100,carbs100,builtin:true
}));

function mergeBuiltinProductCatalog(state){
 if(!state || !Array.isArray(state.productCatalog)) return;
 const existing=new Set(state.productCatalog.map(p=>normalizeExerciseKey(p?.name)).filter(Boolean));
 BUILTIN_PRODUCT_CATALOG.forEach(p=>{ if(!existing.has(normalizeExerciseKey(p.name))) state.productCatalog.push({...p}); });
}

let data = {
    programs: [
        { name: 'Сплит 1: Грудь + Бицепс', exercises: ['Кардио','Жим лёжа','Бицепс с EZ-грифом стоя','Жим в тренажёре под углом','Бицепс сидя под углом','Бабочка в тренажёре','Бицепс обратным хватом','Пресс'], active: [true,true,true,true,true,true,true,true], types: ['cardio','strength','strength','strength','strength','strength','strength','bodyweight'], programActive: true },
        { name: 'Сплит 2: Спина + Трицепс', exercises: ['Подтягивания в тренажёре','Кросс-тяга в наклоне','Французский жим','Горизонтальная тяга','Жим гантели из-за головы','Вертикальная тяга в блоке','Трицепс в блоке'], active: [true,true,true,true,true,true,true], types: ['strength','strength','strength','strength','strength','strength','strength'], programActive: true },
        { name: 'Сплит 3: Ноги + Плечи', exercises: ['Кардио','Жим ногами в тренажёре','Жим гантелей сидя','Разгибание ног в тренажёре','Подъём гантелей перед собой','Сгибание ног в тренажёре','Подъём гантелей в стороны','Разведение гантелей в наклоне'], active: [true,true,true,true,true,true,true,true], types: ['cardio','strength','strength','strength','strength','strength','strength','strength'], programActive: true }
    ],
    history: [],
    measurements: [],
    measurementFields: DEFAULT_MEASURE_FIELDS.map(f => ({...f})),
    foodDiary: { limits: {}, entries: [], goalNutrition: { auto: true, baseMaintenance: 0 } },
    productCatalog: BUILTIN_PRODUCT_CATALOG.map(p=>({...p})),
    exerciseDirectory: [],
    exerciseDirectoryHidden: [],
    exerciseNotes: {},
    fscoreGoal: 'cut',
    fscoreCustomGoals: [],
    fscoreActiveCustomGoalId: null
};

let currentProgram = null, currentExerciseIndex = 0, workoutSets = {}, workoutStartTime = null;
let workoutExerciseSlots = [];
// F-Score keeps the original planned exercises separately from temporary replacements.
let workoutPlanSnapshot = [];
// Exercises borrowed from another split exist only inside the current workout.
// Negative slot references point into this transient array and are never saved to data.programs.
let workoutTransientExercises = [];
let replacementSlotIndex = null;
let pendingWorkoutReplacementCreate = null;
// Explicit mode/context for the workout exercise creation sheet. This survives
// closing the Replace sheet, so a newly created exercise can only replace the
// selected slot when creation was launched from Replace.
let workoutNewExerciseContext = null;
let totalTimerInterval = null, restTimerInterval = null, restEndTime = null, lastResults = {};
let workoutRecommendationAutoCollapseTimer = null;
let workoutRecommendationTimerKey = '';
let lastRestDuration = (function(){ try { const v = parseInt(localStorage.getItem('ftracker_rest_duration')); return Number.isFinite(v) && v > 0 ? v : 120; } catch(e) { return 120; } })();
let pendingProgramIndex = null, openedExerciseName = null, editingHistoryIndex = null;
let pendingDeleteType = null, pendingDeleteIndex = null, pendingDeleteDate = null;
let pendingArchiveExercise=null;
let pendingImportData = null;
let currentAchievements = {};
let progressPeriod = 30;
let pendingMeasurementSave = null;
let pendingMeasurementEditIndex = null;
let currentBodyGraphKey = null;
let editingCatalogProduct = null;
let currentFoodMode = 'portion';
let statsTextPeriod = '7';
let chartPeriod = 'week';
let chartDataType = 'calories';
let editingFoodEntryIndex = null;
let editingMeasurementFieldIndex = null;

function localDateString(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function applyTheme(theme) {
    if (theme === 'light') document.body.classList.add('light-mode');
    else document.body.classList.remove('light-mode');
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', theme === 'light' ? '#f2f2f7' : '#000000');
    localStorage.setItem('strong_theme', theme);
}
function formatDataEventDate(ts){
    try{return new Date(Number(ts)).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return '—';}
}
function renderDataHistoryStatus(){
    const imp=document.querySelector('#lastImportInfo strong');
    const exp=document.querySelector('#lastExportInfo strong');
    const lastImport=localStorage.getItem(LAST_IMPORT_KEY);
    const lastExport=localStorage.getItem(LAST_EXPORT_KEY);
    if(imp) imp.textContent=lastImport ? formatDataEventDate(lastImport) : 'Не выполнялся';
    if(exp){
      if(!lastExport){
        exp.textContent='Не выполнялся';
        exp.className='';
      }else{
        const age=Date.now()-Number(lastExport);
        const fresh=Number.isFinite(age) && age < 3*24*60*60*1000;
        exp.textContent=formatDataEventDate(lastExport)+(fresh?' · менее 3 дней':' · более 3 дней');
        exp.className=fresh?'data-status-fresh':'data-status-stale';
      }
    }
}
function openThemeModal() {
    // Any transient export UI must never survive navigation/opening another modal.
    if (typeof closeBackupExportPrompt === 'function') closeBackupExportPrompt();
    lockModalScroll(); document.getElementById('themeModal').classList.remove('hidden');
    renderDataHistoryStatus();
    if (typeof refreshAutoBackupPanel === 'function') refreshAutoBackupPanel();
}
function closeThemeModal() { document.getElementById('themeModal').classList.add('hidden'); }
function setTheme(theme) { applyTheme(theme); closeThemeModal(); }


const FTRACKER_DATA_SCHEMA_VERSION = 3;

function ftStableHash(value){
    const s=String(value ?? '');
    let h=2166136261;
    for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
    return (h>>>0).toString(16).padStart(8,'0');
}
function ftStableId(prefix,value){ return prefix+'_'+ftStableHash(String(value ?? '')); }
function ftCanonicalName(value){ return String(value ?? '').trim().replace(/\s+/g,' '); }

function ensureProgramShape(p,index){
    if(!p || typeof p!=='object') p={};
    p.name=ftCanonicalName(p.name || p.programName || `Программа ${index+1}`) || `Программа ${index+1}`;
    p.id=String(p.id || p.programId || ftStableId('prog',normalizeExerciseKey(p.name))).trim();
    if(!Array.isArray(p.exercises)) p.exercises=[];
    p.exercises=p.exercises.map(ftCanonicalName).filter(Boolean);
    if(!Array.isArray(p.active)) p.active=[];
    if(!Array.isArray(p.types)) p.types=[];
    p.active=p.exercises.map((_,i)=>p.active[i] !== false);
    p.types=p.exercises.map((_,i)=>p.types[i] || 'strength');
    if(p.programActive===undefined) p.programActive=true;
    return p;
}

function ensureExerciseShape(e){
    if(!e || typeof e!=='object') return null;
    const name=ftCanonicalName(e.name || e.exerciseName);
    if(!name) return null;
    const type=e.type || 'strength';
    const out={...e,name,type,group:e.group||inferExerciseGroup(name,type)};
    out.id=String(out.id || out.exerciseId || ftStableId('ex',normalizeExerciseKey(name))).trim();
    return out;
}

function migrateFTrackerState(state){
    if(!state || typeof state!=='object') return state;
    if(!Array.isArray(state.programs)) state.programs=[];
    state.programs=state.programs.map((p,i)=>ensureProgramShape(p,i)).filter(Boolean);

    if(!Array.isArray(state.history)) state.history=[];
    if(!Array.isArray(state.measurements)) state.measurements=[];
    if(!Array.isArray(state.measurementFields)) state.measurementFields=[];
    if(!state.foodDiary || typeof state.foodDiary!=='object') state.foodDiary={};
    if(!Array.isArray(state.foodDiary.entries)) state.foodDiary.entries=[];
    if(!state.foodDiary.limits || typeof state.foodDiary.limits!=='object') state.foodDiary.limits={};
    if(!Array.isArray(state.foodDiary.limitHistory)) state.foodDiary.limitHistory=[];
    if(!Array.isArray(state.productCatalog)) state.productCatalog=[];
    mergeBuiltinProductCatalog(state);
    if(!Array.isArray(state.exerciseDirectory)) state.exerciseDirectory=[];
    if(!Array.isArray(state.exerciseDirectoryArchived)) state.exerciseDirectoryArchived=[];
    if(!Array.isArray(state.exerciseDirectoryHidden)) state.exerciseDirectoryHidden=[];
    if(!state.exerciseNotes || typeof state.exerciseNotes!=='object' || Array.isArray(state.exerciseNotes)) state.exerciseNotes={};
    try{
      const mirroredNotes=JSON.parse(localStorage.getItem('ftracker_exercise_notes_v1')||'null');
      if(mirroredNotes && typeof mirroredNotes==='object' && !Array.isArray(mirroredNotes)){
        Object.keys(mirroredNotes).forEach(k=>{ if(mirroredNotes[k] && !state.exerciseNotes[k]) state.exerciseNotes[k]=String(mirroredNotes[k]); });
      }
    }catch(e){}
    if(!state.exerciseGuideOverrides || typeof state.exerciseGuideOverrides!=='object') state.exerciseGuideOverrides={};
    if(!state.exerciseAliases || typeof state.exerciseAliases!=='object') state.exerciseAliases={};
    if(!state.programAliases || typeof state.programAliases!=='object') state.programAliases={};
    if(!Array.isArray(state._importedBackupFingerprints)) state._importedBackupFingerprints=[];
    if(!Array.isArray(state._backupConflicts)) state._backupConflicts=[];
    if(!['cut','gain','maintain','custom'].includes(state.fscoreGoal)){
        try{ state.fscoreGoal=localStorage.getItem('ftracker_fscore_goal')||'cut'; }catch(e){ state.fscoreGoal='cut'; }
    }
    if(!Array.isArray(state.fscoreCustomGoals)){
        try{ const ls=JSON.parse(localStorage.getItem('ftracker_fscore_custom_goals')||'null'); if(Array.isArray(ls)) state.fscoreCustomGoals=ls; }catch(e){}
    }
    if(!state.fscoreActiveCustomGoalId && state.fscoreCustomGoal?.id) state.fscoreActiveCustomGoalId=state.fscoreCustomGoal.id;
    if(!state.fscoreCustomGoal && Array.isArray(state.fscoreCustomGoals) && state.fscoreCustomGoals.length){state.fscoreCustomGoal=state.fscoreCustomGoals[0];state.fscoreActiveCustomGoalId=state.fscoreCustomGoals[0].id;}
    // F-Score trend is durable app data, not a UI-only localStorage artifact.
    // Migrate legacy per-goal trend keys into the main state once, preserving
    // history across full backup/restore and device migration.
    if(!state.fscoreTrend || typeof state.fscoreTrend!=='object' || Array.isArray(state.fscoreTrend)) state.fscoreTrend={};
    try{
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(!k || !k.startsWith('ftracker_fscore_trend_v1_')) continue;
        const goalKey=k.slice('ftracker_fscore_trend_v1_'.length);
        let rows=null; try{rows=JSON.parse(localStorage.getItem(k)||'null');}catch(e){}
        if(Array.isArray(rows) && !Array.isArray(state.fscoreTrend[goalKey])) state.fscoreTrend[goalKey]=rows;
      }
    }catch(e){}
    if(!state.foodDiary) state.foodDiary={limits:{},entries:[]};
    if(!state.foodDiary.goalNutrition || typeof state.foodDiary.goalNutrition!=='object') state.foodDiary.goalNutrition={auto:true,baseMaintenance:0};
    if(state.foodDiary.goalNutrition.auto===undefined) state.foodDiary.goalNutrition.auto=true;

    state.measurementFields=state.measurementFields
      .filter(f=>f && f.key && f.label)
      .map(f=>({...f,key:String(f.key).trim(),label:String(f.label).trim()}));

    state.exerciseDirectory=state.exerciseDirectory.map(ensureExerciseShape).filter(Boolean);
    state.exerciseDirectoryArchived=state.exerciseDirectoryArchived.map(ensureExerciseShape).filter(Boolean);

    // Every exercise ever referenced by programs/history must remain resolvable.
    const exerciseMap=new Map();
    [...state.exerciseDirectory,...state.exerciseDirectoryArchived].forEach(e=>{
        if(e && e.name) exerciseMap.set(normalizeExerciseKey(e.name),e);
    });
    state.programs.forEach(p=>{
        p.exercises.forEach((name,i)=>{
            const key=normalizeExerciseKey(name);
            if(!key) return;
            if(!exerciseMap.has(key)){
                const e=ensureExerciseShape({name,type:p.types[i]||'strength'});
                state.exerciseDirectory.push(e);
                exerciseMap.set(key,e);
            }
        });
    });
    state.history.forEach(h=>{
        if(!Array.isArray(h.exercises)) h.exercises=[];
        h.exercises=h.exercises.filter(Boolean).map(ex=>{
            const out={...ex};
            out.name=ftCanonicalName(out.name || out.exerciseName);
            const dir=exerciseMap.get(normalizeExerciseKey(out.name));
            if(dir) out.exerciseId=String(out.exerciseId || dir.id);
            return out;
        }).filter(ex=>ex.name);
        const prog=state.programs.find(p=>p.id===h.programId) ||
          state.programs.find(p=>normalizeExerciseKey(p.name)===normalizeExerciseKey(h.program));
        if(prog){
            h.programId=prog.id;
            if(!h.program) h.program=prog.name;
        }
    });

    state.productCatalog=state.productCatalog.filter(Boolean).map((p,i)=>{
        const out={...p};
        out.name=ftCanonicalName(out.name);
        out.id=String(out.id || out.productId || ftStableId('food',normalizeExerciseKey(out.name||`product-${i}`)));
        out.type=out.type||'per100';
        return out;
    }).filter(p=>p.name);

    state.schemaVersion=FTRACKER_DATA_SCHEMA_VERSION;
    return state;
}


function applyExerciseKnowledgeMigration(){
  try{
    if(!data || typeof data!=='object') return;
    const VERSION=5;
    if(!Array.isArray(data.exerciseDirectory)) data.exerciseDirectory=[];
    if(!Array.isArray(data.exerciseDirectoryArchived)) data.exerciseDirectoryArchived=[];
    // Retire duplicates from the visible directory without touching historical records.
    data.exerciseDirectory=data.exerciseDirectory.filter(e=>!isRetiredExerciseName(e?.name));
    data.exerciseDirectoryArchived=data.exerciseDirectoryArchived.filter(e=>!isRetiredExerciseName(e?.name));
    const squatOldKey=normalizeExerciseKey('Приседания со штангой');
    const squatNewName='Присед со штангой';
    data.exerciseDirectory.forEach(e=>{ if(normalizeExerciseKey(e?.name)===squatOldKey){ e.name=squatNewName; e.builtinName=squatNewName; } });
    data.programs.forEach(pr=>(pr.exercises||[]).forEach((n,i)=>{ if(normalizeExerciseKey(n)===squatOldKey) pr.exercises[i]=squatNewName; }));
    data.history.forEach(h=>(h.exercises||[]).forEach(ex=>{ if(normalizeExerciseKey(ex?.name)===squatOldKey) ex.name=squatNewName; }));
    const retiredKey=normalizeExerciseKey('Кросс-тяга в наклоне');
    data.programs.forEach(pr=>{
      const nextExercises=[], nextActive=[], nextTypes=[];
      (pr.exercises||[]).forEach((n,i)=>{
        if(normalizeExerciseKey(n)===retiredKey) return;
        nextExercises.push(n);
        nextActive.push(Array.isArray(pr.active)?pr.active[i]!==false:true);
        nextTypes.push(Array.isArray(pr.types)?(pr.types[i]||'strength'):'strength');
      });
      pr.exercises=nextExercises; pr.active=nextActive; pr.types=nextTypes;
    });
    if(Number(data.exerciseKnowledgeVersion||0)>=VERSION){ saveData(false,'Обновление базы упражнений'); return; }
    const archived=new Set((data.exerciseDirectoryArchived||[]).map(e=>normalizeExerciseKey(e?.name)).filter(Boolean));
    const applyToEntry=(e)=>{
      if(!e?.name || archived.has(normalizeExerciseKey(e.name))) return false;
      const built=findExerciseGuide(e.builtinName||e.name);
      if(!built) return false;
      e.builtinName=e.builtinName||built.name||e.name;
      e.guide=e.guide&&typeof e.guide==='object'?e.guide:{};
      e.guide.steps=Array.isArray(built.steps)?built.steps.slice():[];
      e.guide.execution=e.guide.steps.join('\n');
      e.guide.primary=Array.isArray(built.primary)?built.primary.slice():[];
      e.guide.secondary=Array.isArray(built.secondary)?built.secondary.slice():[];
      e.guide.muscles=e.guide.primary.slice();
      e.guide.mistakes=Array.isArray(built.mistakes)?built.mistakes.slice():[];
      e.guide.recommendations=Array.isArray(built.recommendations)?built.recommendations.slice():[];
      if(Array.isArray(built.remoteMedia)) e.guide.remoteMedia=built.remoteMedia.map(v=>({...v}));
      return true;
    };
    data.exerciseDirectory.forEach(applyToEntry);
    /* Persist the new built-ins in the single directory, but do not alter programs/history. */
    for(const g of NEW_EXERCISE_GUIDES){
      const key=normalizeExerciseKey(g.name);
      if(archived.has(key)) continue;
      if(!data.exerciseDirectory.some(e=>normalizeExerciseKey(e?.name)===key)){
        data.exerciseDirectory.push({
          name:g.name,type:g.type||'strength',group:inferExerciseGroup(g.name,g.type||'strength'),builtinName:g.name,
          guide:{steps:g.steps.slice(),execution:g.steps.join('\n'),primary:g.primary.slice(),secondary:g.secondary.slice(),muscles:g.primary.slice(),mistakes:g.mistakes.slice(),recommendations:g.recommendations.slice(),media:[],remoteMedia:Array.isArray(g.remoteMedia)?g.remoteMedia.map(v=>({...v})):[]}
        });
      }
    }
    data.exerciseKnowledgeVersion=VERSION;
    saveData(false,'Обновление базы упражнений');
  }catch(err){ console.warn('exercise knowledge migration skipped',err); }
}

function loadData() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.programs && Array.isArray(parsed.programs) && parsed.history) {
                parsed.programs = parsed.programs.map(p => {
                    if (!p.active) p.active = p.exercises.map(() => true);
                    if (!p.types) p.types = p.exercises.map(() => 'strength');
                    if (p.programActive === undefined) p.programActive = true;
                    return p;
                });
                if (!parsed.measurements) parsed.measurements = [];
                if (!Array.isArray(parsed.measurementFields) || !parsed.measurementFields.length) {
                    parsed.measurementFields = DEFAULT_MEASURE_FIELDS.map(f => ({...f}));
                } else {
                    parsed.measurementFields = parsed.measurementFields.filter(f => f && f.key && f.label);
                }
                if (!parsed.foodDiary) parsed.foodDiary = { limits: {}, entries: [] };
                if (!parsed.productCatalog) parsed.productCatalog = [];
                parsed.productCatalog = parsed.productCatalog.map(p => ({ ...p, type: p.type || 'per100' }));
                if (!Array.isArray(parsed.exerciseDirectory)) parsed.exerciseDirectory = [];
                if (!Array.isArray(parsed.exerciseDirectoryArchived)) parsed.exerciseDirectoryArchived = [];
                if (!Array.isArray(parsed.exerciseDirectoryHidden)) parsed.exerciseDirectoryHidden = [];
                const archivedKeys = new Set(parsed.exerciseDirectoryArchived.map(e=>normalizeExerciseKey(e?.name)).filter(Boolean));
                // Сохраняем в справочнике все упражнения, которые когда-либо уже были
                // в программах или истории. Это позволяет не терять их после удаления из сплита.
                const directoryMap = new Map();
                parsed.exerciseDirectory.forEach(e => {
                    if (!e || !e.name) return;
                    const key = normalizeExerciseKey(e.name);
                    if (key && !archivedKeys.has(key)) directoryMap.set(key, {...e, name:String(e.name).trim(), type:e.type||'strength', group:e.group||inferExerciseGroup(e.name,e.type||'strength')});
                });
                (parsed.programs || []).forEach(pr => (pr.exercises || []).forEach((n,i) => {
                    const key = normalizeExerciseKey(n); if (!key || archivedKeys.has(key) || isRetiredExerciseName(n)) return;
                    if (!directoryMap.has(key)) directoryMap.set(key,{name:String(n).trim(),type:pr.types?.[i]||'strength',group:inferExerciseGroup(n,pr.types?.[i]||'strength')});
                }));
                (parsed.history || []).forEach(h => (h.exercises || []).forEach(ex => {
                    const key = normalizeExerciseKey(ex.name); if (!key || archivedKeys.has(key) || isRetiredExerciseName(ex.name)) return;
                    if (!directoryMap.has(key)) directoryMap.set(key,{name:String(ex.name).trim(),type:ex.type||'strength',group:inferExerciseGroup(ex.name,ex.type||'strength')});
                }));
                parsed.exerciseDirectory = [...directoryMap.values()];
                parsed.exerciseDirectoryArchived = (parsed.exerciseDirectoryArchived||[]).filter(e=>e && e.name);
                // Миграция старого механизма скрытых упражнений в новый архив.
                const archivedNow = new Set(parsed.exerciseDirectoryArchived.map(e=>normalizeExerciseKey(e.name)));
                (parsed.exerciseDirectoryHidden||[]).forEach(key=>{
                    const k=normalizeExerciseKey(key); if(!k || archivedNow.has(k)) return;
                    let found=null;
                    for(const pr of (parsed.programs||[])){
                        const i=(pr.exercises||[]).findIndex(n=>normalizeExerciseKey(n)===k);
                        if(i>=0){ found={name:pr.exercises[i],type:pr.types?.[i]||'strength',group:inferExerciseGroup(pr.exercises[i],pr.types?.[i]||'strength')}; break; }
                    }
                    if(!found){ for(const h of (parsed.history||[])){ const ex=(h.exercises||[]).find(x=>normalizeExerciseKey(x?.name)===k); if(ex){ found={name:ex.name,type:ex.type||'strength',group:inferExerciseGroup(ex.name,ex.type||'strength')}; break; } } }
                    if(found){ parsed.exerciseDirectoryArchived.push({...found, archivedAt:new Date().toISOString()}); archivedNow.add(k); }
                });
                parsed.foodDiary.entries = (parsed.foodDiary.entries || []).map(e => ({
                    ...e,
                    calories: parseFloat(e.calories) || 0,
                    protein: parseFloat(e.protein) || 0,
                    fat: parseFloat(e.fat) || 0,
                    carbs: parseFloat(e.carbs) || 0,
                    cal100: e.cal100 !== undefined ? parseFloat(e.cal100) : null,
                    protein100: e.protein100 !== undefined ? parseFloat(e.protein100) : null,
                    fat100: e.fat100 !== undefined ? parseFloat(e.fat100) : null,
                    carbs100: e.carbs100 !== undefined ? parseFloat(e.carbs100) : null
                }));
                repairCanonicalExerciseNames(parsed);
                if(Array.isArray(parsed.exerciseDirectory)){
                  parsed.exerciseDirectory.forEach(normalizeExerciseGuideContent);
                }
                data = migrateFTrackerState(parsed);
            }
        }
    } catch(e) {}
    try { data = migrateFTrackerState(data); } catch(e) { console.warn('FTracker state migration skipped',e); }
    try { const lr = localStorage.getItem('strong_last_results'); if (lr) lastResults = JSON.parse(lr); } catch(e) {}
    applyExerciseKnowledgeMigration();
    const savedTheme = localStorage.getItem('strong_theme') || 'dark'; applyTheme(savedTheme);
    renderHome(); checkDraft(); checkExportReminder();
}

/* ---------- Automatic safety backups ----------
   Manual Import / Export remains unchanged.
   Internal rolling backups are stored in IndexedDB and never open a system dialog.
*/
const AUTO_BACKUP_DB = 'FTrackerAutoBackupV1';
const AUTO_BACKUP_STORE = 'snapshots';
const AUTO_BACKUP_LIMIT = 5;
let autoBackupDbPromise = null;
let autoBackupTimer = null;

function openAutoBackupDB(){
  if(autoBackupDbPromise) return autoBackupDbPromise;
  autoBackupDbPromise = new Promise((resolve,reject)=>{
    if(!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const r = indexedDB.open(AUTO_BACKUP_DB,1);
    r.onupgradeneeded = () => {
      if(!r.result.objectStoreNames.contains(AUTO_BACKUP_STORE)){
        const store = r.result.createObjectStore(AUTO_BACKUP_STORE,{keyPath:'id',autoIncrement:true});
        store.createIndex('createdAt','createdAt',{unique:false});
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return autoBackupDbPromise;
}

async function readAutoBackups(){
  const db=await openAutoBackupDB();
  return await new Promise((resolve,reject)=>{
    const tx=db.transaction(AUTO_BACKUP_STORE,'readonly');
    const req=tx.objectStore(AUTO_BACKUP_STORE).index('createdAt').getAll();
    req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>b.createdAt-a.createdAt));
    req.onerror=()=>reject(req.error);
  });
}

let lastAutoBackupFingerprint=null;
async function createAutoBackup(reason='Изменение данных'){
  try{
    const snapshot = JSON.parse(JSON.stringify(data));
    const fingerprint=ftStableHash(JSON.stringify(snapshot));
    if(lastAutoBackupFingerprint===fingerprint) return;
    const db = await openAutoBackupDB();
    await new Promise((resolve,reject)=>{
      const tx = db.transaction(AUTO_BACKUP_STORE,'readwrite');
      tx.objectStore(AUTO_BACKUP_STORE).add({
        createdAt:Date.now(),
        reason:String(reason||'Изменение данных'),
        schemaVersion:Number(data?.schemaVersion||FTRACKER_DATA_SCHEMA_VERSION),
        exerciseKnowledgeVersion:Number(data?.exerciseKnowledgeVersion||0),
        data:snapshot
      });
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error||new Error('Auto backup transaction aborted'));
    });

    const rows=await readAutoBackups();
    if(rows.length>AUTO_BACKUP_LIMIT){
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(AUTO_BACKUP_STORE,'readwrite');
        const store=tx.objectStore(AUTO_BACKUP_STORE);
        rows.slice(AUTO_BACKUP_LIMIT).forEach(row=>store.delete(row.id));
        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error);
      });
    }
    lastAutoBackupFingerprint=fingerprint;
    localStorage.setItem('ftracker_auto_backup_last',JSON.stringify({createdAt:Date.now(),reason:String(reason||'Изменение данных')}));
    if(document.getElementById('themeModal') && !document.getElementById('themeModal').classList.contains('hidden')) refreshAutoBackupPanel();
  }catch(e){
    console.warn('FTracker automatic backup skipped:',e);
  }
}

function scheduleAutoBackup(reason='Изменение данных'){
  clearTimeout(autoBackupTimer);
  autoBackupTimer=setTimeout(()=>{
    autoBackupTimer=null;
    createAutoBackup(reason);
  },800);
}

window.getAutoBackups=async function(){
  try{return await readAutoBackups();}
  catch(e){return [];}
};

function formatAutoBackupDate(ts){
  try{return new Date(ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
  catch(e){return '—';}
}

async function refreshAutoBackupPanel(){
  const status=document.getElementById('autoBackupStatus');
  const list=document.getElementById('autoBackupList');
  if(!status||!list) return;
  status.className='auto-backup-status';
  status.textContent='Проверяю состояние…';
  list.innerHTML='';
  try{
    const rows=await readAutoBackups();
    if(!rows.length){
      status.textContent='Автосохранение включено. Копий пока нет — первая появится после следующего сохранения данных.';
      return;
    }
    status.className='auto-backup-status ok';
    status.textContent=`Работает · сохранено ${rows.length} из ${AUTO_BACKUP_LIMIT} копий · последняя: ${formatAutoBackupDate(rows[0].createdAt)}`;
    list.innerHTML=rows.map(row=>`<div class="auto-backup-row"><div class="auto-backup-row-main"><div class="auto-backup-row-time">${escapeHtml(formatAutoBackupDate(row.createdAt))}</div><div class="auto-backup-row-reason">${escapeHtml(row.reason||'Изменение данных')}</div></div><button type="button" class="gray auto-backup-restore" onclick="restoreAutoBackup(${Number(row.id)})">Восстановить</button></div>`).join('');
  }catch(e){
    status.textContent='Автосохранение недоступно на этом устройстве.';
    console.warn('FTracker auto backup panel error',e);
  }
}

async function restoreAutoBackup(id){
  try{
    const rows=await readAutoBackups();
    const row=rows.find(x=>Number(x.id)===Number(id));
    if(!row?.data) throw new Error('Копия не найдена');
    pendingAutoBackupRestoreId=Number(id);
    openModal(document.getElementById('autoBackupRestoreConfirmModal'));
  }catch(e){
    console.error('FTracker auto backup restore prepare failed',e);
    showToast('Не удалось открыть восстановление автокопии');
  }
}

function closeAutoBackupRestoreConfirm(){
  pendingAutoBackupRestoreId=null;
  const m=document.getElementById('autoBackupRestoreConfirmModal');
  if(m && !m.classList.contains('hidden')) closeModalElement(m);
}

async function confirmAutoBackupRestore(){
  const id=pendingAutoBackupRestoreId;
  if(id==null) return;
  try{
    const rows=await readAutoBackups();
    const row=rows.find(x=>Number(x.id)===Number(id));
    if(!row?.data) throw new Error('Копия не найдена');
    closeAutoBackupRestoreConfirm();
    data=migrateFTrackerState(JSON.parse(JSON.stringify(row.data)));
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
    renderAll();
    await createAutoBackup('Восстановление из автокопии');
    closeThemeModal();
    showToast('Данные восстановлены из автокопии');
  }catch(e){
    console.error('FTracker auto backup restore failed',e);
    showToast('Не удалось восстановить автокопию');
  }finally{
    pendingAutoBackupRestoreId=null;
  }
}

function renderAll(){
  // One safe refresh entry point used after restore/import. Each renderer is
  // isolated so one optional section cannot prevent the others from updating.
  const calls=[
    ['renderHome',renderHome],
    ['renderSettings',renderSettings],
    ['renderHistory',renderHistory],
    ['renderMeasurementScreen',renderMeasurementScreen],
    ['renderExerciseDirectory',renderExerciseDirectory],
    ['renderFoodDiary',renderFoodDiary],
    ['renderFoodHistory',renderFoodHistory],
    ['renderProgressDashboard',renderProgressDashboard],
    ['renderFScoreHomeWidget',renderFScoreHomeWidget],
    ['renderFScoreAnalytics',renderFScoreAnalytics],
    ['renderDataHistoryStatus',renderDataHistoryStatus]
  ];
  calls.forEach(([name,fn])=>{try{if(typeof fn==='function')fn();}catch(e){console.warn('FTracker renderAll: '+name+' failed',e);}});
}
function saveData(showError=true, autoBackupReason='Изменение данных') {
  try {
    try { data = migrateFTrackerState(data); } catch(migrationError) { console.warn('FTracker save migration skipped',migrationError); }
    const serialized = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, serialized);
    scheduleAutoBackup(autoBackupReason);
    return true;
  } catch(e) {
    if(showError) showToast('Ошибка сохранения');
    console.error('FTracker saveData error', e);
    return false;
  }
}
function saveDraft() { if (currentProgram === null) return; localStorage.setItem(DRAFT_KEY, JSON.stringify({ programIndex: currentProgram, exerciseIndex: currentExerciseIndex, sets: workoutSets, startTime: workoutStartTime, exerciseSlots: workoutExerciseSlots, transientExercises: workoutTransientExercises, fscorePlanSnapshot: workoutPlanSnapshot })); }
function clearDraft() { localStorage.removeItem(DRAFT_KEY); document.getElementById('draftBanner').classList.add('hidden'); }
function checkDraft() { const draft = localStorage.getItem(DRAFT_KEY); if (draft) { try { const p = JSON.parse(draft); if (p.programIndex !== undefined) document.getElementById('draftBanner').classList.remove('hidden'); } catch(e) {} } }

function formatWorkoutDisplayTitle(name) {
    return String(name || 'Тренировка').replace(/^\s*Сплит\s*\d+\s*[:\-–—]\s*/i, '').trim() || 'Тренировка';
}

function resumeDraft() { const draft = localStorage.getItem(DRAFT_KEY); if (!draft) return; try { const p = JSON.parse(draft); currentProgram = p.programIndex; currentExerciseIndex = p.exerciseIndex || 0; workoutSets = p.sets || {}; workoutTransientExercises = Array.isArray(p.transientExercises) ? p.transientExercises : []; workoutPlanSnapshot = Array.isArray(p.fscorePlanSnapshot) ? p.fscorePlanSnapshot : []; const savedSlots = Array.isArray(p.exerciseSlots) ? p.exerciseSlots : []; workoutExerciseSlots = savedSlots.length ? savedSlots.map(Number).filter(ref=>Number.isInteger(ref) && (ref>=0 ? !!data.programs[currentProgram]?.exercises?.[ref] : !!workoutTransientExercises[-ref-1])) : (data.programs[currentProgram]?.exercises||[]).map((_,i)=>i).filter(i=>data.programs[currentProgram].active?.[i]); workoutStartTime = p.startTime || Date.now(); startTotalTimer(); showScreen('workoutScreen'); document.getElementById('workoutTitle').textContent = formatWorkoutDisplayTitle(data.programs[currentProgram].name); renderExerciseStrip(); renderExercise(); } catch(e) { clearDraft(); } }
function checkExportReminder() { const lastExport = localStorage.getItem(LAST_EXPORT_KEY); if (lastExport && (Date.now() - parseInt(lastExport)) > 7*24*60*60*1000) document.getElementById('exportReminder').classList.remove('hidden'); }
function closeExportReminder() { document.getElementById('exportReminder').classList.add('hidden'); }

function resetAppViewport(screenId){
  const screen=screenId ? document.getElementById(screenId) : null;
  // The active application window is now the only vertical scroll owner.
  // Never reset document/body scroll here: they are intentionally locked.
  if(screen){
    screen.scrollTop=0;
    screen.scrollLeft=0;
  }
  try{ window.scrollTo(0,0); }catch(e){}
}
function showScreen(id) {
  // Close transient overlays before changing app screens.
  if (typeof closeBackupExportPrompt === 'function') closeBackupExportPrompt();
  document.querySelectorAll('#app > div').forEach(el => { el.classList.add('hidden'); el.style.pointerEvents='none'; });
  const screen=document.getElementById(id);
  if(!screen) return;
  screen.classList.remove('hidden');
  screen.style.pointerEvents='auto';
  resetAppViewport(id);
  requestAnimationFrame(()=>{
    resetAppViewport(id);
    if(typeof window.__syncScreenHeader==='function') window.__syncScreenHeader(screen);
    if(id==='workoutScreen' && typeof window.__ftSyncWorkoutViewport==='function') window.__ftSyncWorkoutViewport();
  });
}
function goHome() { showScreen('homeScreen'); renderHome(); checkDraft(); checkExportReminder(); }

function renderHome() {
    const list = document.getElementById('programList');
    const activePrograms = data.programs.filter(p => p.programActive);
    list.classList.toggle('program-grid-many', activePrograms.length > 3);
    list.classList.toggle('program-grid-standard', activePrograms.length <= 3);
    if (activePrograms.length === 0) { list.innerHTML = '<div class="card" style="text-align:center;color:var(--subtext);">Нет активных сплитов</div>'; return; }
    list.innerHTML = activePrograms.map((p) => {
        const i = data.programs.indexOf(p);
        return `<div class="card centered-card" onclick="confirmStart(${i})" style="cursor:pointer">
            <div class="program-icon">${['💪','🔙','🦵'][i]||'🏋️'}</div>
            <div class="split-title">${escapeHtml(p.name.replace(/^Сплит\s*\d+\s*:\s*/i, ''))}</div>
            <div style="color:var(--subtext); margin-top:4px;">${p.active.filter(Boolean).length} упражнений</div>
        </div>`;
    }).join('');
    renderFScoreHomeWidget();
}


// UI state is intentionally separate from goal data.
window.__fscoreEditorOpen = window.__fscoreEditorOpen === true;

function getFScoreGoal(){
    try{
        const goal=(data&&['cut','gain','maintain','custom'].includes(data.fscoreGoal))?data.fscoreGoal:null;
        if(goal) return goal;
        const legacy=localStorage.getItem('ftracker_fscore_goal');
        return ['cut','gain','maintain','custom'].includes(legacy)?legacy:'cut';
    }catch(e){return 'cut';}
}
function makeFScoreCustomId(){ return 'cg_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7); }
function createFScoreCustomDraft(){
    const fields=(typeof getMeasurementFields==='function'?getMeasurementFields():[]);
    const latest=(key)=>{const a=(data.measurements||[]).filter(m=>Number(m[key])>0).sort((x,y)=>String(x.date).localeCompare(String(y.date)));return a.length?Number(a[a.length-1][key]):null;};
    const targets={};
    fields.forEach(f=>{const v=latest(f.key);targets[f.key]={direction:'maintain',target:'',tolerance:1,enabled:true};});
    return {id:makeFScoreCustomId(),name:'',mode:'maintain',evaluationDays:90,createdAt:null,targets,training:{target:3,period:'30',weights:{systemity:40,strength:60}},nutrition:{auto:true,calories:0,protein:0,fat:0,carbs:0,toleranceCalories:10,toleranceProtein:10,toleranceFat:10,toleranceCarbs:10},blockWeights:{body:40,training:30,nutrition:30},blockEnabled:{body:true,training:true,nutrition:true},__draft:true};
}
function getFScoreCustomGoals(){
    const fields=(typeof getMeasurementFields==='function'?getMeasurementFields():[]);
    const latest=(key)=>{const a=(data.measurements||[]).filter(m=>Number(m[key])>0).sort((x,y)=>String(x.date).localeCompare(String(y.date)));return a.length?Number(a[a.length-1][key]):null;};
    const fallbackTargets={}; fields.forEach(f=>{const v=latest(f.key);fallbackTargets[f.key]={direction:'maintain',target:v!=null?v:'',tolerance:1,enabled:true};});
    try{
        let list=Array.isArray(data.fscoreCustomGoals)?data.fscoreCustomGoals:null;
        if(!list || !list.length){
            let storedList=null; try{storedList=JSON.parse(localStorage.getItem('ftracker_fscore_custom_goals')||'null');}catch(e){}
            if(Array.isArray(storedList)&&storedList.length) list=storedList;
            const legacy=(list&&list.length)?null:(data.fscoreCustomGoal||JSON.parse(localStorage.getItem('ftracker_fscore_custom_goal')||'null'));
            list=legacy&&typeof legacy==='object'?[legacy]:[];
        }
        list=(list||[]).filter(x=>x&&typeof x==='object'&&!x.__draft).map((c,i)=>{
            const targets={};
            if(c.targets&&typeof c.targets==='object'){
                Object.keys(c.targets).forEach(k=>{const t=c.targets[k]||{};if(fields.some(f=>f.key===k))targets[k]={direction:['gain','cut','maintain'].includes(t.direction)?t.direction:'maintain',target:(Number.isFinite(Number(t.target))&&Number(t.target)>0)?Number(t.target):'',tolerance:Math.max(0,Number.isFinite(Number(t.tolerance))?Number(t.tolerance):1),enabled:t.enabled!==false};});
            }else{
                Object.assign(targets,fallbackTargets);
                if(Array.isArray(c.metrics))Object.keys(targets).forEach(k=>{if(!c.metrics.includes(k))delete targets[k];});
            }
            const bw=c.blockWeights&&typeof c.blockWeights==='object'?c.blockWeights:{};
            const nums={body:Number(bw.body),training:Number(bw.training),nutrition:Number(bw.nutrition)};
            const valid=Object.values(nums).every(Number.isFinite)&&Object.values(nums).every(v=>v>=0)&&Object.values(nums).some(v=>v>0); const rawBW=valid?{body:Math.min(100,nums.body),training:Math.min(100,nums.training),nutrition:Math.min(100,nums.nutrition)}:{body:40,training:30,nutrition:30}; const be=c.blockEnabled&&typeof c.blockEnabled==='object'?c.blockEnabled:{}; const blockEnabled={body:be.body!==false,training:be.training!==false,nutrition:be.nutrition!==false}; const normBW=normalizeFScoreBlockWeights(rawBW,blockEnabled);
            const tr=c.training&&typeof c.training==='object'?c.training:{}; const tw=tr.weights&&typeof tr.weights==='object'?tr.weights:{}; const legacyTarget=Number(tr.target); const trainingPeriod=Math.max(7,Math.min(365,Number(tr.period)||30)); const weeklyTarget=legacyTarget>7?legacyTarget*7/trainingPeriod:(Number.isFinite(legacyTarget)&&legacyTarget>0?legacyTarget:3); const legacyStrength=Number.isFinite(Number(tw.strength))?Number(tw.strength):Number(tw.working||0)+Number(tw.e1rm||0); const rawTW={systemity:Number(tw.systemity),strength:legacyStrength}; const validTW=Object.values(rawTW).every(Number.isFinite)&&Object.values(rawTW).every(v=>v>=0)&&Object.values(rawTW).some(v=>v>0); const normTW=validTW?{systemity:Math.round(rawTW.systemity/(rawTW.systemity+rawTW.strength||1)*100),strength:Math.round(rawTW.strength/(rawTW.systemity+rawTW.strength||1)*100)}:{systemity:40,strength:60}; normTW.strength+=100-(normTW.systemity+normTW.strength); const nu=c.nutrition&&typeof c.nutrition==='object'?c.nutrition:{};
            return {id:String(c.id||('cg_legacy_'+i)),name:String(c.name||'').trim().slice(0,40),mode:['gain','cut','maintain'].includes(c.mode)?c.mode:'maintain',evaluationDays:Math.max(7,Math.min(365,Number(c.evaluationDays)||90)),createdAt:Number(c.createdAt)>0?Number(c.createdAt):null,targets,training:{target:Math.max(1,Math.min(7,weeklyTarget)),period:String(trainingPeriod),weights:normTW},nutrition:{auto:nu.auto!==false,calories:Math.max(0,Number(nu.calories)||0),protein:Math.max(0,Number(nu.protein)||0),fat:Math.max(0,Number(nu.fat)||0),carbs:Math.max(0,Number(nu.carbs)||0),toleranceCalories:Math.max(0,Number.isFinite(Number(nu.toleranceCalories))?Number(nu.toleranceCalories):10),toleranceProtein:Math.max(0,Number.isFinite(Number(nu.toleranceProtein))?Number(nu.toleranceProtein):10),toleranceFat:Math.max(0,Number.isFinite(Number(nu.toleranceFat))?Number(nu.toleranceFat):10),toleranceCarbs:Math.max(0,Number.isFinite(Number(nu.toleranceCarbs))?Number(nu.toleranceCarbs):10)},blockWeights:normBW,blockEnabled};
        }).filter(c=>c.name);
        // Удаляем старую автоматически созданную заглушку «Моя цель», если существует хотя бы одна реально сохранённая пользовательская цель.
        // Это миграция старого UX: новая пустая цель больше никогда не создаётся автоматически.
        // Legacy automatic placeholder is never a real saved goal.
        list=list.filter(c=>String(c.name||'').trim()!=='Моя цель');
        return list;
    }catch(e){return [];}
}
function getFScoreCustomConfig(){
    if(window.__fscoreCustomDraft) return window.__fscoreCustomDraft;
    const list=getFScoreCustomGoals();
    const activeId=data.fscoreActiveCustomGoalId;
    return list.find(x=>x.id===activeId)||list[0]||null;
}
function persistFScoreCustomGoals(list){
    data.fscoreCustomGoals=list; data.fscoreCustomGoal=list.find(x=>x.id===data.fscoreActiveCustomGoalId)||list[0]||null;
    if(data.fscoreCustomGoal)data.fscoreActiveCustomGoalId=data.fscoreCustomGoal.id;
    else data.fscoreActiveCustomGoalId=null;
    try{localStorage.setItem('ftracker_fscore_custom_goals',JSON.stringify(list));if(data.fscoreCustomGoal)localStorage.setItem('ftracker_fscore_custom_goal',JSON.stringify(data.fscoreCustomGoal));else localStorage.removeItem('ftracker_fscore_custom_goal');}catch(e){}
    try{saveData(false,'Изменение своей цели');}catch(e){}
}
function saveFScoreCustomConfig(cfg, existingId=null){
    const list=getFScoreCustomGoals();
    const cleanName=String(cfg.name||'').trim().slice(0,40); if(!cleanName){showToast('Введите название цели');return false;}
    const existing=list.find(x=>x.id=== (existingId||cfg.id)); const createdAt=Number(existing?.createdAt)>0?Number(existing.createdAt):(Number(cfg.createdAt)>0?Number(cfg.createdAt):Date.now()); const clean={id:existingId||cfg.id||makeFScoreCustomId(),name:cleanName,mode:['gain','cut','maintain'].includes(cfg.mode)?cfg.mode:'maintain',evaluationDays:Math.max(7,Math.min(365,Number(cfg.evaluationDays)||90)),createdAt,targets:cfg.targets&&typeof cfg.targets==='object'?cfg.targets:{},training:(()=>{const tr=cfg.training&&typeof cfg.training==='object'?cfg.training:{}; const w=tr.weights&&typeof tr.weights==='object'?tr.weights:{}; const period=Math.max(7,Math.min(365,Number(tr.period)||30)); const rawTarget=Number(tr.target); const target=rawTarget>7?rawTarget*7/period:(Number.isFinite(rawTarget)&&rawTarget>0?rawTarget:3); const legacyStrength=Number.isFinite(Number(w.strength))?Number(w.strength):Number(w.working||0)+Number(w.e1rm||0); const raw={systemity:Number(w.systemity),strength:legacyStrength}; const vals=Object.values(raw).every(Number.isFinite)&&Object.values(raw).every(v=>v>=0)&&Object.values(raw).some(v=>v>0)?raw:{systemity:40,strength:60}; const sum=Object.values(vals).reduce((a,b)=>a+b,0)||100; const nw={systemity:Math.round(vals.systemity/sum*100),strength:Math.round(vals.strength/sum*100)}; nw.strength+=100-(nw.systemity+nw.strength); return {target:Math.max(1,Math.min(7,target)),period:String(period),weights:nw};})(),nutrition:{auto:cfg.nutrition?.auto!==false,calories:Math.max(0,Number(cfg.nutrition?.calories)||0),protein:Math.max(0,Number(cfg.nutrition?.protein)||0),fat:Math.max(0,Number(cfg.nutrition?.fat)||0),carbs:Math.max(0,Number(cfg.nutrition?.carbs)||0),toleranceCalories:Math.max(0,Number(cfg.nutrition?.toleranceCalories)||100),toleranceProtein:Math.max(0,Number(cfg.nutrition?.toleranceProtein)||10),toleranceFat:Math.max(0,Number(cfg.nutrition?.toleranceFat)||10),toleranceCarbs:Math.max(0,Number(cfg.nutrition?.toleranceCarbs)||15)},blockWeights:cfg.blockWeights||{body:40,training:30,nutrition:30},blockEnabled:{body:cfg.blockEnabled?.body!==false,training:cfg.blockEnabled?.training!==false,nutrition:cfg.blockEnabled?.nutrition!==false}};
    clean.blockWeights={body:Math.max(0,Math.min(100,Number(clean.blockWeights?.body)||0)),training:Math.max(0,Math.min(100,Number(clean.blockWeights?.training)||0)),nutrition:Math.max(0,Math.min(100,Number(clean.blockWeights?.nutrition)||0))};
    if(!Object.values(clean.blockEnabled).some(Boolean)) { showToast('Включите хотя бы один фактор Индекса'); return false; }
    if(!Object.keys(clean.blockEnabled).some(k=>clean.blockEnabled[k]&&clean.blockWeights[k]>0)) { showToast('Укажите вес хотя бы одного включённого фактора'); return false; }
    const idx=list.findIndex(x=>x.id===clean.id); if(idx>=0)list[idx]=clean; else list.push(clean);
    window.__fscoreCustomDraft=null;
    data.fscoreActiveCustomGoalId=clean.id; data.fscoreGoal='custom'; persistFScoreCustomGoals(list);
    renderFScoreAnalytics(); renderFScoreHomeWidget();
    return true;
}
function selectFScoreCustomGoal(id){
    const list=getFScoreCustomGoals(); const c=list.find(x=>x.id===id); if(!c)return;
    // Selecting a saved goal changes the calculation, not the editor state.
    window.__fscoreEditorOpen=false;
    window.__fscoreCustomDraft=null;
    data.fscoreActiveCustomGoalId=c.id;
    data.fscoreCustomGoal=JSON.parse(JSON.stringify(c));
    persistFScoreCustomGoals(list);
    setFScoreGoal('custom');
}
function deleteFScoreCustomGoal(id){
    const list=getFScoreCustomGoals(); const next=list.filter(x=>x.id!==id);
    if(data.fscoreActiveCustomGoalId===id){
        window.__fscoreCustomDraft=null;
        if(next.length){data.fscoreActiveCustomGoalId=next[0].id;data.fscoreGoal='custom';}
        else {data.fscoreActiveCustomGoalId=null;data.fscoreGoal='maintain';}
    }
    persistFScoreCustomGoals(next); closeModalElement(document.getElementById('fscoreCustomGoalModal')); window.__fscoreEditorOpen=false; window.__fscoreCustomDraft=null; renderFScoreAnalytics(); renderFScoreHomeWidget(); showToast('Цель удалена');
}
function addFScoreCustomGoal(){
    window.__fscoreEditorBaseGoal=data.fscoreGoal||'maintain';
    window.__fscoreEditorOpen=true;
    window.__fscoreCustomDraft=createFScoreCustomDraft();
    data.fscoreGoal='custom';
    renderFScoreCustomGoalModal();
}
function fscoreCustomModeInfo(mode){
    const map={
      gain:{text:'Профицит. Приоритет — рост веса и мышечных показателей при сохранении прогресса тренировок.'},
      cut:{text:'Дефицит. Приоритет — снижение веса с сохранением тренировочной работоспособности.'},
      maintain:{text:'Поддержание. Приоритет — удержание целевых значений тела и стабильного режима.'}
    }; return map[mode]||map.maintain;
}
function ensureFScoreCustomGoalModal(){
    let modal=document.getElementById('fscoreCustomGoalModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='fscoreCustomGoalModal';
    modal.className='hidden';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`<div class="ft-goal-editor-content fscore-goal-editor-modal-content"><div class="unified-surface-header ft-modal-header"><button class="surface-back-btn" type="button" onclick="closeFScoreCustomEditor()">← Назад</button><div class="surface-title">Настройка цели</div><span aria-hidden="true" class="surface-header-spacer"></span></div><div id="fscoreCustomGoalModalBody"></div></div>`;
    modal.addEventListener('click',e=>{if(e.target===modal)closeFScoreCustomEditor();});
    document.body.appendChild(modal);
    prepareModalRoot(modal);
    return modal;
}
function renderFScoreCustomGoalModal(){
    const modal=ensureFScoreCustomGoalModal();
    const body=document.getElementById('fscoreCustomGoalModalBody');
    if(body)body.innerHTML=renderFScoreCustomEditorMarkup();
    openModal(modal);
    // Goal editor owns one scroll container. Always open at the top so a
    // previously scrolled editor can never make the header appear displaced.
    requestAnimationFrame(()=>{
      const content=modal.querySelector('.fscore-goal-editor-modal-content');
      if(content) content.scrollTop=0;
      if(body) body.scrollTop=0;
      initFScoreTargetRows();
    });
}
function openFScoreCustomEditor(){
    const existing=getFScoreCustomConfig();
    window.__fscoreEditorBaseGoal=data.fscoreGoal||'maintain';
    window.__fscoreCustomDraft=existing?JSON.parse(JSON.stringify(existing)):createFScoreCustomDraft();
    window.__fscoreEditorOpen=true;
    data.fscoreGoal='custom';
    renderFScoreCustomGoalModal();
}
function closeFScoreCustomEditor(){
    const modal=document.getElementById('fscoreCustomGoalModal');
    const hadSaved=!!getFScoreCustomGoals().find(x=>x.id===data.fscoreActiveCustomGoalId);
    window.__fscoreEditorOpen=false;
    window.__fscoreCustomDraft=null;
    if(modal)closeModalElement(modal);
    if(!hadSaved)data.fscoreGoal=window.__fscoreEditorBaseGoal||'maintain';
    renderFScoreAnalytics();
}
function updateFScoreCustomModeInfo(){
    const select=document.getElementById('fscoreCustomMode');
    const mode=select?.value||'maintain';
    const info=fscoreCustomModeInfo(mode);
    const el=document.getElementById('fscoreCustomModeInfo');
    if(el) el.innerHTML=`<span>${escapeHtml(info.text)}</span>`;
    // Keep the draft strategy synchronized immediately, not only after Save.
    if(window.__fscoreCustomDraft) window.__fscoreCustomDraft.mode=mode;
    document.querySelectorAll('#fscoreCustomTargets .fscore-target-card').forEach(row=>{
      const direction=row.querySelector('.fscore-target-direction');
      if(!direction)return;
      if(!direction.dataset.userChanged) direction.value=mode;
      updateFScoreTargetRow(direction);
    });
}
function getFScoreMeasurementUnit(key){
    return key==='weight'?'кг':'см';
}
function formatFScoreValue(value){
    const n=Number(value);
    if(!Number.isFinite(n)) return '';
    return Number.isInteger(n)?String(n):String(Math.round(n*10)/10).replace('.',',');
}
function toggleFScoreAddTargets(btn){
    const picker=document.getElementById('fscoreAddTargetPicker');
    if(!picker)return;
    const open=picker.classList.toggle('hidden');
    if(btn){btn.setAttribute('aria-expanded',String(open));}
}
function toggleFScoreInactiveTargets(btn){
    const root=document.getElementById('fscoreCustomTargets');
    if(!root||!btn)return;
    const showing=root.dataset.showInactive==='1';
    const next=!showing;
    root.dataset.showInactive=next?'1':'0';
    // `next=true` means inactive rows are visible. When false, explicitly hide
    // unchecked rows. The previous code toggled a class that had no corresponding
    // CSS/row logic, so the button changed its label but not the list.
    root.classList.toggle('fscore-show-inactive',next);
    root.classList.toggle('fscore-hide-inactive',!next);
    root.querySelectorAll('.fscore-target-card').forEach(row=>{
      const input=row.querySelector('input.fscore-target-enabled');
      const enabled=!!input?.checked;
      row.classList.toggle('enabled',enabled);
      row.hidden=!next&&!enabled;
    });
    btn.textContent=next?'Скрыть неактивные параметры':'Показать неактивные параметры';
    btn.setAttribute('aria-expanded',next?'true':'false');
    updateFScoreTargetSummaryUI();
}

function addFScoreTargetFromPicker(key){
    const cfg=getFScoreCustomConfig();
    cfg.targets=cfg.targets||{};
    if(!cfg.targets[key]){
        const field=(getMeasurementFields()||[]).find(f=>f.key===key);
        const latest=(data.measurements||[]).filter(m=>Number(m[key])>0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        const current=latest.length?Number(latest[latest.length-1][key]):'';
        cfg.targets[key]={direction:cfg.mode||'maintain',target:current!==''?current:'',tolerance:1,enabled:true};
        saveFScoreCustomConfig(cfg,cfg.id);
    }else{
        cfg.targets[key].enabled=true;
        saveFScoreCustomConfig(cfg,cfg.id);
    }
    renderFScoreAnalytics();
    setTimeout(initFScoreTargetRows,0);
}

function updateFScoreTargetSummaryUI(){
    const root=document.getElementById('fscoreCustomTargets');
    if(!root)return;
    const rows=[...root.querySelectorAll('.fscore-target-card')];
    const active=rows.filter(row=>!!row.querySelector('.fscore-target-enabled')?.checked).length;
    const total=rows.length;
    const inactive=Math.max(0,total-active);
    const summary=root.closest('.fscore-targets-section')?.querySelector('summary em');
    if(summary) summary.textContent=''; const count=root.closest('.fscore-targets-section')?.querySelector('#fscoreTargetCount'); if(count) count.textContent=`Учитываются: ${active} из ${total}`;
    const btn=root.closest('.fscore-targets-section')?.querySelector('.fscore-inactive-toggle');
    if(btn){
        const showing=root.dataset.showInactive==='1';
        btn.textContent=showing?'Скрыть неактивные параметры':`Показать неактивные параметры${inactive?' · '+inactive:''}`;
        btn.setAttribute('aria-expanded',showing?'true':'false');
    }
}
function updateFScoreLiveIndexUI(){
    // While editing a custom goal, the draft is the source of truth. Recalculate
    // the visible Index immediately after a parameter is enabled/disabled without
    // re-rendering the editor or disturbing its scroll/open state.
    try{
        const x=fScoreData();
        const scoreText=x.availableCount?String(x.score):'—';
        const scoreStrong=document.querySelector('.fscore-score-panel .fscore-score-top strong');
        if(scoreStrong) scoreStrong.innerHTML=`${scoreText}<small>/100</small>`;
        const status=document.querySelector('.fscore-score-panel .fscore-score-top em');
        if(status) status.textContent=x.phase==='calibration'?'Сбор данных':x.status;
        const bar=document.querySelector('.fscore-score-panel .fscore-score-bar i');
        if(bar) bar.style.width=`${x.availableCount?x.score:0}%`;
        document.querySelectorAll('.fscore-composition-panel .fscore-block').forEach(block=>{
            const key=block.dataset.blockKey||block.getAttribute('data-block')||'';
            const item=x.blocks.find(v=>v.key===key);
            if(!item)return;
            const ready=item.enabled&&Number.isFinite(item.score);
            block.classList.toggle('is-ready',ready);
            block.classList.toggle('is-empty',!ready);
            const value=block.querySelector('.fscore-block-score');
            if(value) value.innerHTML=`${ready?Math.round(item.score):'—'}<small>/100</small>`;
            const meta=block.querySelector('.fscore-block-meta');
            if(meta){
                if(!item.enabled) meta.textContent='Выключено в цели';
                else if(!ready) meta.textContent='Нет данных';
                else if(key==='body') meta.textContent=`${x.bodyDataCount||0} показ.`;
                else if(key==='training') meta.textContent=`${x.training?.parts?.length||0} показ.`;
                else if(key==='nutrition') meta.textContent=`${x.nutrition?.days||0} дн.`;
            }
            const weight=block.querySelector('.fscore-block-weight');
            if(weight) weight.textContent=`${item.weight||0}% · ${ready?'участвует':'исключён'}`;
        });
        const compositionWeights=document.querySelector('.fscore-composition-panel .fscore-panel-title strong');
        if(compositionWeights) compositionWeights.textContent=`${x.weights.body}% · ${x.weights.training}% · ${x.weights.nutrition}%`;
    }catch(e){}
}
function updateFScoreTargetRow(el){
    const row=el?.closest('.fscore-target-card'); if(!row)return;
    const enabled=!!row.querySelector('.fscore-target-enabled')?.checked;
    const direction=row.querySelector('.fscore-target-direction')?.value||'maintain';
    const key=row.dataset.key||'', unit=getFScoreMeasurementUnit(key);
    row.classList.toggle('enabled',enabled);
    const targetsRoot=row.closest('#fscoreCustomTargets');
    const hiddenInactive=!!(targetsRoot?.classList.contains('fscore-hide-inactive')&&!enabled);
    row.classList.toggle('fscore-inactive-hidden',hiddenInactive);
    row.hidden=hiddenInactive;
    row.classList.toggle('is-maintain',direction==='maintain');
    // Keep the live draft synchronized with the checkbox. This makes the editor
    // count and the Index use the same selection before Save is pressed.
    if(window.__fscoreCustomDraft?.targets?.[key]){
        window.__fscoreCustomDraft.targets[key].enabled=enabled;
        window.__fscoreCustomDraft.targets[key].direction=direction;
    }
    const targetCell=row.querySelector('.fscore-target-value-cell.target');
    const toleranceCell=row.querySelector('.fscore-target-value-cell.tolerance');
    targetCell?.classList.remove('hidden');
    toleranceCell?.classList.toggle('hidden',direction!=='maintain');
    const visibleTarget=row.querySelector('.fscore-target-value');
    const target=Number(visibleTarget?.value);
    const tolInput=row.querySelector('.fscore-target-tolerance');
    const tolerance=Math.max(0,Number(tolInput?.value)||0);
    const corridor=row.querySelector('.fscore-target-corridor');
    if(corridor){
        if(direction==='maintain'&&Number.isFinite(target)&&target>0) corridor.textContent=`Коридор: ${formatFScoreValue(target-tolerance)}–${formatFScoreValue(target+tolerance)} ${unit}`;
        else if(direction==='maintain') corridor.textContent='Задайте центр и допуск';
        else corridor.textContent='Фиксированная цель — допуск не используется';
    }
    updateFScoreTargetSummaryUI();
    updateFScoreLiveIndexUI();
}
function initFScoreTargetRows(){
    document.querySelectorAll('#fscoreCustomTargets .fscore-target-card').forEach(r=>updateFScoreTargetRow(r.querySelector('.fscore-target-enabled')));
    updateFScoreCustomModeInfo();toggleFScoreNutritionMode();updateFScorePeriodUI();updateFScoreWeightTotal();
}
function setFScorePeriodPreset(days){
    const value=Math.max(7,Math.min(365,Number(days)||90));
    const input=document.getElementById('fscoreCustomEvaluationDays');
    if(input) input.value=value;
    const mode=document.getElementById('fscoreCustomPeriodMode');
    if(mode) mode.value='preset';
    if(window.__fscoreCustomDraft) window.__fscoreCustomDraft.evaluationDays=value;
    updateFScorePeriodUI();
}
function setFScoreCustomPeriodMode(mode){
    const next=mode==='custom'?'custom':'preset';
    const select=document.getElementById('fscoreCustomPeriodMode');
    if(select) select.value=next;
    if(window.__fscoreCustomDraft && next==='custom'){
      const input=document.getElementById('fscoreCustomEvaluationDays');
      window.__fscoreCustomDraft.evaluationDays=Math.max(7,Math.min(365,Number(input?.value)||90));
    }
    updateFScorePeriodUI();
}
function updateFScoreEvaluationDaysFromUI(){
    const input=document.getElementById('fscoreCustomEvaluationDays');
    if(!input)return;
    const value=Math.max(7,Math.min(365,Number(input.value)||90));
    input.value=value;
    if(window.__fscoreCustomDraft) window.__fscoreCustomDraft.evaluationDays=value;
    updateFScorePeriodUI();
}
function updateFScorePeriodUI(){
    const input=document.getElementById('fscoreCustomEvaluationDays');if(!input)return;
    const mode=document.getElementById('fscoreCustomPeriodMode')?.value||'preset';
    const custom=mode==='custom';
    document.getElementById('fscoreCustomPeriodInputWrap')?.classList.toggle('hidden',!custom);
    document.querySelectorAll('.fscore-period-preset').forEach(b=>b.classList.toggle('active',!custom&&Number(b.dataset.days)===Number(input.value)));
    document.querySelector('.fscore-period-custom-btn')?.classList.toggle('active',custom);
}

function toggleFScoreNutritionMode(){
    const manual=document.getElementById('fscoreCustomNutritionAuto')?.value==='manual';
    document.querySelectorAll('.fscore-manual-nutrition').forEach(el=>el.classList.toggle('hidden',!manual));
    const hint=document.getElementById('fscoreNutritionSourceHint');
    if(hint)hint.textContent=manual?'Вы сами задаёте цели и допустимые диапазоны ниже.':'Используются текущие автоматически рассчитанные лимиты FTracker для выбранного типа цели.';
}
function normalizeFScoreBlockWeights(raw,enabled){
    const keys=['body','training','nutrition'];
    const clean=Object.fromEntries(keys.map(k=>[k,Math.max(0,Math.min(100,Number(raw?.[k])||0))]));
    const active=keys.filter(k=>enabled?.[k]);
    if(!active.length)return clean;
    const sum=active.reduce((s,k)=>s+clean[k],0);
    if(sum<=0){
        const base=Math.floor(100/active.length), remainder=100-base*active.length;
        active.forEach((k,i)=>clean[k]=base+(i===active.length-1?remainder:0));
        return clean;
    }
    let used=0;
    active.forEach((k,i)=>{
        if(i===active.length-1){clean[k]=100-used;}
        else {clean[k]=Math.round(clean[k]/sum*100);used+=clean[k];}
    });
    return clean;
}
function updateFScoreWeightTotal(){
    const keys=['body','training','nutrition'];
    const raw=Object.fromEntries(keys.map(k=>{const id=`fscoreCustom${k[0].toUpperCase()+k.slice(1)}Weight`;const v=Number(document.getElementById(id)?.value)||0;return [k,Math.max(0,Math.min(100,v))];}));
    const enabled=Object.fromEntries(keys.map(k=>[k,!!document.getElementById(`fscoreCustom${k[0].toUpperCase()+k.slice(1)}Enabled`)?.checked]));
    const normalized=normalizeFScoreBlockWeights(raw,enabled);
    keys.forEach(k=>{const input=document.getElementById(`fscoreCustom${k[0].toUpperCase()+k.slice(1)}Weight`);if(input&&enabled[k])input.value=normalized[k];});
    const activeSum=keys.reduce((sum,k)=>sum+(enabled[k]?normalized[k]:0),0);
    const el=document.getElementById('fscoreCustomWeightTotal');
    if(el) el.textContent=activeSum===100?'Сумма: 100%':'Выберите фактор';
    const draft=window.__fscoreCustomDraft;
    if(draft){ draft.blockWeights=normalized; draft.blockEnabled=enabled; }
}
function rebalanceFScoreWeights(changedKey){
    // The edited field is authoritative. Only the OTHER enabled factors are
    // allowed to move so a user can enter an exact target such as 70/15/15.
    const keys=['body','training','nutrition'];
    const ids=Object.fromEntries(keys.map(k=>[k,`fscoreCustom${k[0].toUpperCase()+k.slice(1)}Weight`]));
    const enabled=Object.fromEntries(keys.map(k=>[k,!!document.getElementById(`fscoreCustom${k[0].toUpperCase()+k.slice(1)}Enabled`)?.checked]));
    const changedInput=document.getElementById(ids[changedKey]); if(!changedInput)return;
    const changed=Math.max(0,Math.min(100,Number(changedInput.value)||0));
    changedInput.value=changed;
    const others=keys.filter(k=>k!==changedKey&&enabled[k]);
    const remaining=100-changed;
    if(others.length){
        const old=others.map(k=>Math.max(0,Number(document.getElementById(ids[k])?.value)||0));
        const sum=old.reduce((a,b)=>a+b,0);
        let used=0;
        others.forEach((k,i)=>{
            const input=document.getElementById(ids[k]);
            if(!input)return;
            if(i===others.length-1) input.value=remaining-used;
            else {
                const value=sum>0?Math.round(remaining*old[i]/sum):Math.round(remaining/others.length);
                input.value=value; used+=value;
            }
        });
    }
    updateFScoreWeightTotal();
    updateFScoreLiveIndexUI();
}
function toggleFScoreFactor(key){
    const keys=['body','training','nutrition'];
    const ids={body:'fscoreCustomBodyEnabled',training:'fscoreCustomTrainingEnabled',nutrition:'fscoreCustomNutritionEnabled'};
    const checkbox=document.getElementById(ids[key]); if(!checkbox)return;
    const all=keys.map(k=>document.getElementById(ids[k]));
    if(!all.some(el=>el?.checked)){checkbox.checked=true;showToast('Хотя бы один фактор должен оставаться включённым');return;}
    const weightIds=Object.fromEntries(keys.map(k=>[k,`fscoreCustom${k[0].toUpperCase()+k.slice(1)}Weight`]));
    const inputs=Object.fromEntries(keys.map(k=>[k,document.getElementById(weightIds[k])]));
    const read=()=>Object.fromEntries(keys.map(k=>[k,Math.max(0,Math.min(100,Number(inputs[k]?.value)||0))]));
    const weights=read();
    window.__fscoreFactorSnapshots=window.__fscoreFactorSnapshots||{};
    if(!checkbox.checked){
        // Remember the exact pre-toggle state so re-enabling can restore it.
        window.__fscoreFactorSnapshots[key]={...weights};
        const others=keys.filter(k=>k!==key&&document.getElementById(ids[k])?.checked);
        const removed=weights[key], sum=others.reduce((s,k)=>s+weights[k],0);
        let used=0;
        others.forEach((k,i)=>{
            const input=inputs[k]; if(!input)return;
            if(i===others.length-1) input.value=100-used;
            else {
                const value=sum>0?Math.round((weights[k]+removed*weights[k]/sum)):Math.round((100-removed)/others.length);
                input.value=Math.max(0,value); used+=input.value;
            }
        });
    }else{
        const snapshot=window.__fscoreFactorSnapshots[key];
        if(snapshot && keys.every(k=>Number.isFinite(Number(snapshot[k])))){
            keys.forEach(k=>{if(inputs[k])inputs[k].value=Math.max(0,Math.min(100,Number(snapshot[k])||0));});
        }else{
            // No snapshot: give the newly enabled factor its current stored
            // weight and take that amount proportionally from active factors.
            const desired=weights[key];
            const others=keys.filter(k=>k!==key&&document.getElementById(ids[k])?.checked);
            const sum=others.reduce((s,k)=>s+weights[k],0);
            inputs[key].value=Math.min(100,desired);
            const remaining=100-Math.min(100,desired);
            let used=0;
            others.forEach((k,i)=>{
                if(i===others.length-1) inputs[k].value=remaining-used;
                else {const value=sum>0?Math.round(remaining*weights[k]/sum):Math.round(remaining/others.length);inputs[k].value=value;used+=value;}
            });
        }
        delete window.__fscoreFactorSnapshots[key];
    }
    const weightInput=inputs[key]; if(weightInput)weightInput.disabled=!checkbox.checked;
    updateFScoreWeightTotal(); updateFScoreLiveIndexUI();
}
function rebalanceFScoreTrainingWeights(changedKey){
    const ids={systemity:'fscoreCustomTrainingSystemityWeight',strength:'fscoreCustomTrainingStrengthWeight'};
    const keys=Object.keys(ids), inputs=Object.fromEntries(keys.map(k=>[k,document.getElementById(ids[k])]));
    if(!inputs[changedKey])return;
    const changed=Math.max(0,Math.min(100,Number(inputs[changedKey].value)||0)); inputs[changedKey].value=changed;
    const others=keys.filter(k=>k!==changedKey), remaining=100-changed, old=others.map(k=>Math.max(0,Number(inputs[k].value)||0)), sum=old.reduce((a,b)=>a+b,0);
    if(!sum){ inputs[others[0]].value=Math.round(remaining/2); inputs[others[1]].value=remaining-Number(inputs[others[0]].value); }
    else { const vals=old.map(v=>remaining*v/sum); inputs[others[0]].value=Math.round(vals[0]); inputs[others[1]].value=remaining-Number(inputs[others[0]].value); }
    const draft=window.__fscoreCustomDraft; if(draft){ draft.training=draft.training||{}; draft.training.weights={}; keys.forEach(k=>draft.training.weights[k]=Math.max(0,Number(inputs[k].value)||0)); }
    updateFScoreTrainingWeightTotal(); updateFScoreLiveIndexUI();
}
function updateFScoreTrainingWeightTotal(){
    const ids={systemity:'fscoreCustomTrainingSystemityWeight',strength:'fscoreCustomTrainingStrengthWeight'};
    const total=Object.values(ids).reduce((a,id)=>a+Math.max(0,Number(document.getElementById(id)?.value)||0),0);
    const el=document.getElementById('fscoreCustomTrainingWeightTotal'); if(el){el.textContent=`${total}%`;el.classList.toggle('is-valid',total===100);}
}
function saveFScoreCustomFromUI(){
    const current=getFScoreCustomConfig();
    const name=(document.getElementById('fscoreCustomName')?.value||'').trim();
    if(!name){showToast('Введите название цели');return;}
    const mode=document.getElementById('fscoreCustomMode')?.value||'maintain';
    const targets={};
    document.querySelectorAll('#fscoreCustomTargets .fscore-target-card').forEach(row=>{const key=row.dataset.key,enabled=!!row.querySelector('.fscore-target-enabled')?.checked;if(!key)return;const direction=row.querySelector('.fscore-target-direction')?.value||'maintain',targetInputs=[...row.querySelectorAll('.fscore-target-value')],targetInput=targetInputs.find(i=>!i.closest('.hidden'))||targetInputs[0],target=Number(targetInput?.value),tolInputs=[...row.querySelectorAll('.fscore-target-tolerance')],tolInput=tolInputs.find(i=>i.type!=='hidden')||tolInputs[0],tolerance=Math.max(0,Number(tolInput?.value)||0);targets[key]={direction,target:(Number.isFinite(target)&&target>0)?target:'',tolerance,enabled};});
    if(!Object.keys(targets).length){showToast('Добавьте хотя бы один параметр тела');return;}
    if(!Object.values(targets).some(t=>t.enabled!==false)){showToast('Включите хотя бы один параметр для расчёта Индекса');return;}
    const rawBlockWeights={body:Math.max(0,Math.min(100,Number(document.getElementById('fscoreCustomBodyWeight')?.value)||0)),training:Math.max(0,Math.min(100,Number(document.getElementById('fscoreCustomTrainingWeight')?.value)||0)),nutrition:Math.max(0,Math.min(100,Number(document.getElementById('fscoreCustomNutritionWeight')?.value)||0))}; const blockEnabled={body:!!document.getElementById('fscoreCustomBodyEnabled')?.checked,training:!!document.getElementById('fscoreCustomTrainingEnabled')?.checked,nutrition:!!document.getElementById('fscoreCustomNutritionEnabled')?.checked}; if(!Object.values(blockEnabled).some(Boolean)){showToast('Включите хотя бы один фактор Индекса');return;} const bw=normalizeFScoreBlockWeights(rawBlockWeights,blockEnabled); if(!Object.keys(blockEnabled).some(k=>blockEnabled[k]&&bw[k]>0)){showToast('Укажите вес хотя бы одного включённого фактора');return;}
    const trainingTarget=Math.max(1,Math.min(7,Number(document.getElementById('fscoreCustomTrainingTarget')?.value)||3)),trainingPeriod=Math.max(7,Math.min(365,Number(document.getElementById('fscoreCustomTrainingPeriod')?.value)||30)),trainingWeights={systemity:Math.max(0,Number(document.getElementById('fscoreCustomTrainingSystemityWeight')?.value)||0),strength:Math.max(0,Number(document.getElementById('fscoreCustomTrainingStrengthWeight')?.value)||0)},trainingWeightSum=Object.values(trainingWeights).reduce((a,b)=>a+b,0); if(trainingWeightSum<=0){showToast('Укажите вес хотя бы для одного показателя тренировки');return;} Object.keys(trainingWeights).forEach(k=>trainingWeights[k]=Math.round(trainingWeights[k]/trainingWeightSum*100)); trainingWeights.strength+=(100-Object.values(trainingWeights).reduce((a,b)=>a+b,0)); const evaluationDays=Math.max(7,Math.min(365,Number(document.getElementById('fscoreCustomEvaluationDays')?.value)||90));
    const nutrition={auto:document.getElementById('fscoreCustomNutritionAuto')?.value!=='manual',calories:Math.max(0,Number(document.getElementById('fscoreCustomCalories')?.value)||0),protein:Math.max(0,Number(document.getElementById('fscoreCustomProtein')?.value)||0),fat:Math.max(0,Number(document.getElementById('fscoreCustomFat')?.value)||0),carbs:Math.max(0,Number(document.getElementById('fscoreCustomCarbs')?.value)||0),toleranceCalories:Math.max(0,Number(document.getElementById('fscoreCustomCalTol')?.value)||0),toleranceProtein:Math.max(0,Number(document.getElementById('fscoreCustomProteinTol')?.value)||0),toleranceFat:Math.max(0,Number(document.getElementById('fscoreCustomFatTol')?.value)||0),toleranceCarbs:Math.max(0,Number(document.getElementById('fscoreCustomCarbsTol')?.value)||0)};
    if(!nutrition.auto && !(nutrition.calories||nutrition.protein||nutrition.fat||nutrition.carbs)){showToast('Для ручного режима задайте хотя бы одну цель КБЖУ');return;}
    if(!Object.keys(blockEnabled).some(k=>blockEnabled[k]&&bw[k]>0)){
        showToast('Укажите вес хотя бы одного включённого фактора');
        return;
    }
    const saved=saveFScoreCustomConfig(
        {id:current?.id,name,mode,evaluationDays,targets,training:{target:trainingTarget,period:trainingPeriod,weights:trainingWeights},nutrition,blockWeights:bw,blockEnabled},
        current?.__draft?null:current?.id
    );
    if(saved===false) return;
    window.__fscoreEditorOpen=false;
    window.__fscoreCustomDraft=null;
    closeModalElement(document.getElementById('fscoreCustomGoalModal'));
    showToast('Своя цель сохранена');
}
function fScoreCustomBody(cfg,startAt=null){
    const targets=cfg?.targets||{}, parts=[], details=[];
    const periodDays=Math.max(7,Math.min(365,Number(cfg?.evaluationDays)||90));
    const now=Date.now(), start=Math.max(now-periodDays*86400000,Number(startAt)||0), mid=Math.max(now-Math.ceil(periodDays/2)*86400000, start);
    const avg=(a)=>a.length?a.reduce((z,x)=>z+x.value,0)/a.length:null;
    Object.entries(targets).forEach(([key,t])=>{
        if(t?.enabled===false)return;
        const series=fScoreConfirmedSeries(key); if(!series.length)return;
        const target=Number(t?.target), direction=['gain','cut','maintain'].includes(t?.direction)?t.direction:'maintain';
        const tolerance=Math.max(.01,Number.isFinite(Number(t?.tolerance))?Number(t.tolerance):1);
        if(!Number.isFinite(target)||target<=0)return;
        const previous=series.filter(x=>x.date>=start&&x.date<mid);
        const currentRows=series.filter(x=>x.date>=mid&&x.date<=now);
        // Comparisons use only measurements inside the selected evaluation window.
        const previousValue=avg(previous), current=avg(currentRows);
        if(!Number.isFinite(current))return;
        const hasComparison=Number.isFinite(previousValue);
        const change=hasComparison?current-previousValue:0;
        let score=70,status='Недостаточно точек внутри периода для полного сравнения',progress=0;
        if(direction==='maintain'){
            const zone=Math.abs(current-target);
            const zoneScore=fScoreClamp(100-(zone/tolerance)*100);
            const stabilityScore=hasComparison?fScoreClamp(100-(Math.abs(change)/tolerance)*45):80;
            score=.7*zoneScore+.3*stabilityScore;
            progress=score;
            status=zone<=tolerance?'В пределах коридора':hasComparison?'Вне коридора — учитывается текущая динамика':'Вне коридора';
        }else{
            const reached=direction==='gain'?current>=target:current<=target;
            if(reached){
                // Reaching the target is excellent, but overshooting it indefinitely
                // must not remain a permanent 100. Once the target is passed by more
                // than the configured tolerance, the score gradually falls.
                const overshoot=direction==='gain'?current-target:target-current;
                const buffer=Math.max(tolerance,Math.abs(target)*0.005);
                if(overshoot<=buffer){
                    score=100; progress=100; status='Цель достигнута';
                }else{
                    const excessRatio=(overshoot-buffer)/Math.max(buffer,0.01);
                    score=fScoreClamp(100-excessRatio*28,55,100);
                    progress=100;
                    status='Цель достигнута · контролируйте отклонение';
                }
            }
            else if(hasComparison){
                const prevGap=Math.abs(target-previousValue), currGap=Math.abs(target-current);
                const improvement=(prevGap-currGap)/Math.max(prevGap,tolerance);
                const directionGood=direction==='gain'?change>0:change<0;
                const trendScore=directionGood?fScoreClamp(70+Math.max(0,improvement)*30):fScoreClamp(60-Math.abs(improvement)*35);
                score=trendScore;progress=fScoreClamp(Math.max(0,improvement)*100);
                status=directionGood?'Текущая половина периода движется к цели':'Текущая половина периода движется от цели';
            }else{
                score=70;progress=0;status='Есть текущая точка, но недостаточно данных для сравнения половин периода';
            }
        }
        score=fScoreClamp(score);
        parts.push(score);
        details.push({key,score,current,previous:previousValue,periodChange:change,target,direction,tolerance,progress,days:periodDays,status,count:series.length,comparison:hasComparison});
    });
    if(!parts.length)return {score:null,available:false,parts:[],details:[],periodDays};
    const aggregate=parts.reduce((a,b)=>a+b,0)/parts.length;
    return {score:fScoreClamp(aggregate),available:true,parts,details,periodDays};
}
function setFScoreGoal(goal){
    if(!['cut','gain','maintain','custom'].includes(goal)) return;
    if(goal==='custom' && !getFScoreCustomGoals().length){ openFScoreCustomEditor(); return; }
    const previousGoal=getFScoreGoal();
    data.fscoreGoal=goal;
    try{localStorage.setItem('ftracker_fscore_goal',goal);}catch(e){}

    // КРИТИЧНО: цель и дневные лимиты КБЖУ — одна система.
    // При смене цели все автоматически созданные лимиты должны сразу
    // пересчитаться. Старые значения 2500/БЖУ не могут оставаться от
    // предыдущей цели. Ручные лимиты (autoGoal:false) сохраняем как осознанный override.
    data.foodDiary=data.foodDiary||{limits:{},entries:[]};
    data.foodDiary.limits=data.foodDiary.limits||{};
    const foodDate=document.getElementById('foodDate')?.value || localDateString(new Date());
    const dates=new Set([foodDate,localDateString(new Date())]);
    Object.entries(data.foodDiary.limits).forEach(([date,limit])=>{
        if(!limit || limit.autoGoal || limit.goal===previousGoal || limit.goal!==goal && limit.autoGoal!==false) dates.add(date);
    });
    // Также создаём новый автолимит для дней с записями за последние 30 дней,
    // если пользователь не задавал их вручную.
    (data.foodDiary.entries||[]).forEach(e=>{
        const date=String(e?.date||'');
        const t=new Date(date+'T12:00:00').getTime();
        if(date && Number.isFinite(t) && Date.now()-t<=30*86400000){
            const saved=data.foodDiary.limits[date];
            if(!saved || saved.autoGoal) dates.add(date);
        }
    });
    dates.forEach(date=>{
        const saved=data.foodDiary.limits[date];
        if(!saved || saved.autoGoal){ syncGoalFoodLimit(date); }
    });

    saveData(false,'Смена цели: автоматически пересчитаны лимиты КБЖУ');
    renderFScoreAnalytics(); renderFScoreHomeWidget();
    if(typeof renderFoodDiary==='function'){
        const active=document.getElementById('foodDate');
        if(active && !active.value) active.value=foodDate;
        renderFoodDiary();
        if(typeof renderFoodHistory==='function') renderFoodHistory();
    }
    showToast(`Цель «${getGoalNutritionLabel(goal)}»: лимиты КБЖУ пересчитаны`);
}

function fScoreAllTimeDays(){
    const dates=[];
    (data.history||[]).forEach(e=>{const t=new Date(e?.date).getTime();if(Number.isFinite(t))dates.push(t);});
    (data.measurements||[]).forEach(e=>{const t=new Date(e?.date).getTime();if(Number.isFinite(t))dates.push(t);});
    (data.foodDiary?.entries||[]).forEach(e=>{const t=new Date(String(e?.date||'')+'T12:00:00').getTime();if(Number.isFinite(t))dates.push(t);});
    const first=dates.length?Math.min(...dates):Date.now();
    return Math.max(7,Math.ceil((Date.now()-first)/86400000)+1);
}
function fScoreClamp(v,min=0,max=100){
    v=Number(v);
    if(!Number.isFinite(v)) return null;
    min=Number.isFinite(Number(min))?Number(min):0;
    max=Number.isFinite(Number(max))?Number(max):100;
    if(min>max){const t=min;min=max;max=t;}
    return Math.max(min,Math.min(max,v));
}
function fScoreRecent(history,daysStart,daysEnd=0,startAt=null){
    const now=Date.now(),lo=Math.max(now-daysStart*86400000,Number(startAt)||0),hi=daysEnd?now-daysEnd*86400000:now;
    return history.filter(e=>{const t=new Date(e.date).getTime();return Number.isFinite(t)&&t>=lo&&t<hi&&(!startAt||t>=Number(startAt));});
}
function fScorePct(a,b){a=Number(a);b=Number(b);return Number.isFinite(a)&&Number.isFinite(b)&&a!==0?(b-a)/Math.abs(a)*100:null;}
function fScoreDates(rows){return rows.map(x=>new Date(x.date).getTime()).filter(Number.isFinite).sort((a,b)=>a-b);}
function fScoreFrequency(count, periodDays=30){
    // Frequency is evaluated as a weekly habit, not as a fixed session quota.
    // A normal 2–4 sessions/week range should not be penalized; higher frequency
    // is not treated as worse training by itself.
    count=Math.max(0,Number(count)||0);
    periodDays=Math.max(7,Number(periodDays)||30);
    const weekly=count*7/periodDays;
    if(weekly>=2&&weekly<=5)return 100;
    if(weekly<2)return fScoreClamp(weekly/2*100);
    return 100;
}
function fScoreDistribution(history){
    const d=fScoreDates(history); if(!d.length)return null;
    if(d.length===1)return 65;
    let maxGap=0;for(let i=1;i<d.length;i++)maxGap=Math.max(maxGap,(d[i]-d[i-1])/86400000);
    const score=maxGap<=5?100:maxGap<=7?96:maxGap<=10?88:maxGap<=14?76:maxGap<=21?58:maxGap<=30?40:20;
    return {score,maxGap};
}
function fScoreTrainingConsistency(recent,previous,periodDays=90){
    if(!recent.length)return {score:null,frequency:null,distribution:null,count:0,periodDays,previousWindowDays:periodDays};
    const frequency=fScoreFrequency(recent.length,periodDays);
    const distribution=fScoreDistribution(recent);
    // The previous window is exactly the immediately preceding window of the
    // same length. This remains true when the custom evaluation period changes.
    const prevFreq=previous.length?fScoreFrequency(previous.length,periodDays):null;
    let current=.60*frequency+.40*(distribution?distribution.score:65);
    if(prevFreq!=null) current=.80*current+.20*prevFreq;
    return {score:fScoreClamp(current),frequency,distribution,count:recent.length,periodDays,previousWindowDays:periodDays};
}
function fScoreMeasurementSeries(key){
    return (data.measurements||[]).map(m=>({date:new Date(m.date).getTime(),value:Number(m[key])})).filter(x=>Number.isFinite(x.date)&&Number.isFinite(x.value)&&x.value>0).sort((a,b)=>a.date-b.date);
}
function fScoreConfirmedSeries(key){
    const a=fScoreMeasurementSeries(key); if(a.length<3)return a;
    // Isolated jump that immediately returns is treated as an unconfirmed anomaly.
    return a.filter((x,i)=>{
        if(i===0||i===a.length-1)return true;
        const p=a[i-1],n=a[i+1];
        const jump=Math.abs(fScorePct(p.value,x.value)||0),back=Math.abs(fScorePct(x.value,n.value)||0);
        return !(jump>3&&back>3&&Math.abs(fScorePct(p.value,n.value)||0)<1.5);
    });
}
function fScoreEMA(arr,period){
    if(!arr.length)return [];
    const alpha=2/(period+1);let ema=arr[0].value;
    return arr.map((x,i)=>{if(i)ema=alpha*x.value+(1-alpha)*ema;return {...x,ema};});
}
function fScoreMeasurementTrend(key,periodDays=90,startAt=null){
    const all=fScoreConfirmedSeries(key);
    const cutoff=Math.max(Date.now()-Math.max(14,Number(periodDays)||90)*86400000,Number(startAt)||0);
    const raw=all.filter(x=>x.date>=cutoff&&(!startAt||x.date>=Number(startAt)));
    if(raw.length<2)return null;
    const sorted=raw.slice().sort((a,b)=>a.date-b.date);
    const median=arr=>{const v=arr.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;};
    let speed=0, rawChange=0;
    if(sorted.length>=4){
        const slopes=[];
        for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
            const dt=(sorted[j].date-sorted[i].date)/86400000;
            if(dt>0)slopes.push((sorted[j].value-sorted[i].value)/dt);
        }
        const slope=median(slopes);
        const baseline=median(sorted.slice(0,Math.min(3,sorted.length)).map(x=>x.value));
        const days=Math.max(1,(sorted[sorted.length-1].date-sorted[0].date)/86400000);
        rawChange=baseline>0&&Number.isFinite(slope)?slope*days/baseline*100:0;
        speed=baseline>0&&Number.isFinite(slope)?slope/baseline*100*7:0;
    }else{
        const first=sorted[0],last=sorted[sorted.length-1];
        const days=Math.max(1,(last.date-first.date)/86400000);
        rawChange=fScorePct(first.value,last.value)||0;
        speed=rawChange/(days/7);
    }
    const dead=key==='weight'?1.0:key==='waist'?1.0:1.5;
    const meaningful=Math.abs(rawChange)>dead;
    const change=meaningful?rawChange:0;
    return {change,rawChange,speed:meaningful?speed:0,days:Math.max(1,(sorted[sorted.length-1].date-sorted[0].date)/86400000),count:sorted.length,meaningful,method:sorted.length>=4?'robust-date-trend':'endpoint-trend'};
}
function fScoreRateScore(goal,speed){
    const a=Math.abs(speed);
    if(goal==='gain'){
        if(speed<0)return fScoreClamp(55-a*32);
        if(speed<.15)return 62+speed*170;
        if(speed<=.55)return 100;
        if(speed<=1)return 100-(speed-.55)*75;
        return fScoreClamp(66-(speed-1)*36);
    }
    if(goal==='cut'){
        if(speed>0)return fScoreClamp(55-speed*38);
        if(a<.25)return 62+a*150;
        if(a<=1)return 100;
        if(a<=1.5)return 100-(a-1)*70;
        return fScoreClamp(65-(a-1.5)*36);
    }
    return a<=.3?100:a<=.5?fScoreClamp(100-(a-.3)*60):a<=1?fScoreClamp(88-(a-.5)*70):fScoreClamp(53-(a-1)*30);
}
function fScoreOtherMeasurements(goal,periodDays=90,startAt=null){
    const fields=getMeasurementFields().filter(f=>!['weight','waist'].includes(f.key));
    const vals=fields.map(f=>fScoreMeasurementTrend(f.key,periodDays,startAt)).filter(Boolean);
    if(!vals.length)return null;
    const scores=vals.map(t=>{
        const c=t.change;
        if(goal==='gain') return c>0?fScoreClamp(78+c*16):fScoreClamp(82+c*18);
        // На сушке небольшая погрешность допустима, но подтверждённая потеря
        // нескольких мышечных объёмов должна заметно снижать качество сушки.
        if(goal==='cut') return c>=-1.0?100:fScoreClamp(100-(Math.abs(c)-1.0)*32);
        // Поддержание: любое устойчивое направление хуже стабильности.
        return Math.abs(c)<=1.0?100:fScoreClamp(100-(Math.abs(c)-1.0)*30);
    });
    const losses=vals.filter(t=>t.change<=-2).length;
    const avg=scores.reduce((a,b)=>a+b,0)/scores.length;
    return {score:avg,losses,count:vals.length,vals};
}
function fScoreBody(goal,periodDays=90,startAt=null){
    const weight=fScoreMeasurementTrend('weight',periodDays,startAt),waist=fScoreMeasurementTrend('waist',periodDays,startAt),otherData=fScoreOtherMeasurements(goal,periodDays,startAt),other=otherData?otherData.score:null;
    const configured=goal==='gain'?{weight:30,waist:10,other:60}:goal==='cut'?{weight:25,waist:35,other:40}:{weight:35,waist:25,other:40};
    const parts=[];
    if(weight)parts.push({score:fScoreRateScore(goal,weight.speed),weight:configured.weight,name:'Вес'});
    if(waist){
        let score;
        if(goal==='cut'){const ws=waist.speed;if(ws>=0)score=ws===0?82:fScoreClamp(82-ws*20);else{const a=Math.abs(ws);score=a<=1?100:fScoreClamp(100-(a-1)*15,70,100);}}
        else if(goal==='gain'){const s=waist.speed;score=s<=.2?100:s<=.4?90:s<=.6?75:s<=1?55:fScoreClamp(55-(s-1)*35);}
        else score=Math.abs(waist.speed)<=.3?100:Math.abs(waist.speed)<=.5?88:fScoreClamp(88-(Math.abs(waist.speed)-.5)*70);
        parts.push({score,weight:configured.waist,name:'Талия'});
    }
    if(other!=null){
        // Sparse "other measurements" must not dominate the body score.
        // Their configured weight is capped by data density, then redistributed
        // among the parameters that actually have evidence.
        const n=Number(otherData?.count)||0;
        const effectiveOther=Math.min(configured.other, n>=3?configured.other: n===2?25:15);
        parts.push({score:other,weight:effectiveOther,name:'Остальные замеры'});
    }
    if(!parts.length)return {score:null,available:false,weight,waist,other,otherData};
    const total=parts.reduce((a,p)=>a+p.weight,0);
    // Each body signal is scored once through its configured component weight.
    // Do not apply a second penalty for the same measurement direction here.
    const score=parts.reduce((a,p)=>a+p.score*p.weight,0)/total;
    return {score:fScoreClamp(score),available:true,weight,waist,other,otherData};
}
function fScoreWorkingWeightTrend(history,periodDays=90,goal='maintain',startAt=null){
    const now=Date.now(),days=Math.max(7,Number(periodDays)||90),start=Math.max(now-days*86400000,Number(startAt)||0),mid=now-Math.ceil(days/2)*86400000,by={};
    // Working weight is deliberately NOT the heaviest set of a workout.
    // Use the canonical working-result rule: same weight, at least 3 sets,
    // and at least 6 reps per set. This keeps the signal about regular work
    // rather than one-off PR attempts and avoids duplicating the e1RM signal.
    (history||[]).forEach(e=>{
        const date=new Date(e.date).getTime();
        if(!Number.isFinite(date)||date<start||date>now)return;
        (e.exercises||[]).forEach(ex=>{
            const name=String(ex?.name||'').trim();
            if(!name || (ex.type && ex.type!=='strength')) return;
            const result=getWorkingResultFromEntry(e,name);
            if(!result || !(Number(result.weight)>0)) return;
            (by[name]||(by[name]=[])).push({date,weight:Number(result.weight)});
        });
    });
    const trends=[];
    Object.values(by).forEach(a=>{
        const prev=a.filter(x=>x.date<mid),cur=a.filter(x=>x.date>=mid);
        if(!prev.length||!cur.length)return;
        const pa=fScoreMedian(prev.map(x=>x.weight)),ca=fScoreMedian(cur.map(x=>x.weight));
        if(pa>0&&Number.isFinite(ca))trends.push((ca-pa)/pa*100);
    });
    if(!trends.length)return {score:null,available:false,count:0,avgChange:null,trend:'Недостаточно данных в обеих половинах периода',periodDays:days,aggregation:'median-working-result'};
    const median=fScoreMedian(trends);
    return {
        score:fScoreWorkingGoalScore(goal,median),
        available:true,
        count:trends.length,
        avgChange:median,
        trend:median>3?'Рост рабочих весов':median<-3?'Снижение рабочих весов':'Рабочие веса стабильны',
        periodDays:days,
        aggregation:'median-working-result'
    };
}
function fScoreWorkingGoalScore(goal,avg){
    if(!Number.isFinite(avg))return null;
    if(goal==='gain')return avg>=2&&avg<=10?100:avg>=0?82+avg*6:Math.max(20,78+avg*9);
    if(goal==='cut')return avg>=-3&&avg<=6?100:avg>6?92:Math.max(20,100-(Math.abs(avg)-3)*9);
    return Math.abs(avg)<=5?100:Math.max(30,100-(Math.abs(avg)-5)*7);
}
function fScoreRepTrend(history,periodDays=90){
    const now=Date.now(),days=Math.max(7,Number(periodDays)||90),start=now-days*86400000,mid=now-Math.ceil(days/2)*86400000,by={};
    (history||[]).forEach(e=>{const date=new Date(e.date).getTime();if(!Number.isFinite(date)||date<start||date>now)return;(e.exercises||[]).forEach(ex=>{const n=String(ex.name||'').trim(),r=(ex.sets||[]).map(x=>Number(x.reps)).filter(v=>Number.isFinite(v)&&v>0);if(n&&r.length)(by[n]||(by[n]=[])).push({date,reps:Math.max(...r)});});});
    const changes=[];Object.values(by).forEach(a=>{const prev=a.filter(x=>x.date<mid),cur=a.filter(x=>x.date>=mid);if(!prev.length||!cur.length)return;const p=prev.reduce((z,x)=>z+x.reps,0)/prev.length,c=cur.reduce((z,x)=>z+x.reps,0)/cur.length;if(p>0)changes.push((c-p)/p*100);});
    return changes.length?changes.reduce((a,b)=>a+b,0)/changes.length:null;
}
function fScoreRepGoalScore(goal,avg){
    if(!Number.isFinite(avg))return null;
    if(goal==='gain')return avg>=1&&avg<=15?100:avg>=-3?82:Math.max(25,82+avg*8);
    if(goal==='cut')return avg>=-5&&avg<=10?100:avg>10?95:Math.max(25,100-(Math.abs(avg)-5)*7);
    return Math.abs(avg)<=8?100:Math.max(30,100-(Math.abs(avg)-8)*6);
}
function fScoreFrequencyCustom(count,target,periodDays=30){
    target=Math.max(1,Math.min(7,Number(target)||3));
    periodDays=Math.max(7,Number(periodDays)||30);
    const weekly=count*7/periodDays;
    const tolerance=1;
    if(weekly>=Math.max(1,target-tolerance)&&weekly<=Math.min(7,target+tolerance))return 100;
    if(weekly<target-tolerance)return fScoreClamp(weekly/Math.max(.5,target-tolerance)*100);
    return 100;
}
function fScoreTrainingConsistencyCustom(recent,previous,target,periodDays=30){
    if(!recent.length)return {score:null,frequency:null,distribution:null,count:0};
    const frequency=fScoreFrequencyCustom(recent.length,target,periodDays),distribution=fScoreDistribution(recent),prevFreq=previous.length?fScoreFrequencyCustom(previous.length,target,periodDays):null;
    let current=.60*frequency+.40*(distribution?distribution.score:65); if(prevFreq!=null)current=.80*current+.20*prevFreq;
    return {score:fScoreClamp(current),frequency,distribution,count:recent.length,target,periodDays,previousWindowDays:periodDays};
}
function fScoreMedian(values){const a=values.map(Number).filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function fScorePerformanceSignals(history, periodDays=90,startAt=null){
    const days=Math.max(7,Number(periodDays)||90), now=Date.now(), cutoff=Math.max(now-days*86400000,Number(startAt)||0);
    const byExercise={};
    (history||[]).forEach(entry=>{
        const t=new Date(entry?.date).getTime();
        if(!Number.isFinite(t)||t<cutoff||t>now)return;
        (entry.exercises||[]).forEach(ex=>{
            const name=String(ex?.name||'').trim();
            if(!name || getExerciseTypeByName(name)!=='strength') return;
            const sets=getStrengthSetsForExerciseInEntry(entry,name); if(!sets.length)return;
            let best1rm=0;
            sets.forEach(s=>{const w=Number(s.weight),r=Number(s.reps);if(!(w>0&&r>0))return;if(r<=12){const est=r===1?w:w*(1+r/30);best1rm=Math.max(best1rm,est);}});
            if(best1rm<=0)return;
            (byExercise[name]||(byExercise[name]=[])).push({date:t,e1rm:best1rm});
        });
    });
    const median=arr=>{const v=arr.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;const m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;};
    const robustChange=(rows,key)=>{
        const valid=rows.filter(r=>Number.isFinite(Number(r[key]))&&Number(r[key])>0).sort((a,b)=>a.date-b.date);
        if(valid.length<4)return null;
        const slopes=[];
        for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){
            const dt=(valid[j].date-valid[i].date)/86400000;
            if(dt>0)slopes.push((valid[j][key]-valid[i][key])/dt);
        }
        const slope=median(slopes); if(!Number.isFinite(slope))return null;
        const baseline=median(valid.slice(0,Math.min(3,valid.length)).map(r=>r[key]));
        const span=(valid[valid.length-1].date-valid[0].date)/86400000;
        return baseline>0&&span>0?(slope*span/baseline*100):null;
    };
    const comparable=[];
    Object.entries(byExercise).forEach(([name,rows])=>{
        const e1rm=robustChange(rows,'e1rm');
        if(Number.isFinite(e1rm))comparable.push({name,e1rm,count:rows.length});
    });
    if(comparable.length<2)return {available:false,rows:[],e1rm:null,comparableCount:comparable.length,periodDays:days,method:'robust-trend'};
    const e1=median(comparable.map(x=>x.e1rm));
    return {available:true,rows:comparable,e1rm:e1,comparableCount:comparable.length,periodDays:days,method:'robust-median-slope'};
}
function fScorePerformanceGoalScore(goal,change){
    if(!Number.isFinite(change)) return null;
    if(goal==='gain') return fScoreClamp(70+change*6);
    if(goal==='cut') return change>=0?100:fScoreClamp(100+change*5);
    return Math.abs(change)<=3?100:fScoreClamp(100-(Math.abs(change)-3)*5);
}
function getFScoreGoalDefinition(goal){
    const defs={
      gain:{icon:'💪',name:'Набор',lead:'Рост веса и мышечных показателей с контролем талии.',body:'Вес · талия · замеры',bodyMeta:'30% · 10% · 60%',training:'Системность · силовая динамика',trainingMeta:'40% · 60%',nutrition:'Профицит + белок',nutritionMeta:'+7% от поддержания · белок 1,8 г/кг · жиры 0,9 г/кг',period:'90 дней'},
      cut:{icon:'🔥',name:'Сушка',lead:'Снижение веса и талии с сохранением тренировочной формы.',body:'Вес · талия · замеры',bodyMeta:'25% · 35% · 40%',training:'Системность · силовая динамика',trainingMeta:'40% · 60%',nutrition:'Дефицит + белок',nutritionMeta:'−15% от поддержания · белок 2,0 г/кг · жиры 0,8 г/кг',period:'90 дней'},
      maintain:{icon:'⚖️',name:'Поддержание',lead:'Стабильный вес и сохранение тренировочной формы.',body:'Вес · талия · замеры',bodyMeta:'35% · 25% · 40%',training:'Системность · силовая динамика',trainingMeta:'40% · 60%',nutrition:'Около поддержания',nutritionMeta:'≈ поддержание · белок 1,7 г/кг · жиры 0,9 г/кг',period:'90 дней'}
    }; return defs[goal]||defs.maintain;
}
function renderFScoreCustomEditorMarkup(){
    const c=getFScoreCustomConfig()||window.__fscoreCustomDraft; if(!c) return '';
    const fields=getMeasurementFields();
    const latest=(key)=>{const a=(data.measurements||[]).filter(m=>Number(m[key])>0).sort((x,y)=>String(x.date).localeCompare(String(y.date)));return a.length?Number(a[a.length-1][key]):null;};
    const activeTargetCount=fields.filter(f=>c.targets?.[f.key]?.enabled!==false).length;
    const inactiveTargetCount=Math.max(0,fields.length-activeTargetCount);
    const rows=fields.map(f=>{
        const current=latest(f.key);
        const t=c.targets?.[f.key]||{direction:c.mode||'maintain',target:current??'',tolerance:1,enabled:true};
        const direction=['gain','cut','maintain'].includes(t.direction)?t.direction:'maintain';
        const unit=getFScoreMeasurementUnit(f.key);
        const target=Number.isFinite(Number(t.target))?Number(t.target):'';
        const tolerance=Math.max(0,Number.isFinite(Number(t.tolerance))?Number(t.tolerance):1);
        const maintain=direction==='maintain';
        const directionLabel=direction==='gain'?'↑ Рост':direction==='cut'?'↓ Уменьшение':'→ Стабильно';
        return `<article class="fscore-target-card ${t.enabled===false?'':'enabled'}" data-key="${escapeHtml(f.key)}">
            <div class="fscore-target-head">
              <label class="fscore-target-check" aria-label="Учитывать ${escapeHtml(f.key==='weight'?'Вес':f.label)}">
                <input class="fscore-target-enabled" type="checkbox" ${t.enabled===false?'':'checked'} onchange="updateFScoreTargetRow(this)">
                <span class="fscore-target-checkmark" aria-hidden="true"></span>
              </label>
              <b class="fscore-target-name">${escapeHtml(f.key==='weight'?'Вес':f.label)}</b>
              <select class="fscore-target-direction" aria-label="Направление для ${escapeHtml(f.key==='weight'?'Вес':f.label)}" onchange="this.dataset.userChanged='1';updateFScoreTargetRow(this)"><option value="gain" ${direction==='gain'?'selected':''}>↑ Рост</option><option value="cut" ${direction==='cut'?'selected':''}>↓ Снижение</option><option value="maintain" ${maintain?'selected':''}>→ Стабильность</option></select>
            </div>
            <div class="fscore-target-values ${maintain?'is-maintain':''}">
              <div class="fscore-target-value-cell current"><span>Сейчас</span><strong>${current==null?'—':escapeHtml(formatFScoreValue(current))}<em>${unit}</em></strong></div>
              <label class="fscore-target-value-cell target"><span>Цель</span><div><input class="fscore-target-value" type="number" step="0.1" value="${target}" placeholder="Введите"><em>${unit}</em></div></label>
              <label class="fscore-target-value-cell tolerance ${maintain?'':'hidden'}"><span>Допуск</span><div><input class="fscore-target-tolerance" type="number" step="0.1" min="0" value="${tolerance}" placeholder="±"><em>${unit}</em></div></label>
            </div>
            <div class="fscore-target-corridor ${maintain?'':'hidden'}">${Number.isFinite(target)&&target>0?`Коридор: ${formatFScoreValue(target-tolerance)}–${formatFScoreValue(target+tolerance)} ${unit}`:'Введите цель и допуск'}</div>
        </article>`;
    }).join('');
    return `<div id="fscoreCustomEditor" class="fscore-custom-editor">
      <div class="fscore-editor-hero"><div class="fscore-editor-icon">🎯</div><div><strong>${escapeHtml(c.name||'Новая цель')}</strong><span>Настройте цель, период и показатели, которые должны влиять на Индекс динамики.</span></div></div>
      <div class="fscore-custom-grid"><label><span>Название цели</span><input id="fscoreCustomName" value="${escapeHtml(c.name||'')}" maxlength="40" placeholder="Например: Рекомпозиция"></label><label><span>Стратегия</span><select id="fscoreCustomMode" onchange="updateFScoreCustomModeInfo()"><option value="gain" ${c.mode==='gain'?'selected':''}>💪 Набор</option><option value="cut" ${c.mode==='cut'?'selected':''}>🔥 Снижение</option><option value="maintain" ${c.mode==='maintain'?'selected':''}>⚖️ Стабильность</option></select></label></div><div id="fscoreCustomModeInfo" class="fscore-mode-info" aria-live="polite"></div>
      <section class="fscore-evaluation-field"><div class="fscore-field-heading"><b>Период оценки</b><span>От него начинается расчёт вашей цели</span></div><div class="fscore-period-presets"><button type="button" class="fscore-period-preset ${Number(c.evaluationDays)===30?'active':''}" data-days="30" onclick="setFScorePeriodPreset(30)">30 дней</button><button type="button" class="fscore-period-preset ${Number(c.evaluationDays)===60?'active':''}" data-days="60" onclick="setFScorePeriodPreset(60)">60 дней</button><button type="button" class="fscore-period-preset ${Number(c.evaluationDays)===90?'active':''}" data-days="90" onclick="setFScorePeriodPreset(90)">90 дней</button><button type="button" class="fscore-period-preset ${Number(c.evaluationDays)===180?'active':''}" data-days="180" onclick="setFScorePeriodPreset(180)">180 дней</button><button type="button" class="fscore-period-custom-btn" onclick="setFScoreCustomPeriodMode('custom')">Свой</button></div><input id="fscoreCustomPeriodMode" type="hidden" value="preset"><div id="fscoreCustomPeriodInputWrap" class="hidden"><input id="fscoreCustomEvaluationDays" type="number" min="7" max="365" value="${c.evaluationDays}" oninput="updateFScoreEvaluationDaysFromUI()"><small>дней</small></div></section>
      <section class="fscore-custom-section fscore-factor-weight-section"><div class="fscore-factor-weight-heading"><div><b>Факторы Индекса</b><span>Включите нужные блоки. Изменяемый вес фиксируется, остальные активные веса перераспределяются до 100%.</span></div><strong id="fscoreCustomWeightTotal">Нормировано до 100%</strong></div><div class="fscore-custom-weights"><label><span><input id="fscoreCustomBodyEnabled" type="checkbox" ${c.blockEnabled?.body!==false?'checked':''} onchange="toggleFScoreFactor('body')"> Тело</span><input id="fscoreCustomBodyWeight" type="number" min="0" max="100" value="${c.blockWeights?.body??40}" oninput="rebalanceFScoreWeights('body')" ${c.blockEnabled?.body===false?'disabled':''}><em>вес</em></label><label><span><input id="fscoreCustomTrainingEnabled" type="checkbox" ${c.blockEnabled?.training!==false?'checked':''} onchange="toggleFScoreFactor('training')"> Тренировки</span><input id="fscoreCustomTrainingWeight" type="number" min="0" max="100" value="${c.blockWeights?.training??30}" oninput="rebalanceFScoreWeights('training')" ${c.blockEnabled?.training===false?'disabled':''}><em>вес</em></label><label><span><input id="fscoreCustomNutritionEnabled" type="checkbox" ${c.blockEnabled?.nutrition!==false?'checked':''} onchange="toggleFScoreFactor('nutrition')"> Питание</span><input id="fscoreCustomNutritionWeight" type="number" min="0" max="100" value="${c.blockWeights?.nutrition??30}" oninput="rebalanceFScoreWeights('nutrition')" ${c.blockEnabled?.nutrition===false?'disabled':''}><em>вес</em></label></div></section>
      <details class="fscore-custom-section fscore-targets-section" aria-label="Параметры тела"><summary><span>📏 Параметры тела</span><small>${activeTargetCount} из ${fields.length} учитываются</small></summary><div class="fscore-target-intro"><div class="fscore-target-count" id="fscoreTargetCount">Учитываются: ${activeTargetCount} из ${fields.length}</div></div><div class="fscore-target-rules"><span><b>Рост</b> — выше текущего</span><span><b>Снижение</b> — ниже</span><span><b>Стабильность</b> — в допустимом коридоре</span></div><div id="fscoreCustomTargets" class="fscore-custom-targets">${rows}</div><button type="button" class="fscore-inactive-toggle" aria-expanded="true" onclick="toggleFScoreInactiveTargets(this)">Скрыть неактивные параметры${inactiveTargetCount?` · ${inactiveTargetCount}`:''}</button></details>
      <details class="fscore-custom-section fscore-training-section"><summary><span>🏋️ Тренировки</span><small>Системность и силовая динамика</small></summary><div class="fscore-custom-training"><label>Тренировок в неделю<input id="fscoreCustomTrainingTarget" type="number" min="1" max="7" step="0.5" value="${c.training?.target||3}"></label><label>Период системности, дней<input id="fscoreCustomTrainingPeriod" type="number" min="7" max="365" value="${Math.min(Number(c.evaluationDays)||90,Number(c.training?.period)||30)}"></label></div><div class="fscore-training-weight-editor"><div class="fscore-training-weight-head"><span>Вес показателей</span><b id="fscoreCustomTrainingWeightTotal">${(Number(c.training?.weights?.systemity??40)+Number(c.training?.weights?.strength??60))}%</b></div><div class="fscore-training-weight-grid"><label>Системность<input id="fscoreCustomTrainingSystemityWeight" type="number" min="0" max="100" value="${c.training?.weights?.systemity??40}" oninput="rebalanceFScoreTrainingWeights('systemity')"></label><label>Силовая динамика<input id="fscoreCustomTrainingStrengthWeight" type="number" min="0" max="100" value="${c.training?.weights?.strength??60}" oninput="rebalanceFScoreTrainingWeights('strength')"></label></div></div></details>
      <details class="fscore-custom-section fscore-nutrition-section"><summary><span>🍽️ Питание</span><small>Автоматические или ручные цели КБЖУ</small></summary><select id="fscoreCustomNutritionAuto" onchange="toggleFScoreNutritionMode()"><option value="auto" ${c.nutrition?.auto!==false?'selected':''}>Автоматически</option><option value="manual" ${c.nutrition?.auto===false?'selected':''}>Вручную</option></select><div class="fscore-manual-nutrition ${c.nutrition?.auto===false?'':'hidden'}"><div class="fscore-nutrition-default-note">Допуск: ±10% от цели.</div><div class="fscore-custom-kbju"><label>Ккал<input id="fscoreCustomCalories" type="number" value="${c.nutrition?.calories||getGoalNutritionProfile(c.mode||'maintain').calories}"></label><label>Белок<input id="fscoreCustomProtein" type="number" value="${c.nutrition?.protein||getGoalNutritionProfile(c.mode||'maintain').protein}"></label><label>Жиры<input id="fscoreCustomFat" type="number" value="${c.nutrition?.fat||getGoalNutritionProfile(c.mode||'maintain').fat}"></label><label>Углеводы<input id="fscoreCustomCarbs" type="number" value="${c.nutrition?.carbs||getGoalNutritionProfile(c.mode||'maintain').carbs}"></label></div></div></details>
      <div class="fscore-goal-editor-actions"><button type="button" class="fscore-custom-save" onclick="saveFScoreCustomFromUI()">Сохранить цель</button>${c.id?`<button type="button" class="fscore-custom-delete-goal" onclick="deleteFScoreCustomGoal('${escapeHtml(c.id)}')">Удалить цель</button>`:''}</div>
    </div>`;
}
function fScoreTraining(recent,prev,history,goal,customCfg=null,startAt=null){
    const periodDays=customCfg?Math.max(7,Number(customCfg.evaluationDays)||90):90;
    const consistencyDays=customCfg?Math.min(periodDays,Math.max(7,Number(customCfg.training?.period)||30)):Math.min(periodDays,30);
    const consistency=customCfg?.training?.target?fScoreTrainingConsistencyCustom(recent,prev,Number(customCfg.training.target)||3,consistencyDays):fScoreTrainingConsistency(recent,prev,consistencyDays);
    const working=fScoreWorkingWeightTrend(history,periodDays,goal,startAt);
    const performance=fScorePerformanceSignals(history,periodDays,startAt);
    const e1rmScore=performance.available?fScorePerformanceGoalScore(goal,performance.e1rm):null;
    const workingScore=working.available?working.score:null;
    // Balance peak-strength trend with repeatable working performance.
    const strengthScore=Number.isFinite(e1rmScore)&&Number.isFinite(workingScore)?(e1rmScore*.6+workingScore*.4):(Number.isFinite(e1rmScore)?e1rmScore:workingScore);
    const trainingWeights=customCfg?.training?.weights||{systemity:40,strength:60};
    const parts=[
        {score:consistency.score,weight:Number(trainingWeights.systemity)||0,name:'Системность'},
        {score:strengthScore,weight:Number(trainingWeights.strength)||0,name:'Силовая динамика'}
    ].filter(p=>Number.isFinite(p.score)&&p.weight>0);
    if(!parts.length)return {score:null,available:false,consistency,working,performance,periodDays,consistencyDays,parts:[]};
    const tw=parts.reduce((a,p)=>a+p.weight,0);
    const aggregate=parts.reduce((a,p)=>a+p.score*p.weight,0)/tw;
    return {score:fScoreClamp(aggregate),available:true,consistency,working,performance,strengthScore:fScoreClamp(strengthScore),periodDays,consistencyDays,parts};
}
function fScoreNutrition(goal, customCfg=null, periodDays=90,startAt=null){
    const entries=(data.foodDiary?.entries||[]).filter(e=>e&&e.date);
    const daysLimit=Math.max(7,Math.min(3650,Number(periodDays)||90));
    if(!entries.length) return {score:null,available:false,days:0,periodDays:daysLimit,coverage:0};
    const now=Date.now(),by={};
    entries.forEach(e=>{
        const date=String(e.date||''),t=new Date(date+'T12:00:00').getTime();
        const cutoff=Math.max(now-daysLimit*86400000,Number(startAt)||0);
        if(!date||!Number.isFinite(t)||t<cutoff||t>now)return;
        const x=by[date]||(by[date]={cal:0,protein:0,fat:0,carbs:0});
        x.cal+=Number(e.calories)||0;x.protein+=Number(e.protein)||0;x.fat+=Number(e.fat)||0;x.carbs+=Number(e.carbs)||0;
    });
    const loggedDays=Object.entries(by).map(([date,v])=>({date,...v}));
    const getLimitsForDay=date=>{let lim=getEffectiveFoodLimit(date)||{};if(customCfg?.nutrition?.auto===false){const n=customCfg.nutrition;lim={calories:Number(n.calories)||0,protein:Number(n.protein)||0,fat:Number(n.fat)||0,carbs:Number(n.carbs)||0};}return lim;};
    // A day is eligible only when logged calories reach at least 70% of its
    // calorie target. This filters partial diaries (e.g. breakfast only) so they
    // are not misread as a full day of severe under-eating.
    const days=loggedDays.filter(d=>{const target=Number(getLimitsForDay(d.date).calories)||0;return target>0?d.cal>=target*0.70:d.cal>0;});
    // At least three eligible days are required before nutrition affects Index.
    if(days.length<3)return {score:null,available:false,days:days.length,loggedDays:loggedDays.length,partialDays:Math.max(0,loggedDays.length-days.length),periodDays:daysLimit,coverage:days.length/daysLimit};
    const calScores=[],proteinScores=[],macroScores=[];
    days.forEach(d=>{
        const lim=getLimitsForDay(d.date);
        const tc=Number(lim.calories)||0,tp=Number(lim.protein)||0,tf=Number(lim.fat)||0,tcar=Number(lim.carbs)||0;
        const manualNutrition=customCfg?.nutrition?.auto===false;
        const tolCal=manualNutrition?tc*0.10:Math.max(0,Number(customCfg?.nutrition?.toleranceCalories)||100);
        const tolProtein=manualNutrition?tp*0.10:Math.max(0,Number(customCfg?.nutrition?.toleranceProtein)||10);
        const tolFat=manualNutrition?tf*0.10:Math.max(0,Number(customCfg?.nutrition?.toleranceFat)||10);
        const tolCarbs=manualNutrition?tcar*0.10:Math.max(0,Number(customCfg?.nutrition?.toleranceCarbs)||15);
        if(tc>0){const ratio=d.cal/tc;const excess=Math.max(0,Math.abs(ratio-1)-tolCal/tc);const directionalFactor=goal==='cut'?(ratio>1?1.5:0.75):goal==='gain'?(ratio<1?1.5:0.75):1;calScores.push(fScoreClamp(100-excess*220*directionalFactor));}
        if(tp>0){const r=d.protein/tp,c=tolProtein/tp;proteinScores.push(fScoreClamp(r>=1?100:100-Math.max(0,1-r-c)*100));}
        const macro=[];if(tf>0)macro.push(fScoreClamp(100-Math.max(0,Math.abs(d.fat/tf-1)-tolFat/tf)*120));if(tcar>0)macro.push(fScoreClamp(100-Math.max(0,Math.abs(d.carbs/tcar-1)-tolCarbs/tcar)*90));if(macro.length)macroScores.push(macro.reduce((a,b)=>a+b,0)/macro.length);
    });
    const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
    const cal=mean(calScores),protein=mean(proteinScores),macros=mean(macroScores);
    const baseParts=[{score:cal,weight:40},{score:protein,weight:30},{score:macros,weight:30}].filter(x=>Number.isFinite(x.score));
    if(!baseParts.length)return {score:null,available:false,days:days.length,periodDays:daysLimit,coverage:days.length/daysLimit,reason:'Нет целевых КБЖУ для выбранного периода'};
    const total=baseParts.reduce((a,p)=>a+p.weight,0);
    const rawScore=baseParts.reduce((a,p)=>a+p.score*p.weight,0)/total;
    const score=fScoreClamp(rawScore);
    // Missing diary days are not treated as bad nutrition. The Index uses only
    // logged days after the 3-day minimum; coverage is reported separately as
    // data quality and does not alter the numeric nutrition score.
    const coverage=Math.min(1,days.length/Math.min(14,daysLimit));
    return {score,rawScore:score,available:true,days:days.length,loggedDays:loggedDays.length,partialDays:Math.max(0,loggedDays.length-days.length),cal,protein,macros,goal,periodDays:daysLimit,coverage:Math.min(1,days.length/daysLimit),confidenceCoverage:coverage,manual:customCfg?.nutrition?.auto===false};
}
function fScoreData(){
    const h=(data.history||[]).filter(e=>e&&e.date).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    const goal=getFScoreGoal(),custom=goal==='custom'?getFScoreCustomConfig():null;
    // Standard goals use the same fixed 90-day evaluation window as the goal definition.
    // Custom goals may choose their own evaluation period.
    const evaluationDays=custom?Math.max(7,Math.min(365,Number(custom.evaluationDays)||90)):90;
    const customStartAt=custom&&Number(custom.createdAt)>0?Number(custom.createdAt):null;
    // A user-created goal starts its own clock at creation. The selected evaluation
    // period remains the maximum window, but it can never reach back before the goal existed.
    // Legacy custom goals without createdAt retain the previous rolling-window behavior.
    // The evaluation period is the single public calculation window. A custom
    // training consistency window may be shorter, but never extends beyond it.
    const consistencyDays=custom?Math.min(evaluationDays,Math.max(7,Number(custom.training?.period)||30)):evaluationDays;
    const recent=fScoreRecent(h,consistencyDays,0,customStartAt),prev=fScoreRecent(h,consistencyDays*2,consistencyDays,customStartAt),engineGoal=custom?.mode||goal;
    const body=custom?fScoreCustomBody(custom,customStartAt):fScoreBody(engineGoal,evaluationDays);
    const training=fScoreTraining(recent,prev,h,engineGoal,custom,customStartAt);
    const nutrition=fScoreNutrition(engineGoal,custom,evaluationDays,customStartAt);
    // Standard goals always have a stable 40/30/30 model. Custom goals may
    // choose their own relative weights, normalized across enabled factors at calculation time.
    const rawWeights=custom?.blockWeights?{body:Number(custom.blockWeights.body)||0,training:Number(custom.blockWeights.training)||0,nutrition:Number(custom.blockWeights.nutrition)||0}:{body:40,training:30,nutrition:30};
    const blockEnabled=custom?.blockEnabled||{body:true,training:true,nutrition:true};
    const enabledWeightSum=['body','training','nutrition'].reduce((sum,key)=>sum+(blockEnabled[key]?rawWeights[key]:0),0);
    const weights={body:0,training:0,nutrition:0};
    const enabledKeys=['body','training','nutrition'].filter(key=>blockEnabled[key]);
    if(enabledWeightSum>0) enabledKeys.forEach((key,i)=>{weights[key]=i===enabledKeys.length-1?100-enabledKeys.slice(0,-1).reduce((sum,k)=>sum+weights[k],0):Math.round(rawWeights[key]/enabledWeightSum*100);});
    const blockSources={body,training,nutrition};
    const blocks=['body','training','nutrition'].map(key=>({key,name:key==='body'?'Тело':key==='training'?'Тренировки':'Питание',score:blockEnabled[key]&&Number.isFinite(blockSources[key]?.score)?fScoreClamp(blockSources[key].score):null,weight:blockEnabled[key]?weights[key]:0,enabled:!!blockEnabled[key],available:blockEnabled[key]&&!!blockSources[key]?.available}));
    const available=blocks.filter(x=>x.enabled&&Number.isFinite(x.score)&&x.weight>0);
    const totalWeight=available.reduce((a,b)=>a+b.weight,0);
    const score=totalWeight?Math.round(available.reduce((a,b)=>a+b.score*b.weight,0)/totalWeight):0;
    const now=Date.now();
    const evaluationCutoff=Math.max(now-Math.max(7,Number(evaluationDays)||90)*86400000,customStartAt||0);
    // Quality of data must use the same evaluation window as the index itself.
    // Otherwise old measurements could make the quality look better than the
    // actual data available for the selected period.
    const measurements=(data.measurements||[]).filter(m=>{
        const t=new Date(m?.date).getTime();
        return Number.isFinite(t)&&t>=evaluationCutoff&&t<=now;
    }).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    const measureCount=measurements.length, first=measurements[0], last=measurements[measurements.length-1], days=first&&last?(new Date(last.date)-new Date(first.date))/86400000:0;
    const bodyItems=getFScoreBodyDisplayItems(measurements);
    const bodyDataCount=bodyItems.filter(i=>i.has).length;
    const selectedBodyKeys=custom ? Object.entries(custom.targets||{}).filter(([k,t])=>t?.enabled!==false && bodyItems.some(i=>i.key===k)).map(([k])=>k) : bodyItems.map(i=>i.key);
    const bodySelectedCount=selectedBodyKeys.length;
    const bodySelectedWithData=selectedBodyKeys.filter(k=>bodyItems.some(i=>i.key===k&&i.has)).length;
    // Keep the quality score explainable: all three data domains are counted,
    // including a completely missing domain, because it is still a missing input.
    const bodyConfidence=measureCount<1?0:Math.min(100,30+(measureCount>=2?25:0)+(measureCount>=4?20:0)+(bodySelectedCount?Math.round(25*bodySelectedWithData/bodySelectedCount):0));
    const trainingConfidence=Math.min(100,(recent.length>=1?25:0)+(recent.length>=3?15:0)+(recent.length>=6?20:0)+(training.performance?.available?25:0)+(recent.length>=10?15:0));
    const nutritionConfidence=Math.min(100,Math.round((nutrition.coverage||0)*100));
    const confidenceKeys=custom?['body','training','nutrition'].filter(k=>blockEnabled[k]):['body','training','nutrition'];
    const confidenceValues={body:bodyConfidence,training:trainingConfidence,nutrition:nutritionConfidence};
    const confidence=Math.round(confidenceKeys.length?confidenceKeys.reduce((sum,k)=>sum+confidenceValues[k],0)/confidenceKeys.length:0);
    const phase=confidence<55||(blockEnabled.body&&measureCount<2)?'calibration':(confidence>=80&&(!blockEnabled.body||(measureCount>=4&&days>=60))?'full':'preliminary');
    const confidenceLabel=confidence>=70?'данных достаточно':confidence>=45?'данных частично достаточно':'данных недостаточно';
    const confidenceMissing=[];
    if(blockEnabled.body&&measureCount<2){
        confidenceMissing.push(`Нужно ещё ${Math.max(1,2-measureCount)} ${Math.max(1,2-measureCount)===1?'замер':'замера'} тела за выбранный период — сейчас ${measureCount}.`);
    } else if(blockEnabled.body&&bodySelectedCount&&bodySelectedWithData<bodySelectedCount){
        confidenceMissing.push(`Не заполнены выбранные параметры тела: ${bodyItems.filter(i=>selectedBodyKeys.includes(i.key)&&!i.has).map(i=>i.label).join(', ')}.`);
    }
    if(blockEnabled.training&&(recent.length<6 || !training.performance?.available)){
        const detail=recent.length<6?`тренировок за окно системности ${consistencyDays} дней: ${recent.length}`:'для рабочих весов нужна повторяемая история нагрузки';
        confidenceMissing.push(`Больше данных по тренировкам (${detail}).`);
    }
    if(blockEnabled.nutrition&&!nutrition.available){
        confidenceMissing.push(nutrition.days<3?`Дней питания, прошедших порог 70% калорий: ${nutrition.days}. Нужно минимум 3; частичных дней исключено: ${nutrition.partialDays||0}.`:`Больше дней с заполненным питанием за выбранный период — сейчас ${nutrition.days} из ${evaluationDays}.`);
    } else if(blockEnabled.nutrition&&(nutrition.coverage||0)<0.5){
        confidenceMissing.push(`Больше дней с заполненным питанием — сейчас ${nutrition.days} из ${evaluationDays}.`);
    }
    const statusLevel=!available.length?'attention':score>=80?'good':score>=55?'attention':'bad';
    const status=!available.length?'Пока нет данных':(phase==='calibration'?'Собираем данные':statusLevel==='good'?'Динамика в норме':statusLevel==='attention'?'Есть что улучшить':'Динамика требует внимания');
    const statusReason=!available.length?'Нет доступных блоков для расчёта.':phase==='calibration'?'Расчёт предварительный: системе ещё нужна история данных.':(statusLevel==='good'?'Основные доступные показатели поддерживают выбранную цель.':statusLevel==='attention'?'Есть показатели, которые пока соответствуют цели не полностью.':'Несколько доступных показателей заметно отклоняются от выбранной цели.');
    const qualityParts={body:null,training:null,nutrition:null},qualityMax={body:null,training:null,nutrition:null}; const qKeys=confidenceKeys; qKeys.forEach((k,i)=>{qualityMax[k]=i===qKeys.length-1?100-qKeys.slice(0,-1).reduce((sum,key)=>sum+(qualityMax[key]||0),0):Math.round(100/qKeys.length); qualityParts[k]=Math.round((confidenceValues[k]||0)*qualityMax[k]/100);});
    return {score,status,statusLevel,statusReason,goal,customStartAt,history:h,measures:data.measurements||[],recent,prev,body,training,nutrition,blocks,availableCount:available.length,phase,confidence,confidenceLabel,confidenceMissing,evaluationDays,consistencyDays,measureCount,bodyDataCount,bodySelectedCount,bodySelectedWithData,weights,totalWeight,qualityParts,qualityMax};
}
function fScoreTrackScoreChange(x){
    const custom=x.goal==='custom'?getFScoreCustomConfig():null;
    const signature=JSON.stringify({goal:x.goal,customId:custom?.id||null,mode:custom?.mode||null,evaluationDays:x.evaluationDays,consistencyDays:x.consistencyDays,weights:custom?.blockWeights||null,blockEnabled:custom?.blockEnabled||null,targets:custom?.targets||null,training:custom?.training||null,manual:custom?.nutrition?.auto===false,nutrition:custom?.nutrition||null});
    const key='ftracker_fscore_snapshot_v2_'+(custom?.id||x.goal);
    let prev=null;try{prev=JSON.parse(localStorage.getItem(key)||'null');}catch(e){}
    const now=Date.now(),current={score:x.score,at:now,signature};
    if(!prev||prev.signature!==signature||!Number.isFinite(prev.score)){try{localStorage.setItem(key,JSON.stringify(current));}catch(e){}return null;}
    const age=now-Number(prev.at||0);
    if(age<12*3600000)return null;
    try{localStorage.setItem(key,JSON.stringify(current));}catch(e){}
    if(prev.score===x.score)return {delta:0,previous:prev.score};
    return {delta:x.score-prev.score,previous:prev.score};
}

function fScoreFmt(v,u){return v==null?'—':(v>0?'+':'')+Number(v).toFixed(1)+u;}
function fScoreBuildExplanation(x){
    const reasons=[];
    const goalName={gain:'набора',cut:'сушки',maintain:'поддержания'}[x.goal]||'поддержания';
    const add=(kind,title,text)=>reasons.push({kind,title,text});
    if(x.blocks?.find(b=>b.key==='body')?.enabled!==false && x.goal==='custom' && x.body?.details?.length){
        x.body.details.slice(0,3).forEach(d=>{
            const title=(typeof getMeasurementFields==='function'?getMeasurementFields().find(f=>f.key===d.key)?.label:null)||d.key;
            const kind=d.score>=80?'good':d.score>=60?'attention':'bad';
            add(kind,title,d.status||'Параметр участвует в оценке динамики.');
        });
    }else if(x.blocks?.find(b=>b.key==='body')?.enabled!==false){
        const w=x.body?.weight, wa=x.body?.waist;
        if(w){
            const speed=w.speed;
            if(x.goal==='gain') add(speed>0?'good':'bad','Вес',speed>0?`Тренд веса растёт (${fScoreFmt(speed,'%/нед')}) — направление соответствует цели.`:'Тренд веса не растёт — для набора это снижает оценку тела.');
            else if(x.goal==='cut') add(speed<0?'good':'bad','Вес',speed<0?`Тренд веса снижается (${fScoreFmt(speed,'%/нед')}) — направление соответствует сушке.`:'Тренд веса не снижается — для сушки это ухудшает соответствие цели.');
            else add(Math.abs(speed)<=.3?'good':'attention','Вес',Math.abs(speed)<=.3?'Вес остаётся в зоне стабильности — это соответствует поддержанию.':`Вес меняется на ${fScoreFmt(speed,'%/нед')}, что выходит за комфортную зону поддержания.`);
        }
        if(wa){
            if(x.goal==='cut') add(wa.change<0?'good':wa.change===0?'attention':'bad','Талия',wa.change<0?'Талия уменьшается вместе с динамикой сушки — это подтверждает качество снижения веса.':wa.change===0?'Талия пока стабильна — снижение веса ещё не подтверждено изменением объёма.':'Талия растёт — это противоречит цели сушки.');
            else if(x.goal==='maintain') add(Math.abs(wa.speed)<=.3?'good':'attention','Талия',Math.abs(wa.speed)<=.3?'Талия стабильна — это соответствует поддержанию.':'Есть заметная динамика талии, поэтому стабильность тела оценивается ниже.');
            else add('neutral','Талия','На наборе талия используется как контекст и сама по себе не штрафует индекс.');
        }
        if(x.body?.other!=null) add(x.body.other>=80?'good':x.body.other>=60?'attention':'bad','Другие замеры',x.body.other>=80?'Остальные доступные объёмы поддерживают выбранную цель.':x.body.other>=60?'Динамика остальных замеров смешанная или умеренная.':'Остальные доступные замеры пока слабо подтверждают выбранную цель.');
    }
    if(x.blocks?.find(b=>b.key==='training')?.enabled!==false && x.training?.available){
        const c=x.training.consistency;
        add(c.score>=80?'good':c.score>=60?'attention':'bad','Тренировки',c.score>=80?'Регулярность тренировок поддерживает индекс.':c.score>=60?'Системность тренировок есть, но не максимальная — отдельные пропуски допускаются.':'Недостаточно устойчивой тренировочной системности.');
    }
    if(x.blocks?.find(b=>b.key==='nutrition')?.enabled!==false && x.nutrition?.available){
        const n=x.nutrition,avg=Math.round(n.score);
        add(avg>=80?'good':avg>=60?'attention':'bad','Питание',avg>=80?`КБЖУ в целом соответствует цели ${goalName} и поддерживает итоговый индекс.`:avg>=60?`Питание частично соответствует цели ${goalName}; этот блок ограничивает итоговый результат.`:`Текущие калории или КБЖУ заметно расходятся с целью ${goalName}.`);
    }
    return reasons.slice(0,6);
}
function fScoreTrendStore(x){
    const custom=x.goal==='custom'?getFScoreCustomConfig():null;
    const goalKey=String(custom?.id||x.goal);
    const legacyKey='ftracker_fscore_trend_v1_'+goalKey;
    data.fscoreTrend=data.fscoreTrend&&typeof data.fscoreTrend==='object'&&!Array.isArray(data.fscoreTrend)?data.fscoreTrend:{};
    let rows=Array.isArray(data.fscoreTrend[goalKey])?data.fscoreTrend[goalKey]:[];
    if(!rows.length){try{const legacy=JSON.parse(localStorage.getItem(legacyKey)||'[]');if(Array.isArray(legacy))rows=legacy;}catch(e){}}
    const today=new Date(),day=today.toISOString().slice(0,10);
    const score=Number.isFinite(Number(x.score))?Math.max(0,Math.min(100,Number(x.score))):null;
    let changed=false;
    if(score!=null){
      const existing=rows.find(r=>r&&r.date===day);
      if(existing){if(Number(existing.score)!==score){existing.score=score;changed=true;}}
      else{rows.push({date:day,score});changed=true;}
    }
    const cutoff=new Date(today.getTime()-120*86400000).toISOString().slice(0,10);
    const filtered=rows.filter(r=>r&&r.date>=cutoff&&Number.isFinite(Number(r.score))).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    if(filtered.length!==rows.length)changed=true;
    data.fscoreTrend[goalKey]=filtered;
    try{localStorage.setItem(legacyKey,JSON.stringify(filtered));}catch(e){}
    // Persist only when the durable trend actually changed; do not create a
    // backup on every render of the same screen.
    if(changed) saveData(false,'Обновление истории Индекса');
    return filtered;
}
function fScoreTrendDelta(rows){
    if(!rows||rows.length<2)return null;
    const now=rows[rows.length-1];
    const cutoff=new Date(new Date(now.date+'T12:00:00').getTime()-30*86400000).toISOString().slice(0,10);
    const candidates=rows.filter(r=>r.date<=cutoff);
    if(candidates.length){
        const base=candidates[candidates.length-1];
        return {delta:Number(now.score)-Number(base.score),previous:Number(base.score),date:base.date,period:'30 дней'};
    }
    const base=rows[Math.max(0,rows.length-2)];
    const days=Math.max(1,Math.round((new Date(now.date)-new Date(base.date))/86400000));
    return {delta:Number(now.score)-Number(base.score),previous:Number(base.score),date:base.date,period:`${days} дн.`};
}
function fScoreSparkline(rows,current){
    const values=[];
    const recent=(rows||[]).filter(r=>r&&Number.isFinite(Number(r.score))).slice(-7);
    recent.forEach(r=>values.push(Math.max(0,Math.min(100,Number(r.score)))));
    if(!values.length && Number.isFinite(Number(current))) values.push(Number(current));
    if(values.length===1) values.unshift(values[0]);
    const w=120,h=34,p=3,min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min);
    const pts=values.map((v,i)=>{
        const x=p+(i*Math.max(0,w-p*2))/Math.max(1,values.length-1);
        const y=h-p-((v-min)/range)*(h-p*2);
        return [x,y];
    });
    const line=pts.map((pt,i)=>(i?'L':'M')+pt[0].toFixed(1)+' '+pt[1].toFixed(1)).join(' ');
    const last=pts[pts.length-1];
    return `<svg class="fscore-home-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="fscore-home-spark-track" d="M3 17 H117"></path><path class="fscore-home-spark-line" d="${line}"></path><circle class="fscore-home-spark-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.8"></circle></svg>`;
}
function renderFScoreHomeWidget(){
    const el=document.getElementById('fscoreHomeWidget'); if(!el)return;
    try{
        const x=fScoreData();
        const rows=fScoreTrendStore(x);
        const delta=fScoreTrendDelta(rows);
        const activeCustomGoal=getFScoreCustomConfig();
        const goalName=x.goal==='custom'?(activeCustomGoal?.name||'Своя цель'):({cut:'Сушка',gain:'Набор',maintain:'Поддержание'}[x.goal]||'Поддержание');
        const displayStatus=x.phase==='calibration'?'Собираем данные':x.status;
        const score=x.availableCount?Math.max(0,Math.min(100,Math.round(x.score))):0;
        const deltaText=delta&&Number.isFinite(delta.delta)?`${delta.delta>0?'+':''}${Math.round(delta.delta)}`:'Нет сравнения';
        const deltaClass=delta&&delta.delta>0?'up':delta&&delta.delta<0?'down':'flat';
        const deltaPeriod=delta?.period||'';
        const ringStyle=`--fscore-value:${score}%;`;
        const blockNames={body:'Тело',training:'Тренировки',nutrition:'Питание'};
        const blockMarkup=x.blocks.map(b=>{
            const value=Number.isFinite(Number(b.score))?Math.round(b.score):null;
            const width=value==null?0:value;
            return `<span class="fscore-home-breakdown-item"><span class="fscore-home-breakdown-label">${blockNames[b.key]}</span><span class="fscore-home-breakdown-value">${value==null?'—':value}</span><span class="fscore-home-breakdown-bar"><i style="width:${width}%"></i></span></span>`;
        }).join('');
        el.className=`fscore-widget fscore-widget-${x.statusLevel}`;
        let collapsed=false;
        try{collapsed=localStorage.getItem('ftracker_home_fscore_collapsed')==='1';}catch(e){}
        if(collapsed)el.classList.add('home-fscore-collapsed');
        const collapseLabel=collapsed?'Развернуть индекс':'Свернуть индекс';
        el.innerHTML=`<span class="fscore-home-top"><span><span class="fscore-home-title">Индекс динамики</span><span class="fscore-home-goal">${escapeHtml(goalName)}</span></span><span class="fscore-home-actions"><button type="button" class="fscore-home-collapse" aria-label="${collapseLabel}" aria-expanded="${!collapsed}" onclick="toggleHomeFScoreCollapse(this);event.stopPropagation()">${collapsed?'⌄':'⌃'}</button><span class="fscore-home-action">Подробнее <span aria-hidden="true">›</span></span></span></span><span class="fscore-home-hero"><span class="fscore-home-ring" style="${ringStyle}" aria-label="${score} из 100"><span class="fscore-home-ring-inner"><b>${x.availableCount?score:'—'}</b></span></span><span class="fscore-home-trend"><span class="fscore-home-delta ${deltaClass}">${deltaText} <small>${escapeHtml(deltaPeriod)}</small></span>${fScoreSparkline(rows,score)}<span class="fscore-home-status"><i aria-hidden="true"></i><b>${escapeHtml(displayStatus)}</b></span></span></span><span class="fscore-home-breakdown">${blockMarkup}</span>`;
    }catch(err){
        console.error('FScore render failed',err);
        el.className='fscore-widget fscore-widget-attention';
        el.innerHTML='<span class="fscore-home-top"><span><span class="fscore-home-title">Индекс динамики</span></span><span class="fscore-home-action">Подробнее <span aria-hidden="true">›</span></span></span><span class="fscore-home-fallback">Не удалось обновить индекс</span>';
    }
}

function toggleHomeFScoreCollapse(btn){
    const card=document.getElementById('fscoreHomeWidget');
    if(!card)return;
    const collapsed=card.classList.toggle('home-fscore-collapsed');
    try{localStorage.setItem('ftracker_home_fscore_collapsed',collapsed?'1':'0');}catch(e){}
    btn.setAttribute('aria-expanded',String(!collapsed));
    btn.setAttribute('aria-label',collapsed?'Развернуть индекс':'Свернуть индекс');
    btn.textContent=collapsed?'⌄':'⌃';
}

function showFScoreAnalytics(){
    showScreen('fscoreAnalyticsScreen');
    requestAnimationFrame(()=>{try{renderFScoreAnalytics();}catch(err){
        console.error('FScore analytics failed',err);
        const r=document.getElementById('fscoreAnalyticsContent');
        if(r)r.innerHTML='<div class="card">Не удалось построить индекс системности. Попробуйте обновить приложение.</div>';
    }});
}
function buildFScoreConclusion(x){
    if(!x.availableCount)return 'Недостаточно данных для оценки. Добавьте тренировки — система начнёт анализировать регулярность, непрерывность и динамику рабочих весов.';
    const ww=x.training.working.available?x.training.working.trend:'динамика рабочих весов пока не оценивается';
    return `За выбранные ${x.evaluationDays} дней записано ${x.recent.length} тренировок. ${ww}. Разовые изменения количества подходов, повторений или отсутствие рекорда не считаются ухудшением — оценивается общая тенденция.`;
}
function getFScoreBodyDisplayItems(measurements){
    const fields=getMeasurementFields();
    const rows=(measurements||[]).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    // Each parameter has its own latest value. A partial newest measurement
    // must not hide values recorded earlier for other parameters.
    const latestByKey={};
    fields.forEach(f=>{
        for(let i=rows.length-1;i>=0;i--){
            const value=Number(rows[i]?.[f.key]);
            if(Number.isFinite(value)&&value>0){latestByKey[f.key]={value,date:rows[i].date};break;}
        }
    });
    const raw=fields.map(f=>({key:f.key,label:f.label,has:!!latestByKey[f.key],date:latestByKey[f.key]?.date||null,value:latestByKey[f.key]?.value??null}));
    const hipLike=raw.filter(i=>i.key==='hips'||i.key==='thigh');
    const rest=raw.filter(i=>i.key!=='hips'&&i.key!=='thigh');
    if(hipLike.length){
        const chosen=hipLike.find(i=>i.key==='hips'&&i.has)||hipLike.find(i=>i.has)||hipLike.find(i=>i.key==='hips')||hipLike[0];
        rest.push({...chosen,label:'Бёдра'});
    }
    return rest;
}
function getFScoreNextStep(x,bodyItems){
    const bodyWithHistory=Number(x.measureCount||0)>=2;
    if(!bodyWithHistory) return '📏 Сделайте следующий замер в другую дату — история тела станет точнее.';
    if(!x.training.available) return '🏋️ Добавьте завершённую тренировку с заполненными результатами.';
    if(!x.nutrition.available) return '🍽️ Добавьте питание минимум за 3 дня — тогда блок начнёт участвовать в Индексе.';
    if((bodyItems||[]).filter(i=>i.has).length<3) return '📏 Добавляйте те параметры тела, которые вам действительно важны — отсутствующие данные не штрафуются.';
    return '🟢 Данные собираются стабильно. Продолжайте вести тренировки, питание и замеры в привычном режиме.';
}
function renderFScoreAnalytics(){
    const root=document.getElementById('fscoreAnalyticsContent');
    if(!root)return;
    const x=fScoreData(), customConfig=getFScoreCustomConfig();
    if(x.goal==='custom'&&!customConfig&&!window.__fscoreCustomDraft){
        data.fscoreGoal='maintain';
        try{localStorage.setItem('ftracker_fscore_goal','maintain');}catch(e){}
        return renderFScoreAnalytics();
    }

    const goalName=x.goal==='custom'?(customConfig?.name||'Своя цель'):getFScoreGoalDefinition(x.goal).name;
    const definition=x.goal==='custom'?null:getFScoreGoalDefinition(x.goal);
    const scoreText=x.availableCount?String(x.score):'—';
    const goalButtons=['gain','cut','maintain'].map(g=>{
        const d=getFScoreGoalDefinition(g);
        return `<button type="button" class="${x.goal===g?'active':''}" onclick="setFScoreGoal('${g}')" aria-pressed="${x.goal===g}"><span>${d.icon}</span><b>${d.name}</b></button>`;
    }).join('');
    const customButtons=getFScoreCustomGoals().map(g=>{
        const active=x.goal==='custom'&&customConfig?.id===g.id;
        return `<button type="button" class="${active?'active':''}" onclick="selectFScoreCustomGoal('${escapeHtml(g.id)}')" aria-pressed="${active}"><span>🎯</span><b>${escapeHtml(g.name||'Моя цель')}</b></button>`;
    }).join('');
    const customGoalsHtml=customButtons?`<div class="fscore-custom-goals"><span class="fscore-custom-goals-label">Мои цели</span><div class="fscore-custom-goals-list">${customButtons}</div></div>`:'';

    const weights=x.weights||{body:40,training:30,nutrition:30};
    const blockMeta={
        body:!x.blocks.find(b=>b.key==='body')?.enabled?'Выключено в цели':x.body?.available?(x.goal==='custom'?`${x.bodySelectedWithData||0} из ${x.bodySelectedCount||0} с данными`:`${x.bodyDataCount||0} показ.`):'Нет данных',
        training:!x.blocks.find(b=>b.key==='training')?.enabled?'Выключено в цели':x.training?.available?`${x.recent.length} трен. · системность ${x.consistencyDays} дн.`:'Нет данных',
        nutrition:!x.blocks.find(b=>b.key==='nutrition')?.enabled?'Выключено в цели':x.nutrition?.available?`${x.nutrition.days||0} дн.`:'Нет данных'
    };
    const blockCard=(key,icon,name)=>{
        const b=x.blocks.find(v=>v.key===key)||{};
        const available=Number.isFinite(b.score);
        const weight=Number(b.weight)||0;
        const score=available?Math.round(b.score):'—';
        return `<article class="fscore-block ${available?'is-ready':'is-empty'}" data-block="${key}">
            <div class="fscore-block-icon">${icon}</div>
            <div class="fscore-block-name">${name}</div>
            <div class="fscore-block-score">${score}<small>/100</small></div>
            <div class="fscore-block-meta">${escapeHtml(blockMeta[key])}</div>
            <div class="fscore-block-weight">${weight}% · ${available?'участвует':'исключён'}</div>
        </article>`;
    };

    const perf=x.training?.performance;
    const signals=[];
    if(x.blocks.find(b=>b.key==='body')?.enabled&&x.body?.weight) signals.push({label:'Вес',value:fScoreFmt(x.body.weight.speed,'%/нед')});
    if(x.blocks.find(b=>b.key==='body')?.enabled&&x.body?.waist) signals.push({label:'Талия',value:fScoreFmt(x.body.waist.speed,'%/нед')});
    if(x.blocks.find(b=>b.key==='training')?.enabled&&perf?.available&&Number.isFinite(perf.e1rm)) signals.push({label:'Силовая динамика',value:fScoreFmt(x.training?.strengthScore,'%')});
    if(x.blocks.find(b=>b.key==='nutrition')?.enabled&&x.nutrition?.available&&Number.isFinite(x.nutrition.score)) signals.push({label:'КБЖУ',value:`${Math.round(x.nutrition.score)}/100`});

    const signalHtml=signals.slice(0,5).map(s=>`<div class="fscore-signal"><span>${escapeHtml(s.label)}</span><b>${escapeHtml(s.value)}</b></div>`).join('');
    const reasons=fScoreBuildExplanation(x).map(r=>`<div class="fscore-reason"><span class="${r.kind}">${r.kind==='good'?'✓':r.kind==='bad'?'!':'•'}</span><div><b>${escapeHtml(r.title)}</b><small>${escapeHtml(r.text)}</small></div></div>`).join('');

    const definitionHtml=definition?`
        <div class="fscore-goal-formula">
            <div class="fscore-formula-row"><span>📏 Тело</span><b>${escapeHtml(definition.bodyMeta)}</b></div>
            <div class="fscore-formula-row"><span>🏋️ Тренировки</span><b>${escapeHtml(definition.trainingMeta)}</b></div>
            <div class="fscore-formula-row"><span>🍽️ Питание</span><b>${escapeHtml(definition.nutritionMeta)}</b></div>
            <div class="fscore-formula-period"><span>Период</span><b>${definition.period}</b></div>
        </div>`:'';

    root.innerHTML=`
      <section class="fscore-panel fscore-goal-panel">
        <div class="fscore-panel-title"><span>🎯</span><div><b>Цель</b><small>Выберите режим расчёта</small></div></div>
        <div class="fscore-goal-tabs">${goalButtons}</div>${customGoalsHtml}
        ${definition?`<details class="fscore-goal-details"><summary><span>${definition.icon} Как формируется «${definition.name}»</span><b>⌃</b></summary><div class="fscore-goal-lead">${escapeHtml(definition.lead)}</div>${definitionHtml}<div class="fscore-weight-strip"><span>Вес блоков</span><b>${weights.body}%</b><b>${weights.training}%</b><b>${weights.nutrition}%</b></div></details>`:''}
        ${x.goal==='custom'?`<div class="fscore-custom-actions"><button type="button" class="fscore-secondary-btn" onclick="openFScoreCustomEditor()">⚙️ Настроить цель</button><button type="button" class="fscore-primary-btn" onclick="addFScoreCustomGoal()">＋ Добавить цель</button></div>`:`<button type="button" class="fscore-primary-btn" onclick="addFScoreCustomGoal()">＋ Создать свою цель</button>`}
      </section>

      <section class="fscore-panel fscore-score-panel ${x.statusLevel}">
        <div class="fscore-analytics-ring-wrap">
          <div class="fscore-analytics-ring" style="--fscore-ring:${x.availableCount?x.score:0}%" aria-label="${scoreText} из 100"><div><strong>${scoreText}</strong><small>/100</small></div></div>
          <div class="fscore-analytics-ring-copy"><span>ИНДЕКС ДИНАМИКИ</span><b>${escapeHtml(goalName)}</b><em>${x.phase==='calibration'?'Сбор данных':x.status}</em></div>
        </div>
        <div class="fscore-score-meta"><span>Период оценки</span><span>${x.evaluationDays} дн.</span></div>
      </section>

      <section class="fscore-confidence-card" aria-label="Качество данных">
        <div class="fscore-confidence-head"><b>Качество данных</b><div><strong>${x.confidence}%</strong><span>${x.confidenceLabel}</span></div></div>
        <div class="fscore-quality-breakdown">
          <div><span>Тело</span><b>${x.qualityParts.body==null?'—':x.qualityParts.body+'%'}</b><small>${x.qualityMax.body==null?'выключено':'из '+x.qualityMax.body+'%'}</small></div>
          <div><span>Тренировки</span><b>${x.qualityParts.training==null?'—':x.qualityParts.training+'%'}</b><small>${x.qualityMax.training==null?'выключено':'из '+x.qualityMax.training+'%'}</small></div>
          <div><span>Питание</span><b>${x.qualityParts.nutrition==null?'—':x.qualityParts.nutrition+'%'}</b><small>${x.qualityMax.nutrition==null?'выключено':'из '+x.qualityMax.nutrition+'%'}</small></div>
        </div>
        ${x.confidenceMissing.length?`<div class="fscore-confidence-missing"><b>Чего не хватает:</b><ol>${x.confidenceMissing.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ol><div class="fscore-confidence-actions">${x.blocks.find(b=>b.key==='body')?.enabled&&x.measureCount<2?`<button type="button" class="fscore-secondary-btn" onclick="showBodyMeasurements()">Добавить замер</button>`:''}${x.blocks.find(b=>b.key==='training')?.enabled&&!x.training.available?`<button type="button" class="fscore-secondary-btn" onclick="showHistory()">Добавить тренировку</button>`:''}${x.blocks.find(b=>b.key==='nutrition')?.enabled&&!x.nutrition.available?`<button type="button" class="fscore-secondary-btn" onclick="showFoodDiary()">Добавить питание</button>`:''}</div></div>`:`<div class="fscore-confidence-complete">Всё необходимое для расчёта заполнено.</div>`}
        <small class="fscore-confidence-note">Период расчёта: <b>${x.evaluationDays} дней</b>. Качество данных не меняет Индекс. Оно показывает, насколько надёжна текущая оценка.</small>
      </section>

      <section class="fscore-panel fscore-composition-panel">
        <div class="fscore-panel-title compact"><div><b>Состав индекса</b><small>Вклад блоков в результат</small></div><strong>${weights.body}% · ${weights.training}% · ${weights.nutrition}%</strong></div>
        <div class="fscore-block-grid">${blockCard('body','📏','Тело')}${blockCard('training','🏋️','Тренировки')}${blockCard('nutrition','🍽️','Питание')}</div>
        
        ${signalHtml?`<div class="fscore-subtitle">Ключевые сигналы</div><div class="fscore-signal-grid">${signalHtml}</div>`:''}
      </section>

      <section class="fscore-panel fscore-reasons-panel">
        <div class="fscore-panel-title compact"><div><b>Что влияет сейчас</b><small>Показываются только факторы, реально участвующие в расчёте</small></div></div>
        <div class="fscore-reasons">${reasons||'<div class="fscore-empty">Пока недостаточно истории для объяснения.</div>'}</div><div class="fscore-status-reason"><b>${escapeHtml(x.status)}</b><span>${escapeHtml(x.statusReason)}</span></div>
      </section>

      <details class="fscore-panel fscore-method-panel">
  <summary><span>🧮 Методика расчёта</span><b>⌄</b></summary>
  <div class="fscore-method-body">
    <div class="fscore-method-intro"><b>Суть:</b> доступные показатели переводятся в баллы <b>0–100</b>, затем формируются блоки <b>Тело / Тренировки / Питание</b>. Недостающие данные не дают ноль — показатель исключается из расчёта.</div>
    <details class="fscore-method-sub"><summary>Тело</summary><div class="fscore-method-section">
      <div class="fscore-method-item"><b>Вес</b><span>Очистка аномальных скачков + устойчивый тренд по реальным датам. Скорость выражается в % в неделю; зона ±1% считается незначимой и не влияет на балл.</span></div>
      <div class="fscore-method-item"><b>Талия</b><span>Устойчивый тренд по реальным датам. Сушка — снижение лучше, но слишком быстрое снижение постепенно снижает балл; набор — контролируемый рост; поддержание — стабильность.</span></div>
      <div class="fscore-method-item"><b>Остальные замеры</b><span>Параметры оцениваются отдельно, затем усредняются. При 1–2 доступных параметрах эффективный вес этого блока ограничивается: 1 параметр → до 15%, 2 → до 25%, 3+ → полный заданный вес; остаток перераспределяется между доступными параметрами.</span></div>
      <div class="fscore-method-formula"><b>Веса: вес · талия · остальные</b><div><span>Набор</span><strong>30% · 10% · 60%</strong></div><div><span>Сушка</span><strong>25% · 35% · 40%</strong></div><div><span>Поддержание</span><strong>35% · 25% · 40%</strong></div></div>
    </div></details>
    <details class="fscore-method-sub"><summary>Тренировки</summary><div class="fscore-method-section">
      <div class="fscore-method-item"><b>Системность — 40%</b><span>Частота оценивается в тренировках за неделю. Окно системности: ${x.consistencyDays} дней; сравнивается с непосредственно предыдущим окном такой же длины. Для стандартной цели 2–5 тренировок в неделю не штрафуются за сам факт высокой частоты; дополнительно учитывается равномерность.</span></div>
      <div class="fscore-method-item"><b>Силовая динамика — 60%</b><span>Объединяет рабочий результат и расчётный 1ПМ одного силового сигнала, чтобы один и тот же рост силы не учитывался дважды. Тренд устойчиво оценивается по истории упражнения.</span></div>
      <div class="fscore-method-note">Расчётный 1ПМ используется внутри силовой динамики и не получает отдельный вес. Это уменьшает двойной учёт одного и того же прогресса. Недоступный показатель исключается, остальные веса пересчитываются.</div>
    </div></details>
    <details class="fscore-method-sub"><summary>Питание</summary><div class="fscore-method-section">
      <div class="fscore-method-item"><b>Калории — 40%</b><span>Сравнение с целью; автоматический допуск ±100 ккал. Для сушки перебор после допуска штрафуется сильнее, для набора — недобор; поддержание остаётся симметричным.</span></div>
      <div class="fscore-method-item"><b>Белок — 30%</b><span>Автоматический допуск ±10 г. В ручном КБЖУ — ±10%; достижение или превышение цели = 100, штраф только ниже нижней границы.</span></div>
      <div class="fscore-method-item"><b>Жиры + углеводы — 30%</b><span>Отдельные оценки, затем среднее. Автоматические допуски: жиры ±10 г, углеводы ±15 г; в ручном КБЖУ — ±10%.</span></div>
      <div class="fscore-method-note">Минимум для блока — 3 заполненных дня. До этого питание не участвует в Индексе. После достижения минимума оцениваются только фактически записанные дни; пропуски не считаются плохим питанием. Количество заполненных дней отдельно влияет на качество данных.</div>
    </div></details>
    <details class="fscore-method-sub"><summary>Итог</summary><div class="fscore-method-section">
      <div class="fscore-method-formula"><b>Стандарт</b><div><strong>Тело 40% · Тренировки 30% · Питание 30%</strong></div></div>
      <div class="fscore-method-item"><b>Стандартная цель</b><span>Использует фиксированные веса: тело 40%, тренировки 30%, питание 30%.</span></div><div class="fscore-method-item"><b>Своя цель</b><span>Веса блоков задаются пользователем и всегда нормализуются ровно до 100%.</span></div>
      <div class="fscore-method-note"><b>Индекс = Σ(балл блока × вес) / Σ доступных весов.</b> Недостающие данные не считаются провалом.</div>
    </div></details>
    <details class="fscore-method-sub"><summary>Своя цель</summary><div class="fscore-method-section">
      <div class="fscore-method-item"><b>Рост / снижение</b><span>Фиксированная цель. До достижения оценивается движение к ней; после — буфер max(допуск, 0,5% цели). При превышении буфера оценка плавно снижается и ограничена диапазоном 55–100.</span></div>
      <div class="fscore-method-item"><b>Стабильно</b><span>70% — положение относительно цели + 30% — стабильность. Если сравнения двух половин нет, стабильность временно оценивается как 80.</span></div>
      <div class="fscore-method-item"><b>Период</b><span>Главный период расчёта — ${x.evaluationDays} дней. Для системности может использоваться более короткое окно, но оно не выходит за пределы главного периода.</span></div>
    </div></details>
    <details class="fscore-method-sub"><summary>Качество данных</summary><div class="fscore-method-section">
      <div class="fscore-method-item"><b>Качество данных</b><span>Показывает полноту входных данных и не добавляется к Индексу.</span></div>
      <div class="fscore-method-item"><b>Фазы</b><span>Калибровка: доверие &lt;55% или &lt;2 замеров. Полная оценка: доверие ≥80%, ≥4 замеров и ≥60 дней истории.</span></div>
      <div class="fscore-method-item"><b>Сглаживание</b><span>Вес использует сглаживание по частым измерениям; для редких замеров тела направление определяется по реальным датам и устойчивому тренду.</span></div>
    </div></details>
    <div class="fscore-method-note fscore-method-note-final"><b>Цепочка:</b> данные → очистка/сглаживание → баллы → блоки → исключение недоступных данных → нормализация → Индекс 0–100.</div>
  </div>
</details>

      <section class="fscore-next"><span>Следующий шаг</span><b>${escapeHtml(getFScoreNextStep(x,getFScoreBodyDisplayItems(x.measures||[])))}</b></section>
    `;

    // The editor is already rendered by renderFScoreCustomEditorMarkup().
    // Do not call openFScoreCustomEditor() here: that function itself renders
    // the analytics screen and used to cause a render loop / noticeable lag.
}
function showProgress() {
    showScreen('progressScreen');
    renderProgressDashboard();
}
function getHistoryInPeriod(days) {
    if (days === 'all') return data.history.slice();
    const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
    return data.history.filter(e => new Date(e.date).getTime() >= cutoff);
}
function calculateWorkoutVolume(entry) {
    let volume = 0;
    (entry.exercises || []).forEach(ex => (ex.sets || []).forEach(s => {
        const w = parseFloat(s.weight), r = parseInt(s.reps);
        if (Number.isFinite(w) && Number.isFinite(r)) volume += w * r;
    }));
    return volume;
}
function getExerciseRecords() {
    const records = {};
    data.history.forEach(entry => (entry.exercises || []).forEach(ex => {
        if (!records[ex.name]) records[ex.name] = { maxWeight:0, maxReps:0, bestWeightReps:'' };
        (ex.sets || []).forEach(s => {
            const w = parseFloat(s.weight) || 0, r = parseInt(s.reps) || 0;
            if (w > records[ex.name].maxWeight) records[ex.name].maxWeight = w;
            if (r > records[ex.name].maxReps) records[ex.name].maxReps = r;
            if (w > 0 && r > 0) {
                const score = w * r;
                if (!records[ex.name].bestScore || score > records[ex.name].bestScore) {
                    records[ex.name].bestScore = score;
                    records[ex.name].bestWeightReps = `${w} кг × ${r}`;
                }
            }
        });
    }));
    return records;
}
function getPreviousWorkoutForProgram(currentEntry) {
    const same = data.history
        .filter(e => e.program === currentEntry.program && e !== currentEntry)
        .sort((a,b) => new Date(b.date)-new Date(a.date));
    return same[0] || null;
}

/* Лучший исторический результат до текущей тренировки.
   Важно: для каждого показателя ниже сравнение идёт с максимумом за всю историю,
   а не просто с предыдущей тренировкой. */
function getBestWorkoutForProgram(currentEntry) {
    const same = (data.history || [])
        .filter(e => e.program === currentEntry.program && e !== currentEntry)
        .sort((a,b) => new Date(a.date)-new Date(b.date));
    if (!same.length) return null;

    const best = { date: null, program: currentEntry.program, exercises: [] };
    const names = new Set();
    same.forEach(entry => (entry.exercises || []).forEach(ex => names.add(ex.name)));

    names.forEach(name => {
        const entries = [];
        same.forEach(entry => {
            const ex = (entry.exercises || []).find(x => x.name === name);
            if (ex && (ex.sets || []).length) entries.push({ entry, ex });
        });
        if (!entries.length) return;
        const currentType = getExerciseTypeByName(name);
        const compatible=entries.filter(item=>(item.ex.type||currentType)===currentType);
        const pool=compatible.length?compatible:entries;
        const score = item => {
            const sets = item.ex.sets || [], type=item.ex.type||currentType;
            if (type === 'strength') return calculateWorkoutVolume({exercises:[item.ex]});
            if (type === 'cardio') return Math.max(0,...sets.map(s => (parseFloat(s.time)||0) * (parseFloat(s.intensity)||1)));
            return Math.max(0,...sets.map(s => parseInt(s.reps)||0));
        };
        pool.sort((a,b) => score(b)-score(a));
        best.exercises.push({ name, type:pool[0].ex.type||currentType, sets: pool[0].ex.sets || [] });
    });
    return best.exercises.length ? best : null;
}

function getBestSetForExercise(ex,type){
    const sets=(ex?.sets||[]).filter(Boolean);if(!sets.length)return null;
    const score=s=>{
        if(type==='strength'){const w=parseFloat(s.weight)||0,r=parseInt(s.reps)||0;return [w,r,w*r];}
        if(type==='cardio'){const t=parseFloat(s.time)||0,i=parseFloat(s.intensity)||0;return [t,i,t*i];}
        const r=parseInt(s.reps)||0;return [r,r,0];
    };
    return sets.reduce((best,set)=>{if(!best)return set;const A=score(set),B=score(best);for(let i=0;i<A.length;i++)if(A[i]!==B[i])return A[i]>B[i]?set:best;return best;},null);
}
function getBestStrengthSet(sets) {
    const valid = (sets || []).filter(s => Number.isFinite(parseFloat(s.weight)) && Number.isFinite(parseInt(s.reps)));
    if (!valid.length) return null;
    return valid.reduce((best, set) => {
        if (!best) return set;
        const w = parseFloat(set.weight) || 0, bw = parseFloat(best.weight) || 0;
        const r = parseInt(set.reps) || 0, br = parseInt(best.reps) || 0;
        return (w > bw || (w === bw && r > br)) ? set : best;
    }, null);
}

function getBestExerciseHistory(name, currentEntry) {
    const type = getExerciseTypeByName(name);
    const items = [];

    // История хранит собственный тип упражнения. Сравниваем только совместимые
    // записи, чтобы переименование типа в текущей программе не переписывало прошлое.
    // Индивидуальный лучший результат упражнения ищется ЗА ВСЮ ИСТОРИЮ,
    // независимо от сплита/программы. Количество подходов не учитывается.
    (data.history || []).forEach(entry => {
        if (entry === currentEntry) return;
        const ex = (entry.exercises || []).find(x => x.name === name);
        if (!ex || !(ex.sets || []).length || (ex.type&&ex.type!==type)) return;

        const bestSet = getBestSetForExercise(ex, ex.type||type);
        if (bestSet) items.push({ entry, ex, bestSet });
    });

    if (!items.length) return null;

    // Для силовых упражнений приоритет всегда:
    // 1) больший вес; 2) при одинаковом весе — больше повторений.
    // Поэтому 50×8 ВСЕГДА лучше 25×10.
    const compareSets = (a, b) => {
        if (type === 'strength') {
            const aw = parseFloat(a?.weight) || 0;
            const bw = parseFloat(b?.weight) || 0;
            if (aw !== bw) return aw - bw;
            return (parseInt(a?.reps) || 0) - (parseInt(b?.reps) || 0);
        }
        if (type === 'cardio') {
            const at = parseFloat(a?.time) || 0;
            const bt = parseFloat(b?.time) || 0;
            if (at !== bt) return at - bt;
            return (parseFloat(a?.intensity) || 0) - (parseFloat(b?.intensity) || 0);
        }
        return (parseInt(a?.reps) || 0) - (parseInt(b?.reps) || 0);
    };

    items.sort((a, b) => compareSets(b.bestSet, a.bestSet));
    return items[0];
}

function compareWorkoutEntries(currentEntry, bestEntry) {
    if (!bestEntry) return [];
    const result = [];
    (currentEntry.exercises || []).forEach(ex => {
        const best = (bestEntry.exercises || []).find(x => x.name === ex.name);
        if (!best) return;
        const curSets = ex.sets || [], bestSets = best.sets || [];
        const type = ex.type || getExerciseTypeByName(ex.name);

        if(type === 'strength'){
            const curBest = getBestStrengthSet(curSets);
            const bestBest = getBestStrengthSet(bestSets);
            if(curBest && bestBest){
                const curWeight = parseFloat(curBest.weight)||0;
                const bestWeight = parseFloat(bestBest.weight)||0;
                const curReps = parseInt(curBest.reps)||0;
                const bestReps = parseInt(bestBest.reps)||0;

                // Сравниваем именно лучший ОДИН подход.
                // Вес имеет приоритет; повторения используются только при одинаковом весе.
                const betterByWeight = curWeight !== bestWeight;
                const diff = betterByWeight ? curWeight-bestWeight : curReps-bestReps;
                const metricType = betterByWeight ? 'weight' : 'reps';
                const isDifferent = betterByWeight ? curWeight !== bestWeight : curReps !== bestReps;

                if(isDifferent){
                    result.push({
                        name:ex.name,
                        diff,
                        type:metricType,
                        current:metricType==='weight'?curWeight:curReps,
                        best:metricType==='weight'?bestWeight:bestReps,
                        currentWeight:curWeight,
                        currentReps:curReps,
                        bestWeight:bestWeight,
                        bestReps:bestReps
                    });
                }
            }
        } else if(type === 'cardio'){
            const curTime = Math.max(0,...curSets.map(s=>parseFloat(s.time)||0));
            const bestTime = Math.max(0,...bestSets.map(s=>parseFloat(s.time)||0));
            if(curTime !== bestTime) result.push({name:ex.name,diff:curTime-bestTime,type:'time',current:curTime,best:bestTime});
            const curIntensity = Math.max(0,...curSets.map(s=>parseFloat(s.intensity)||0));
            const bestIntensity = Math.max(0,...bestSets.map(s=>parseFloat(s.intensity)||0));
            if(curIntensity !== bestIntensity) result.push({name:ex.name,diff:curIntensity-bestIntensity,type:'intensity',current:curIntensity,best:bestIntensity});
        } else {
            const curReps = Math.max(0,...curSets.map(s=>parseInt(s.reps)||0));
            const bestReps = Math.max(0,...bestSets.map(s=>parseInt(s.reps)||0));
            if(curReps !== bestReps) result.push({name:ex.name,diff:curReps-bestReps,type:'reps',current:curReps,best:bestReps});
        }
    });
    return result;
}


function progressEsc(value){ return escapeHtml(value); }
function formatKg(v){ return Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('ru-RU',{maximumFractionDigits:1})} кг` : '—'; }
function formatNum(v){ return Number.isFinite(Number(v)) ? Number(v).toLocaleString('ru-RU',{maximumFractionDigits:1}) : '—'; }
function getAllExerciseNames(){
    const names = new Set();
    (data.programs||[]).forEach(p => (p.exercises||[]).forEach((name,i)=>{ if(p.active?.[i] !== false) names.add(name); }));
    (data.history||[]).forEach(e => (e.exercises||[]).forEach(x=>{ if(x.name) names.add(x.name); }));
    return [...names].sort((a,b)=>a.localeCompare(b,'ru'));
}
function getExerciseTypeByName(name){
    for(const p of (data.programs||[])){
        const i=(p.exercises||[]).indexOf(name);
        if(i>=0) return p.types?.[i] || 'strength';
    }

    // Fallback for archived/replaced exercises: use the type stored in history.
    for(const entry of (data.history||[])){
        const ex=(entry.exercises||[]).find(x=>x.name===name);
        if(ex?.type) return ex.type;
    }

    return 'strength';
}
function getExerciseSeries(name, history){
    const fallbackType=getExerciseTypeByName(name), rows=[];
    (history||[]).map((entry,historyIndex)=>({entry,historyIndex})).slice().sort((a,b)=>new Date(a.entry.date)-new Date(b.entry.date)).forEach(({entry,historyIndex})=>{
        const ex=(entry.exercises||[]).find(x=>normalizeExerciseKey(x?.name)===normalizeExerciseKey(name)); if(!ex) return;
        const type=ex.type||fallbackType;
        const sets=ex.sets||[]; if(!sets.length) return;
        let maxWeight=0,maxReps=0,volume=0,maxTime=0,maxIntensity=0,e1rm=0;
        sets.forEach(set=>{
            const w=parseWorkoutNumber(set.weight)||0, r=parseInt(set.reps)||0, t=parseWorkoutNumber(set.time)||0, intensity=parseWorkoutNumber(set.intensity)||0;
            maxWeight=Math.max(maxWeight,w); maxReps=Math.max(maxReps,r); volume+=w*r;
            // Conservative e1RM signal: use the reliable 1–12 rep range.
            // Higher-rep sets remain useful for volume, but are not allowed to
            // dominate the strength trend with a noisy 1RM extrapolation.
            if(w>0&&r>0&&r<=12) e1rm=Math.max(e1rm,w*(1+r/30));
            maxTime=Math.max(maxTime,t); maxIntensity=Math.max(maxIntensity,intensity);
        });
        rows.push({date:new Date(entry.date),historyIndex,weight:maxWeight,reps:maxReps,volume,e1rm,maxTime,maxIntensity,type});
    });
    return rows;
}
function getExerciseRecordData(name){
    const type=getExerciseTypeByName(name), entries=(data.history||[]).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    if(type==='strength'){
        const sets=[];
        entries.forEach(entry=>getStrengthSetsForExerciseInEntry(entry,name).forEach(s=>sets.push({weight:parseWorkoutNumber(s.weight),reps:parseWorkoutNumber(s.reps),date:entry.date})));
        if(!sets.length) return {type,metrics:[['Лучший вес','—'],['Лучшие повторы','—'],['Рабочий вес','—'],['Тренировок','—']]};
        let bestWeight=Math.max(...sets.map(x=>x.weight));
        let bestWeightReps=Math.max(...sets.filter(x=>x.weight===bestWeight).map(x=>x.reps));
        let bestReps=Math.max(...sets.map(x=>x.reps));
        let bestRepsWeight=Math.max(...sets.filter(x=>x.reps===bestReps).map(x=>x.weight));
        const working=[]; entries.forEach(entry=>{const r=getWorkingResultFromEntry(entry,name);if(r)working.push(r);});
        const work=working.length?working.reduce((a,b)=>b.weight>a.weight?b:a):null;
        let bestE1rm=0;
        sets.forEach(x=>{if(x.weight>0&&x.reps>0&&x.reps<=12) bestE1rm=Math.max(bestE1rm,x.weight*(1+x.reps/30));});
        return {type,metrics:[
            ['Лучший вес',`${formatNum(bestWeight)} кг × ${formatNum(bestWeightReps)}`],
            ['Расчётный 1ПМ',bestE1rm?`${formatNum(bestE1rm)} кг`:'—'],
            ['Лучшие повторы',`${formatNum(bestRepsWeight)} кг × ${formatNum(bestReps)}`],
            ['Лучший рабочий результат',work?`${formatNum(work.weight)} кг × ${formatNum(work.reps)} × ${work.sets}`:'—'],
            ['Тренировок',String(entries.filter(e=>getStrengthSetsForExerciseInEntry(e,name).length).length)]
        ]};
    }
    const rows=getExerciseSeries(name,data.history||[]);
    if(type==='cardio') return {type,metrics:[['Макс. время',rows.length?`${formatNum(Math.max(...rows.map(r=>r.maxTime)))} мин`:'—'],['Макс. интенсивность',rows.length?formatNum(Math.max(...rows.map(r=>r.maxIntensity))):'—'],['Тренировок',String(rows.length||'—')]]};
    return {type,metrics:[['Лучшие повторы',rows.length?`${formatNum(Math.max(...rows.map(r=>r.reps)))} повт.`:'—'],['Тренировок',String(rows.length||'—')],['Последний результат',rows.length?`${formatNum(rows[rows.length-1].reps)} повторов`:'—']]};
}
function getExerciseMetricConfig(type){
    if(type==='strength') return [
        {key:'weight',label:'Вес',unit:'кг'},
        {key:'e1rm',label:'Расчётный 1ПМ',unit:'кг'},
        {key:'reps',label:'Повторы',unit:'повт.'},
        {key:'volume',label:'Объём',unit:'кг'}
    ];
    if(type==='cardio') return [
        {key:'maxTime',label:'Время',unit:'мин'},
        {key:'maxIntensity',label:'Интенсивность',unit:''}
    ];
    return [{key:'reps',label:'Повторы',unit:'повт.'}];
}

function getWorkoutStats(history){
    const sorted=(history||[]).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    const volume=sorted.map(e=>({date:new Date(e.date),value:calculateWorkoutVolume(e)}));
    const duration=sorted.filter(e=>Number(e.durationSeconds)>0).map(e=>({date:new Date(e.date),value:Number(e.durationSeconds)/60}));
    return {sorted,volume,duration};
}
function drawLineChart(canvas, points, options={}){
    if(!canvas) return;
    const box=canvas.parentElement;
    const dpr=Math.max(1,window.devicePixelRatio||1);
    const w=Math.max(280,box?.clientWidth||300), h=Math.max(180,box?.clientHeight||200);
    canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
    canvas.style.width=w+'px'; canvas.style.height=h+'px';
    const ctx=canvas.getContext('2d'); if(!ctx) return;
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    const sub=getComputedStyle(document.body).getPropertyValue('--subtext').trim()||'#999';
    const border=getComputedStyle(document.body).getPropertyValue('--border').trim()||'rgba(128,128,128,.18)';
    const accent=(options && options.color) || getComputedStyle(document.body).getPropertyValue('--button-green').trim() || '#34c759';
    if(!points||!points.length){ctx.fillStyle=sub;ctx.font='14px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Нет данных',w/2,h/2);return;}
    const vals=points.map(p=>Number(p.value)||0), min=Math.min(...vals), max=Math.max(...vals), range=(max-min)||1;
    const m={top:18,right:14,bottom:34,left:48}, cw=Math.max(1,w-m.left-m.right), ch=Math.max(1,h-m.top-m.bottom), base=m.top+ch;
    ctx.strokeStyle=border;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(m.left,m.top);ctx.lineTo(m.left,base);ctx.lineTo(m.left+cw,base);ctx.stroke();
    ctx.font='10px sans-serif';ctx.fillStyle=sub;ctx.textAlign='right';ctx.textBaseline='alphabetic';
    for(let i=0;i<=4;i++){const v=min+range*i/4,y=base-ch*i/4;ctx.fillText(formatNum(v),m.left-5,y+3);ctx.strokeStyle=border;ctx.beginPath();ctx.moveTo(m.left,y);ctx.lineTo(m.left+cw,y);ctx.stroke();}
    const xAt=i=>m.left+(points.length===1?cw/2:i*cw/(points.length-1));
    const yAt=v=>base-((v-min)/range)*ch;
    ctx.strokeStyle=accent;ctx.lineWidth=2.5;ctx.beginPath();points.forEach((p,i)=>{const x=xAt(i),y=yAt(Number(p.value)||0);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
    ctx.fillStyle=accent;points.forEach((p,i)=>{const x=xAt(i),y=yAt(Number(p.value)||0);ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();});
    ctx.fillStyle=sub;ctx.textAlign='center';const step=Math.max(1,Math.ceil(points.length/6));
    points.forEach((p,i)=>{if(i%step===0||i===points.length-1){const d=new Date(p.date);const label=Number.isNaN(d.getTime())?'':d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});ctx.fillText(label,xAt(i),base+20);}});
}
function selectProgressExercise(name){window.progressSelectedExercise=name;renderProgressDashboard();}
function renderSelectedExerciseProgress(name,history){
    const box=document.getElementById('selectedExerciseProgress');if(!box)return;
    const rows=getExerciseSeries(name,history), allRows=getExerciseSeries(name,data.history||[]), type=getExerciseTypeByName(name);
    if(!rows.length){box.innerHTML='<div class="progress-empty">За выбранный период данных по этому упражнению нет</div>';return;}

    const first=rows[0],last=rows[rows.length-1];
    const metrics = type==='strength'
        ? [
            ['Рекорд веса',formatKg(Math.max(0,...allRows.map(r=>r.weight)))],
            ['Рекорд повторов',formatNum(Math.max(0,...allRows.map(r=>r.reps)))+' повт.'],
            ['Лучший объём',formatKg(Math.max(0,...allRows.map(r=>r.volume)))],
            ['Тренировок',String(allRows.length)]
        ]
        : type==='cardio'
        ? [
            ['Макс. время',formatNum(Math.max(0,...allRows.map(r=>r.maxTime)))+' мин'],
            ['Макс. интенсивность',formatNum(Math.max(0,...allRows.map(r=>r.maxIntensity)))],
            ['Тренировок',String(allRows.length)]
        ]
        : [
            ['Рекорд повторов',formatNum(Math.max(0,...allRows.map(r=>r.reps)))+' повт.'],
            ['Тренировок',String(allRows.length)],
            ['Последний результат',formatNum(last.reps)+' повторов']
        ];

    const metricHtml=metrics.map(m=>`<div class="progress-metric"><div class="progress-metric-label">${escapeHtml(m[0])}</div><div class="progress-metric-value">${escapeHtml(m[1])}</div></div>`).join('');
    let changes='';
    if(type==='strength'){
        changes=`<div class="analysis-line">Вес: ${progressDelta(first.weight,last.weight,' кг')}</div><div class="analysis-line">Повторы: ${progressDelta(first.reps,last.reps)}</div><div class="analysis-line">Объём: ${progressDelta(first.volume,last.volume,' кг')}</div>`;
    }else if(type==='cardio'){
        changes=`<div class="analysis-line">Время: ${progressDelta(first.maxTime,last.maxTime,' мин')}</div><div class="analysis-line">Интенсивность: ${progressDelta(first.maxIntensity,last.maxIntensity)}</div>`;
    }else{
        changes=`<div class="analysis-line">Повторы: ${progressDelta(first.reps,last.reps)}</div>`;
    }

    let charts='';
    if(type==='strength'){
        charts=`<div class="progress-section" style="padding:0;background:transparent"><div class="progress-section-title" style="margin-top:12px">Вес</div><div class="progress-chart"><canvas id="exerciseWeightChart"></canvas></div></div>
        <div class="progress-section" style="padding:0;background:transparent"><div class="progress-section-title" style="margin-top:12px">Повторы</div><div class="progress-chart"><canvas id="exerciseRepsChart"></canvas></div></div>
        <div class="progress-section" style="padding:0;background:transparent"><div class="progress-section-title" style="margin-top:12px">Объём</div><div class="progress-chart"><canvas id="exerciseVolumeChart"></canvas></div></div>`;
    }else if(type==='cardio'){
        charts=`<div class="progress-section" style="padding:0;background:transparent"><div class="progress-section-title" style="margin-top:12px">Время</div><div class="progress-chart"><canvas id="exerciseTimeChart"></canvas></div></div>
        <div class="progress-section" style="padding:0;background:transparent"><div class="progress-section-title" style="margin-top:12px">Интенсивность</div><div class="progress-chart"><canvas id="exerciseIntensityChart"></canvas></div></div>`;
    }else{
        charts=`<div class="progress-section" style="padding:0;background:transparent"><div class="progress-section-title" style="margin-top:12px">Повторы</div><div class="progress-chart"><canvas id="exerciseRepsChart"></canvas></div></div>`;
    }

    box.innerHTML=`<div class="progress-metrics">${metricHtml}</div>
    <div class="analysis-card" style="margin-top:10px"><div class="analysis-title">📊 Изменение за период</div>${changes}</div>
    ${charts}
    <div style="margin-top:10px"><div class="progress-section-title">История упражнения</div>${rows.slice().reverse().map(r=>{
        let value='';
        if(type==='strength') value=`${formatKg(r.weight)} × ${formatNum(r.reps)} повт. · ${formatKg(r.volume)}`;
        else if(type==='cardio') value=`${formatNum(r.maxTime)} мин · интенсивность ${formatNum(r.maxIntensity)}`;
        else value=`${formatNum(r.reps)} повторов`;
        return `<div class="progress-history-row"><span>${r.date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'})}</span><span>${value}</span></div>`;
    }).join('')}</div>`;

    if(type==='strength'){
        drawLineChart(document.getElementById('exerciseWeightChart'),rows.map(r=>({date:r.date,value:r.weight})));
        drawLineChart(document.getElementById('exerciseVolumeChart'),rows.map(r=>({date:r.date,value:r.volume})));
        drawLineChart(document.getElementById('exerciseRepsChart'),rows.map(r=>({date:r.date,value:r.reps})));
    }else if(type==='cardio'){
        drawLineChart(document.getElementById('exerciseTimeChart'),rows.map(r=>({date:r.date,value:r.maxTime})));
        drawLineChart(document.getElementById('exerciseIntensityChart'),rows.map(r=>({date:r.date,value:r.maxIntensity})));
    }else{
        drawLineChart(document.getElementById('exerciseRepsChart'),rows.map(r=>({date:r.date,value:r.reps})));
    }
}

function getWorkoutReplacementCandidates() {
    const currentSlots = getActiveExerciseIndices();
    const usedNames = new Set(currentSlots.map(i=>normalizeExerciseName(getWorkoutExercise(i)?.name||'')).filter(Boolean));
    return getDirectoryExercises().filter(item=>!usedNames.has(normalizeExerciseName(item.name)))
        .map(item=>({name:item.name,type:item.type,group:item.group,source:'directory',programIndex:-1,exerciseIndex:-1,inCurrentProgram:false,currentIndex:-1,splitName:item.group}));
}

let replaceExerciseCandidates = [];
let replaceExerciseSelectedKey = '__none__';
let replaceExerciseSearchText = '';

function replacementCandidateKey(c){ return `${c.source}:${normalizeExerciseName(c.name)}`; }
function selectReplacementCandidate(key){
    const c=replaceExerciseCandidates.find(x=>replacementCandidateKey(x)===key);
    if(!c) return;
    replaceExerciseSelectedKey=key;
    document.getElementById('replaceNewExerciseFields')?.classList.add('hidden');
    renderReplaceExerciseList(replaceExerciseSearchText);
}
function selectNewReplacement(){
    replaceExerciseSelectedKey='__new__';
    document.getElementById('replaceNewExerciseFields')?.classList.remove('hidden');
    document.getElementById('replaceNewExerciseName')?.focus();
    renderReplaceExerciseList(replaceExerciseSearchText);
}
function filterReplaceExerciseList(value){
    replaceExerciseSearchText=String(value||'').trim();
    const clear=document.getElementById('replaceSearchClear');
    if(clear) clear.classList.toggle('hidden',!replaceExerciseSearchText);
    renderReplaceExerciseList(replaceExerciseSearchText);
}
function clearReplaceExerciseSearch(){
    const input=document.getElementById('replaceExerciseSearch');
    if(input) input.value='';
    filterReplaceExerciseList('');
    input?.focus();
}
function renderReplaceExerciseListBase(query=''){
    const list=document.getElementById('replaceExerciseList'); if(!list) return;
    const q=normalizeExerciseName(query);
    const filtered=replaceExerciseCandidates.filter(c=>!q || normalizeExerciseName(c.name).includes(q));
    const groups=[]; const groupMap=new Map();
    filtered.forEach(c=>{
        const key=c.group||c.splitName||'Другое';
        if(!groupMap.has(key)){const g={key,title:key,items:[]};groupMap.set(key,g);groups.push(g);}
        groupMap.get(key).items.push(c);
    });
    groups.forEach(g=>g.items.sort((a,b)=>a.name.localeCompare(b.name,'ru')));
    list.innerHTML=groups.length?groups.map(g=>`<section class="replace-split-group">
      <div class="replace-split-title"><span class="replace-split-dot"></span>${escapeHtml(g.title)}</div>
      ${g.items.map(c=>{
        const key=replacementCandidateKey(c), selected=replaceExerciseSelectedKey===key;
        const typeLabel=c.type==='strength'?'Силовое':c.type==='cardio'?'Кардио':'Повторы';
        return `<button type="button" class="replace-exercise-option ${selected?'selected':''}" data-replace-key="${escapeHtml(key)}" aria-pressed="${selected?'true':'false'}">
          <span class="replace-option-name">${escapeHtml(c.name)}</span>
          <span class="replace-option-type">${typeLabel}</span>
          <span class="replace-option-check">${selected?'✓':'›'}</span>
        </button>`;
      }).join('')}
    </section>`).join(''):'<div class="replace-empty">Ничего не найдено.<br>Попробуй другое название.</div>';

    // One delegated handler survives every list re-render and cannot be shadowed by old inline handlers.
    list.onclick=function(e){
        const btn=e.target.closest('.replace-exercise-option');
        if(!btn || !list.contains(btn)) return;
        e.preventDefault();
        e.stopPropagation();
        const key=btn.getAttribute('data-replace-key');
        if(key) selectReplacementCandidate(key);
    };
}
function openWorkoutNewExerciseModal(){
    // Direct 'add exercise' flow: append a new slot. Replacement flow sets
    // its own explicit context before calling this function.
    if(!workoutNewExerciseContext) workoutNewExerciseContext={mode:'add',programIndex:currentProgram};
    const m=document.getElementById('workoutNewExerciseModal'); if(!m)return;
    document.getElementById('workoutNewExerciseName').value='';
    document.getElementById('workoutNewExerciseGroup').value='Грудь';
    document.getElementById('workoutNewExerciseType').value='strength';
    lockModalScroll(); m.classList.remove('hidden');
    setTimeout(()=>document.getElementById('workoutNewExerciseName')?.focus(),80);
}
function closeWorkoutNewExerciseModal(){document.getElementById('workoutNewExerciseModal')?.classList.add('hidden'); workoutNewExerciseContext=null; pendingWorkoutReplacementCreate=null;}
function openWorkoutNewExerciseFromReplace(){
    if(replacementSlotIndex===null || currentProgram===null){ showToast('Не удалось определить упражнение для замены'); return; }
    const slot=Number(replacementSlotIndex);
    const slots=getActiveExerciseIndices();
    if(!Number.isInteger(slot) || slot<0 || slot>=slots.length){ showToast('Не удалось определить упражнение для замены'); return; }
    // Freeze the exact slot BEFORE closing the Replace sheet. Do not depend on
    // replacementSlotIndex after closeReplaceExerciseModal(), because that
    // function intentionally clears the selected slot.
    workoutNewExerciseContext={mode:'replace',slot,programIndex:Number(currentProgram),oldRef:slots[slot]};
    pendingWorkoutReplacementCreate={slot,programIndex:Number(currentProgram)};
    closeReplaceExerciseModal();
    openWorkoutNewExerciseModal();
}

/* FTracker canonical exercise-creation duplicate system.
   One rule set, no wrappers and no second-pass duplicate checks. */
(function(){
'use strict';
const FT_STOP_WORDS=new Set(['на','в','во','с','со','и','из','для','по','под','над','к','от','у','через']);
function ftNorm(v){
  return String(v??'').normalize('NFKC').toLocaleLowerCase('ru')
    .replace(/ё/g,'е')
    .replace(/[\u2010-\u2015]/g,'-')
    .replace(/[«»„“”"'`]/g,'')
    .replace(/[^a-zа-я0-9]+/gi,' ')
    .trim()
    .replace(/\s+/g,' ');
}
function ftFullKey(v){ return ftNorm(v).replace(/ /g,''); }
function ftWords(v){
  return [...new Set(ftNorm(v).split(' ').filter(w=>w && !FT_STOP_WORDS.has(w)))];
}
function ftDistance(a,b){
  a=String(a);b=String(b);
  if(a===b)return 0;
  if(!a)return b.length;if(!b)return a.length;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++)
      cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return prev[b.length];
}
function ftExerciseList(){
  /* The duplicate search must see the same universe the user sees in the
     Exercise Directory: saved entries, built-in entries, archived entries,
     plus exercises that are already present in programs/history. */
  const result=[], seen=new Set();
  const add=(x,type='strength',group='Другое')=>{
    const name=typeof x==='string'?x:x?.name;
    if(!name || isRetiredExerciseName(name))return;
    const k=ftFullKey(name);
    if(!k||seen.has(k))return;
    seen.add(k);
    result.push({name:String(name).trim(),type:(typeof x==='object'&&x?.type)||type,group:(typeof x==='object'&&x?.group)||group});
  };
  (data.exerciseDirectory||[]).forEach(e=>add(e));
  (data.exerciseDirectoryArchived||[]).forEach(e=>add(e));
  if(typeof getDirectoryExercises==='function') getDirectoryExercises().forEach(e=>add(e));
  if(typeof EXERCISE_GUIDES!=='undefined' && Array.isArray(EXERCISE_GUIDES)) EXERCISE_GUIDES.forEach(e=>add(e));
  (data.programs||[]).forEach(p=>(p.exercises||[]).forEach((n,i)=>add(n,p.types?.[i]||'strength')));
  (data.history||[]).forEach(h=>(h.exercises||[]).forEach(e=>add(e,e?.type||'strength')));
  return result;
}
function ftFindDuplicate(name){
  const inputKey=ftFullKey(name);
  const inputWords=ftWords(name);
  const exact=[], similar=[];
  for(const ex of ftExerciseList()){
    const exKey=ftFullKey(ex.name);
    if(exKey===inputKey){
      exact.push({...ex,reason:'Название совпадает после приведения регистра, пробелов, знаков и е/ё.'});
      continue;
    }
    /* A minimal typo in an otherwise identical full name is treated as a full duplicate. */
    if(Math.min(inputKey.length,exKey.length)>=4 && ftDistance(inputKey,exKey)<=1){
      exact.push({...ex,reason:'Название отличается только минимальной ошибкой написания.'});
      continue;
    }
    const exWords=ftWords(ex.name);
    let reason='';
    outer: for(const a of inputWords){
      if(!a)continue;
      for(const b of exWords){
        if(!b)continue;
        if(a===b || a.includes(b) || b.includes(a)){
          reason=`Совпадает или частично совпадает слово «${b}».`;
          break outer;
        }
        /* Catch the same lexical stem, e.g. «кросс» / «кроссовер» or
           «тяга» / «тягой», without making every short/common word a match. */
        const commonPrefix=(()=>{
          let n=0, max=Math.min(a.length,b.length);
          while(n<max && a[n]===b[n]) n++;
          return n;
        })();
        if(commonPrefix>=4){
          reason=`Совпадает основа слова «${b}».`;
          break outer;
        }
        const min=Math.min(a.length,b.length);
        if(min>=4 && ftDistance(a,b)<=1){
          reason=`Найдено очень близкое по написанию слово «${b}».`;
          break outer;
        }
      }
    }
    if(reason) similar.push({...ex,reason});
  }
  return {exact,similar};
}
function ftEsc(v){
  return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
window.showExerciseDuplicateModal=function(name,matches,exact,onAllow){
  let modal=document.getElementById('exerciseDuplicateModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='exerciseDuplicateModal';
    modal.className='hidden';
    modal.innerHTML=`<div class="exercise-dup-sheet">
      <div class="unified-surface-header ft-modal-header exercise-dup-header">
        <button type="button" class="surface-back-btn" id="exerciseDupBack" aria-label="Назад">← Назад</button>
        <div id="exerciseDupTitle" class="surface-title"></div>
        <span class="surface-header-spacer" aria-hidden="true"></span>
      </div>
      <div id="exerciseDupSub" class="exercise-dup-sub"></div>
      <div id="exerciseDupList" class="exercise-dup-list"></div>
      <div id="exerciseDupNote" class="exercise-dup-note"></div>
      <div id="exerciseDupActions" class="exercise-dup-actions">
        <button type="button" class="dup-cancel" id="exerciseDupCancel"></button>
        <button type="button" class="dup-add" id="exerciseDupAdd">Всё равно добавить</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } else if(modal.parentElement!==document.body) document.body.appendChild(modal);

  // Remove any legacy close control if a stale DOM instance survived.
  modal.querySelector('#exerciseDupClose,.exercise-dup-close')?.remove();
  const sheet=modal.querySelector('.exercise-dup-sheet');
  const back=modal.querySelector('#exerciseDupBack');
  modal.style.setProperty('z-index','2147483647','important');
  modal.style.setProperty('position','fixed','important');
  modal.querySelector('#exerciseDupTitle').textContent=exact?'Упражнение уже существует':'Найдено похожее упражнение';
  modal.querySelector('#exerciseDupSub').textContent=exact?'Точную копию создать нельзя.':`В названии «${name}» найдено совпадение.`;
  modal.querySelector('#exerciseDupList').innerHTML=matches.slice(0,6).map(x=>
    `<div class="exercise-dup-item"><div class="exercise-dup-name">${ftEsc(x.name)}</div>
     <div class="exercise-dup-meta">${ftEsc(x.group||'Другое')} · ${x.type==='cardio'?'Кардио':'Силовое'}</div>
     <div class="exercise-dup-reason">${ftEsc(x.reason||'Похожее название.')}</div></div>`
  ).join('');
  modal.querySelector('#exerciseDupNote').textContent=exact
    ?'Создание второй записи запрещено.'
    :'Если это действительно другое упражнение, его можно добавить отдельно.';
  const actions=modal.querySelector('#exerciseDupActions');
  const cancel=modal.querySelector('#exerciseDupCancel');
  const add=modal.querySelector('#exerciseDupAdd');
  actions.classList.toggle('single',!!exact);
  add.style.display=exact?'none':'';
  cancel.textContent=exact?'Закрыть':'Нет, отменить';

  const close=()=>{
    modal.classList.add('hidden');
    modal._onAllow=null;
    if(typeof updateModalStackState==='function') updateModalStackState();
  };
  back.onclick=close;
  cancel.onclick=close;
  modal.onclick=e=>{if(e.target===modal)close();};
  modal._onAllow=typeof onAllow==='function'?onAllow:null;
  if(!exact){
    add.onclick=(e)=>{
      e.preventDefault();
      e.stopPropagation();
      const fn=modal._onAllow;
      modal._onAllow=null;
      /* Explicit approval: close this decision layer through the same modal-stack
         owner used by every other confirmation. The previous implementation
         manually edited modalStack and removed the DOM node, which could leave
         a stale overlay above the refreshed screen. */
      closeModalElement(modal);
      if(typeof fn==='function') setTimeout(fn,0);
    };
  } else {
    modal._onAllow=null;
    add.onclick=null;
  }

  openModal(modal);
  sheet?.scrollTo(0,0);
};
window.ftFindExerciseDuplicate=ftFindDuplicate;
})();

function saveWorkoutNewExercise(){
    const name=String(document.getElementById('workoutNewExerciseName')?.value||'').trim().replace(/\s+/g,' ');
    const type=document.getElementById('workoutNewExerciseType')?.value||'strength';
    const group=document.getElementById('workoutNewExerciseGroup')?.value||'Другое';
    if(!name){showToast('Введите название упражнения');return;}

    const dup=window.ftFindExerciseDuplicate(name);
    if(dup.exact.length){
      window.showExerciseDuplicateModal(name,dup.exact,true);
      return;
    }
    const create=()=>{
      const createdEntry=ensureDirectoryEntry(name,type,group);
      if(createdEntry) createdEntry.guide=createdEntry.guide||{steps:[],execution:'',primary:[],secondary:[],muscles:[],mistakes:[],recommendations:[],media:[]};
      const replacementCtx=workoutNewExerciseContext?.mode==='replace' ? {...workoutNewExerciseContext} : null;
      const replacementFallback=pendingWorkoutReplacementCreate ? {...pendingWorkoutReplacementCreate} : null;
      workoutNewExerciseContext=null;
      pendingWorkoutReplacementCreate=null;
      saveData();
      document.getElementById('workoutNewExerciseModal')?.classList.add('hidden');
      if((replacementCtx || replacementFallback) && currentProgram!==null){
        // HARD SLOT REPLACEMENT: creation from the Replace sheet can never
        // append a second exercise. The old reference is removed from the
        // active slot array and the new transient reference occupies exactly
        // the same position.
        const ctx=replacementCtx || {mode:'replace',...replacementFallback};
        if(Number(ctx.programIndex)===Number(currentProgram)){
          const slots=Array.isArray(workoutExerciseSlots)?workoutExerciseSlots.slice():[];
          const slot=Number(ctx.slot);
          if(slot>=0 && slot<slots.length){
            const oldRef=slots[slot];
            const transient={name,type,group,guide:{steps:[],execution:'',primary:[],secondary:[],muscles:[],mistakes:[],recommendations:[],media:[]}};
            workoutTransientExercises=Array.isArray(workoutTransientExercises)?workoutTransientExercises:[];
            workoutTransientExercises.push(transient);
            const ref=-(workoutTransientExercises.length);
            if(oldRef!==undefined) delete workoutSets[oldRef];
            delete workoutSets[ref];
            slots.splice(slot,1,ref);
            workoutExerciseSlots=slots;
            currentExerciseIndex=Math.min(slot,Math.max(0,slots.length-1));
            if(!Array.isArray(workoutPlanSnapshot)) workoutPlanSnapshot=[];
            if(!workoutPlanSnapshot[slot]) workoutPlanSnapshot[slot]={plannedName:'',plannedType:type,plannedGroup:group};
            workoutPlanSnapshot[slot].status='replaced';
            workoutPlanSnapshot[slot].actualName=name;
            workoutPlanSnapshot[slot].actualType=type;
            workoutPlanSnapshot[slot].actualGroup=group;
            saveDraft();
            renderExerciseStrip();
            renderExercise();
            showToast(`Заменено новым упражнением: «${name}»`);
            return;
          }
        }
      }
      if(currentProgram!==null){
        const transient={name,type,group,guide:{steps:[],execution:'',primary:[],secondary:[],muscles:[],mistakes:[],recommendations:[],media:[]}};
        workoutTransientExercises=Array.isArray(workoutTransientExercises)?workoutTransientExercises:[];
        workoutTransientExercises.push(transient);
        const ref=-(workoutTransientExercises.length);
        workoutExerciseSlots=getActiveExerciseIndices().concat([ref]);
        currentExerciseIndex=workoutExerciseSlots.length-1;
        workoutSets[ref]=[];
        saveDraft(); renderExerciseStrip(); renderExercise();
      }
      showToast('Упражнение добавлено');
    };
    if(dup.similar.length){
      window.showExerciseDuplicateModal(name,dup.similar,false,create);
      return;
    }
    create();
}
function openReplaceExerciseModal(slotIndex){
    if(currentProgram===null || !data.programs[currentProgram]) return;
    const slots=getActiveExerciseIndices();
    if(slotIndex<0 || slotIndex>=slots.length) return;
    replacementSlotIndex=slotIndex;
    const currentIdx=slots[slotIndex], program=data.programs[currentProgram];
    const currentName=getWorkoutExercise(currentIdx)?.name || program.exercises[currentIdx];
    document.getElementById('replaceExerciseCurrent').textContent=`Сейчас: ${currentName}`;
    const replaceHeaderTitle=document.querySelector('#replaceExerciseModal > .replace-exercise-sheet > .unified-surface-header > .surface-title');
    if(replaceHeaderTitle) replaceHeaderTitle.textContent=currentName;
    replaceExerciseCandidates=getWorkoutReplacementCandidates().filter(c=>!(c.inCurrentProgram && c.currentIndex===currentIdx));
    replaceExerciseSelectedKey='__none__';
    replaceExerciseSearchText='';
    const input=document.getElementById('replaceExerciseSearch');
    if(input) input.value='';
    document.getElementById('replaceSearchClear')?.classList.add('hidden');
    renderReplaceExerciseList('');
    lockModalScroll(); document.getElementById('replaceExerciseModal').classList.remove('hidden');
}
function handleReplaceSelectChange(){
    // Совместимость со старыми вызовами, если они остались в DOM.
    const select=document.getElementById('replaceExerciseSelect');
    if(!select) return;
    if(select.value==='__new__') selectNewReplacement();
}
function closeReplaceExerciseModal(){ document.getElementById('replaceExerciseModal')?.classList.add('hidden'); replacementSlotIndex=null; replaceExerciseSelectedKey='__none__'; }
function confirmReplaceExercise(){
    if(replacementSlotIndex===null || currentProgram===null) return;
    const slots=Array.isArray(workoutExerciseSlots)?workoutExerciseSlots.slice():[];
    const slot=replacementSlotIndex;
    if(slot<0 || slot>=slots.length){ showToast('Не удалось определить упражнение'); return; }

    const oldRef=slots[slot];
    const oldMeta=getWorkoutExercise(oldRef);
    let newRef=null, replacementName='', replacementType='strength';

    if(replaceExerciseSelectedKey==='__new__' || replaceExerciseSelectedKey==='__none__'){
        showToast('Сначала выберите упражнение из списка');
        return;
    }

    const candidate=replaceExerciseCandidates.find(x=>replacementCandidateKey(x)===replaceExerciseSelectedKey);
    if(!candidate){ showToast('Выберите упражнение'); return; }

    replacementName=String(candidate.name||'').trim();
    replacementType=candidate.type||'strength';
    if(!replacementName){ showToast('Некорректное упражнение'); return; }

    // Replacement is a SLOT operation, not an ADD operation:
    // the old exercise disappears from this workout and the new one occupies
    // exactly the same position. The program itself is never modified.
    if(normalizeExerciseName(replacementName)===normalizeExerciseName(oldMeta?.name||'')){
        closeReplaceExerciseModal();
        return;
    }

    // Never allow an exercise that is already present in another slot.
    const duplicateSlot=slots.findIndex((ref,i)=>i!==slot && normalizeExerciseName(getWorkoutExercise(ref)?.name||'')===normalizeExerciseName(replacementName));
    if(duplicateSlot!==-1){ showToast('Это упражнение уже есть в этой тренировке'); return; }

    if(candidate.source==='program' && candidate.programIndex===currentProgram){
        newRef=candidate.exerciseIndex;
    }else{
        // Exercises borrowed from the directory are temporary for this session.
        workoutTransientExercises=Array.isArray(workoutTransientExercises)?workoutTransientExercises:[];
        const transientIndex=workoutTransientExercises.length;
        workoutTransientExercises.push({
            name:replacementName,
            type:replacementType,
            group:candidate.group||fScoreExerciseGroup(replacementName,replacementType),
            sourceProgram:candidate.programIndex,
            sourceExerciseIndex:candidate.exerciseIndex
        });
        newRef=-(transientIndex+1);
    }

    // Remove ALL draft data belonging to the old slot/reference. This is
    // important: stale sets must not be counted after a replacement.
    if(oldRef!==undefined) delete workoutSets[oldRef];
    delete workoutSets[newRef];

    // Keep the original planned exercise in the same plan slot so F-Score
    // evaluates the replacement against what was actually planned.
    if(!Array.isArray(workoutPlanSnapshot)) workoutPlanSnapshot=[];
    if(!workoutPlanSnapshot[slot]){
        workoutPlanSnapshot[slot]={
            plannedName:oldMeta?.name||'',
            plannedType:oldMeta?.type||'strength',
            plannedGroup:fScoreExerciseGroup(oldMeta?.name||'',oldMeta?.type||'strength'),
            status:'pending'
        };
    }
    const plan=workoutPlanSnapshot[slot];
    plan.status='replaced';
    plan.actualName=replacementName;
    plan.actualType=replacementType;
    plan.actualGroup=fScoreExerciseGroup(replacementName,replacementType);
    plan.score=(fScoreNormName(plan.plannedGroup)&&fScoreNormName(plan.plannedGroup)===fScoreNormName(plan.actualGroup))?100:50;
    workoutPlanSnapshot[slot]=plan;

    // Replace in-place. Do NOT push/append.
    // The session is slot-based: one planned slot can contain exactly one
    // current exercise. Remove any stale set keys that point to the old
    // exercise, then write the new reference into the same slot.
    workoutExerciseSlots=slots;
    workoutExerciseSlots[slot]=newRef;
    const validRefs=new Set(workoutExerciseSlots.map(Number));
    Object.keys(workoutSets||{}).forEach(k=>{
        const ref=Number(k);
        if(!validRefs.has(ref)) delete workoutSets[k];
    });
    currentExerciseIndex=slot;

    // Keep snapshot and slots one-to-one. This prevents the old exercise from
    // reappearing in the saved plan/history as an extra eighth exercise.
    if(workoutPlanSnapshot.length>workoutExerciseSlots.length){
        workoutPlanSnapshot=workoutPlanSnapshot.slice(0,workoutExerciseSlots.length);
    }

    saveDraft();
    closeReplaceExerciseModal();
    renderExerciseStrip();
    renderExercise();
    showToast(`Заменено: «${oldMeta?.name||'упражнение'}» → «${replacementName}»`);
}

function openExerciseModal(realIdx){
    if(currentProgram===null || !data.programs[currentProgram]) return;
    const meta=getWorkoutExercise(realIdx); if(!meta)return;
    openedExerciseName=meta.name; exerciseGraphMetric=meta.type==='strength'?'weight':'reps';
    const title=document.querySelector('#exerciseModal .unified-surface-header .surface-title'); if(title)title.textContent=meta.name; const exerciseName=document.getElementById('exerciseModalExerciseName'); if(exerciseName)exerciseName.textContent=meta.name;
    const modal=document.getElementById('exerciseModal'); if(!modal)return;
    modal.classList.remove('hidden');
    const labels=[['history','Обзор'],['records','Рекорды'],['graph','График']];
    modal.querySelectorAll('.tabs .tab').forEach(t=>{const x=labels.find(v=>v[0]===t.dataset.tab);if(x)t.textContent=x[1];});
    switchExerciseModalTab('history');
}
function closeExerciseModal(){document.getElementById('exerciseModal').classList.add('hidden');openedExerciseName=null;}
let exerciseGraphMetric='weight';
function getExerciseGraphMetrics(type){
    if(type==='strength') return [
        {key:'weight',label:'Вес'},
        {key:'reps',label:'Повторы'}
    ];
    if(type==='cardio') return [
        {key:'maxTime',label:'Время'},
        {key:'maxIntensity',label:'Интенсивность'}
    ];
    return [{key:'reps',label:'Повторы'}];
}
function renderExerciseGraph(){
    const name=openedExerciseName;if(!name)return;
    const type=getExerciseTypeByName(name), all=getExerciseSeries(name,data.history||[]);
    const metrics=getExerciseGraphMetrics(type);
    if(!metrics.some(m=>m.key===exerciseGraphMetric)) exerciseGraphMetric=metrics[0]?.key||'reps';
    const controls=document.getElementById('exerciseGraphControls');
    if(controls){
        controls.innerHTML=metrics.map(m=>`<button type="button" class="exercise-graph-metric ${m.key===exerciseGraphMetric?'active':''}" onclick="setExerciseGraphMetric('${m.key}')">${escapeHtml(m.label)}</button>`).join('');
    }
    const canvas=document.getElementById('progressGraph');
    const pts=all.map(r=>({date:r.date,value:Number(r[exerciseGraphMetric])||0}));
    setTimeout(()=>drawLineChart(canvas,pts),0);
}
function setExerciseGraphMetric(metric){exerciseGraphMetric=metric;renderExerciseGraph();}
function switchExerciseModalTab(tab){
    const modal=document.getElementById('exerciseModal'); if(!modal)return;
    modal.querySelectorAll('.tabs .tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
    ['history','records','graph'].forEach(x=>{const el=document.getElementById('tab'+x.charAt(0).toUpperCase()+x.slice(1));if(el)el.classList.toggle('active',x===tab);});
    const name=openedExerciseName;if(!name)return;
    const all=getExerciseSeries(name,data.history||[]), type=getExerciseTypeByName(name);
    if(tab==='history'){
        const working=getLatestWorkingResult(name,null,new Date().toISOString());
        const current=all.length?all[all.length-1]:null;
        const hero=type==='strength'&&working?`<div class="analytics-hero"><div><span>Рабочий вес</span><b>${formatNum(working.weight)} кг</b><small>${formatNum(working.reps)} повторов · ${working.sets} подхода</small></div><div class="analytics-hero-badge">Актуально</div></div>`:'';
        const html=hero+(all.length?`<div class="analytics-section-title">Последние тренировки</div>`+all.slice().reverse().map(r=>{
            let main=''; if(type==='strength')main=`${formatKg(r.weight)} × ${formatNum(r.reps)} повт.`; else if(type==='cardio')main=`${formatNum(r.maxTime)} мин · инт. ${formatNum(r.maxIntensity)}`; else main=`${formatNum(r.reps)} повторов`;
            return `<div class="analytics-history-row analytics-history-row-clickable" data-exercise-history-index="${Number(r.historyIndex)}" data-exercise-history-name="${escapeHtml(name)}" role="button" tabindex="0" aria-label="Открыть результат упражнения"><div><strong>${r.date.toLocaleDateString('ru-RU',{day:'2-digit',month:'short'})}</strong><span>${main}</span></div><i>›</i></div>`;
        }).join(''):'<div class="progress-empty">Истории пока нет</div>');
        document.getElementById('tabHistory').innerHTML=html;
    }else if(tab==='records'){
        const record=getExerciseRecordData(name);
        const workoutCountMetric=record.metrics.find(m=>m?.[0]==='Тренировок');
        document.getElementById('tabRecords').innerHTML=`<div class="records-hero"><div class="records-hero-kicker">ЛУЧШИЕ РЕЗУЛЬТАТЫ</div><div class="records-grid">${record.metrics.slice(0,3).map((m,i)=>`<div class="record-modern ${i===2?'record-work':''}"><div class="record-modern-icon">${i===0?'🏆':i===1?'🔁':'💪'}</div><div class="record-modern-label">${escapeHtml(m[0])}</div><div class="record-modern-value">${escapeHtml(m[1])}</div></div>`).join('')}</div><div class="record-modern-foot">Тренировок: <b>${escapeHtml(workoutCountMetric?.[1]||'—')}</b></div></div>`;
    }else renderExerciseGraph();
}

function showBodyMeasurements() { showScreen('bodyScreen'); renderMeasurementScreen(); }

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function renderMeasurementScreen() {
    closeBodyHistory();
    const form = document.getElementById('measurementForm');
    const fields = getMeasurementFields();
    const lastIndex = data.measurements.length - 1;
    const last = lastIndex >= 0 ? data.measurements[lastIndex] : null;

    ensureMeasurementHistoryModal();

    if (!last) {
        form.innerHTML = `
            <div class="body-empty-card">
                <div class="body-empty-icon">📏</div>
                <div class="body-empty-title">Замеров пока нет</div>
                <div class="body-empty-sub">Добавь первый замер, чтобы отслеживать изменения.</div>
                <button class="body-primary-action" onclick="openNewMeasurementModal()">＋ Новый замер</button>
                <button class="body-secondary-action" onclick="openMeasurementManager()">⚙️ Параметры</button>
            </div>
        `;
        return;
    }

    const dateText = new Date(last.date).toLocaleDateString('ru-RU', {day:'2-digit', month:'long', year:'numeric'});
    const rows = fields.map(f => {
        const cur = last[f.key];
        if (cur === null || cur === undefined || cur === '') return '';
        return `<div class="body-value-item"><span>${escapeHtml(f.label)}</span><strong>${escapeHtml(cur)}</strong></div>`;
    }).join('');

    form.innerHTML = `
        <div class="body-current-card">
            <div class="body-section-head">
                <div>
                    <div class="body-section-kicker">Последний замер</div>
                    <div class="body-section-date">${dateText}</div>
                </div>
                <button class="body-icon-action" onclick="openMeasurementManager()" title="Параметры">⚙️</button>
            </div>
            <div class="body-values-grid">${rows || '<div class="body-no-values">Нет заполненных параметров</div>'}</div>
            <div class="body-main-actions">
                <button class="body-primary-action" onclick="openNewMeasurementModal()">＋ Новый замер</button>
                <button class="body-secondary-action" onclick="openLastMeasurementEdit()">✏️ Изменить</button>
            </div>
        </div>

        <div class="body-tools-card">
            <div class="body-tools-grid">
                <button class="body-tool" onclick="openBodyHistory()">
                    <span class="body-tool-icon">↺</span>
                    <span><strong>История</strong><small>${data.measurements.length} ${data.measurements.length===1?'замер':'замеров'}</small></span>
                    <span class="body-tool-arrow">›</span>
                </button>
                <button class="body-tool" onclick="openBodyGraph()">
                    <span class="body-tool-icon">↗</span>
                    <span><strong>Динамика</strong><small>График параметра</small></span>
                    <span class="body-tool-arrow">›</span>
                </button>
            </div>
        </div>

        <div id="comparisonBlock"></div>
    `;

    updateFScoreCustomModeInfo();
    showLatestMeasurementComparison();
}

function ensureMeasurementHistoryModal() {
    let modal = document.getElementById('measurementHistoryModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'measurementHistoryModal';
    modal.className = 'catalog-modal hidden';
    modal.onclick = function(e){ if(e.target === modal) closeBodyHistory(); };
    modal.innerHTML = `
        <div class="catalog-modal-content body-history-modal-content">
            <div class="body-history-modal-head unified-surface-header">
                <button type="button" class="surface-back-btn" onclick="closeBodyHistory()">← Назад</button>
                <div class="surface-title">История</div><span aria-hidden="true" class="surface-header-spacer"></span>
            </div>
            <div class="body-history-modal-sub">Все сохранённые измерения</div>
            <div id="measurementHistory"></div>
        </div>`;
    document.body.appendChild(modal);
    return modal;
}

function openBodyHistory() {
    const modal = ensureMeasurementHistoryModal();
    renderMeasurementHistory();
    modal.classList.remove('hidden');
}
function closeBodyHistory() { document.getElementById('measurementHistoryModal')?.classList.add('hidden'); }

function openNewMeasurementModal() {
    const fields = getMeasurementFields();
    let modal = document.getElementById('newMeasurementModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'newMeasurementModal';
        modal.className = 'catalog-modal hidden';
        modal.onclick = function(e){ if(e.target === modal) closeNewMeasurementModal(); };
        document.body.appendChild(modal);
    }

    const today = new Date().toISOString().slice(0,10);
    // Для нового замера автоматически подставляем последнее сохранённое
    // значение каждого параметра. Если в последнем замере параметр пустой,
    // берём самое свежее непустое значение из истории.
    const latestValueForField = key => {
        for(let i=(data.measurements||[]).length-1;i>=0;i--){
            const value=data.measurements[i]?.[key];
            if(value!==null && value!==undefined && value!=='') return value;
        }
        return '';
    };
    modal.innerHTML = `
        <div class="catalog-modal-content measurement-manager-modal-content">
            <div class="unified-surface-header">
                <button class="surface-back-btn" type="button" onclick="closeNewMeasurementModal()">← Назад</button>
                <div class="surface-title">Новый замер</div>
                <span class="surface-header-spacer" aria-hidden="true"></span>
            </div>
            <div class="measurement-modal-note">Последние значения подставлены автоматически — измени только то, что поменялось.</div>
            <div class="measurement-form-compact">
                <div class="measurement-date-compact">
                    <label class="field-label">Дата</label>
                    <input type="date" id="newMeasurementDate" value="${today}">
                </div>
                <div class="measurement-fields-grid">
                ${fields.map(f => {
                    const latest=latestValueForField(f.key);
                    return `<div class="measurement-field-compact">
                        <label class="field-label">${escapeHtml(f.label)}</label>
                        <input type="number" step="any" id="newMeas_${escapeHtml(f.key)}" value="${latest!==''?escapeHtml(latest):''}" placeholder="—">
                    </div>`;
                }).join('')}
                </div>
            </div>
            <div class="measurement-actions-compact">
                <button onclick="prepareNewMeasurementSave()">💾 Сохранить</button>
                <button class="gray" onclick="closeNewMeasurementModal()">Отмена</button>
            </div>
        </div>`;
    modal.classList.remove('hidden');
}

function closeNewMeasurementModal() {
    document.getElementById('newMeasurementModal')?.classList.add('hidden');
}

function prepareNewMeasurementSave() {
    const fields = getMeasurementFields();
    const date = document.getElementById('newMeasurementDate')?.value;
    if (!date) { showToast('Выберите дату'); return; }

    const measurement = { date: new Date(date + 'T12:00:00').toISOString() };
    fields.forEach(field => {
        const input = document.getElementById(`newMeas_${field.key}`);
        const value = input ? parseFloat(input.value) : NaN;
        measurement[field.key] = Number.isFinite(value) ? value : null;
    });

    if (fields.every(field => measurement[field.key] === null)) {
        showToast('Введите хотя бы одно значение');
        return;
    }

    pendingMeasurementSave = measurement;
    pendingMeasurementEditIndex = null;

    const filled = fields
        .filter(f => measurement[f.key] != null)
        .map(f => `${f.label}: ${measurement[f.key]}`)
        .join(' · ');

    document.getElementById('measurementSaveConfirmText').textContent = filled;
    closeNewMeasurementModal();
    lockModalScroll(); document.getElementById('measurementSaveConfirmModal').classList.remove('hidden');
}

function openLastMeasurementEdit() {
    const fields = getMeasurementFields();
    const index = data.measurements.length - 1;
    if (index < 0) return openNewMeasurementModal();

    const last = data.measurements[index];
    let modal = document.getElementById('editMeasurementModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editMeasurementModal';
        modal.className = 'catalog-modal hidden';
        modal.onclick = function(e){ if(e.target === modal) closeLastMeasurementEdit(); };
        document.body.appendChild(modal);
    }

    const dateValue = new Date(last.date).toISOString().slice(0,10);

    modal.innerHTML = `
        <div class="catalog-modal-content measurement-manager-modal-content">
            <div class="unified-surface-header">
                <button class="surface-back-btn" type="button" onclick="closeLastMeasurementEdit()">← Назад</button>
                <div class="surface-title">Изменить замер</div>
                <span class="surface-header-spacer" aria-hidden="true"></span>
            </div>
            <div class="measurement-modal-note">Изменения исправят существующий последний замер, новый замер не создаётся.</div>
            <div class="measurement-form-compact">
                <div class="measurement-date-compact">
                    <label class="field-label">Дата</label>
                    <input type="date" id="editMeasurementDate" value="${dateValue}">
                </div>
                <div class="measurement-fields-grid">
                ${fields.map(f => `<div class="measurement-field-compact">
                    <label class="field-label">${escapeHtml(f.label)}</label>
                    <input type="number" step="any" id="editMeas_${escapeHtml(f.key)}"
                           value="${last[f.key] != null ? escapeHtml(last[f.key]) : ''}"
                           placeholder="—">
                </div>`).join('')}
                </div>
            </div>
            <div class="measurement-actions-compact">
                <button onclick="prepareLastMeasurementEdit()">💾 Сохранить изменения</button>
                <button class="gray" onclick="closeLastMeasurementEdit()">Отмена</button>
            </div>
        </div>`;

    modal.classList.remove('hidden');
}

function closeLastMeasurementEdit() {
    document.getElementById('editMeasurementModal')?.classList.add('hidden');
}

function prepareLastMeasurementEdit() {
    const fields = getMeasurementFields();
    const index = data.measurements.length - 1;
    if (index < 0) return;

    const date = document.getElementById('editMeasurementDate')?.value;
    if (!date) { showToast('Выберите дату'); return; }

    const measurement = { ...data.measurements[index] };
    measurement.date = new Date(date + 'T12:00:00').toISOString();

    fields.forEach(field => {
        const input = document.getElementById(`editMeas_${field.key}`);
        const value = input ? parseFloat(input.value) : NaN;
        measurement[field.key] = Number.isFinite(value) ? value : null;
    });

    if (fields.every(field => measurement[field.key] === null)) {
        showToast('Введите хотя бы одно значение');
        return;
    }

    pendingMeasurementSave = measurement;
    pendingMeasurementEditIndex = index;

    const filled = fields
        .filter(f => measurement[f.key] != null)
        .map(f => `${f.label}: ${measurement[f.key]}`)
        .join(' · ');

    document.getElementById('measurementSaveConfirmText').textContent = filled;
    closeLastMeasurementEdit();
    lockModalScroll(); document.getElementById('measurementSaveConfirmModal').classList.remove('hidden');
}

function openMeasurementManager() {
    renderMeasurementFieldManager();
    document.getElementById('measurementManagerModal').classList.remove('hidden');
}
function closeMeasurementManager() {
    document.getElementById('measurementManagerModal').classList.add('hidden');
}

function renderMeasurementFieldManager() {
    const container = document.getElementById('measurementManagerList');
    if (!container) return;
    const fields = getMeasurementFields();
    container.innerHTML = fields.map((f, idx) => `
        <div class="measurement-manager-row">
            <div class="measurement-manager-row-name">${escapeHtml(f.label)}</div>
            <button onclick="openMeasurementFieldEditor(${idx})">✏️</button>
            <button onclick="deleteMeasurementField(${idx})">🗑️</button>
        </div>
    `).join('');
}

function openMeasurementFieldEditor(index = null) {
    editingMeasurementFieldIndex = index;
    const input = document.getElementById('measurementFieldNameInput');
    const title = document.getElementById('measurementFieldModalTitle');
    const fields = getMeasurementFields();
    if (index !== null && fields[index]) {
        title.textContent = 'Изменить параметр';
        input.value = fields[index].label;
    } else {
        title.textContent = 'Новый параметр';
        input.value = '';
    }
    document.getElementById('measurementFieldModal').classList.remove('hidden');
    setTimeout(() => input.focus(), 80);
}

function closeMeasurementFieldEditor() {
    document.getElementById('measurementFieldModal').classList.add('hidden');
    editingMeasurementFieldIndex = null;
}

function saveMeasurementFieldEditor() {
    const input = document.getElementById('measurementFieldNameInput');
    const cleanLabel = (input.value || '').trim();
    if (!cleanLabel) { showToast('Введите название параметра'); return; }

    const fields = getMeasurementFields();
    if (fields.some((f, i) => i !== editingMeasurementFieldIndex && f.label.toLowerCase() === cleanLabel.toLowerCase())) {
        showToast('Такой параметр уже существует');
        return;
    }

    if (editingMeasurementFieldIndex !== null && fields[editingMeasurementFieldIndex]) {
        fields[editingMeasurementFieldIndex].label = cleanLabel;
        saveData(true, 'Изменение параметров замеров');
        closeMeasurementFieldEditor();
        renderMeasurementFieldManager();
        renderMeasurementScreen();
        showToast('Параметр изменён');
        return;
    }

    const key = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    fields.push({ key, label: cleanLabel });
    data.measurements.forEach(m => { if (!(key in m)) m[key] = null; });
    saveData();
    closeMeasurementFieldEditor();
    renderMeasurementFieldManager();
    renderMeasurementScreen();
    showToast('Параметр добавлен');
}

function deleteMeasurementField(index) {
    const fields = getMeasurementFields();
    const field = fields[index];
    if (!field) return;
    if (fields.length <= 1) { showToast('Должен остаться хотя бы один параметр'); return; }
    pendingDeleteType = 'measurementField';
    pendingDeleteIndex = index;
    showDeleteConfirm(`Удалить параметр «${escapeHtml(field.label)}»?`);
}

function findPreviousMeasurement(index, key) {
    for (let i = index - 1; i >= 0; i--) {
        const value = data.measurements[i]?.[key];
        if (value !== null && value !== undefined && value !== '') return { measurement: data.measurements[i], index: i };
    }
    return null;
}

function formatMeasurementDiff(current, previous) {
    const diff = Number(current) - Number(previous);
    if (!Number.isFinite(diff) || Math.abs(diff) < 0.000001) {
        return `<div class="measurement-change same"><span class="measurement-arrow">●</span><span>Без изменений</span></div>`;
    }
    const value = Number.isInteger(diff) ? String(Math.abs(diff)) : Math.abs(diff).toFixed(1).replace(/\.0$/, '');
    if (diff > 0) return `<div class="measurement-change up"><span class="measurement-arrow">▲</span><span>+${value}</span></div>`;
    return `<div class="measurement-change down"><span class="measurement-arrow">▼</span><span>−${value}</span></div>`;
}

function buildMeasurementComparison(measurementIndex) {
    const current = data.measurements[measurementIndex];
    if (!current) return '';
    const fields = getMeasurementFields();
    const items = [];
    fields.forEach(field => {
        const cur = current[field.key];
        if (cur === null || cur === undefined || cur === '') return;
        const previous = findPreviousMeasurement(measurementIndex, field.key);
        const changeHtml = previous ? formatMeasurementDiff(cur, previous.measurement[field.key]) : `<div class="measurement-change same"><span class="measurement-arrow">●</span><span>Первое значение</span></div>`;
        items.push(`<div class="body-comparison-row"><div><div class="body-comparison-name">${escapeHtml(field.label)}</div>${changeHtml}</div><div class="body-comparison-value">${escapeHtml(cur)}</div></div>`);
    });
    return items.length ? `<div class="body-comparison-list">${items.join('')}</div>` : '<div style="color:var(--subtext);font-size:13px;">Нет заполненных параметров.</div>';
}

function showLatestMeasurementComparison() {
    const block = document.getElementById('comparisonBlock');
    if (!block) return;
    if (!data.measurements.length) { block.innerHTML = ''; return; }
    block.innerHTML = `<div class="body-comparison-card"><div class="body-comparison-title">Сравнение с предыдущим замером</div>${buildMeasurementComparison(data.measurements.length - 1)}</div>`;
}

function renderMeasurementHistory() {
    const container = document.getElementById('measurementHistory');
    if (!container) return;
    if (!data.measurements.length) { container.innerHTML = '<div style="color:var(--subtext);text-align:center;padding:12px 0;">Пока нет сохранённых замеров</div>'; return; }
    const fields = getMeasurementFields();
    container.innerHTML = data.measurements.slice().reverse().map((m, reverseIdx) => {
        const realIdx = data.measurements.length - 1 - reverseIdx;
        const date = new Date(m.date).toLocaleDateString('ru-RU');
        const values = fields.filter(f => m[f.key] !== null && m[f.key] !== undefined && m[f.key] !== '').map(f => `<span class="body-history-value">${escapeHtml(f.label)}: ${escapeHtml(m[f.key])}</span>`).join('');
        const comparison = realIdx > 0 ? `<div class="body-history-comparison">${buildMeasurementComparison(realIdx)}</div>` : '';
        return `<div class="body-history-item"><div class="body-history-item-head"><div class="body-history-date">${date}</div><div style="display:flex;gap:6px;"><button class="gray" onclick="openHistoricalMeasurementEdit(${realIdx})">✏️</button><button class="body-history-delete gray" onclick="deleteMeasurement(${realIdx})">🗑️</button></div></div><div class="body-history-values">${values || '<span style="color:var(--subtext);font-size:12px;">Нет значений</span>'}</div>${comparison}</div>`;
    }).join('');
}

function openHistoricalMeasurementEdit(index) {
    closeBodyHistory();
    const measurement = data.measurements[index];
    if (!measurement) return;
    const fields = getMeasurementFields();
    let modal = document.getElementById('historicalMeasurementEditModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'historicalMeasurementEditModal';
        modal.className = 'catalog-modal hidden';
        modal.onclick = function(e){ if(e.target===modal) closeHistoricalMeasurementEdit(); };
        document.body.appendChild(modal);
    }
    const dateValue = new Date(measurement.date).toISOString().slice(0,10);
    modal.innerHTML = `<div class="catalog-modal-content measurement-manager-modal-content historical-measurement-edit-content">
        <div class="unified-surface-header ft-modal-header historical-measurement-edit-header">
            <button class="surface-back-btn" type="button" onclick="closeHistoricalMeasurementEdit()" aria-label="Назад">← Назад</button>
            <div class="surface-title">Изменить замер</div>
            <span class="surface-header-spacer" aria-hidden="true"></span>
        </div>
        <div class="measurement-modal-note">Изменяется именно сохранённый замер за выбранную дату.</div>
        <div class="historical-measurement-date-compact">
            <label class="field-label">Дата</label>
            <input type="date" id="historicalMeasurementDate" value="${dateValue}">
        </div>
        <div class="historical-measurement-fields-grid">
            ${fields.map(f => `<div class="historical-measurement-field">
                <label class="field-label">${escapeHtml(f.label)}</label>
                <input type="number" step="any" id="historicalMeas_${escapeHtml(f.key)}" value="${measurement[f.key] ?? ''}" placeholder="—">
            </div>`).join('')}
        </div>
        <div class="historical-measurement-actions">
            <button onclick="prepareHistoricalMeasurementSave(${index})">💾 Сохранить изменения</button>
            <button class="gray" onclick="closeHistoricalMeasurementEdit()">Отмена</button>
        </div>
    </div>`;
    modal.classList.remove('hidden');
}
function closeHistoricalMeasurementEdit(){ document.getElementById('historicalMeasurementEditModal')?.classList.add('hidden'); }
function prepareHistoricalMeasurementSave(index){
    const measurement=data.measurements[index];
    if(!measurement) return;
    const date=document.getElementById('historicalMeasurementDate')?.value;
    if(!date){ showToast('Выберите дату'); return; }
    const fields=getMeasurementFields();
    const updated={...measurement,date:new Date(date+'T12:00:00').toISOString()};
    fields.forEach(f=>{
        const v=parseFloat(document.getElementById('historicalMeas_'+f.key)?.value);
        updated[f.key]=Number.isFinite(v)?v:null;
    });
    if(fields.every(f=>updated[f.key]===null)){ showToast('Введите хотя бы одно значение'); return; }
    pendingMeasurementSave=updated;
    pendingMeasurementEditIndex=index;
    document.getElementById('measurementSaveConfirmText').textContent=fields.filter(f=>updated[f.key]!=null).map(f=>`${f.label}: ${updated[f.key]}`).join(' · ');
    closeHistoricalMeasurementEdit();
    lockModalScroll(); document.getElementById('measurementSaveConfirmModal').classList.remove('hidden');
}

function deleteMeasurement(index) { pendingDeleteType = 'measurement'; pendingDeleteIndex = index; showDeleteConfirm('Удалить этот замер?'); }

function saveMeasurements() {
    const fields = getMeasurementFields();
    const measurement = { date: new Date().toISOString() };
    fields.forEach(field => {
        const input = document.getElementById(`meas_${field.key}`);
        const value = input ? parseFloat(input.value) : NaN;
        measurement[field.key] = Number.isFinite(value) ? value : null;
    });
    if (fields.every(field => measurement[field.key] === null)) {
        showToast('Введите хотя бы одно значение');
        return;
    }

    pendingMeasurementSave = measurement;
    pendingMeasurementEditIndex = null;

    const filled = fields.filter(f=>measurement[f.key]!=null)
        .map(f=>`${f.label}: ${measurement[f.key]}`).join(' · ');
    document.getElementById('measurementSaveConfirmText').textContent = filled;
    lockModalScroll(); document.getElementById('measurementSaveConfirmModal').classList.remove('hidden');
}

function closeMeasurementSaveConfirm() {
    document.getElementById('measurementSaveConfirmModal').classList.add('hidden');
    pendingMeasurementSave = null;
    pendingMeasurementEditIndex = null;
}

function confirmSaveMeasurements() {
    if (!pendingMeasurementSave) return;

    if (pendingMeasurementEditIndex !== null && data.measurements[pendingMeasurementEditIndex]) {
        data.measurements[pendingMeasurementEditIndex] = pendingMeasurementSave;
        data.measurements.sort((a,b) => new Date(a.date) - new Date(b.date));
        showToast('Замер изменён');
    } else {
        data.measurements.push(pendingMeasurementSave);
        data.measurements.sort((a,b) => new Date(a.date) - new Date(b.date));
        showToast('Новый замер сохранён');
    }

    saveData(true, pendingMeasurementEditIndex !== null ? 'Изменение замера' : 'Добавление замера');
    pendingMeasurementSave = null;
    pendingMeasurementEditIndex = null;
    document.getElementById('measurementSaveConfirmModal').classList.add('hidden');
    renderMeasurementScreen();
}

function openBodyGraph() {
    const select=document.getElementById('bodyGraphField');
    const fields=getMeasurementFields();
    select.innerHTML=fields.map(f=>`<option value="${escapeHtml(f.key)}">${escapeHtml(f.label)}</option>`).join('');
    if(currentBodyGraphKey && fields.some(f=>f.key===currentBodyGraphKey)) select.value=currentBodyGraphKey;
    currentBodyGraphKey=select.value;
    lockModalScroll(); document.getElementById('bodyGraphModal').classList.remove('hidden');
    renderBodyGraph();
}
function closeBodyGraph(){ document.getElementById('bodyGraphModal').classList.add('hidden'); }
function renderBodyGraph(){
    const select=document.getElementById('bodyGraphField');
    const key=select ? select.value : currentBodyGraphKey;
    currentBodyGraphKey=key;
    const field=getMeasurementFields().find(f=>f.key===key);
    const summary=document.getElementById('bodyGraphSummary');
    const canvas=document.getElementById('bodyGraphCanvas');
    if(!field || !summary || !canvas) return;

    // Используем тот же отрисовщик, что и графики Progress/Питания.
    // Это важно для iPhone/Retina: один общий механизм масштабирования canvas.
    const points=(data.measurements||[])
        .map(m=>({date:new Date(m.date),value:Number(m[key])}))
        .filter(p=>Number.isFinite(p.value) && !Number.isNaN(p.date.getTime()))
        .sort((a,b)=>a.date-b.date);

    if(!points.length){
        summary.innerHTML='<div style="color:var(--subtext);">Нет данных для графика.</div>';
        const ctx=canvas.getContext('2d');
        if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height);
        return;
    }

    const first=points[0], last=points[points.length-1], diff=last.value-first.value;
    const unit=field.unit ? ` ${field.unit}` : '';
    const diffText=diff===0 ? 'Без изменений' : `С первого значения: ${diff>0?'+':''}${formatNum(diff)}${unit}`;
    summary.innerHTML=`<div style="font-weight:700;">${escapeHtml(field.label)}: ${formatNum(last.value)}${unit}</div>
        <div style="color:var(--subtext);font-size:13px;">${diffText}</div>`;

    // Модальное окно только что показалось, поэтому ждём расчёта размеров.
    // После этого drawLineChart сам корректно создаст HiDPI canvas.
    const draw=()=>{
        if(document.getElementById('bodyGraphModal')?.classList.contains('hidden')) return;
        drawLineChart(canvas,points,{color:getComputedStyle(document.body).getPropertyValue('--button-green').trim()});
    };
    requestAnimationFrame(()=>requestAnimationFrame(draw));
    setTimeout(draw,80);
}

function confirmStart(index) {
    const i=Number(index);
    if(!Number.isInteger(i) || !data?.programs?.[i]) return;
    pendingProgramIndex=i;
    const screen=document.getElementById('confirmScreen');
    if(screen) screen.dataset.programIndex=String(i);
    const title=document.getElementById('confirmTitle');
    if(title) title.textContent=data.programs[i].name || 'Тренировка';
    showScreen('confirmScreen');
}
function startConfirmed(event) {
    if(event) event.preventDefault();
    try{
        const screen=document.getElementById('confirmScreen');
        let index=Number.isInteger(pendingProgramIndex)?pendingProgramIndex:NaN;
        if(!Number.isInteger(index) && screen?.dataset?.programIndex!=='') index=Number(screen.dataset.programIndex);
        const program=data?.programs?.[index];
        if(!Number.isInteger(index) || !program){
            showToast('Не удалось определить тренировку. Вернитесь и выберите сплит ещё раз.');
            return;
        }
        pendingProgramIndex=null;
        currentProgram=index;
        currentExerciseIndex=0;
        workoutSets={};
        const exercises=Array.isArray(program.exercises)?program.exercises:[];
        const active=Array.isArray(program.active)?program.active:[];
        workoutExerciseSlots=exercises.map((_,i)=>i).filter(i=>active[i]!==false);
        workoutPlanSnapshot=workoutExerciseSlots.map(ref=>{
            const name=exercises[ref]||'';
            const type=Array.isArray(program.types)?(program.types[ref]||'strength'):'strength';
            return {plannedName:name,plannedType:type,plannedGroup:fScoreExerciseGroup(name,type),status:'pending'};
        });
        workoutStartTime=Date.now();
        currentAchievements={};
        // Prefill the first set from the calculated working-weight logic.
        // Only fully completed sets count toward progress/history.
        seedWorkoutSetsFromHistory();
        showScreen('workoutScreen');
        const title=document.getElementById('workoutTitle');
        if(title) title.textContent=formatWorkoutDisplayTitle(program.name);
        startTotalTimer();
        renderExerciseStrip();
        renderExercise();
        saveDraft();
        showToast('Тренировка начата');
    }catch(err){
        console.error('Workout start failed',err);
        showToast('Не удалось запустить тренировку. Ошибка сохранена в консоли.');
    }
}
window.confirmStart=confirmStart;
window.startConfirmed=startConfirmed;
function startTotalTimer() { clearInterval(totalTimerInterval); updateTotalTimer(); totalTimerInterval=setInterval(updateTotalTimer,1000); }
function updateTotalTimer() { if (!workoutStartTime) return; const elapsed=Math.floor((Date.now()-workoutStartTime)/1000); document.getElementById('totalTimer').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`; }
function stopTotalTimer() { clearInterval(totalTimerInterval); workoutStartTime=null; clearTimeout(workoutRecommendationAutoCollapseTimer); workoutRecommendationAutoCollapseTimer=null; workoutRecommendationTimerKey=''; }
function getActiveExerciseIndices() { return Array.isArray(workoutExerciseSlots) ? workoutExerciseSlots.slice() : []; }
function getWorkoutExercise(ref) {
    if (Number.isInteger(ref) && ref >= 0) {
        const prog=data.programs[currentProgram];
        if (!prog || !prog.exercises?.[ref]) return null;
        return { name: prog.exercises[ref], type: prog.types?.[ref] || 'strength', programIndex: currentProgram, exerciseIndex: ref, transient: false };
    }
    if (Number.isInteger(ref) && ref < 0) {
        const item=workoutTransientExercises[-ref-1];
        return item ? { ...item, transient: true, programIndex: -1, exerciseIndex: -1 } : null;
    }
    return null;
}
function getActiveExercises() { return getActiveExerciseIndices().map(getWorkoutExercise).filter(Boolean).map(x=>x.name); }
function renderExerciseStrip() {
    const activeEx=getActiveExercises();
    const strip=document.getElementById('exerciseStrip');
    if (!strip) return;
    strip.innerHTML=activeEx.map((ex,idx)=>{
        const realIdx=getActiveExerciseIndices()[idx];
        const exerciseMeta=getWorkoutExercise(realIdx);
        const sets=workoutSets[realIdx]||[];
        const hasDone=isWorkoutExerciseCompleted(realIdx);
        const active=idx===currentExerciseIndex?'active':'';
        const doneClass=hasDone?'done':'';
        return `<div class="exercise-dot ${active} ${doneClass}" data-step="${idx+1}" onclick="switchExercise(${idx})">${escapeHtml(ex)}</div>`;
    }).join('');
    setTimeout(()=>{
        const activeEl=strip.querySelector('.exercise-dot.active');
        if(activeEl) activeEl.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    },50);
    updateWorkoutProgressUI();
}
function getWorkoutCompletionTarget(type){ return type==='strength' ? 3 : 1; }
function isWorkoutExerciseCompleted(exIdx){
    const meta=getWorkoutExercise(exIdx);
    return !!meta && countWorkoutSetResults(exIdx) >= getWorkoutCompletionTarget(meta.type);
}
function getWorkoutProgressTotals(){
    const activeIndices=getActiveExerciseIndices();
    const baseTotal=activeIndices.reduce((sum,idx)=>sum+getWorkoutCompletionTarget(getWorkoutExercise(idx)?.type||'strength'),0);
    const completed=activeIndices.reduce((sum,idx)=>sum+countWorkoutSetResults(idx),0);
    // Extra sets stay in history but never expand the planned progress denominator.
    const total=baseTotal;
    const completedForProgress=Math.min(completed,baseTotal);
    return {activeIndices,baseTotal,completed,completedForProgress,total};
}
function updateWorkoutProgressUI(){
    const {activeIndices,completedForProgress,total}=getWorkoutProgressTotals();
    const pct=total?Math.min(100,Math.round(completedForProgress/total*100)):0;
    const bar=document.getElementById('workoutProgressBar'); if(bar) bar.style.width=pct+'%';
    const left=document.getElementById('workoutProgressLeft'); if(left) left.textContent=`Выполнено ${completedForProgress} из ${total} подходов`;
    const right=document.getElementById('workoutProgressRight');
    const currentReal=activeIndices[currentExerciseIndex];
    const currentMeta=currentReal!==undefined?getWorkoutExercise(currentReal):null;
    const currentDone=currentReal!==undefined?countWorkoutSetResults(currentReal):0;
    const target=currentMeta?getWorkoutCompletionTarget(currentMeta.type):1;
    if(right) right.textContent=`${currentDone}/${target} подход${target===1?'':'а'} выполнено`;
    const text=document.getElementById('workoutProgressText'); if(text) text.textContent=`Упражнение ${Math.min(currentExerciseIndex+1,activeIndices.length)} из ${activeIndices.length}`;
}

function switchExercise(idx) { stopRestTimer(); currentExerciseIndex=idx; renderExerciseStrip(); renderExercise(); saveDraft(); }
function getRealExerciseIndex() { return getActiveExerciseIndices()[currentExerciseIndex]; }

function getPreviousExerciseResult(exerciseName, beforeDate){
    const history = (data.history || []).slice().sort((a,b)=>{
        return new Date(b.date || 0) - new Date(a.date || 0);
    });
    const cutoff = beforeDate ? new Date(beforeDate) : new Date();
    for(const entry of history){
        const entryDate = new Date(entry.date || 0);
        if(!Number.isFinite(entryDate.getTime())) continue;
        if(entryDate >= cutoff) continue;
        const ex = (entry.exercises || []).find(x => x && x.name === exerciseName);
        if(!ex || !Array.isArray(ex.sets) || !ex.sets.length) continue;
        const validSets = ex.sets.filter(s => s && (
            s.weight !== undefined || s.reps !== undefined ||
            s.time !== undefined || s.durationSeconds !== undefined ||
            s.intensity !== undefined
        ));
        if(validSets.length) return {date: entry.date, exercise: ex, sets: validSets};
    }
    return null;
}
function formatPreviousSetResult(set, exerciseName){
    const type = getExerciseTypeByName(exerciseName);
    if(type === 'cardio'){
        const parts = [];
        const time = Number(set.time ?? set.minutes);
        const durationSeconds = Number(set.durationSeconds);
        const intensity = Number(set.intensity);
        const reps = Number(set.reps);
        if(Number.isFinite(durationSeconds) && durationSeconds > 0) parts.push(`${formatNum(durationSeconds/60)} мин`);
        else if(Number.isFinite(time) && time > 0) parts.push(`${formatNum(time)} мин`);
        if(Number.isFinite(intensity) && intensity > 0) parts.push(`инт. ${formatNum(intensity)}`);
        if(Number.isFinite(reps) && reps > 0) parts.push(`${formatNum(reps)} повт.`);
        return parts.join(' · ') || 'Данные сохранены';
    }
    if(type === 'bodyweight'){
        const reps = Number(set.reps);
        return Number.isFinite(reps) && reps > 0 ? `${formatNum(reps)} повторов` : 'Данные сохранены';
    }
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    if(Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0)
        return `${formatNum(weight)} кг × ${formatNum(reps)}`;
    if(Number.isFinite(weight) && weight > 0) return `${formatNum(weight)} кг`;
    if(Number.isFinite(reps) && reps > 0) return `${formatNum(reps)} повторов`;
    return 'Данные сохранены';
}



function parseWorkoutNumber(value){
    if(value===null || value===undefined) return NaN;
    const normalized=String(value).trim().replace(/\s+/g,'').replace(',', '.');
    if(!normalized) return NaN;
    return Number(normalized);
}

function getStrengthSetsForExerciseInEntry(entry, exerciseName){
    const ex=(entry?.exercises||[]).find(x=>x && normalizeExerciseKey(x.name)===normalizeExerciseKey(exerciseName));
    // Historical type wins over the current catalog type. This prevents an
    // old cardio/bodyweight result from being reinterpreted as strength after
    // the exercise was changed in the catalog. Legacy entries without a type
    // retain the existing name-based fallback.
    if(ex?.type && ex.type!=='strength') return [];
    return (ex?.sets||[]).filter(s=>parseWorkoutNumber(s.weight)>0 && parseWorkoutNumber(s.reps)>0);
}
function getWorkingResultFromEntry(entry, exerciseName){
    const sets=getStrengthSetsForExerciseInEntry(entry,exerciseName);
    if(!sets.length) return null;
    const byWeight=new Map();
    sets.forEach(s=>{
        const w=parseWorkoutNumber(s.weight), r=parseWorkoutNumber(s.reps);
        if(r>=6){ if(!byWeight.has(w)) byWeight.set(w,[]); byWeight.get(w).push(r); }
    });
    const qualified=[...byWeight.entries()].filter(([,rs])=>rs.length>=3).sort((a,b)=>b[0]-a[0]);
    if(!qualified.length) return null;
    const [weight,reps]=qualified[0];
    const avg=reps.reduce((a,b)=>a+b,0)/reps.length;
    return {weight,reps:Math.max(1,Math.round(avg)),sets:reps.length,date:entry.date};
}
function getLatestWorkingResult(exerciseName,programName,beforeDate){
    const cutoff=beforeDate?new Date(beforeDate):new Date();
    const entries=(data.history||[]).slice().sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
    for(const entry of entries){
        const d=new Date(entry.date||0); if(!Number.isFinite(d.getTime()) || d>=cutoff) continue;
        if(programName && entry.program!==programName) continue;
        const r=getWorkingResultFromEntry(entry,exerciseName); if(r) return r;
    }
    return null;
}
function getBestWorkingResult(exerciseName,programName,beforeDate){
    const cutoff=beforeDate?new Date(beforeDate):new Date();
    let best=null;
    (data.history||[]).forEach(entry=>{
        const d=new Date(entry.date||0);
        if(!Number.isFinite(d.getTime()) || d>=cutoff) return;
        // Working weight is an exercise-level historical metric. It uses the
        // full history regardless of which program/split contained the exercise.
        const r=getWorkingResultFromEntry(entry,exerciseName);
        if(!r) return;
        if(!best || Number(r.weight)>Number(best.weight) ||
           (Number(r.weight)===Number(best.weight) && new Date(r.date||0)>new Date(best.date||0))){
            best=r;
        }
    });
    return best;
}

function getFallbackStrengthResult(exerciseName,programName,beforeDate){
    const cutoff=beforeDate?new Date(beforeDate):new Date();
    const entries=(data.history||[]).slice().sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).filter(entry=>{
        const d=new Date(entry.date||0); return Number.isFinite(d.getTime()) && d<cutoff;
    });
    const samples=[];
    for(const entry of entries){
        const sets=getStrengthSetsForExerciseInEntry(entry,exerciseName);
        // Исключаем одиночные пиковые подходы: для запасного расчёта берём лучший вес,
        // который был выполнен хотя бы на 5 повторений.
        const usable=sets.filter(s=>Number(s.reps)>=5);
        if(!usable.length) continue;
        const maxW=Math.max(...usable.map(s=>Number(s.weight)));
        const same=usable.filter(s=>Number(s.weight)===maxW);
        const reps=same.reduce((a,s)=>a+Number(s.reps),0)/same.length;
        samples.push({weight:maxW,reps,date:entry.date});
        if(samples.length>=3) break;
    }
    if(!samples.length) return null;
    const weights=[0.5,0.3,0.2];
    let w=0,r=0,ws=0;
    samples.forEach((x,i)=>{const k=weights[i]??0.1;w+=x.weight*k;r+=x.reps*k;ws+=k;});
    w/=ws;r/=ws;
    return {weight:w,reps:Math.max(1,Math.round(r)),samples:samples.length,estimated:true};
}
function getAutofillStrengthResult(exerciseName,programName,beforeDate){
    // The first set must contain a proven working weight, never an estimate.
    // Fallback estimates remain available for recommendations, but are not
    // written into the workout input as if they were an earned working weight.
    const working=getBestQualifiedStrengthResult(exerciseName,programName,beforeDate);
    if(working) return {...working,reps:8,sets:3,ideal:true};
    return null;
}

function seedWorkoutSetsFromHistory(){
    // New workout: no placeholder/auto-created sets.
    // Values are filled only when the user explicitly adds the first set.
    return;
}

function getLatestAnalogousExerciseHistory(exerciseName, programName, beforeDate){
    const cutoff=beforeDate?new Date(beforeDate):new Date();
    return (data.history||[]).slice().sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).find(entry=>{
        if(new Date(entry.date||0)>=cutoff) return false;
        if(programName && entry.program!==programName) return false;
        return (entry.exercises||[]).some(x=>x && normalizeExerciseKey(x.name)===normalizeExerciseKey(exerciseName) && Array.isArray(x.sets) && x.sets.length);
    }) || null;
}
function getBestQualifiedStrengthResult(exerciseName,programName,beforeDate){
    return getBestWorkingResult(exerciseName,programName,beforeDate);
}



function roundRecommendationWeight(weight){
    const w=Number(weight); if(!Number.isFinite(w)||w<=0) return null;
    const step=w<20?1:2.5;
    return Math.round((w+step)/step)*step;
}
function getExerciseRecommendation(exerciseName,type,programName){
    const before=new Date().toISOString();
    if(type==='strength'){
        // Recommendations are derived only from a historically qualified
        // working weight. Estimated fallback values are intentionally excluded:
        // an estimate is not an earned working weight and must not become a
        // target presented as if it were based on confirmed history.
        // Use the latest confirmed working result; historical best remains an analytics metric.
        const base=getLatestWorkingResult(exerciseName,programName,before);
        if(base){
            const baseWeight=Number(base.weight)||0, baseReps=Number(base.reps)||0;
            const step=baseWeight<20?1:2.5;
            const nextWeight=baseReps>=8?Math.round((baseWeight+step)/step)*step:baseWeight;
            return {weight:nextWeight,reps:8,sets:3,currentWeight:baseWeight,currentReps:baseReps,
                reason:baseReps>=8?`После выполнения целевого диапазона нагрузку можно повысить с ${formatNum(baseWeight)} до ${formatNum(nextWeight)} кг.`:`На ${formatNum(baseWeight)} кг пока не набран целевой объём повторений. Сначала доведи подходы до 8 повторений и только затем повышай вес.`, advice:baseReps>=8?`Ты стабильно выполнил целевой диапазон — увеличь вес небольшим шагом и сохрани чистую технику во всех рабочих подходах.`:`Не повышай вес раньше времени: сначала закрепи 8 качественных повторений в каждом рабочем подходе, затем добавляй нагрузку.`};
        }
        return {weight:null,reps:8,sets:3,currentWeight:null,currentReps:null,reason:'После первого полноценного выполнения появится персональная цель.', advice:'Начни с веса, с которым все рабочие повторения выполняются чисто.'};
    }
    const previous=getPreviousExerciseResult(exerciseName,before);
    const last=previous?.sets?.[previous.sets.length-1]||null;
    if(type==='cardio'){
        const time=last?Number(last.time??last.minutes):NaN, intensity=last?Number(last.intensity):NaN;
        const t=Number.isFinite(time)&&time>0?time:null, i=Number.isFinite(intensity)&&intensity>0?intensity:null;
        return {time:t,intensity:i,sets:1,currentTime:t,currentIntensity:i,reason:last?'Увеличение времени или интенсивности оправдано только при сохранении контролируемого темпа.':'После первого сохранённого выполнения появится персональный рабочий показатель.', advice:last?(t!=null&&i!=null&&i>=8?'Закрепи объём и темп, затем немного повысь интенсивность.':'Сначала стабилизируй длительность и интенсивность, затем меняй один параметр.'):'Начни с комфортной длительности и интенсивности.'};
    }
    const reps=last?Number(last.reps):NaN, r=Number.isFinite(reps)&&reps>0?reps:null;
    return {reps:r,sets:1,currentReps:r,reason:last?'Увеличивай повторения постепенно, не жертвуя техникой.':'После первого сохранённого выполнения появится персональный рабочий показатель.', advice:last?'Добавляй повторения небольшими шагами после стабильного выполнения текущего объёма.':'Начни с количества повторений, которое выполняешь чисто.'};
}

function formatRecommendation(rec){
    if(!rec) return '';
    const target=rec.weight!=null
      ? `${formatNum(rec.weight)} кг × ${formatNum(rec.reps||0)} × ${formatNum(rec.sets||1)}`
      : rec.time!=null
        ? `${formatNum(rec.time)} мин${rec.intensity!=null?` × ${formatNum(rec.intensity)}/10`:''}`
        : rec.reps!=null
          ? `${formatNum(rec.reps)} повторений × ${formatNum(rec.sets||1)}`
          : 'Персональная цель';
    return `<div class="workout-recommendation"><div class="recommendation-head"><span>🎯 Рекомендация</span><span>✓</span></div><div class="recommendation-target"><span>Цель</span><b>${escapeHtml(target)}</b></div><div class="recommendation-note">${escapeHtml(rec.advice||rec.reason||'Повышай нагрузку постепенно, сохраняя технику и качество выполнения.')}</div></div>`;
}

function resetWorkoutRecommendationAutoCollapse(){
    const realIdx=getRealExerciseIndex();
    const meta=realIdx!==undefined?getWorkoutExercise(realIdx):null;
    const key=meta?.name ? normalizeExerciseKey(meta.name) : '';
    if(!key) return;
    // The 30-second window belongs to the exercise transition, not to re-renders
    // caused by entering sets or running the separate rest timer.
    if(key===workoutRecommendationTimerKey) return;
    workoutRecommendationTimerKey=key;
    clearTimeout(workoutRecommendationAutoCollapseTimer);
    workoutRecommendationAutoCollapseTimer=setTimeout(()=>{
        window.workoutRecommendationCollapsed=window.workoutRecommendationCollapsed||{};
        window.workoutRecommendationCollapsed[key]=true;
        const card=document.querySelector('#workoutScreen .workout-recommendation[data-rec-key="'+CSS.escape(key)+'"]');
        if(card){
            card.classList.add('is-collapsed');
            card.setAttribute('aria-expanded','false');
            const toggle=card.querySelector('.recommendation-toggle');
            if(toggle) toggle.textContent='⌄';
        }
        workoutRecommendationAutoCollapseTimer=null;
    },10000);
}

function buildWorkoutSetRowHtml(realIdx,type,s,i){
    let inputFields='';
    if(type==='strength') inputFields=`<div class="workout-set-inputs horizontal"><input type="text" inputmode="decimal" placeholder="Вес, кг" value="${escapeHtml(s.weight||'')}" onchange="updateSet(${realIdx},${i},'weight',this.value)"><input type="text" inputmode="numeric" placeholder="Повторы" value="${escapeHtml(s.reps||'')}" onchange="updateSet(${realIdx},${i},'reps',this.value)"></div>`;
    else if(type==='cardio') inputFields=`<div class="workout-set-inputs horizontal"><input type="text" inputmode="decimal" placeholder="Минуты" value="${escapeHtml(s.time||'')}" onchange="updateSet(${realIdx},${i},'time',this.value)"><input type="text" inputmode="decimal" placeholder="Инт. 1–10" value="${escapeHtml(s.intensity||'')}" onchange="updateSet(${realIdx},${i},'intensity',this.value)"></div>`;
    else inputFields=`<div class="workout-set-inputs horizontal single"><input class="workout-bodyweight-input" type="text" inputmode="numeric" placeholder="Повторы" value="${escapeHtml(s.reps||'')}" onchange="updateSet(${realIdx},${i},'reps',this.value)"></div>`;
    return `<div class="set-row workout-set-row"><span class="set-num">${i+1}</span>${inputFields}<button type="button" class="set-delete-btn" onclick="deleteSet(${realIdx},${i})" title="Удалить подход" aria-label="Удалить подход">🗑️</button></div>`;
}

function getWorkoutExerciseDirectoryEntry(exerciseName, type='strength'){
    const key=normalizeExerciseKey(exerciseName);
    let entry=(data.exerciseDirectory||[]).find(e=>normalizeExerciseKey(e?.name)===key);
    if(!entry && key) entry=ensureDirectoryEntry(exerciseName,type);
    return entry || null;
}
function getWorkoutExerciseNote(exerciseName, type='strength'){
    const key=normalizeExerciseKey(exerciseName);
    if(key && data.exerciseNotes && Object.prototype.hasOwnProperty.call(data.exerciseNotes,key)) return String(data.exerciseNotes[key] ?? '');
    const entry=getWorkoutExerciseDirectoryEntry(exerciseName,type);
    return String(entry?.note ?? '');
}
function openWorkoutExerciseNote(exerciseName, type='strength'){
    const modal=document.getElementById('workoutExerciseNoteModal');
    const input=document.getElementById('workoutExerciseNoteInput');
    const title=document.getElementById('workoutExerciseNoteTitle');
    if(!modal || !input) return;
    modal.dataset.exerciseName=String(exerciseName||'');
    modal.dataset.exerciseType=String(type||'strength');
    if(title) title.textContent=`Заметка · ${exerciseName}`;
    input.value=getWorkoutExerciseNote(exerciseName,type);
    lockModalScroll();
    modal.classList.remove('hidden');
    requestAnimationFrame(()=>input.focus());
}
function closeWorkoutExerciseNote(){
    const modal=document.getElementById('workoutExerciseNoteModal');
    if(modal) modal.classList.add('hidden');
}
function saveWorkoutExerciseNote(){
    const modal=document.getElementById('workoutExerciseNoteModal');
    const input=document.getElementById('workoutExerciseNoteInput');
    if(!modal || !input) return;
    const name=String(modal.dataset.exerciseName||'').trim();
    const type=String(modal.dataset.exerciseType||'strength');
    if(!name) return;
    const entry=getWorkoutExerciseDirectoryEntry(name,type);
    if(!entry) return;
    const note=String(input.value||'').trim();
    if(!data.exerciseNotes || typeof data.exerciseNotes!=='object' || Array.isArray(data.exerciseNotes)) data.exerciseNotes={};
    const key=normalizeExerciseKey(name);
    if(key){
        if(note) data.exerciseNotes[key]=note;
        else delete data.exerciseNotes[key];
        // Keep a small dedicated mirror as an additional PWA durability layer.
        // The canonical backup value remains data.exerciseNotes, so this does not
        // create a second source of truth.
        try{
            const stored=JSON.parse(localStorage.getItem('ftracker_exercise_notes_v1')||'{}');
            if(note) stored[key]=note; else delete stored[key];
            localStorage.setItem('ftracker_exercise_notes_v1',JSON.stringify(stored));
        }catch(e){}
    }
    // Keep the directory record mirrored for older backups and screens that read it directly.
    entry.note=note;
    saveData();
    closeWorkoutExerciseNote();
    renderExercise();
    showToast(entry.note ? 'Заметка сохранена' : 'Заметка удалена');
}
window.openWorkoutExerciseNote=openWorkoutExerciseNote;
window.closeWorkoutExerciseNote=closeWorkoutExerciseNote;
window.saveWorkoutExerciseNote=saveWorkoutExerciseNote;

function renderExerciseBase() {
    const program=data.programs[currentProgram];
    const activeEx=getActiveExercises();
    if(currentExerciseIndex>=activeEx.length){ finishWorkout(); return; }
    const realIdx=getActiveExerciseIndices()[currentExerciseIndex];
    const meta=getWorkoutExercise(realIdx); if(!meta){ finishWorkout(); return; }
    const exerciseName=meta.name, type=meta.type, sets=workoutSets[realIdx]||[];
    const isLastExercise=currentExerciseIndex===activeEx.length-1;
    const completedSets=sets.filter(s=>hasWorkoutSetResult(realIdx,s)).length;
    // Progress target for strength is the standard 3 working sets.
    // Completed count is based only on fully filled sets, so 4/3 is valid
    // when an additional set is added.
    const target=getWorkoutCompletionTarget(type);

    const titleEl=document.getElementById('workoutTitle');
    if(titleEl) titleEl.textContent=program?.name || 'Тренировка';
    const progressEl=document.getElementById('workoutProgressText');
    if(progressEl) progressEl.textContent='';
    const timeEl=document.getElementById('totalTimer');
    if(timeEl) timeEl.dataset.workoutTimer='1';


    const recommendation=getExerciseRecommendation(exerciseName,type,program?.name) || {reps:8,sets:target,reason:'После первого выполнения приложение начнёт использовать твои собственные результаты для расчёта цели.'};
    const recKey=normalizeExerciseKey(exerciseName);
    const recCollapsed=window.workoutRecommendationCollapsed?.[recKey]===true;
    let currentMain='', targetMain='';
    if(type==='strength'){
        currentMain=recommendation.currentWeight!=null ? `${formatNum(recommendation.currentWeight)} кг × ${formatNum(recommendation.currentReps||8)} × ${target}` : 'Нет сохранённого рабочего веса';
        targetMain=recommendation.weight!=null ? `${formatNum(recommendation.weight)} кг × ${formatNum(recommendation.reps||8)} × ${target}` : 'Подбери рабочий вес';
    }else if(type==='cardio'){
        const ct=recommendation.currentTime!=null?`${formatNum(recommendation.currentTime)} мин`:'';
        const ci=recommendation.currentIntensity!=null?` · интенсивность ${formatNum(recommendation.currentIntensity)}/10`:'';
        currentMain=(ct||ci)?`${ct}${ci} × ${target}`:'Нет сохранённого рабочего показателя';
        const tt=recommendation.time!=null?`${formatNum(recommendation.time)} мин`:'';
        const ti=recommendation.intensity!=null?` · интенсивность ${formatNum(recommendation.intensity)}/10`:'';
        targetMain=(tt||ti)?`${tt}${ti} × ${target}`:'Определи комфортную длительность и интенсивность';
    }else{
        currentMain=recommendation.currentReps!=null?`${formatNum(recommendation.currentReps)} повторений × ${target}`:'Нет сохранённого рабочего показателя';
        targetMain=recommendation.reps!=null?`${formatNum(recommendation.reps)} повторений × ${target}`:'Определи целевое число повторений';
    }
    const advice=recommendation.advice||recommendation.reason||'Повышай нагрузку постепенно, сохраняя технику и качество выполнения.';
    const recommendationHtml=`<div class="workout-recommendation ${recCollapsed?'is-collapsed':''}" data-rec-key="${escapeHtml(recKey)}" onclick="toggleWorkoutRecommendation('${escapeHtml(recKey)}')" role="button" tabindex="0" aria-expanded="${!recCollapsed}"><div class="recommendation-head"><span>🎯 Рекомендация</span><span class="recommendation-toggle">${recCollapsed?'⌄':'✓'}</span></div><div class="recommendation-target"><span>Цель</span><b>${escapeHtml(targetMain)}</b></div><div class="recommendation-note">${escapeHtml(advice)}</div></div>`;

    let setsHTML='';
    sets.forEach((s,i)=>{
        if(i===3 && type==='strength') setsHTML += '<div class="workout-extra-set-label">Дополнительные подходы · необязательно</div>';
        setsHTML += buildWorkoutSetRowHtml(realIdx,type,s,i);
    });

    const bars=Array.from({length:target},(_,i)=>`<span class="completion-segment ${i<Math.min(completedSets,target)?'filled':''}"></span>`).join('');
    const directoryItem=(data.exerciseDirectory||[]).find(e=>normalizeExerciseKey(e.name)===normalizeExerciseKey(exerciseName));
    const group=directoryItem?.group || inferExerciseGroup(exerciseName,type);
    const typeLabel=type==='strength'?'Силовое':type==='cardio'?'Кардио':'Повторы';
    const container=document.getElementById('exerciseContainer');

    const muscleGroup=String(group||inferExerciseGroup(exerciseName,type)||'Другое').trim() || 'Другое';
    const exerciseNote=getWorkoutExerciseNote(exerciseName,type);
    container.innerHTML=`<article class="card workout-exercise-card">
      <div class="workout-exercise-titleblock">
        <div class="workout-exercise-title-row">
          <button type="button" class="workout-exercise-name-large" onclick="openTechniqueFromWorkout(${realIdx})" aria-label="Открыть информацию об упражнении">${escapeHtml(exerciseName)} <span class="workout-info-icon">ⓘ</span></button>
          <button type="button" class="workout-note-btn ${exerciseNote?'has-note':''}" data-workout-note-name="${escapeHtml(exerciseName)}" data-workout-note-type="${escapeHtml(type)}" onclick="event.stopPropagation()" title="${exerciseNote?'Изменить заметку':'Добавить заметку'}" aria-label="${exerciseNote?'Изменить заметку':'Добавить заметку'}">📝${exerciseNote?'<span class="workout-note-dot"></span>':''}</button>
        </div>
        <div class="workout-exercise-kicker"><span>${escapeHtml(typeLabel)} · ${escapeHtml(muscleGroup)}</span></div>
      </div>
      <div class="workout-action-grid">
        <button type="button" class="workout-action-btn analytics" onclick="openExerciseModal(${realIdx})"><span class="action-icon">▥</span><span class="action-copy">Аналитика<br>упражнения</span><span class="action-arrow">›</span></button>
        <button type="button" class="workout-action-btn replace" onclick="openReplaceExerciseModal(${currentExerciseIndex})"><span class="action-icon">↔</span><span class="action-copy">Заменить<br>упражнение</span><span class="action-arrow">›</span></button>
      </div>
      <section class="workout-completion">
        <div class="workout-completion-head"><div><b>ВЫПОЛНЕНО</b><strong>${completedSets}/${target}</strong><span>подходов</span></div></div>
        <div class="completion-track ${target===1?'single':''}">${bars}</div>
      </section>
      ${recommendationHtml}
      <div class="sets-heading"><span>ПОДХОДЫ</span></div>
      <div id="setsList">${setsHTML}</div>
      <div id="restTimerContainer" class="rest-panel hidden" aria-label="Таймер отдыха"><div class="rest-progress-ring" aria-hidden="true"><span id="timerDisplay">02:00</span></div><div class="rest-actions"><button type="button" class="rest-adjust-circle" onclick="adjustRestTime(-30)" aria-label="Уменьшить отдых на 30 секунд">−30</button><button type="button" class="rest-adjust-circle" onclick="adjustRestTime(30)" aria-label="Увеличить отдых на 30 секунд">+30</button><button type="button" class="rest-skip" onclick="stopRestTimer()">Пропустить отдых</button></div></div><div class="workout-bottom-actions">
        <button type="button" class="workout-bottom-action add-action" data-workout-anchor="add-set" onclick="addSet()" aria-label="Добавить подход"><span class="nav-icon">＋</span><span class="nav-label">Добавить<br>подход</span></button>
        <button type="button" class="workout-bottom-action next-action" data-workout-anchor="next-exercise" onclick="${isLastExercise?'confirmFinishWorkout()':'nextExercise()'}" aria-label="${isLastExercise?'Завершить тренировку':'Следующее упражнение'}"><span class="nav-icon">${isLastExercise?'✓':'→'}</span><span class="nav-label">${isLastExercise?'Завершить<br>тренировку':'Следующее<br>упражнение'}</span></button>
      </div>
    </article>`;

    const noteBtn=container.querySelector('.workout-note-btn');
    if(noteBtn) noteBtn.addEventListener('click',()=>openWorkoutExerciseNote(noteBtn.dataset.workoutNoteName||exerciseName,noteBtn.dataset.workoutNoteType||type));
    if(typeof window.__ftSyncWorkoutViewport==='function') requestAnimationFrame(window.__ftSyncWorkoutViewport);
    if(restEndTime&&restEndTime>Date.now()){const rc=document.getElementById('restTimerContainer');if(rc)rc.classList.remove('hidden');updateRestTimerDisplay();}
    resetWorkoutRecommendationAutoCollapse();
    updateTotalTimer(); updateWorkoutProgressUI();
}

function toggleWorkoutRecommendation(key){
    window.workoutRecommendationCollapsed=window.workoutRecommendationCollapsed||{};
    window.workoutRecommendationCollapsed[key]=!window.workoutRecommendationCollapsed[key];
    renderExercise();
}
function formatLastResult(last, type) {
    if (type === 'strength') return `${last.weight || 0} кг × ${last.reps || 0}`;
    if (type === 'cardio') return `${last.time || 0} мин × ${last.intensity || 0}`;
    return `${last.reps || 0} повторов`;
}
function captureWorkoutAnchor(){
    const screen=document.getElementById('exerciseContainer');
    if(!screen) return null;
    const rows=[...screen.querySelectorAll('.workout-set-row')];
    const top=screen.getBoundingClientRect().top;
    const visible=rows.find(r=>r.getBoundingClientRect().bottom>top+20);
    return {scroll:screen.scrollTop, key:visible?.querySelector('.set-num')?.textContent||null};
}
function restoreWorkoutAnchor(anchor){
    const screen=document.getElementById('exerciseContainer');
    if(!screen||!anchor) return;
    requestAnimationFrame(()=>{
        if(anchor.key){
            const row=[...screen.querySelectorAll('.workout-set-row')].find(r=>r.querySelector('.set-num')?.textContent===anchor.key);
            if(row){
                const delta=row.getBoundingClientRect().top-(screen.getBoundingClientRect().top+20);
                screen.scrollTop+=delta;
                return;
            }
        }
        screen.scrollTop=anchor.scroll;
    });
}
function updateWorkoutCompletionUI(){
    const realIdx=getRealExerciseIndex();
    const meta=realIdx!==undefined?getWorkoutExercise(realIdx):null;
    if(!meta) return;
    const sets=workoutSets[realIdx]||[];
    const target=getWorkoutCompletionTarget(meta.type);
    const completed=countWorkoutSetResults(realIdx);
    const card=document.querySelector('#exerciseContainer .workout-exercise-card');
    if(!card) return;
    const count=card.querySelector('.workout-completion-head strong');
    if(count) count.textContent=`${completed}/${target}`;
    card.querySelectorAll('.completion-segment').forEach((el,i)=>el.classList.toggle('filled',i<Math.min(completed,target)));
    updateWorkoutProgressUI();
}

function addSet() {
    const screen = document.getElementById('workoutScreen');
    const realIdx = getRealExerciseIndex();
    const meta = getWorkoutExercise(realIdx);
    if(!meta) return;
    const type = meta.type;
    if(!workoutSets[realIdx]) workoutSets[realIdx] = [];
    const lastSet = workoutSets[realIdx].slice(-1)[0];
    const exercise = meta.name;
    const historyPrev = getPreviousExerciseResult(exercise, new Date().toISOString());
    const historySet = historyPrev?.sets?.[historyPrev.sets.length - 1] || {};
    const prev = lastResults[exercise] || historySet || {};
    const recommendation = getExerciseRecommendation(exercise,type,data.programs[currentProgram]?.name);
    const newSet = { done:false };
    if(type==='strength'){
        newSet.weight = lastSet ? lastSet.weight : (recommendation?.currentWeight ?? prev.weight ?? '');
        newSet.reps = lastSet ? lastSet.reps : (recommendation?.currentReps ?? prev.reps ?? '');
    }else if(type==='cardio'){
        newSet.time = lastSet ? lastSet.time : (recommendation?.currentTime ?? prev.time ?? '');
        newSet.intensity = lastSet ? lastSet.intensity : (recommendation?.currentIntensity ?? prev.intensity ?? '');
    }else{
        newSet.reps = lastSet ? lastSet.reps : (recommendation?.currentReps ?? prev.reps ?? '');
    }
    const setIndex=workoutSets[realIdx].length;
    workoutSets[realIdx].push(newSet);
    saveDraft();

    // Отдых запускается именно по нажатию «Добавить подход».
    // Первый подход — без отдыха; каждый следующий добавленный подход —
    // с текущей длительностью отдыха.
    if(setIndex > 0) startRestTimer(lastRestDuration);

    // Fast path: append only the new row. Rebuilding the complete exercise card
    // on every added set caused avoidable layout/paint work in iOS PWA.
    const list=document.getElementById('setsList');
    if(list){
        list.insertAdjacentHTML('beforeend',buildWorkoutSetRowHtml(realIdx,type,newSet,setIndex));
        updateWorkoutCompletionUI();
        requestAnimationFrame(()=>{
            const row=list.lastElementChild;
            const input=row?.querySelector('input');
            if(input){ try{input.focus({preventScroll:true});}catch(e){input.focus();} }
        });
    }else{
        renderExercise();
    }
}
function deleteSet(exIdx, setIdx) { if (!workoutSets[exIdx]?.[setIdx]) return; pendingDeleteType='workoutSet'; pendingDeleteIndex=exIdx; pendingDeleteDate=String(setIdx); showDeleteConfirm('Удалить этот подход?'); }
function updateSet(exIdx, setIdx, field, value) {
    if (!workoutSets[exIdx] || !workoutSets[exIdx][setIdx]) return;
    const meta = getWorkoutExercise(exIdx);
    const type = meta?.type || 'strength';
    const set = workoutSets[exIdx][setIdx];
    const wasComplete = isWorkoutSetFilledForResult(set,type);
    set[field] = value;
    const isComplete = isWorkoutSetFilledForResult(set,type);
    if (!wasComplete && isComplete) {
        checkPersonalRecord(exIdx,setIdx);
    }
    saveDraft();
    updateWorkoutCompletionUI();
    updateWorkoutProgressUI();
}

function checkPersonalRecord(exIdx, setIdx) {
    // Используем getWorkoutExercise: exIdx может быть отрицательным (заменённое
    // упражнение из другого сплита), program.exercises[exIdx] в этом случае undefined
    // и рекорды молча не фиксировались.
    const meta = getWorkoutExercise(exIdx);
    if (!meta) return;
    const exerciseName = meta.name;
    const type = meta.type;
    const set = workoutSets[exIdx]?.[setIdx];
    if (!set || !exerciseName) return;

    // Важный принцип: рекорд сравниваем только с результатами ДО этой тренировки.
    // Поэтому второй одинаковый новый подход внутри одной тренировки не "съедает"
    // первый рекорд и не отменяет уже найденное достижение.
    const previousSets = [];
    (data.history || []).forEach(entry => {
        const ex = (entry.exercises || []).find(e => e.name === exerciseName);
        if (ex) (ex.sets || []).forEach(s => previousSets.push(s));
    });

    let achievementText = null;

    if (type === 'strength') {
        const weight = parseFloat(set.weight) || 0;
        const reps = parseInt(set.reps) || 0;
        if (weight <= 0 || reps <= 0) return;

        let maxWeightEver = 0;
        let bestRepsAtWeight = 0;
        previousSets.forEach(s => {
            const w = parseFloat(s.weight) || 0;
            const r = parseInt(s.reps) || 0;
            maxWeightEver = Math.max(maxWeightEver, w);
            if (w === weight) bestRepsAtWeight = Math.max(bestRepsAtWeight, r);
        });

        if (weight > maxWeightEver) {
            achievementText = `Новый рекорд веса: ${weight} кг × ${reps}`;
        } else if (weight === maxWeightEver && reps > bestRepsAtWeight) {
            achievementText = `Новый рекорд повторений с ${weight} кг: ${reps}`;
        }
    } else if (type === 'bodyweight') {
        const reps = parseInt(set.reps) || 0;
        if (reps <= 0) return;
        const bestEver = Math.max(0, ...previousSets.map(s => parseInt(s.reps) || 0));
        if (reps > bestEver) achievementText = `Новый рекорд повторений: ${reps}`;
    } else if (type === 'cardio') {
        const time = parseFloat(set.time);
        const intensity = parseFloat(set.intensity);
        if (!Number.isFinite(time) || time <= 0) return;

        const maxTimeEver = Math.max(0, ...previousSets.map(s => parseFloat(s.time) || 0));
        const maxIntensityEver = Math.max(0, ...previousSets.map(s => parseFloat(s.intensity) || 0));
        if (Number.isFinite(time) && time > maxTimeEver) {
            achievementText = `Новый рекорд времени: ${formatNum(time)} мин`;
        } else if (Number.isFinite(intensity) && intensity > maxIntensityEver) {
            achievementText = `Новый рекорд интенсивности: ${formatNum(intensity)}`;
        }
    }

    if (achievementText) {
        // Не перезаписываем уже найденный PR менее значимым повторным подходом.
        // Если позже в этой же тренировке найден более сильный PR, обновляем текст.
        const existing = currentAchievements[exerciseName];
        if (!existing) {
            currentAchievements[exerciseName] = achievementText;
        } else if (type === 'strength') {
            const currentWeight = parseFloat((existing.match(/([0-9]+(?:[.,][0-9]+)?)\s*кг/) || [])[1]?.replace(',', '.')) || 0;
            const newWeight = parseFloat(set.weight) || 0;
            const currentReps = parseInt((existing.match(/×\s*([0-9]+)/) || [])[1]) || 0;
            const newReps = parseInt(set.reps) || 0;
            if (newWeight > currentWeight || (newWeight === currentWeight && newReps > currentReps)) {
                currentAchievements[exerciseName] = achievementText;
            }
        } else {
            currentAchievements[exerciseName] = achievementText;
        }
    }
}

function startRestTimer(seconds) {
    stopRestTimer(); restEndTime=Date.now()+seconds*1000; updateRestTimerDisplay();
    const container=document.getElementById('restTimerContainer'); if(container) container.classList.remove('hidden');
    restTimerInterval=setInterval(updateRestTimerDisplay,1000);
}
function setRestDuration(seconds){ lastRestDuration = seconds; try { localStorage.setItem('ftracker_rest_duration', String(seconds)); } catch(e) {} startRestTimer(seconds); }
function updateRestTimerDisplay(){
    if(!restEndTime) return;
    const remaining=Math.max(0,Math.ceil((restEndTime-Date.now())/1000));
    const display=document.getElementById('timerDisplay'); const container=document.getElementById('restTimerContainer');
    if(!display||!container) return;
    display.textContent=formatTime(remaining); const total=Math.max(1,Number(lastRestDuration)||120); const progress=Math.max(0,Math.min(100,(remaining/total)*100)); container.style.setProperty('--rest-progress', progress+'%'); if(remaining<=10) container.classList.add('warning'); else container.classList.remove('warning');
    if(remaining<=0){ stopRestTimer(); if(navigator.vibrate) navigator.vibrate(200); }
}
function addRestTime(){ if(restEndTime){ restEndTime+=30000; updateRestTimerDisplay(); } }
function stopRestTimer(){ if(restTimerInterval) clearInterval(restTimerInterval); restTimerInterval=null; restEndTime=null; const container=document.getElementById('restTimerContainer'); if(container) container.classList.add('hidden'); }
function formatTime(sec){ const m=Math.floor(sec/60); const s=sec%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function nextExercise() { stopRestTimer(); currentExerciseIndex++; renderExerciseStrip(); renderExercise(); saveDraft(); }
function confirmExitWorkout() { lockModalScroll(); document.getElementById('confirmExitModal').classList.remove('hidden'); }
function closeConfirmExit() { document.getElementById('confirmExitModal').classList.add('hidden'); }
function exitWorkoutWithoutSaving() { closeConfirmExit(); stopRestTimer(); stopTotalTimer(); clearDraft(); workoutExerciseSlots=[]; workoutTransientExercises=[]; currentProgram = null; goHome(); showToast('Тренировка отменена — данные не сохранены'); }

function isWorkoutSetFilledForResult(set,type='strength'){
    if(!set || typeof set!=='object') return false;
    // iPhone/RU keyboard can return decimal values with a comma (27,5).
    // Normalize both comma and dot before validation so decimal weights are
    // treated exactly like integer weights.
    const toNumeric=v=>{
        if(v===null || v===undefined) return NaN;
        const normalized=String(v).trim().replace(/\s+/g,'').replace(',', '.');
        if(!normalized) return NaN;
        return Number(normalized);
    };
    const positive=v=>Number.isFinite(toNumeric(v)) && toNumeric(v)>0;
    if(type==='cardio') return positive(set.time) && positive(set.intensity);
    if(type==='bodyweight') return positive(set.reps);
    // Силовой подход считается результатом только при заполнении ОБОИХ полей.
    return positive(set.weight) && positive(set.reps);
}
function hasWorkoutSetResult(exIdx,set){
    const meta=getWorkoutExercise(exIdx);
    return isWorkoutSetFilledForResult(set,meta?.type||'strength');
}
function countWorkoutSetResults(exIdx){
    return (workoutSets[exIdx]||[]).filter(s=>hasWorkoutSetResult(exIdx,s)).length;
}

function finishWorkout() {
    try {
    // Validate the current draft before saving. Empty placeholder rows are not
    // meaningful workout data and must never enter history.
    if (currentProgram !== null && Array.isArray(workoutExerciseSlots)) {
        const cleaned = {};
        workoutExerciseSlots.forEach(ref => {
            const meta = getWorkoutExercise(ref);
            const type = meta?.type || 'strength';
            const sets = Array.isArray(workoutSets?.[ref]) ? workoutSets[ref].filter(set => {
                if (!set || typeof set !== 'object') return false;
                return isWorkoutSetFilledForResult(set,type);
            }) : [];
            if (sets.length) cleaned[ref] = sets;
        });
        if (!Object.keys(cleaned).length) {
            showToast('Нет заполненных подходов — тренировка не сохранена');
            clearDraft(); stopRestTimer(); stopTotalTimer();
            workoutSets = {}; workoutExerciseSlots = []; workoutTransientExercises = []; workoutPlanSnapshot = []; currentProgram = null;
            goHome();
            return;
        }
        workoutSets = cleaned;
    }
    closeFinishWorkoutConfirm();
    const sessionDurationSeconds = workoutStartTime ? Math.max(0, Math.floor((Date.now() - workoutStartTime) / 1000)) : 0;
    closeConfirmExit(); stopRestTimer(); stopTotalTimer();
    if (currentProgram === null) return;
    const activeRefSet = new Set(getActiveExerciseIndices().map(Number));
    Object.keys(workoutSets||{}).forEach(k=>{ if(!activeRefSet.has(Number(k))) delete workoutSets[k]; });
    const hasAnySets = getActiveExerciseIndices().some(ref => Array.isArray(workoutSets[ref]) && workoutSets[ref].length > 0);
    if (!hasAnySets) { workoutExerciseSlots=[]; workoutTransientExercises=[]; currentProgram = null; clearDraft(); showToast('Нет выполненных подходов, тренировка не сохранена'); goHome(); return; }
    const program = data.programs[currentProgram];
    const sessionIndices = getActiveExerciseIndices();
    sessionIndices.forEach(realIdx => {
        const meta=getWorkoutExercise(realIdx);
        if(!meta) return;
        const ex=meta.name;
        const sets=workoutSets[realIdx];
        if (sets && sets.length) { const last = sets[sets.length - 1]; lastResults[ex] = { ...last, done: undefined }; }
    });
    localStorage.setItem('strong_last_results', JSON.stringify(lastResults));
    const durationSeconds = sessionDurationSeconds;
    const completionRequirements={strength:3,cardio:1,bodyweight:1};
    const recordedExerciseIndices=sessionIndices.filter(realIdx=>{
        const type=getWorkoutExercise(realIdx)?.type||'strength';
        return (workoutSets[realIdx]||[]).some(s=>isWorkoutSetFilledForResult(s,type));
    });
    const completedExerciseIndices=recordedExerciseIndices.filter(realIdx=>{
        const type=getWorkoutExercise(realIdx)?.type||'strength';
        const required=completionRequirements[type]||1;
        return (workoutSets[realIdx]||[]).filter(s=>isWorkoutSetFilledForResult(s,type)).length>=required;
    });
    const completionTargets=completedExerciseIndices.map(realIdx=>{
        const type=getWorkoutExercise(realIdx)?.type||'strength';
        return {realIdx,type,required:completionRequirements[type]||1};
    });
    const allPlannedWorkoutIndices=Array.isArray(sessionIndices)?sessionIndices:[];
    const completionUnits=allPlannedWorkoutIndices.map(realIdx=>{
        const type=getWorkoutExercise(realIdx)?.type||'strength';
        const required=completionRequirements[type]||1;
        const done=(workoutSets[realIdx]||[]).filter(s=>isWorkoutSetFilledForResult(s,type)).length;
        return {realIdx,type,required,done:Math.min(required,done)};
    });
    const completionTotal=completionUnits.reduce((sum,x)=>sum+x.required,0);
    const completionDone=completionUnits.reduce((sum,x)=>sum+x.done,0);
    const completionPercent=completionTotal?Math.round(completionDone/completionTotal*100):0;
    const plannedSnapshot=Array.isArray(workoutPlanSnapshot)?workoutPlanSnapshot:[];
    const plannedExercises=plannedSnapshot.map((p,i)=>{
        const ref=workoutExerciseSlots[i];
        const meta=getWorkoutExercise(ref);
        const actualType=meta?.type||'strength';
        const doneSets=(workoutSets[ref]||[]).filter(s=>isWorkoutSetFilledForResult(s,actualType));
        let status=p?.status||'pending', score=0;
        const required=actualType==='strength'?3:1;
        if(status!=='replaced'){
            if(doneSets.length>=required){status='completed';score=100;}
            else if(doneSets.length){status='partial';score=Math.round(doneSets.length/required*100);}
            else status='skipped';
        }
        if(status==='replaced'){
            const pg=fScoreNormName(p.plannedGroup), ag=fScoreNormName(p.actualGroup);
            score=(pg&&ag&&pg===ag)?100:50;
        }
        return {...p, actualName:meta?.name||p?.plannedName||'', actualType:meta?.type||p?.plannedType||'strength',
            actualGroup:p?.actualGroup||fScoreExerciseGroup(meta?.name||'',meta?.type||'strength'), status, score};
    });
    const newHistoryEntry = {
        date: new Date().toISOString(), program: program.name, durationSeconds,
        completion:{completed:completionDone,total:completionTotal,percent:completionPercent},
        plannedExercises,
        exercises: recordedExerciseIndices.map(realIdx => {
            const meta=getWorkoutExercise(realIdx);
            if(!meta) return null;
            const type=meta.type||'strength';
            const doneSets=(workoutSets[realIdx] || []).filter(s=>isWorkoutSetFilledForResult(s,type));
            return { name: meta.name, type:meta.type||'strength', group:fScoreExerciseGroup(meta.name,meta.type||'strength'), completedSets: doneSets.length, sets: doneSets.map(s => { const { done, ...clean } = s; return clean; }) };
        }).filter(x => x && x.sets.length)
    };
    data.history.push(newHistoryEntry);
    const workoutSaved=saveData(true, 'Завершение тренировки');
    clearDraft(); workoutTransientExercises=[]; workoutPlanSnapshot=[]; currentProgram = null;
    if(workoutSaved) showToast('Тренировка сохранена');
    showWorkoutSummary(newHistoryEntry);

    } catch(err) {
        console.error('finishWorkout error:', err);
        stopRestTimer();
        stopTotalTimer();
        clearDraft();
        workoutExerciseSlots=[];
        workoutTransientExercises=[];
        currentProgram = null;
        goHome();
        showToast('Ошибка: тренировка могла не сохраниться. Проверьте историю.');
    }
}
function getWorkoutPersonalRecords(entry) {
    const records = {};
    const previousHistory = (data.history || []).filter(e => e !== entry);
    (entry?.exercises || []).forEach(ex => {
        const type = ex.type || getExerciseTypeByName(ex.name);
        const currentSets = (ex.sets || []).filter(Boolean);
        if (!currentSets.length || !ex.name) return;
        const previousSets = [];
        previousHistory.forEach(h => {
            const hx = (h.exercises || []).find(x => x.name === ex.name && (x.type || type) === type);
            if (hx) (hx.sets || []).forEach(set => previousSets.push(set));
        });
        if (type === 'strength') {
            const valid = currentSets.filter(s => Number.isFinite(parseFloat(s.weight)) && parseInt(s.reps) > 0 && parseFloat(s.weight) > 0);
            if (!valid.length) return;
            const bestCurrent = valid.reduce((a,b) => {
                const aw=parseFloat(a.weight)||0, bw=parseFloat(b.weight)||0, ar=parseInt(a.reps)||0, br=parseInt(b.reps)||0;
                return bw>aw || (bw===aw && br>ar) ? b : a;
            });
            const prevMaxWeight = previousSets.reduce((m,s)=>Math.max(m,parseFloat(s.weight)||0),0);
            const prevBestRepsAtWeight = previousSets.reduce((m,s)=>{
                const w=parseFloat(s.weight)||0, r=parseInt(s.reps)||0;
                return w===parseFloat(bestCurrent.weight) ? Math.max(m,r) : m;
            },0);
            const w=parseFloat(bestCurrent.weight)||0, r=parseInt(bestCurrent.reps)||0;
            if (w>prevMaxWeight) records[ex.name]=`Новый рекорд веса: ${formatNum(w)} кг × ${r}`;
            else if (w===prevMaxWeight && r>prevBestRepsAtWeight) records[ex.name]=`Новый рекорд повторений с ${formatNum(w)} кг: ${r}`;
        } else if (type === 'bodyweight') {
            const bestCurrent=Math.max(...currentSets.map(s=>parseInt(s.reps)||0));
            const prevBest=Math.max(0,...previousSets.map(s=>parseInt(s.reps)||0));
            if(bestCurrent>0 && bestCurrent>prevBest) records[ex.name]=`Новый рекорд повторений: ${bestCurrent}`;
        } else if (type === 'cardio') {
            const bestTime=Math.max(...currentSets.map(s=>parseFloat(s.time)||0));
            const bestIntensity=Math.max(...currentSets.map(s=>parseFloat(s.intensity)||0));
            const prevTime=Math.max(0,...previousSets.map(s=>parseFloat(s.time)||0));
            const prevIntensity=Math.max(0,...previousSets.map(s=>parseFloat(s.intensity)||0));
            if(bestTime>0 && bestTime>prevTime) records[ex.name]=`Новый рекорд времени: ${formatNum(bestTime)} мин`;
            else if(bestIntensity>0 && bestIntensity>prevIntensity) records[ex.name]=`Новый рекорд интенсивности: ${formatNum(bestIntensity)}`;
        }
    });
    return records;
}

function showWorkoutSummary(entry) {
    const duration = entry.durationSeconds || 0;
    const sets = (entry.exercises||[]).reduce((n,e)=>n+(e.sets||[]).length,0);
    const volume = Math.round(calculateWorkoutVolume(entry));
    const hasVolume = volume > 0;
    const cardioMinutes = (entry.exercises||[]).reduce((sum,e)=>sum+(e.sets||[]).reduce((s,x)=>s+(parseFloat(x.time)||0),0),0);
    const best = getBestWorkoutForProgram(entry);
    const comparisons = compareWorkoutEntries(entry, best);
    const computedRecords = getWorkoutPersonalRecords(entry);
    Object.assign(currentAchievements, computedRecords);
    const records = Object.entries(computedRecords);
    const title = document.getElementById('workoutSummaryTitle');
    const content = document.getElementById('workoutSummaryContent');

    const bestVolume = best ? Math.round(calculateWorkoutVolume(best)) : 0;
    const volumeDiff = bestVolume ? volume - bestVolume : 0;
    const volumePct = bestVolume ? Math.abs(volumeDiff / bestVolume * 100) : 0;
    const volumeArrow = volumeDiff > 0 ? '↑' : volumeDiff < 0 ? '↓' : '＝';
    const volumeClass = volumeDiff > 0 ? 'positive' : volumeDiff < 0 ? 'negative' : 'same';

    const labels={weight:'вес',setVolume:'объём подхода',volume:'объём',time:'время',intensity:'интенсивность',reps:'повторы'};
    const units={weight:' кг',setVolume:' кг',volume:' кг',time:' мин',intensity:'',reps:' повт.'};
    const formatExerciseBest = (ex,type) => {
        const sets=ex?.sets||[];
        if(type==='strength'){
            const maxSet=getBestStrengthSet(sets);
            return maxSet ? `${maxSet.weight||0} кг × ${maxSet.reps||0}` : '—';
        }
        if(type==='cardio'){
            const maxSet=sets.reduce((a,b)=>(parseFloat(b.time)||0)>(parseFloat(a?.time)||0)?b:a,null);
            return maxSet ? `${maxSet.time||0} мин × ${maxSet.intensity||0}` : '—';
        }
        const maxSet=sets.reduce((a,b)=>(parseInt(b.reps)||0)>(parseInt(a?.reps)||0)?b:a,null);
        return maxSet ? `${maxSet.reps||0} повт.` : '—';
    };

    const comparisonRows = (entry.exercises||[]).map(ex=>{
        const bestItem = getBestExerciseHistory(ex.name, entry);
        if(!bestItem) return '';
        const type=getExerciseTypeByName(ex.name);
        const currentBestSet=getBestSetForExercise(ex,type);
        const bestTextSet=getBestSetForExercise(bestItem.ex,type);
        const currentText=currentBestSet?formatExerciseBest({sets:[currentBestSet]},type):'—';
        const bestText=bestTextSet?formatExerciseBest({sets:[bestTextSet]},type):'—';
        const comparison=compareWorkoutEntries({exercises:[ex]},{exercises:[bestItem.ex]}).filter(x=>x.name===ex.name);
        const primary=comparison.find(x=>x.type==='setVolume'||x.type==='weight'||x.type==='reps'||x.type==='time'||x.type==='intensity') || comparison[0];
        if(!primary) return `<div class="best-compare-row"><div class="best-compare-name">${escapeHtml(ex.name)}</div><div class="best-compare-values"><span>Сегодня <b>${escapeHtml(currentText)}</b></span><span>Лучший <b>${escapeHtml(bestText)}</b></span><em class="same">＝ лучший результат</em></div></div>`;
        const pct=primary.best ? Math.abs(primary.diff/primary.best*100) : 0;
        const cls=primary.diff>0?'positive':primary.diff<0?'negative':'same';
        const direction=primary.diff>0?'↑':primary.diff<0?'↓':'＝';
        const text=primary.diff===0?'на уровне лучшего':`${direction} ${Math.abs(Math.round(primary.diff))}${units[primary.type]||''} ${labels[primary.type]||'результат'}${primary.best && pct>=0.1 ? ` · ${Math.round(pct*10)/10}%` : ''}`;
        return `<div class="best-compare-row"><div class="best-compare-name">${escapeHtml(ex.name)}</div><div class="best-compare-values"><span>Сегодня <b>${escapeHtml(currentText)}</b></span><span>Лучший <b>${escapeHtml(bestText)}</b></span><em class="${cls}">${text}</em></div></div>`;
    }).join('');

    title.textContent = '🏁 Тренировка завершена';
    content.innerHTML = `
        <div class="summary-program-name">${escapeHtml(entry.program)}</div>
        ${entry.completion && entry.completion.total ? `<div class="analysis-card completion-summary-card"><div class="analysis-title">🏁 Выполнение тренировки</div><div class="completion-summary-main"><b>${entry.completion.completed}/${entry.completion.total}</b><span>единиц выполнения</span></div><div class="completion-summary-message">${entry.completion.completed===entry.completion.total?'Отличный результат — тренировка выполнена полностью.':entry.completion.completed>=entry.completion.total*0.75?'Тренировка выполнена хорошо, но часть запланированной работы осталась.':'Тренировка выполнена не полностью — часть запланированной работы пропущена.'}</div></div>` : ''}
        <div class="smart-summary-grid">
            <div class="smart-stat"><div class="smart-stat-value">${formatTime(duration)}</div><div class="smart-stat-label">ВРЕМЯ</div></div>
            <div class="smart-stat"><div class="smart-stat-value">${entry.exercises.length}</div><div class="smart-stat-label">УПРАЖНЕНИЙ</div></div>
            <div class="smart-stat"><div class="smart-stat-value">${sets}</div><div class="smart-stat-label">ПОДХОДОВ</div></div>
            <div class="smart-stat"><div class="smart-stat-value">${hasVolume?volume.toLocaleString('ru-RU'):(cardioMinutes?formatNum(cardioMinutes):'—')}</div><div class="smart-stat-label">${hasVolume?'ОБЪЁМ, КГ':'КАРДИО, МИН'}</div></div>
        </div>
        ${records.length ? `<div class="analysis-card records-card"><div class="analysis-title">🏆 Новые рекорды</div>${records.map(([ex,txt])=>`<div class="summary-record"><span>✨ ${escapeHtml(ex)}</span><b>${escapeHtml(txt)}</b></div>`).join('')}</div>` : `<div class="analysis-card final-insight-card"><div class="analysis-title">💡 Итог</div><div class="analysis-line">Новых личных рекордов сегодня не установлено. Сравнение ниже показывает изменения по лучшим подходам упражнений.</div></div>`}
        ${best && comparisonRows ? `<div class="analysis-card best-comparison-card"><div class="analysis-title">📈 Результаты по упражнениям</div><div class="analysis-subtitle">Лучший подход сегодня сравнивается с личным максимумом этого упражнения за всю историю.</div>${comparisonRows}</div>` : ''}
        ${best ? `<div class="analysis-card summary-overall"><div class="analysis-title">📊 Общий объём тренировки</div><div class="overall-result"><span>Сегодня</span><b>${hasVolume ? volume.toLocaleString('ru-RU')+' кг' : formatNum(cardioMinutes)+' мин'}</b></div><div class="overall-result"><span>Максимальный объём тренировки</span><b>${bestVolume ? bestVolume.toLocaleString('ru-RU')+' кг' : '—'}</b></div><div class="overall-diff ${volumeClass}">${volumeArrow} ${bestVolume ? (volumeDiff===0 ? 'На уровне лучшего результата' : `${Math.abs(volumeDiff).toLocaleString('ru-RU')} кг · ${Math.round(volumePct*10)/10}% ${volumeDiff>0?'выше':'ниже'} лучшего`) : 'Недостаточно данных для сравнения'}</div></div>` : ''}
        ${records.length ? `<div class="analysis-card final-insight-card"><div class="analysis-title">💡 Итог</div><div class="analysis-line">Сегодня установлено новых личных рекордов: <b>${records.length}</b>. Общий объём показан отдельно и не определяет наличие личного рекорда.</div></div>` : ''}
    `;
    lockModalScroll(); document.getElementById('workoutSummaryModal').classList.remove('hidden');
}
function closeWorkoutSummary() {
    document.getElementById('workoutSummaryModal').classList.add('hidden');
    currentAchievements = {};
    goHome();
}
function closeAchievements() { document.getElementById('achievementsModal').classList.add('hidden'); currentAchievements = {}; goHome(); }

function editHistoryDate(index) { editingHistoryIndex = index; const entry = data.history[index]; document.getElementById('newDateInput').value = new Date(entry.date).toISOString().slice(0,10); lockModalScroll(); document.getElementById('dateModal').classList.remove('hidden'); }
function closeDateModal() { document.getElementById('dateModal').classList.add('hidden'); editingHistoryIndex = null; }
function saveDateChange() { if (editingHistoryIndex === null) return; const newDate = document.getElementById('newDateInput').value; if (newDate) { data.history[editingHistoryIndex].date = new Date(newDate + 'T12:00:00').toISOString(); saveData(); showHistory(); showToast('Дата изменена'); } closeDateModal(); }

function showSettings() { showScreen('settingsScreen'); renderSettings(); }
function renderSettings() {
    const editor = document.getElementById('programsEditor');
    editor.innerHTML = data.programs.map((p, idx) => {
        const activeCount = (p.active || []).filter(Boolean).length;
        return `<div class="card program-v5-card" id="splitCard_${idx}">
            <div class="program-v5-head" onclick="toggleSplitCard(${idx})">
                <input type="checkbox" ${p.programActive ? 'checked' : ''} onclick="event.stopPropagation()" onchange="toggleProgramActive(${idx}, this.checked)" style="width:22px;height:22px;flex:none;">
                <div class="program-v5-head-main">
                    <div class="program-v5-name">${escapeHtml(p.name.replace(/^Сплит\s*\d+\s*:\s*/i, ''))}</div>
                    <div class="program-v5-meta">${activeCount} из ${p.exercises.length} упражнений активно</div>
                </div>
                <span class="program-original-chevron">⌄</span>
            </div>
            <div class="program-v5-body">
                ${p.exercises.map((ex, exIdx) => `
                    <div class="program-v5-ex">
                        <input class="program-v5-check" type="checkbox" ${p.active[exIdx] ? 'checked' : ''} onchange="toggleExercise(${idx}, ${exIdx}, this.checked)">
                        <div class="program-v5-ex-name ${p.active[exIdx]?'':'off'}" onclick="openTechniqueModal(data.programs[${idx}].exercises[${exIdx}], data.programs[${idx}].types[${exIdx}])" title="Открыть технику">${escapeHtml(ex)}</div>
                        <button type="button" class="program-tech-btn program-v5-tech" onclick="openTechniqueModal(data.programs[${idx}].exercises[${exIdx}], data.programs[${idx}].types[${exIdx}])" title="Техника">💪</button>
                        <button type="button" class="small-btn gray program-v5-delete" onclick="deleteExercise(${idx}, ${exIdx})" title="Убрать из сплита" style="color:var(--negative);">✕</button>
                    </div>`).join('')}
                <div class="program-v5-actions">
                    <button type="button" class="program-add-btn program-v5-add" onclick="addExercise(${idx})">＋ Добавить упражнение</button>
                    <button type="button" class="gray program-v5-add" onclick="openExerciseOrderModal(${idx})">☰ Изменить порядок</button>
                    <button type="button" class="program-delete-btn" onclick="deleteProgram(${idx})">🗑️ Удалить сплит</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function toggleSplitCard(idx){
    document.getElementById('splitCard_'+idx)?.classList.toggle('open');
}

function toggleExercise(progIdx, exIdx, isActive) { data.programs[progIdx].active[exIdx] = isActive; saveData(); }
function updateProgramName(idx, name) {
    const p=data.programs[idx]; if(!p) return;
    const oldName=String(p.name||'');
    const newName=ftCanonicalName(name);
    if(!newName) return;
    if(oldName && normalizeExerciseKey(oldName)!==normalizeExerciseKey(newName)){
        if(!data.programAliases || typeof data.programAliases!=='object') data.programAliases={};
        data.programAliases[normalizeExerciseKey(oldName)]=String(p.id||ftStableId('prog',normalizeExerciseKey(oldName)));
    }
    p.name=newName;
    saveData();
}
function normalizeExerciseName(value) {
    return normalizeExerciseKey(value);
}
function exerciseNameExists(progIdx, value, excludeIndex = -1) {
    const normalized = normalizeExerciseName(value);
    if (!normalized) return false;
    const exercises = data.programs[progIdx]?.exercises || [];
    return exercises.some((name, i) => i !== excludeIndex && normalizeExerciseName(name) === normalized);
}
function updateExercise(progIdx, exIdx, value) {
    const program = data.programs[progIdx];
    if (!program) return;
    const oldValue = program.exercises[exIdx];
    const name = String(value || '').trim().replace(/\s+/g, ' ');
    if (!name) {
        showToast('Название упражнения не может быть пустым');
        renderSettings();
        setTimeout(() => document.getElementById('splitCard_'+progIdx)?.classList.add('open'), 0);
        return;
    }
    if (exerciseNameExists(progIdx, name, exIdx)) {
        showToast('Упражнение с таким названием уже есть в этом сплите');
        renderSettings();
        setTimeout(() => document.getElementById('splitCard_'+progIdx)?.classList.add('open'), 0);
        return;
    }
    program.exercises[exIdx] = name;
    if(oldValue && normalizeExerciseKey(oldValue)!==normalizeExerciseKey(name)){
        const oldKey=normalizeExerciseKey(oldValue);
        const dir=(data.exerciseDirectory||[]).find(e=>normalizeExerciseKey(e.name)===oldKey);
        if(!data.exerciseAliases || typeof data.exerciseAliases!=='object') data.exerciseAliases={};
        data.exerciseAliases[oldKey]=String(dir?.id||ftStableId('ex',oldKey));
    }
    saveData();
}
function updateExerciseType(progIdx, exIdx, value) { data.programs[progIdx].types[exIdx] = value; saveData(); }
function addExercise(progIdx) {
    if (!data.programs[progIdx]) return;
    openExercisePicker(progIdx);
}

function deleteExercise(progIdx, exIdx) {
    if (data.programs[progIdx].exercises.length <= 1) { showToast('Нельзя удалить последнее упражнение'); return; }
    pendingDeleteType='programExercise'; pendingDeleteIndex=exIdx; pendingProgramIndex=progIdx; showDeleteConfirm(`Удалить упражнение «${escapeHtml(data.programs[progIdx].exercises[exIdx])}» из сплита?`);
}
function toggleProgramActive(idx, isActive) { data.programs[idx].programActive = isActive; saveData(); renderHome(); }
function addProgram() {
    const name='Новая программа';
    data.programs.push({ id:ftStableId('prog',name+'-'+Date.now()), name, exercises:[], active:[], types:[], programActive:true });
    saveData(); renderSettings();
}
function deleteProgram(idx) {
    if (data.programs.length <= 1) { showToast('Нельзя удалить последний сплит'); return; }
    pendingDeleteType = 'program'; pendingDeleteIndex = idx; showDeleteConfirm('Удалить сплит?');
}


/* ===== Exercise directory / safe program picker ===== */
const DIRECTORY_GROUPS = ['Грудь','Бицепс','Спина','Трицепс','Плечи','Ноги','Пресс','Кардио','Другое'];
function normalizeExerciseKey(value) {
    // TECHNICAL COMPARISON KEY ONLY.
    // IMPORTANT: never use this function for a displayed exercise name.
    // Word boundaries are preserved so the UI/search can distinguish text normally.
    return String(value || '')
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g,'е')
      .replace(/[«»"'`´]/g,'')
      .replace(/[\-–—_.,:;!?()[\]{}]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
}

const RETIRED_EXERCISES = new Set([
  'подтягивания',
  'отжимания на брусьях',
  'кросс-тяга в наклоне'
].map(normalizeExerciseKey));
function isRetiredExerciseName(name){ return RETIRED_EXERCISES.has(normalizeExerciseKey(name)); }

function displayExerciseName(value){
    const raw=String(value||'').trim().replace(/\s+/g,' ');
    if(!raw) return '';
    const key=normalizeExerciseKey(raw);
    const builtin=(typeof EXERCISE_GUIDES!=='undefined' && Array.isArray(EXERCISE_GUIDES))
      ? EXERCISE_GUIDES.find(g=>g?.name && normalizeExerciseKey(g.name)===key)
      : null;
    return builtin?.name || raw;
}

function canonicalExerciseName(value){
    return displayExerciseName(value);
}

/* Repair only accidental normalization of known built-in exercises.
   A genuinely renamed custom exercise is left untouched. */

function normalizeExerciseGuideContent(entry){
  if(!entry) return false;
  if(!entry.guide || typeof entry.guide!=='object') entry.guide={};
  const g=entry.guide;
  const lines=v=>Array.isArray(v)?v.map(x=>String(x??'').trim()).filter(Boolean)
    :String(v??'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
  let changed=false;
  if(!Array.isArray(g.recommendations) || !g.recommendations.length){
    const source=g.recommendation || g.recs;
    const rec=lines(source);
    if(rec.length){ g.recommendations=rec; changed=true; }
  }
  if(!Array.isArray(g.mistakes) || !g.mistakes.length){
    const bad=lines(g.errors || g.mistakes);
    if(bad.length){ g.mistakes=bad; changed=true; }
  }
  return changed;
}

function repairCanonicalExerciseNames(target){
    if(!target) return false;
    let changed=false;

    if(Array.isArray(target.exerciseDirectory)){
        target.exerciseDirectory.forEach(e=>{
            if(!e?.name) return;
            const canonical=canonicalExerciseName(e.name);
            if(canonical && canonical!==e.name){
                e.name=canonical;
                changed=true;
            }
            if(canonical && typeof findExerciseGuide==='function' && findExerciseGuide(canonical)){
                if(!e.builtinName || normalizeExerciseKey(e.builtinName)===normalizeExerciseKey(canonical)){
                    if(e.builtinName!==canonical){e.builtinName=canonical;changed=true;}
                }
            }
        });
    }

    (target.programs||[]).forEach(p=>{
        (p.exercises||[]).forEach((name,i)=>{
            const canonical=canonicalExerciseName(name);
            if(canonical && canonical!==name){
                p.exercises[i]=canonical;
                changed=true;
            }
        });
    });

    (target.history||[]).forEach(h=>{
        (h.exercises||[]).forEach(ex=>{
            if(!ex?.name) return;
            const canonical=canonicalExerciseName(ex.name);
            if(canonical && canonical!==ex.name){
                ex.name=canonical;
                changed=true;
            }
        });
    });

    (target.exerciseDirectoryArchived||[]).forEach(e=>{
        if(!e?.name) return;
        const canonical=canonicalExerciseName(e.name);
        if(canonical && canonical!==e.name){e.name=canonical;changed=true;}
    });

    return changed;
}
// Compatibility helper: all workout/planned-exercise group lookups use the canonical classifier.
function fScoreNormName(value){
  return String(value ?? '').toLocaleLowerCase('ru').replace(/[ё]/g,'е').replace(/[^\p{L}\p{N}]+/gu,'').trim();
}
window.fScoreNormName=fScoreNormName;
function fScoreExerciseGroup(name, type) { return inferExerciseGroup(name, type); }

function inferExerciseGroup(name, type) {
    if (type === 'cardio') return 'Кардио';
    const g = findExerciseGuide(name);
    const p = g?.primary || [];
    if (p.includes('cardio')) return 'Кардио';
    if (p.includes('chest')) return 'Грудь';
    if (p.includes('biceps')) return 'Бицепс';
    if (p.includes('lats') || p.includes('upperback') || p.includes('traps')) return 'Спина';
    if (p.includes('triceps')) return 'Трицепс';
    if (p.some(k => k.startsWith('delts'))) return 'Плечи';
    if (p.some(k => ['quads','glutes','hamstrings','calves'].includes(k))) return 'Ноги';
    if (p.includes('abs') || p.includes('obliques')) return 'Пресс';
    return 'Другое';
}
function ensureDirectoryEntry(name,type='strength',group=null){
    const clean=canonicalExerciseName(String(name||'').trim().replace(/\s+/g,' ')); if(!clean) return null;
    if(!Array.isArray(data.exerciseDirectory)) data.exerciseDirectory=[];
    const key=normalizeExerciseKey(clean);
    data.exerciseDirectoryHidden = (data.exerciseDirectoryHidden||[]).filter(k=>normalizeExerciseKey(k)!==key);
    const existing=data.exerciseDirectory.find(e=>normalizeExerciseKey(e.name)===key);
    if(existing) return existing;
    const entry={name:clean,type:type||'strength',group:group||inferExerciseGroup(clean,type||'strength'), note:'', guide:{execution:'',muscles:[],steps:[],primary:[],secondary:[],mistakes:[],recommendations:[],media:[]}};
    data.exerciseDirectory.push(entry); return entry;
}
function getDirectoryExercises() {
    const map = new Map();
    const archived = new Set((data.exerciseDirectoryArchived||[]).map(e=>normalizeExerciseKey(e?.name)).filter(Boolean));
    const add = (name,type='strength',group=null,source=null) => {
        const clean = canonicalExerciseName(String(name||'').trim().replace(/\s+/g,' ')); if (!clean || isRetiredExerciseName(clean)) return;
        const key = normalizeExerciseKey(clean); if (!key || archived.has(key)) return;
        if (!map.has(key)) {
            map.set(key,{
                name:clean,
                type:type||'strength',
                group:group||inferExerciseGroup(clean,type||'strength')
            });
        }
    };
    // Единый справочник. ВАЖНО: сохранённая запись упражнения имеет приоритет
    // над встроенным названием при совпадении normalizeExerciseKey(). Это
    // сохраняет пользовательское написание названия, например «Бабочка в тренажёре».
    (data.exerciseDirectory||[]).forEach(e=>add(e.name,e.type,e.group,e));

    // Если встроенное упражнение уже представлено сохранённой записью (в том числе
    // после переименования через builtinName), не создаём второй пункт.
    const savedBuiltinKeys = new Set(
        (data.exerciseDirectory||[])
          .flatMap(e => [e?.builtinName, e?.name])
          .map(normalizeExerciseKey)
          .filter(Boolean)
    );

    if (typeof EXERCISE_GUIDES !== 'undefined' && Array.isArray(EXERCISE_GUIDES)) {
        EXERCISE_GUIDES.forEach(g=>{
            if (!g || !g.name) return;
            const k = normalizeExerciseKey(g.name);
            if (savedBuiltinKeys.has(k)) return;
            add(g.name, g.type || 'strength', inferExerciseGroup(g.name, g.type || 'strength'));
        });
    }
    (data.programs||[]).forEach(p => (p.exercises||[]).forEach((n,i)=>add(n,p.types?.[i]||'strength')));
    (data.history||[]).forEach(h => (h.exercises||[]).forEach(ex=>add(ex.name,ex.type||'strength')));
    return [...map.values()].sort((a,b)=>{
        const ga=DIRECTORY_GROUPS.indexOf(a.group), gb=DIRECTORY_GROUPS.indexOf(b.group);
        return (ga-gb)||a.name.localeCompare(b.name,'ru');
    });
}
function getArchivedExercises(){
    const map=new Map();
    (data.exerciseDirectoryArchived||[]).forEach(e=>{
        if(!e||!e.name) return;
        const key=normalizeExerciseKey(e.name); if(!key||map.has(key)) return;
        map.set(key,{...e,name:String(e.name).trim(),type:e.type||'strength',group:e.group||inferExerciseGroup(e.name,e.type||'strength'),archivedAt:e.archivedAt||null});
    });
    return [...map.values()].sort((a,b)=>{
        const ga=DIRECTORY_GROUPS.indexOf(a.group), gb=DIRECTORY_GROUPS.indexOf(b.group);
        return (ga-gb)||a.name.localeCompare(b.name,'ru');
    });
}
let directoryView='active';

/* =========================================================
   v95 — one canonical exercise directory + duplicate repair
   ========================================================= */
function mergeExerciseGuides(a,b){
    const A=(a&&typeof a==='object')?a:{};
    const B=(b&&typeof b==='object')?b:{};
    const out={...A};
    const arrKeys=['steps','primary','secondary','muscles','mistakes','recommendations','media'];
    arrKeys.forEach(k=>{
        const av=Array.isArray(A[k])?A[k]:[];
        const bv=Array.isArray(B[k])?B[k]:[];
        if(k==='media'){
            const seen=new Set(); out[k]=[];
            [...av,...bv].forEach(m=>{ if(!m?.id || seen.has(m.id)) return; seen.add(m.id); out[k].push(m); });
        }else{
            const seen=new Set(); out[k]=[...av,...bv].filter(v=>{const k2=String(v||'');if(seen.has(k2))return false;seen.add(k2);return !!k2;});
        }
    });
    if(!String(out.execution||'').trim()) out.execution=String(B.execution||'');
    if(!out.hiddenBuiltinIndexes?.length && Array.isArray(B.hiddenBuiltinIndexes)) out.hiddenBuiltinIndexes=[...B.hiddenBuiltinIndexes];
    return out;
}
function repairExerciseDirectoryDuplicates(persist=true){
    if(!Array.isArray(data.exerciseDirectory)) data.exerciseDirectory=[];
    if(!Array.isArray(data.exerciseDirectoryArchived)) data.exerciseDirectoryArchived=[];
    const archivedKeys=new Set(data.exerciseDirectoryArchived.map(e=>normalizeExerciseKey(e?.name)).filter(Boolean));
    const map=new Map(); let changed=false;
    data.exerciseDirectory.forEach(raw=>{
        if(!raw?.name) return;
        const key=normalizeExerciseKey(raw.name); if(!key) return;
        if(archivedKeys.has(key)){ changed=true; return; }
        const e={...raw,name:String(raw.name).trim(),type:raw.type||'strength',group:raw.group||inferExerciseGroup(raw.name,raw.type||'strength'),guide:cloneGuide(raw.guide||emptyGuide())};
        const prev=map.get(key);
        if(!prev){ map.set(key,e); return; }
        changed=true;
        /* Keep the first human-facing name, but merge all useful content/media. */
        prev.guide=mergeExerciseGuides(prev.guide,e.guide);
        prev.type=prev.type||e.type;
        prev.group=prev.group||e.group;
        if(!prev.builtinName && e.builtinName) prev.builtinName=e.builtinName;
    });
    const next=[...map.values()];
    if(next.length!==data.exerciseDirectory.length) changed=true;
    if(changed){ data.exerciseDirectory=next; if(persist) saveData(); }
    return changed;
}

function setDirectoryView(view){ directoryView=view==='archive'?'archive':'active'; renderExerciseDirectory(); }
window.openDirectoryExerciseByKey = function(key){
    try{
        const normalized=normalizeExerciseKey(key);
        const item=getDirectoryExercises().find(x=>normalizeExerciseKey(x.name)===normalized) || getArchivedExercises().find(x=>normalizeExerciseKey(x.name)===normalized);
        if(!item) return;
        if(typeof window.openTechniqueModal==='function') window.openTechniqueModal(item.name,item.type,'directory');
    }catch(err){ console.warn('directory open failed',err); }
};
function showExerciseDirectory() {
    showScreen('exerciseDirectoryScreen');
    directoryView='active';
    const input=document.getElementById('directorySearch'); if(input) input.value='';
    const clear=document.getElementById('directorySearchClear'); if(clear) clear.classList.add('hidden');
    renderExerciseDirectory();
}
function filterDirectorySearch(value){
    const input=document.getElementById('directorySearch');
    const clear=document.getElementById('directorySearchClear');
    if(input && input.value!==String(value??'')) input.value=String(value??'');
    if(clear) clear.classList.toggle('hidden', !String(value??'').trim());
    renderExerciseDirectory();
}
function clearDirectorySearch(){
    const input=document.getElementById('directorySearch');
    if(input) input.value='';
    const clear=document.getElementById('directorySearchClear');
    if(clear) clear.classList.add('hidden');
    renderExerciseDirectory();
    input?.focus();
}

function renderExerciseDirectory() {
    const root=document.getElementById('exerciseDirectoryContent'); if(!root) return;
    const qRaw=(document.getElementById('directorySearch')?.value||'').trim();
    const q=normalizeExerciseKey(qRaw);
    const activeTab=document.getElementById('directoryActiveTab'), archiveTab=document.getElementById('directoryArchiveTab');
    if(activeTab) activeTab.classList.toggle('active',directoryView==='active');
    if(archiveTab) archiveTab.classList.toggle('active',directoryView==='archive');
    const actions=document.getElementById('directoryActiveActions'); if(actions) actions.style.display=directoryView==='active'?'flex':'none';
    const source=directoryView==='archive'?getArchivedExercises():getDirectoryExercises();
    const items=source.filter(x=>!q || normalizeExerciseKey(x.name).includes(q));
    const clear=document.getElementById('directorySearchClear');
    if(clear) clear.classList.toggle('hidden', !q);
    if(directoryView==='archive'){
        root.innerHTML=DIRECTORY_GROUPS.map(group=>{
            const list=items.filter(x=>x.group===group); if(!list.length) return '';
            return `<section class="directory-group"><div class="directory-group-title">${escapeHtml(group)}</div><div class="directory-list">${list.map(item=>`
                <div class="directory-item directory-archived-item" data-directory-key="${escapeHtml(normalizeExerciseKey(item.name))}">
                    <button type="button" class="directory-item-main" data-directory-open="${escapeHtml(normalizeExerciseKey(item.name))}" onclick="openDirectoryExerciseByKey(this.dataset.directoryOpen); return false;"><span><span class="directory-item-name">${escapeHtml(item.name)}</span><small class="directory-archive-meta">В архиве</small></span><span class="directory-chevron">›</span></button>
                    <button type="button" class="gray directory-restore" data-directory-restore="${escapeHtml(normalizeExerciseKey(item.name))}" title="Восстановить">↩</button>
                    <button type="button" class="gray directory-delete" data-directory-purge="${escapeHtml(normalizeExerciseKey(item.name))}" title="Удалить полностью">🗑️</button>
                </div>`).join('')}</div></section>`;
        }).join('') || '<div class="card" style="text-align:center;color:var(--subtext);">Архив пуст</div>';
        root.querySelectorAll('[data-directory-open]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const item=getArchivedExercises().find(x=>normalizeExerciseKey(x.name)===btn.dataset.directoryOpen);if(item)openTechniqueModal(item.name,item.type,'directory');}));
        root.querySelectorAll('[data-directory-restore]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const item=getArchivedExercises().find(x=>normalizeExerciseKey(x.name)===btn.dataset.directoryRestore);if(item)restoreDirectoryExercise(item.name);}));
        root.querySelectorAll('[data-directory-purge]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const item=getArchivedExercises().find(x=>normalizeExerciseKey(x.name)===btn.dataset.directoryPurge);if(item)purgeDirectoryExercise(item.name);}));
        return;
    }
    root.innerHTML=DIRECTORY_GROUPS.map(group=>{
        const list=items.filter(x=>x.group===group); if(!list.length) return '';
        return `<section class="directory-group"><div class="directory-group-title">${escapeHtml(group)}</div><div class="directory-list">${list.map(item=>`
            <div class="directory-item" data-directory-key="${escapeHtml(normalizeExerciseKey(item.name))}">
                <button type="button" class="directory-item-main" data-directory-open="${escapeHtml(normalizeExerciseKey(item.name))}" onclick="openDirectoryExerciseByKey(this.dataset.directoryOpen); return false;"><span class="directory-item-name">${escapeHtml(item.name)}</span><span class="directory-chevron">›</span></button>
                <button type="button" class="gray directory-guide-edit" data-directory-guide-edit="${escapeHtml(normalizeExerciseKey(item.name))}" title="Внести изменения">✎</button>
                <button type="button" class="gray directory-edit" data-directory-edit="${escapeHtml(normalizeExerciseKey(item.name))}" title="Переименовать">Aa</button>
                <button type="button" class="gray directory-delete" data-directory-delete="${escapeHtml(normalizeExerciseKey(item.name))}" title="Убрать из справочника">✕</button>
            </div>`).join('')}</div></section>`;
    }).join('') || '<div class="card" style="text-align:center;color:var(--subtext);">Ничего не найдено</div>';
    root.querySelectorAll('[data-directory-open]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const item=getDirectoryExercises().find(x=>normalizeExerciseKey(x.name)===btn.dataset.directoryOpen);if(item)openTechniqueModal(item.name,item.type,'directory');}));
    root.querySelectorAll('[data-directory-edit]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const item=getDirectoryExercises().find(x=>normalizeExerciseKey(x.name)===btn.dataset.directoryEdit);if(item)openRenameExerciseModal(item.name);}));
    root.querySelectorAll('[data-directory-guide-edit]').forEach(btn=>btn.addEventListener('click',e=>{
        e.preventDefault();e.stopPropagation();
        const k=btn.dataset.directoryGuideEdit;
        const item=getDirectoryExercises().find(x=>normalizeExerciseKey(x.name)===k);
        if(item && typeof window.openExerciseEditor==='function') window.openExerciseEditor(item.name,item.type);
    }));
    root.querySelectorAll('[data-directory-delete]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const item=getDirectoryExercises().find(x=>normalizeExerciseKey(x.name)===btn.dataset.directoryDelete);if(item)archiveDirectoryExercise(item.name);}));
}
function openRenameExerciseModal(oldName){
    const modal=document.getElementById('renameExerciseModal'); if(!modal) return;
    document.getElementById('renameExerciseOld').value=oldName;
    document.getElementById('renameExerciseInput').value=oldName;
    modal.classList.remove('hidden');
    setTimeout(()=>document.getElementById('renameExerciseInput')?.focus(),50);
}
function closeRenameExerciseModal(){ document.getElementById('renameExerciseModal')?.classList.add('hidden'); }
function saveRenameExercise(){
    const oldName=document.getElementById('renameExerciseOld')?.value||'';
    const raw=document.getElementById('renameExerciseInput')?.value||'';
    const name=String(raw).trim().replace(/\s+/g,' ');
    if(!name) return showToast('Название не может быть пустым');
    const oldKey=normalizeExerciseKey(oldName), newKey=normalizeExerciseKey(name);
    if(!newKey || oldKey===newKey){ closeRenameExerciseModal(); return; }
    const existingItem=getDirectoryExercises().find(x=>normalizeExerciseKey(x.name)===oldKey);
    if(!data.exerciseAliases || typeof data.exerciseAliases!=='object') data.exerciseAliases={};
    if(existingItem?.id) data.exerciseAliases[oldKey]=String(existingItem.id);
    else data.exerciseAliases[oldKey]=ftStableId('ex',oldKey);
    const exists=getDirectoryExercises().some(x=>normalizeExerciseKey(x.name)===newKey && normalizeExerciseKey(x.name)!==oldKey);
    if(exists) return showToast('Такое упражнение уже есть в справочнике');
    (data.exerciseDirectory||[]).forEach(e=>{if(normalizeExerciseKey(e.name)===oldKey){e.id=e.id||data.exerciseAliases[oldKey];e.name=name;}});
    (data.programs||[]).forEach(p=>p.exercises=(p.exercises||[]).map(x=>normalizeExerciseKey(x)===oldKey?name:x));
    (data.history||[]).forEach(h=>(h.exercises||[]).forEach(ex=>{if(normalizeExerciseKey(ex.name)===oldKey)ex.name=name;}));
    (data.exerciseDirectoryArchived||[]).forEach(e=>{if(normalizeExerciseKey(e.name)===oldKey){e.id=e.id||data.exerciseAliases[oldKey];e.name=name;}});
    data.exerciseDirectoryHidden=(data.exerciseDirectoryHidden||[]).filter(k=>normalizeExerciseKey(k)!==oldKey);
    saveData(); closeRenameExerciseModal(); renderExerciseDirectory(); renderHome(); renderSettings(); showToast('Название изменено');
}
function archiveDirectoryExercise(name){
    const key=normalizeExerciseKey(name); if(!key) return;
    const item=getDirectoryExercises().find(x=>normalizeExerciseKey(x.name)===key); if(!item) return;
    const programRefs=[];
    (data.programs||[]).forEach((p,pi)=>{
        (p.exercises||[]).forEach((ex,ei)=>{
            if(normalizeExerciseKey(ex)!==key) return;
            programRefs.push({programName:p.name||`Сплит ${pi+1}`,exerciseIndex:ei,active:p.active?.[ei]!==false,type:p.types?.[ei]||item.type||'strength'});
        });
    });
    pendingArchiveExercise={name:item.name,type:item.type||'strength',group:item.group||inferExerciseGroup(item.name,item.type||'strength'),programRefs};
    const count=programRefs.length;
    showDeleteConfirm(`Убрать «${escapeHtml(item.name)}» в архив?${count?` Оно будет удалено из ${count} сплит${count===1?'а':'ов'}, но история и прогресс сохранятся.`:''}`);
    pendingDeleteType='archiveDirectoryExercise';
    pendingDeleteDate=key;
}
function restoreDirectoryExercise(name){
    const key=normalizeExerciseKey(name); const archived=getArchivedExercises().find(x=>normalizeExerciseKey(x.name)===key); if(!archived)return;
    const refs=archived.programRefs||[];
    ensureDirectoryEntry(archived.name,archived.type,archived.group);
    refs.forEach(ref=>{
        const p=(data.programs||[]).find(pr=>String(pr.name||'')===String(ref.programName||''));
        if(!p) return;
        if((p.exercises||[]).some(x=>normalizeExerciseKey(x)===key)) return;
        const idx=Math.min(Math.max(Number(ref.exerciseIndex)||0,p.exercises.length),p.exercises.length);
        p.exercises.splice(idx,0,archived.name); p.active.splice(idx,0,ref.active!==false); p.types.splice(idx,0,ref.type||archived.type||'strength');
    });
    data.exerciseDirectoryArchived=(data.exerciseDirectoryArchived||[]).filter(e=>normalizeExerciseKey(e.name)!==key);
    data.exerciseDirectoryHidden=(data.exerciseDirectoryHidden||[]).filter(k=>normalizeExerciseKey(k)!==key);
    saveData(); renderExerciseDirectory(); renderSettings(); renderHome(); showToast('Упражнение восстановлено');
}
function purgeDirectoryExercise(name){
    const key=normalizeExerciseKey(name); if(!key)return;
    pendingDeleteType='purgeDirectoryExercise'; pendingDeleteDate=key;
    const refs=(data.programs||[]).reduce((n,p)=>n+(p.exercises||[]).filter(x=>normalizeExerciseKey(x)===key).length,0);
    const historyRows=(data.history||[]).reduce((n,h)=>n+(h.exercises||[]).filter(ex=>normalizeExerciseKey(ex.name)===key).length,0);
    showDeleteConfirm(`Удалить «${escapeHtml(name)}» полностью? Будут удалены справочник, ${refs} вхожд. в программах и ${historyRows} историч. записей/результатов. Это необратимо — перед удалением рекомендуется экспортировать бэкап.`);
}
function renameExerciseGlobal(oldName) { openRenameExerciseModal(oldName); }
function openNewDirectoryExerciseModal(){
    document.getElementById('directoryNewName').value='';
    document.getElementById('directoryNewType').value='strength';
    document.getElementById('directoryNewGroup').value='Грудь';
    lockModalScroll(); document.getElementById('directoryNewExerciseModal').classList.remove('hidden');
    setTimeout(()=>document.getElementById('directoryNewName')?.focus(),50);
}
function closeNewDirectoryExerciseModal(){document.getElementById('directoryNewExerciseModal')?.classList.add('hidden');}
function showExerciseCreateConfirm(name,onConfirm){
    let modal=document.getElementById('exerciseCreateConfirmModal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='exerciseCreateConfirmModal';
      modal.className='confirm-modal hidden';
      modal.innerHTML=`<div class="confirm-modal-content exercise-create-confirm-content">
        <div class="exercise-create-confirm-title">Добавить упражнение?</div>
        <div class="exercise-create-confirm-text"></div>
        <div class="exercise-create-confirm-actions">
          <button type="button" class="gray exercise-create-confirm-no">Нет</button>
          <button type="button" class="exercise-create-confirm-yes">Да</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
    }
    const finish=ok=>{
      closeModalElement(modal);
      if(ok && typeof onConfirm==='function') onConfirm();
    };
    modal.querySelector('.exercise-create-confirm-text').textContent=
      `Упражнения «${name}» нет в базе. Добавить его в справочник?`;
    modal.querySelector('.exercise-create-confirm-no').onclick=()=>finish(false);
    modal.querySelector('.exercise-create-confirm-yes').onclick=()=>finish(true);
    modal.onclick=e=>{if(e.target===modal)finish(false);};
    openModal(modal);
}

let pendingSplitExerciseCreate=null;
function openNewDirectoryExerciseForSplit(progIdx){
    if(!data.programs?.[progIdx]) return;
    pendingSplitExerciseCreate={progIdx:Number(progIdx)};
    closeExercisePicker();
    openNewDirectoryExerciseModal();
}
window.openNewDirectoryExerciseForSplit=openNewDirectoryExerciseForSplit;

function saveNewDirectoryExercise(){
    const input=document.getElementById('directoryNewName');
    const name=String(input?.value||'').trim().replace(/\s+/g,' ');
    const type=document.getElementById('directoryNewType')?.value||'strength';
    const group=document.getElementById('directoryNewGroup')?.value||'Другое';
    if(!name){showToast('Введите название упражнения');return;}

    const dup=window.ftFindExerciseDuplicate(name);
    if(dup.exact.length){
      window.showExerciseDuplicateModal(name,dup.exact,true);
      return;
    }
    const create=()=>{
      if(!Array.isArray(data.exerciseDirectory)) data.exerciseDirectory=[];
      const key=String(name).normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,'');
      /* No second duplicate check here: this callback is already the user's explicit approval. */
      const existingDirectory=data.exerciseDirectory.find(e=>normalizeExerciseKey(e.name)===normalizeExerciseKey(name));
      if(!existingDirectory){
        data.exerciseDirectory.push({
          name,type,group,
          guide:{steps:[],execution:'',primary:[],secondary:[],muscles:[],mistakes:[],recommendations:[],media:[]}
        });
      }
      data.exerciseDirectoryHidden=(data.exerciseDirectoryHidden||[]).filter(k=>ftFullKey(k)!==key);
      const splitCtx=pendingSplitExerciseCreate ? {...pendingSplitExerciseCreate} : null;
      pendingSplitExerciseCreate=null;
      if(splitCtx && data.programs?.[splitCtx.progIdx]){
        const p=data.programs[splitCtx.progIdx];
        p.exercises=Array.isArray(p.exercises)?p.exercises:[];
        p.active=Array.isArray(p.active)?p.active:[];
        p.types=Array.isArray(p.types)?p.types:[];
        const pKey=normalizeExerciseKey(name);
        if(!(p.exercises||[]).some(x=>normalizeExerciseKey(x)===pKey)){
          p.exercises=p.exercises||[]; p.active=p.active||[]; p.types=p.types||[];
          p.exercises.push(name); p.active.push(true); p.types.push(type||'strength');
        }
      }
      saveData(); directoryView='active';
      const search=document.getElementById('directorySearch'); if(search) search.value='';
      closeNewDirectoryExerciseModal(); renderExerciseDirectory(); renderHome();
      if(splitCtx){
        renderSettings();
        setTimeout(()=>document.getElementById('splitCard_'+splitCtx.progIdx)?.classList.add('open'),0);
        showToast('Упражнение добавлено в справочник и в сплит');
      }else{
        showToast('Упражнение добавлено в справочник');
      }
    };
    if(dup.similar.length){
      window.showExerciseDuplicateModal(name,dup.similar,false,create);
      return;
    }
    // No conflict: still require explicit user approval before writing to the directory.
    showExerciseCreateConfirm(name,create);
}
let exercisePickerProgramIndex=null;
function openExercisePicker(progIdx){
    exercisePickerProgramIndex=progIdx; const modal=document.getElementById('exercisePickerModal'); if(!modal)return;
    document.getElementById('exercisePickerTitle').textContent='Добавить упражнение';
    const input=document.getElementById('exercisePickerSearch'); if(input)input.value=''; modal.classList.remove('hidden'); renderExercisePicker();
}
function closeExercisePicker(){exercisePickerProgramIndex=null;document.getElementById('exercisePickerModal')?.classList.add('hidden');}
function renderExercisePickerBase(){
    const root=document.getElementById('exercisePickerList'); if(!root)return;
    const q=(document.getElementById('exercisePickerSearch')?.value||'').trim().toLocaleLowerCase('ru');
    const p=data.programs[exercisePickerProgramIndex]; const existing=new Set((p?.exercises||[]).map(normalizeExerciseKey));
    const items=getDirectoryExercises().filter(x=>!q||x.name.toLocaleLowerCase('ru').includes(q));
    const groups=DIRECTORY_GROUPS.map(group=>({group,items:items.filter(x=>x.group===group)})).filter(g=>g.items.length);
    root.innerHTML=groups.map(g=>`<section class="picker-group"><div class="picker-group-title">${escapeHtml(g.group)}</div>${g.items.map(item=>{
        const selected=existing.has(normalizeExerciseKey(item.name));
        return `<button type="button" class="catalog-choice ${selected?'selected':''}" ${selected?'disabled':''} data-picker-name="${escapeHtml(item.name)}"><span class="catalog-choice-name">${escapeHtml(item.name)}</span><span class="catalog-choice-group">${escapeHtml(item.type==='cardio'?'Кардио':item.group)}</span><span>${selected?'✓':'›'}</span></button>`;
    }).join('')}</section>`).join('') || '<div style="padding:12px;color:var(--subtext);">Ничего не найдено</div>';
    root.querySelectorAll('[data-picker-name]').forEach(btn=>btn.addEventListener('click',()=>{if(!btn.disabled)selectExerciseForProgram(exercisePickerProgramIndex,btn.dataset.pickerName,getDirectoryExercises().find(x=>x.name===btn.dataset.pickerName)?.type||'strength');}));
}
function selectExerciseForProgram(progIdx,name,type){
    const p=data.programs[progIdx]; if(!p)return; const key=normalizeExerciseKey(name);
    if((p.exercises||[]).some(x=>normalizeExerciseKey(x)===key)){showToast('Это упражнение уже есть в сплите');return;}
    p.exercises.push(name); p.active.push(true); p.types.push(type||'strength'); ensureDirectoryEntry(name,type); saveData(); closeExercisePicker(); renderSettings(); setTimeout(()=>document.getElementById('splitCard_'+progIdx)?.classList.add('open'),0);
}

function showHistory() { showScreen('historyScreen'); renderHistory(); }
function renderHistory() {
    const list = document.getElementById('historyList');
    if (!data.history.length) { list.innerHTML='<div class="card" style="text-align:center;color:var(--subtext);">Нет записей</div>'; return; }
    list.innerHTML = [...data.history].reverse().map((entry,idx) => {
        const realIdx = data.history.length - 1 - idx;
        return `<div class="card" onclick="viewWorkout(${realIdx})" style="cursor:pointer">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:600;font-size:18px;">${escapeHtml(entry.program)}</div>
                <div style="display:flex;gap:8px;">
                    <button type="button" class="history-date-btn gray" onclick="event.stopPropagation();editHistoryDate(${realIdx})" aria-label="Изменить дату">${new Date(entry.date).toLocaleDateString()}</button>
                    <button type="button" class="history-delete-btn gray" onclick="event.stopPropagation();deleteHistoryEntry(${realIdx})" aria-label="Удалить тренировку" title="Удалить тренировку">🗑</button>
                </div>
            </div>
            <div style="margin-top:6px;font-size:15px;color:var(--subtext);">${entry.exercises.length} упражнений${entry.durationSeconds ? ` · ${formatTime(entry.durationSeconds)}` : ''}</div>
        </div>`;
    }).join('');
}
function deleteHistoryEntry(index) { pendingDeleteType='history'; pendingDeleteIndex=index; showDeleteConfirm('Удалить запись?'); }
function showDeleteConfirm(text) {
    const content = document.getElementById('deleteConfirmContent');
    content.innerHTML = `<span class="close-btn" onclick="closeDeleteConfirm()">&times;</span>
        <div style="font-size:20px;font-weight:600;margin-bottom:16px;">${text}</div>
        <button onclick="confirmDeleteEntry()">Да</button>
        <button class="gray" onclick="closeDeleteConfirm()">Нет</button>`;
    lockModalScroll(); document.getElementById('deleteConfirmModal').classList.remove('hidden');
}
function closeDeleteConfirm() { document.getElementById('deleteConfirmModal').classList.add('hidden'); pendingDeleteType=null; pendingDeleteIndex=null; pendingDeleteDate=null; pendingProgramIndex=null; pendingArchiveExercise=null; }
function confirmDeleteEntry() {
    if (pendingDeleteType === 'history' && pendingDeleteIndex !== null) { data.history.splice(pendingDeleteIndex,1); saveData(); renderHistory(); showToast('Запись удалена'); }
    else if (pendingDeleteType === 'measurement' && pendingDeleteIndex !== null) { data.measurements.splice(pendingDeleteIndex,1); saveData(); renderMeasurementScreen(); showToast('Замер удалён'); }
    else if (pendingDeleteType === 'measurementField' && pendingDeleteIndex !== null) { const fields=getMeasurementFields(); const field=fields[pendingDeleteIndex]; if (field) { fields.splice(pendingDeleteIndex,1); data.measurements.forEach(m=>{ delete m[field.key]; }); saveData(); renderMeasurementFieldManager(); renderMeasurementScreen(); showToast('Параметр удалён'); } }
    else if (pendingDeleteType === 'programExercise' && pendingDeleteIndex !== null && pendingProgramIndex !== null) { const p=data.programs[pendingProgramIndex]; if(p && p.exercises.length>1){ p.exercises.splice(pendingDeleteIndex,1); p.active.splice(pendingDeleteIndex,1); p.types.splice(pendingDeleteIndex,1); saveData(); renderSettings(); showToast('Упражнение удалено'); } }
    else if (pendingDeleteType === 'program' && pendingDeleteIndex !== null) { data.programs.splice(pendingDeleteIndex, 1); saveData(); renderSettings(); renderHome(); showToast('Сплит удалён'); }
    else if (pendingDeleteType === 'archiveDirectoryExercise' && pendingDeleteDate) {
        const key=normalizeExerciseKey(pendingDeleteDate);
        const item=getDirectoryExercises().find(x=>normalizeExerciseKey(x.name)===key);
        const archived={...(pendingArchiveExercise||item||{}), archivedAt:new Date().toISOString()};
        if(item){
            archived.name=item.name; archived.type=item.type||'strength'; archived.group=item.group||inferExerciseGroup(item.name,item.type||'strength');
        }
        if(Array.isArray(data.exerciseDirectoryArchived)) data.exerciseDirectoryArchived=data.exerciseDirectoryArchived.filter(e=>normalizeExerciseKey(e.name)!==key);
        data.exerciseDirectoryArchived=[...(data.exerciseDirectoryArchived||[]),archived];
        data.exerciseDirectory=(data.exerciseDirectory||[]).filter(e=>normalizeExerciseKey(e.name)!==key);
        (data.programs||[]).forEach(p=>{
            for(let i=(p.exercises||[]).length-1;i>=0;i--){ if(normalizeExerciseKey(p.exercises[i])===key){p.exercises.splice(i,1);p.active.splice(i,1);p.types.splice(i,1);} }
        });
        data.exerciseDirectoryHidden=Array.from(new Set([...(data.exerciseDirectoryHidden||[]), key]));
        pendingArchiveExercise=null; saveData(); renderExerciseDirectory(); renderSettings(); renderHome(); showToast('Упражнение перенесено в архив');
    }
    else if (pendingDeleteType === 'purgeDirectoryExercise' && pendingDeleteDate) {
        const key=normalizeExerciseKey(pendingDeleteDate);
        data.exerciseDirectory=(data.exerciseDirectory||[]).filter(e=>normalizeExerciseKey(e.name)!==key);
        data.exerciseDirectoryArchived=(data.exerciseDirectoryArchived||[]).filter(e=>normalizeExerciseKey(e.name)!==key);
        data.exerciseDirectoryHidden=(data.exerciseDirectoryHidden||[]).filter(k=>normalizeExerciseKey(k)!==key);
        (data.programs||[]).forEach(p=>{
            for(let i=(p.exercises||[]).length-1;i>=0;i--){ if(normalizeExerciseKey(p.exercises[i])===key){p.exercises.splice(i,1);p.active.splice(i,1);p.types.splice(i,1);} }
        });
        (data.history||[]).forEach(h=>{ h.exercises=(h.exercises||[]).filter(ex=>normalizeExerciseKey(ex.name)!==key); });
        data.history=(data.history||[]).filter(h=>(h.exercises||[]).length>0);
        Object.keys(lastResults||{}).forEach(k=>{if(normalizeExerciseKey(k)===key) delete lastResults[k];});
        localStorage.setItem('strong_last_results',JSON.stringify(lastResults||{}));
        saveData(); renderExerciseDirectory(); renderSettings(); renderHome(); showToast('Упражнение удалено полностью');
    }
    else if (pendingDeleteType === 'catalogProduct' && pendingDeleteIndex !== null) {
        if (data.productCatalog[pendingDeleteIndex]) data.productCatalog.splice(pendingDeleteIndex,1);
        saveData(); renderCatalogList(); showToast('Продукт удалён');
    }
    else if (pendingDeleteType === 'workoutSet' && pendingDeleteIndex !== null && pendingDeleteDate !== null) { const si=parseInt(pendingDeleteDate); if(workoutSets[pendingDeleteIndex]?.[si]) workoutSets[pendingDeleteIndex].splice(si,1); saveDraft(); renderExerciseStrip(); renderExercise(); showToast('Подход удалён'); }
    else if (pendingDeleteType === 'foodEntry' && pendingDeleteIndex !== null) { data.foodDiary.entries.splice(pendingDeleteIndex,1); saveData(); renderFoodDiary(); showToast('Запись удалена'); }
    else if (pendingDeleteType === 'foodDay' && pendingDeleteDate) {
        data.foodDiary.entries = data.foodDiary.entries.filter(e => e.date !== pendingDeleteDate);
        delete data.foodDiary.limits[pendingDeleteDate];
        saveData();
        renderFoodDiary();
        if (document.getElementById('foodTabHistory').classList.contains('active')) renderFoodHistory();
        showToast('День удалён');
        pendingDeleteDate = null;
    }
    closeDeleteConfirm();
}
function viewWorkout(index) {
    const entry = data.history[index];
    const dateLabel = new Date(entry.date).toLocaleDateString();
    document.getElementById('workoutDetailTitle').innerHTML = `<strong>${escapeHtml(entry.program)}</strong><span>${dateLabel}</span>`;
    let html = '<div class="workout-history-detail-list">';
    entry.exercises.forEach(ex => {
        html += `<section class="workout-history-exercise"><div class="workout-history-exercise-name">${escapeHtml(ex.name)}</div>`;
        if (!ex.sets || !ex.sets.length) html += '<div class="workout-history-empty">Нет данных</div>';
        else {
          html += '<div class="workout-history-sets">';
          ex.sets.forEach((s,i) => {
            const value = s.weight ? `${s.weight} кг × ${s.reps}` : s.time ? `${s.time} мин × ${s.intensity}` : `${s.reps} повт.`;
            html += `<div class="workout-history-set"><span>Подход ${i+1}</span><b>${value}</b></div>`;
          });
          html += '</div>';
        }
        html += '</section>';
    });
    html += '</div>';
    document.getElementById('workoutDetailContent').innerHTML = html;
    lockModalScroll(); document.getElementById('workoutDetailModal').classList.remove('hidden');
}
function closeWorkoutDetail() { document.getElementById('workoutDetailModal').classList.add('hidden'); }

function closeBackupExportPrompt() {
    const box = document.getElementById('backupDownloadFallback');
    if (!box) return;
    const url = box.dataset.objectUrl;
    box.remove();
    if (url) {
        try { setTimeout(() => URL.revokeObjectURL(url), 500); } catch (e) {}
    }
}

/* Legacy exporter removed. The canonical Full Backup exporter below is the only export path. */

/* Safe food preset selection: no user text is embedded into inline onclick. */
let foodPresetDelegationInstalled = false;
function installFoodPresetDelegation(){
    if(foodPresetDelegationInstalled) return;
    foodPresetDelegationInstalled = true;
    const list = document.getElementById('foodPresetList');
    if(!list) return;
    const handlePreset = function(e){
        const item = e.target.closest ? e.target.closest('.food-preset-item') : null;
        if(!item || !list.contains(item)) return;
        e.preventDefault();
        e.stopPropagation();
        const name = item.getAttribute('data-food-preset-name');
        if(name != null) selectFoodPreset(name);
    };
    list.addEventListener('click', handlePreset, false);
}
installFoodPresetDelegation();


function setupHiDPICanvas(canvas, cssWidth, cssHeight){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cssWidth));
    const h = Math.max(1, Math.round(cssHeight));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx, width:w, height:h, dpr};
}


let foodHistoryDelegationInstalled=false;
function installFoodHistoryDelegation(){
    if(foodHistoryDelegationInstalled)return;
    foodHistoryDelegationInstalled=true;
    document.addEventListener('click',function(e){
        // Сначала обрабатываем корзину: кнопка находится внутри карточки даты,
        // поэтому прежний обработчик карточки перехватывал клик и не давал удалить день.
        const delEl=e.target.closest?e.target.closest('[data-delete-food-history-date]'):null;
        if(delEl){
            e.preventDefault();
            e.stopPropagation();
            deleteFoodDay(delEl.getAttribute('data-delete-food-history-date'));
            return;
        }
        const openEl=e.target.closest?e.target.closest('[data-food-history-date]'):null;
        if(openEl){
            openFoodDay(openEl.getAttribute('data-food-history-date'));
        }
    },false);
}
installFoodHistoryDelegation();


function resolveCssColor(value, fallback){
    if(!value) return fallback || '#34c759';
    if(!value.includes('var(')) return value;
    const probe = document.createElement('div');
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved || fallback || '#34c759';
}

function buildWorkoutAnalysis(entry, previousEntry){
    const out=[];
    if(!previousEntry) return out;
    const comparisons=compareWorkoutEntries(entry,previousEntry);
    comparisons.forEach(x=>{
        const direction=x.diff>0?'↑':'↓';
        const labels={weight:'вес',setVolume:'объём подхода',volume:'объём',time:'время',intensity:'интенсивность',reps:'повторы'};
        const units={weight:' кг',setVolume:' кг',volume:' кг',time:' мин',intensity:'',reps:' повт.'};
        out.push({name:x.name,text:`${direction} ${Math.abs(Math.round(x.diff))}${units[x.type]||''} ${labels[x.type]||'результат'}`});
    });
    return out;
}

function openManualWorkoutModal() {
    const splitSelect = document.getElementById('manualSplitSelect');
    splitSelect.innerHTML = data.programs.map((p,i) => `<option value="${i}">${p.name}</option>`).join('');
    document.getElementById('manualDate').value = localDateString(new Date());
    splitSelect.dispatchEvent(new Event('change'));
    lockModalScroll(); document.getElementById('manualWorkoutModal').classList.remove('hidden');
}
function closeManualWorkout() { document.getElementById('manualWorkoutModal').classList.add('hidden'); }
function saveManualWorkout() {
    const splitIdx = parseInt(document.getElementById('manualSplitSelect').value);
    const date = document.getElementById('manualDate').value;
    if (!date) { showToast('Выберите дату'); return; }
    const program = data.programs[splitIdx];
    const activeEx = program.exercises.filter((_,i) => program.active[i]);
    const manualSets = {};
    let hasAny = false;
    activeEx.forEach((ex,idx) => {
        const container = document.getElementById(`manual_sets_${idx}`);
        if (!container) return;
        const rows = container.querySelectorAll('.set-row');
        const sets = [];
        rows.forEach(row => {
            const w = row.querySelector('.weight-input')?.value.trim();
            const r = row.querySelector('.reps-input')?.value.trim();
            if (w || r) { sets.push({ weight: w, reps: r }); hasAny = true; }
        });
        if (sets.length) manualSets[ex] = sets;
    });
    if (!hasAny) { showToast('Добавьте хотя бы один подход'); return; }
    data.history.push({
        date: new Date(date).toISOString(),
        durationSeconds: 0,
        program: program.name,
        plannedExercises: activeEx.map(ex=>({plannedName:ex, plannedType:(program.types?.[program.exercises.indexOf(ex)]||'strength'), plannedGroup:fScoreExerciseGroup(ex,program.types?.[program.exercises.indexOf(ex)]||'strength'), status:(manualSets[ex]||[]).length?'completed':'skipped'})),
        exercises: activeEx.map((ex,idx) => ({ name: ex, sets: manualSets[ex] || [] }))
    });
    saveData(); closeManualWorkout(); showHistory(); showToast('Тренировка добавлена');
}
document.getElementById('manualSplitSelect').addEventListener('change', function() {
    const idx = parseInt(this.value);
    const program = data.programs[idx];
    const activeEx = program.exercises.filter((_,i) => program.active[i]);
    const container = document.getElementById('manualExercises');
    container.innerHTML = activeEx.map((ex,i) => `
        <div style="margin-bottom:12px;">
            <div style="font-weight:600;">${ex}</div>
            <div id="manual_sets_${i}"></div>
            <button class="small-btn gray" onclick="addManualSet(${i})">➕ Подход</button>
        </div>`).join('');
});
window.addManualSet = function(exIdx) {
    const container = document.getElementById(`manual_sets_${exIdx}`);
    const idx = container.querySelectorAll('.set-row').length + 1;
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `<span class="set-num">${idx}</span>
        <input type="text" inputmode="decimal" placeholder="Вес" class="weight-input" style="flex:1">
        <input type="text" inputmode="decimal" placeholder="Повторы" class="reps-input" style="flex:1">`;
    container.appendChild(row);
};

function showFoodDiary() {
  showScreen('foodScreen');
  const date=document.getElementById('foodDate');
  if(date) date.value=localDateString(new Date());
  switchFoodTab('today');
  requestAnimationFrame(()=>resetAppViewport('foodScreen'));
}
function switchFoodTab(tabName) {
    document.querySelectorAll('#foodScreen .tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`#foodScreen .tab[data-tab="${tabName}"]`).classList.add('active');
    document.querySelectorAll('#foodScreen .tab-content').forEach(c => c.classList.remove('active'));
    if (tabName === 'today') {
        document.getElementById('foodTabToday').classList.add('active');
        renderFoodDiary();
    } else if (tabName === 'history') {
        document.getElementById('foodTabHistory').classList.add('active');
        renderFoodHistory();
    } else if (tabName === 'stats') {
        document.getElementById('foodTabStats').classList.add('active');
        renderTextStats();
    } else if (tabName === 'catalog') {
        document.getElementById('foodTabCatalog').classList.add('active');
        renderCatalogList();
    }
}
function getDateWithWeekday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
}
function getGoalNutritionLabel(goal=getFScoreGoal()){
    if(goal==='custom'){ const c=getFScoreCustomConfig(); return c?.name||'Своя цель'; } return goal==='gain'?'Набор массы':goal==='cut'?'Сушка':'Поддержание';
}
function getLatestBodyWeight(){
    const rows=(data.measurements||[]).filter(m=>Number(m.weight)>0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    return rows.length?Number(rows[rows.length-1].weight):null;
}
function getGoalNutritionProfile(goal=getFScoreGoal()){
    data.foodDiary=data.foodDiary||{limits:{},entries:[]};
    data.foodDiary.goalNutrition=data.foodDiary.goalNutrition||{auto:true,baseMaintenance:0};
    const cfg=data.foodDiary.goalNutrition;
    const weight=getLatestBodyWeight()||75;
    // Персональная стартовая оценка поддержания. Она зависит от фактической активности,
    // а не использует одну фиксированную цифру вроде «3000 для набора».
    const now=Date.now(), monthAgo=now-30*86400000;
    const workouts=(data.history||[]).filter(h=>new Date(h.date).getTime()>=monthAgo).length;
    const weekly=workouts/4.285;
    let kcalPerKg = weekly>=5 ? 35 : weekly>=3 ? 33 : weekly>=1 ? 31 : 29;
    const estimatedMaintenance=Math.round(weight*kcalPerKg/10)*10;
    const maintenance=Number(cfg.baseMaintenance)>0?Number(cfg.baseMaintenance):estimatedMaintenance;
    let calories;
    if(goal==='gain') calories=maintenance+Math.round(Math.max(150,maintenance*0.07)/10)*10;
    else if(goal==='cut') calories=maintenance-Math.round(Math.max(250,maintenance*0.15)/10)*10;
    else calories=maintenance;
    calories=Math.max(1200,Math.round(calories/10)*10);
    const proteinPerKg=goal==='cut'?2.0:goal==='gain'?1.8:1.7;
    const fatPerKg=goal==='cut'?0.8:0.9;
    const protein=Math.round(weight*proteinPerKg);
    const fat=Math.max(45,Math.round(weight*fatPerKg));
    const carbs=Math.max(0,Math.round((calories-protein*4-fat*9)/4));
    return {calories,protein,fat,carbs,weight,maintenance,estimated:!Number(cfg.baseMaintenance),weeklyWorkouts:weekly};
}
function getEffectiveFoodLimit(date){
    const saved=(data.foodDiary.limits||{})[date];
    const cfg=data.foodDiary.goalNutrition||{};
    // Ручной лимит — единственное исключение. Все autoGoal-лимиты всегда
    // вычисляются заново из текущей выбранной цели.
    if(saved && saved.autoGoal===false) return saved;
    if(cfg.auto===false) return saved||{};
    const goal=getFScoreGoal();
    if(goal==='custom'){
        const c=getFScoreCustomConfig(), n=c.nutrition||{};
        if(n.auto===false) return {calories:Number(n.calories)||0,protein:Number(n.protein)||0,fat:Number(n.fat)||0,carbs:Number(n.carbs)||0,autoGoal:true,goal:'custom'};
        return {...getGoalNutritionProfile(c.mode||'maintain'),autoGoal:true,goal:'custom'};
    }
    return {...getGoalNutritionProfile(goal),autoGoal:true,goal};
}
function syncGoalFoodLimit(date){
    const cfg=data.foodDiary.goalNutrition||{};
    if(cfg.auto===false) return;
    const activeGoal=getFScoreGoal();
    const custom=activeGoal==='custom'?getFScoreCustomConfig():null;
    const p=getGoalNutritionProfile(custom?.mode||activeGoal);
    const n=custom?.nutrition;
    data.foodDiary.limits[date]={calories:n?.auto===false?Number(n.calories)||0:p.calories,protein:n?.auto===false?Number(n.protein)||0:p.protein,fat:n?.auto===false?Number(n.fat)||0:p.fat,carbs:n?.auto===false?Number(n.carbs)||0:p.carbs,autoGoal:true,goal:activeGoal,updatedAt:Date.now()};
}
function renderFoodDiary() {
    const date = document.getElementById('foodDate').value;
    if(date && !(data.foodDiary.limits||{})[date]) syncGoalFoodLimit(date);
    const lim = getEffectiveFoodLimit(date);
    const dayEntries = data.foodDiary.entries.filter(e => e.date === date);
    let totalCal = 0, totalProtein = 0, totalFat = 0, totalCarbs = 0;
    dayEntries.forEach(e => { totalCal += parseFloat(e.calories)||0; totalProtein += parseFloat(e.protein)||0; totalFat += parseFloat(e.fat)||0; totalCarbs += parseFloat(e.carbs)||0; });
    const targetCal = Number(lim.calories)||0;
    const remaining = targetCal - totalCal;
    const ratio = targetCal > 0 ? totalCal / targetCal : 0;
    let calorieStatus='Нет цели', calorieStatusClass='neutral';
    if(targetCal>0){
      if(ratio < 0.80){ calorieStatus='Сильный недобор'; calorieStatusClass='over'; }
      else if(ratio < 0.90){ calorieStatus='Допустимо, но ниже цели'; calorieStatusClass='warn'; }
      else if(ratio < 1.00){ calorieStatus='Близко к цели'; calorieStatusClass='near'; }
      else if(ratio <= 1.05){ calorieStatus='Цель выполнена'; calorieStatusClass='good'; }
      else if(ratio <= 1.10){ calorieStatus='Небольшой профицит'; calorieStatusClass='warn'; }
      else { calorieStatus='Высокий профицит'; calorieStatusClass='over'; }
    }
    document.getElementById('foodSummary').innerHTML = `
        <div class="food-day-head">
            <div><div class="food-day-title">${getDateWithWeekday(date)}</div><div class="food-day-status ${calorieStatusClass}">${calorieStatus} · ${getGoalNutritionLabel()}</div></div>
            <div class="food-calorie-main"><span class="food-calorie-label">Калории</span><strong>${Math.round(totalCal)} ккал</strong><span>из ${targetCal || '—'} ккал</span></div>
        </div>
        <div class="food-macro-grid">
            <div class="food-macro-card protein"><span>Белки</span><strong>${Math.round(totalProtein)} г</strong>${lim.protein ? `<small>из ${lim.protein} г</small>` : ''}</div>
            <div class="food-macro-card fat"><span>Жиры</span><strong>${Math.round(totalFat)} г</strong>${lim.fat ? `<small>из ${lim.fat} г</small>` : ''}</div>
            <div class="food-macro-card carbs"><span>Углеводы</span><strong>${Math.round(totalCarbs)} г</strong>${lim.carbs ? `<small>из ${lim.carbs} г</small>` : ''}</div>
        </div>
        <div class="food-calorie-limit"><span>Лимит</span><strong>${lim.calories || 0} ккал</strong><span class="food-calorie-remaining">${remaining > 0 ? `Осталось ${Math.round(remaining)} ккал` : (remaining < 0 ? `Профицит ${Math.round(Math.abs(remaining))} ккал` : 'Лимит достигнут')}</span></div>
    `;
    const entriesContainer = document.getElementById('foodEntries');
    if (dayEntries.length === 0) { entriesContainer.innerHTML = '<div style="color:var(--subtext); text-align:center;">Нет записей</div>'; return; }
    entriesContainer.innerHTML = dayEntries.map((entry, idx) => {
        const realIdx = data.foodDiary.entries.indexOf(entry);
        return `<div class="food-item">
            <div style="flex:1;"><div style="font-weight:600;">${escapeHtml(entry.name)}</div><div style="font-size:14px; color:var(--subtext);">${entry.portion} — ${entry.calories} ккал</div><div style="font-size:12px; color:var(--subtext);">Б ${entry.protein||0} · Ж ${entry.fat||0} · У ${entry.carbs||0}</div></div>
            <button class="small-btn gray" onclick="editFoodEntry(${realIdx})" style="width:auto;">✏️</button>
            <button class="small-btn gray" onclick="duplicateFoodEntry(${realIdx})" style="width:auto;">📋</button>
            <button class="small-btn gray" onclick="deleteFoodEntry(${realIdx})" style="width:auto;">✕</button>
        </div>`;
    }).join('');
}
function renderFoodHistory() {
    const container = document.getElementById('foodHistoryList');
    const days = new Set();
    data.foodDiary.entries.forEach(e => days.add(e.date));
    Object.keys(data.foodDiary.limits).forEach(date => days.add(date));
    if (days.size === 0) { container.innerHTML = '<div style="color:var(--subtext); text-align:center;">Нет записей</div>'; return; }
    const sorted = Array.from(days).sort((a,b) => b.localeCompare(a));
    container.innerHTML = sorted.map(date => {
        const lim = getEffectiveFoodLimit(date);
        const dayEntries = data.foodDiary.entries.filter(e => e.date === date);
        let totalCal = 0;
        dayEntries.forEach(e => totalCal += parseFloat(e.calories)||0);
        return `<div class="card" style="cursor:pointer;" data-food-history-date="${escapeHtml(date)}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:600;">${getDateWithWeekday(date)}</div>
                    <div style="font-size:14px; color:var(--subtext);">Съедено: ${totalCal} ккал ${lim.calories ? ' / Лимит: '+lim.calories : ''}</div>
                </div>
                <button class="small-btn gray" data-delete-food-history-date="${escapeHtml(date)}" style="width:auto;">✕</button>
            </div>
        </div>`;
    }).join('');
}
function openFoodDay(date) {
    switchFoodTab('today');
    document.getElementById('foodDate').value = date;
    renderFoodDiary();
}
function deleteFoodDay(date) {
    pendingDeleteType = 'foodDay';
    pendingDeleteDate = date;
    const dayEntries = data.foodDiary.entries.filter(e => e.date === date);
    const limit = data.foodDiary.limits[date];
    let message = `Удалить все записи за ${getDateWithWeekday(date)}?`;
    if (dayEntries.length) message += ` (${dayEntries.length} записей)`;
    if (limit) message += ' и лимиты КБЖУ';
    showDeleteConfirm(message);
}

function setTextStatsPeriod(period) {
    statsTextPeriod = period;
    document.querySelectorAll('.stats-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`.stats-tab[data-stats-period="${period}"]`).classList.add('active');
    renderTextStats();
}
function renderTextStats() {
    const container = document.getElementById('textStatsContent');
    if (!container) return;
    const entries = data.foodDiary.entries;
    if (entries.length === 0) {
        container.innerHTML = '<div style="color:var(--subtext); text-align:center;">Нет данных</div>';
        return;
    }
    let startDate;
    const now = new Date();
    if (statsTextPeriod === '7') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 6);
    } else if (statsTextPeriod === '30') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 29);
    } else { // 'all'
        startDate = new Date(0);
    }
    const startStr = localDateString(startDate);
    const endStr = localDateString(now);
    const filtered = entries.filter(e => e.date >= startStr && e.date <= endStr);
    if (filtered.length === 0) {
        container.innerHTML = '<div style="color:var(--subtext); text-align:center;">Нет записей за выбранный период</div>';
        return;
    }
    let totalCal = 0, totalProtein = 0, totalFat = 0, totalCarbs = 0;
    const daysWithData = new Set();
    filtered.forEach(e => {
        totalCal += parseFloat(e.calories) || 0;
        totalProtein += parseFloat(e.protein) || 0;
        totalFat += parseFloat(e.fat) || 0;
        totalCarbs += parseFloat(e.carbs) || 0;
        daysWithData.add(e.date);
    });
    const daysCount = daysWithData.size;
    const avgCal = daysCount > 0 ? Math.round(totalCal / daysCount) : 0;
    container.innerHTML = `
        <div class="nutrition-summary">
            <div class="nutrition-summary-main">
                <div class="nutrition-stat"><span>Дней</span><b>${daysCount}</b></div>
                <div class="nutrition-stat"><span>Среднее</span><b>${avgCal} <small>ккал/день</small></b></div>
                <div class="nutrition-stat"><span>Всего</span><b>${totalCal} <small>ккал</small></b></div>
            </div>
            <div class="nutrition-macros">
                <div class="nutrition-macro"><span>Белки</span><b>${totalProtein} г</b></div>
                <div class="nutrition-macro"><span>Жиры</span><b>${totalFat} г</b></div>
                <div class="nutrition-macro"><span>Углеводы</span><b>${totalCarbs} г</b></div>
            </div>
        </div>
    `;
}

const CHART_COLORS = {
    calories: '#34c759',
    protein: '#5ac8fa',
    fat: '#ff9f0a',
    carbs: '#af52de'
};
const CHART_LABELS = {
    calories: 'Калории, ккал',
    protein: 'Белки, г',
    fat: 'Жиры, г',
    carbs: 'Углеводы, г'
};
let chartCustomStart = '';
let chartCustomEnd = '';

function openChartModal() {
    const modal=document.getElementById('chartModal'); if(!modal) return;
    /* Nutrition chart is a standalone fullscreen surface; never enter Modal Stack/body lock. */
    modal.classList.remove('hidden');
    requestAnimationFrame(()=>{
        setChartPeriod(chartPeriod==='custom'&&chartCustomStart&&chartCustomEnd?'custom':'week',{render:false});
        setChartDataType(chartDataType||'calories',{render:false});
        requestAnimationFrame(()=>renderChart());
    });
}
function closeChartModal(){document.getElementById('chartModal')?.classList.add('hidden');}
function setChartPeriod(period,options={}){
    chartPeriod=period;
    document.querySelectorAll('#chartModal .period-selector button').forEach(b=>{const active=b.dataset.period===period;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');});
    const customRange=document.getElementById('chartCustomDateRange');
    if(period==='custom'){
        customRange?.classList.remove('hidden');
        const dates=(data.foodDiary?.entries||[]).map(e=>e.date).filter(Boolean).sort();
        const start=document.getElementById('chartStartDate'),end=document.getElementById('chartEndDate');
        if(start&&!start.value&&dates.length)start.value=dates[0];
        if(end&&!end.value&&dates.length)end.value=dates[dates.length-1];
        if(chartCustomStart&&chartCustomEnd){if(start)start.value=chartCustomStart;if(end)end.value=chartCustomEnd;}
    }else customRange?.classList.add('hidden');
    if(options.render!==false)requestAnimationFrame(()=>renderChart());
}
function setChartDataType(type,options={}){
    chartDataType=type;
    document.querySelectorAll('#chartModal .data-type-selector button').forEach(b=>{const active=b.dataset.type===type;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');});
    if(options.render!==false)requestAnimationFrame(()=>renderChart());
}
function applyChartCustom(){
    let start=document.getElementById('chartStartDate')?.value,end=document.getElementById('chartEndDate')?.value;
    if(!start||!end){showToast('Выберите дату начала и окончания');return;}
    if(start>end)[start,end]=[end,start];
    document.getElementById('chartStartDate').value=start;document.getElementById('chartEndDate').value=end;
    chartCustomStart=start;chartCustomEnd=end;chartPeriod='custom';
    document.querySelectorAll('#chartModal .period-selector button').forEach(b=>b.classList.toggle('active',b.dataset.period==='custom'));
    document.getElementById('chartCustomDateRange')?.classList.remove('hidden');
    requestAnimationFrame(()=>renderChart());showToast(`Период: ${formatShortDate(start)} — ${formatShortDate(end)}`);
}
function formatShortDate(dateStr) {
    const parts = dateStr.split('-');
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : dateStr;
}

function getChartDateRange() {
    if (chartPeriod === 'custom') {
        if (!chartCustomStart || !chartCustomEnd) return null;
        return { startStr: chartCustomStart, endStr: chartCustomEnd };
    }

    const end = new Date();
    const start = new Date(end);

    if (chartPeriod === 'week') {
        start.setDate(end.getDate() - 6);
    } else if (chartPeriod === 'month') {
        start.setDate(end.getDate() - 29);
    } else if (chartPeriod === 'year') {
        start.setDate(end.getDate() - 364);
    } else {
        return null;
    }

    return {
        startStr: localDateString(start),
        endStr: localDateString(end)
    };
}

function renderChart() {
    const canvas = document.getElementById('chartCanvas');
    if (!canvas) return;

    const range = getChartDateRange();
    if (!range) return;

    const container = canvas.parentElement;
    if (!container) return;

    const startStr = range.startStr;
    const endStr = range.endStr;
    const caption = document.getElementById('chartRangeCaption');
    if (caption) caption.textContent = `${formatShortDate(startStr)} — ${formatShortDate(endStr)}`;

    const dailyData = { calories:{}, protein:{}, fat:{}, carbs:{} };
    const entries = Array.isArray(data?.foodDiary?.entries) ? data.foodDiary.entries : [];

    entries.forEach(e => {
        const date = String(e.date || '');
        if (date >= startStr && date <= endStr) {
            dailyData.calories[date] = (dailyData.calories[date] || 0) + (parseFloat(e.calories) || 0);
            dailyData.protein[date]  = (dailyData.protein[date]  || 0) + (parseFloat(e.protein)  || 0);
            dailyData.fat[date]      = (dailyData.fat[date]      || 0) + (parseFloat(e.fat)      || 0);
            dailyData.carbs[date]    = (dailyData.carbs[date]    || 0) + (parseFloat(e.carbs)    || 0);
        }
    });

    const allDates = [];
    const cursor = new Date(startStr + 'T12:00:00');
    const endDate = new Date(endStr + 'T12:00:00');
    while (cursor <= endDate) {
        allDates.push(localDateString(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    const typesToShow = chartDataType === 'all'
        ? ['calories','protein','fat','carbs']
        : [CHART_COLORS[chartDataType] ? chartDataType : 'calories'];

    const hasAnyValue = allDates.some(date =>
        typesToShow.some(type => Number(dailyData[type][date] || 0) !== 0)
    );

    // The exercise/progress graphs use drawLineChart. Use the exact same renderer
    // for a single nutrition metric so iPhone/Retina canvas scaling is identical.
    if (typesToShow.length === 1) {
        const type = typesToShow[0];
        const points = allDates.map(date => ({
            date: new Date(date + 'T12:00:00'),
            value: Number(dailyData[type][date] || 0)
        }));
        drawLineChart(canvas, points, { color: CHART_COLORS[type] });
    } else {
        drawFoodMultiChart(canvas, allDates, dailyData, typesToShow);
    }

    const legendContainer = document.getElementById('chartLegend');
    if (legendContainer) {
        const compactLegend = { calories: 'Калории', protein: 'Белки', fat: 'Жиры', carbs: 'Углеводы' };
        legendContainer.innerHTML = typesToShow.map(type => `
            <div class="legend-item">
                <span class="legend-dot" style="background:${CHART_COLORS[type]}"></span>
                ${typesToShow.length > 1 ? compactLegend[type] : CHART_LABELS[type]}
            </div>
        `).join('');
    }

    // drawLineChart already shows an empty-state message, but keep the information
    // in the DOM as well so the user never gets an unexplained empty gray canvas.
    if (!hasAnyValue && caption) caption.textContent += ' · нет записей';
}

function drawFoodMultiChart(canvas, dates, dailyData, types) {
    if (!canvas) return;
    const box = canvas.parentElement;
    const rect = box?.getBoundingClientRect?.();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(280, Math.round(rect?.width || box?.clientWidth || 300));
    const h = Math.max(180, Math.round(rect?.height || box?.clientHeight || 240));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);

    const sub = getComputedStyle(document.body).getPropertyValue('--subtext').trim() || '#999';
    const border = getComputedStyle(document.body).getPropertyValue('--border').trim() || 'rgba(128,128,128,.18)';
    const margin = {top:18,right:14,bottom:34,left:48};
    const cw = Math.max(1,w-margin.left-margin.right);
    const ch = Math.max(1,h-margin.top-margin.bottom);
    const base = margin.top + ch;
    const stepX = cw / Math.max(1,dates.length-1);

    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif';
    ctx.fillStyle = sub;
    ctx.textAlign = 'right';
    for(let i=0;i<=4;i++){
        const y = base - ch*i/4;
        ctx.beginPath(); ctx.moveTo(margin.left,y); ctx.lineTo(margin.left+cw,y); ctx.stroke();
        ctx.fillText(i === 0 ? '0' : String(i*25)+'%', margin.left-5, y+3);
    }

    types.forEach(type=>{
        const vals = dates.map(d=>Number(dailyData[type][d]||0));
        const max = Math.max(1,...vals);
        const color = CHART_COLORS[type] || '#34c759';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        vals.forEach((v,i)=>{
            const x = margin.left + i*stepX;
            const y = base - (v/max)*ch;
            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.stroke();
        ctx.fillStyle = color;
        vals.forEach((v,i)=>{
            const x = margin.left + i*stepX;
            const y = base - (v/max)*ch;
            ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fill();
        });
    });

    ctx.fillStyle = sub;
    ctx.textAlign = 'center';
    const step = Math.max(1,Math.ceil(dates.length/6));
    dates.forEach((date,i)=>{
        if(i%step===0 || i===dates.length-1){
            const d = new Date(date+'T12:00:00');
            ctx.fillText(d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'}), margin.left+i*stepX, base+20);
        }
    });
}


let chartInteractionDelegationInstalled=false;
function installChartInteractionDelegation(){
    if(chartInteractionDelegationInstalled)return;
    chartInteractionDelegationInstalled=true;
    const modal=document.getElementById('chartModal'); if(!modal)return;
    let lastHandled=0;
    const handle=e=>{
        const button=e.target?.closest?.('#chartModal .period-selector button,#chartModal .data-type-selector button,#chartModal .apply-period-btn');
        if(!button)return;
        const now=Date.now();
        if(e.type==='click' && now-lastHandled<500)return;
        lastHandled=now;
        e.preventDefault();
        e.stopPropagation();
        if(button.dataset.period) setChartPeriod(button.dataset.period);
        else if(button.dataset.type) setChartDataType(button.dataset.type);
        else if(button.classList.contains('apply-period-btn')) applyChartCustom();
    };
    modal.addEventListener('click',handle,false);
    modal.addEventListener('touchend',handle,{passive:false});
}
installChartInteractionDelegation();


function renderCatalogList() {
    const container = document.getElementById('catalogContainer');
    if (!data.productCatalog.length) {
        container.innerHTML = '<div style="color:var(--subtext); text-align:center;">Каталог пуст</div>';
        return;
    }
    container.innerHTML = data.productCatalog.map((prod, idx) => `
        <div class="food-item">
            <div style="flex:1;">
                <div style="font-weight:600;">${escapeHtml(prod.name)}</div>
                <div style="font-size:12px; color:var(--subtext);">
                    ${prod.type === 'dish' 
                        ? `Блюдо: ${prod.calories} ккал, Б ${prod.protein}, Ж ${prod.fat}, У ${prod.carbs}` 
                        : `на 100 г: ${prod.cal100} ккал, Б ${prod.protein100}, Ж ${prod.fat100}, У ${prod.carbs100}`}
                </div>
            </div>
            <button class="small-btn gray" onclick="editCatalogProduct(${idx})">✏️</button>
            <button class="small-btn gray" onclick="deleteCatalogProduct(${idx})">🗑️</button>
        </div>
    `).join('');
}

function openAddToCatalog() {
    editingCatalogProduct = null;
    document.getElementById('catalogEditTitle').textContent = 'Новый продукт';
    document.getElementById('catalogName').value = '';
    document.getElementById('catalogType').value = 'per100';
    toggleCatalogTypeFields();
    document.getElementById('catalogEditModal').classList.remove('hidden');
}

function editCatalogProduct(index) {
    const prod = data.productCatalog[index];
    editingCatalogProduct = index;
    document.getElementById('catalogEditTitle').textContent = 'Редактировать';
    document.getElementById('catalogName').value = prod.name;
    document.getElementById('catalogType').value = prod.type || 'per100';
    toggleCatalogTypeFields();
    if (prod.type === 'dish') {
        document.getElementById('catalogDishCalories').value = prod.calories || '';
        document.getElementById('catalogDishProtein').value = prod.protein || '';
        document.getElementById('catalogDishFat').value = prod.fat || '';
        document.getElementById('catalogDishCarbs').value = prod.carbs || '';
    } else {
        document.getElementById('catalogCal100').value = prod.cal100 || '';
        document.getElementById('catalogProtein100').value = prod.protein100 || '';
        document.getElementById('catalogFat100').value = prod.fat100 || '';
        document.getElementById('catalogCarbs100').value = prod.carbs100 || '';
    }
    document.getElementById('catalogEditModal').classList.remove('hidden');
}

function toggleCatalogTypeFields() {
    const type = document.getElementById('catalogType').value;
    const per100Fields = document.getElementById('catalogPer100Fields');
    const dishFields = document.getElementById('catalogDishFields');
    if (type === 'dish') {
        per100Fields.classList.add('hidden');
        dishFields.classList.remove('hidden');
    } else {
        per100Fields.classList.remove('hidden');
        dishFields.classList.add('hidden');
    }
}

function closeCatalogEdit() { document.getElementById('catalogEditModal').classList.add('hidden'); }

function saveCatalogProduct() {
    const name = document.getElementById('catalogName').value.trim();
    if (!name) { showToast('Введите название'); return; }
    const type = document.getElementById('catalogType').value;
    let product = { name, type };

    if (type === 'dish') {
        product.calories = parseFloat(document.getElementById('catalogDishCalories').value) || 0;
        product.protein = parseFloat(document.getElementById('catalogDishProtein').value) || 0;
        product.fat = parseFloat(document.getElementById('catalogDishFat').value) || 0;
        product.carbs = parseFloat(document.getElementById('catalogDishCarbs').value) || 0;
        if (!product.calories) { showToast('Введите калории блюда'); return; }
    } else {
        product.cal100 = parseFloat(document.getElementById('catalogCal100').value) || 0;
        product.protein100 = parseFloat(document.getElementById('catalogProtein100').value) || 0;
        product.fat100 = parseFloat(document.getElementById('catalogFat100').value) || 0;
        product.carbs100 = parseFloat(document.getElementById('catalogCarbs100').value) || 0;
        if (!product.cal100) { showToast('Введите калории на 100 г'); return; }
    }

    // Не допускаем одинаковые названия в каталоге. Сравнение точное после trim.
    // При редактировании текущая запись исключается из проверки.
    const normalizeFoodCatalogName = (v) => String(v || '').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[\u2010-\u2015]/g,'-').replace(/[«»„“”\"'`]/g,'').replace(/[^a-zа-я0-9]+/gi,' ').trim().replace(/\s+/g,' ');
    const duplicateIndex = data.productCatalog.findIndex((p, i) =>
        i !== editingCatalogProduct && normalizeFoodCatalogName(p.name) === normalizeFoodCatalogName(name)
    );
    if (duplicateIndex !== -1) {
        showToast('Продукт с таким названием уже есть в каталоге');
        return;
    }

    if (editingCatalogProduct !== null) {
        data.productCatalog[editingCatalogProduct] = product;
    } else {
        data.productCatalog.push(product);
    }
    saveData();
    closeCatalogEdit();
    renderCatalogList();
    showToast('Продукт сохранён в каталоге');
}

function deleteCatalogProduct(index) {
    if (!data.productCatalog[index]) return;
    pendingDeleteType='catalogProduct'; pendingDeleteIndex=index;
    showDeleteConfirm(`Удалить «${escapeHtml(data.productCatalog[index].name)}» из каталога?`);
}

function openAddFoodModal() {
    editingFoodEntryIndex = null;
    document.getElementById('addFoodModal').classList.remove('hidden');
    document.getElementById('foodName').value = '';
    document.getElementById('foodPortion').value = '';
    document.getElementById('foodCalories').value = '';
    document.getElementById('foodProtein').value = '';
    document.getElementById('foodFat').value = '';
    document.getElementById('foodCarbs').value = '';
    document.getElementById('foodWeight').value = '';
    document.getElementById('foodCal100').value = '';
    document.getElementById('foodProtein100').value = '';
    document.getElementById('foodFat100').value = '';
    document.getElementById('foodCarbs100').value = '';
    document.getElementById('foodPresetList').classList.add('hidden');
    document.getElementById('calcResult').textContent = '';
    switchFoodMode('portion');
}
function closeAddFoodModal() { document.getElementById('addFoodModal').classList.add('hidden'); }

function editFoodEntry(index) {
    const entry = data.foodDiary.entries[index];
    if (!entry) return;
    editingFoodEntryIndex = index;
    document.getElementById('addFoodModal').classList.remove('hidden');
    document.getElementById('foodName').value = entry.name;
    document.getElementById('foodPresetList').classList.add('hidden');
    document.getElementById('calcResult').textContent = '';
    if (entry.cal100) {
        switchFoodMode('100');
        document.getElementById('foodWeight').value = parseFloat(entry.portion) || '';
        document.getElementById('foodCal100').value = entry.cal100;
        document.getElementById('foodProtein100').value = entry.protein100 || '';
        document.getElementById('foodFat100').value = entry.fat100 || '';
        document.getElementById('foodCarbs100').value = entry.carbs100 || '';
        calcFrom100();
    } else {
        switchFoodMode('portion');
        document.getElementById('foodPortion').value = entry.portion || '';
        document.getElementById('foodCalories').value = entry.calories || '';
        document.getElementById('foodProtein').value = entry.protein || '';
        document.getElementById('foodFat').value = entry.fat || '';
        document.getElementById('foodCarbs').value = entry.carbs || '';
    }
}

function duplicateFoodEntry(index) {
    const entry = data.foodDiary.entries[index];
    if (!entry) return;
    data.foodDiary.entries.push({ ...entry });
    saveData();
    renderFoodDiary();
    showToast('Запись скопирована');
}

function switchFoodMode(mode) {
    currentFoodMode = mode;
    const portionFields = document.getElementById('portionFields');
    const per100Fields = document.getElementById('per100Fields');
    const typeSelect = document.getElementById('foodType');
    if (typeSelect) typeSelect.value = mode === '100' ? 'per100' : 'dish';
    if (mode === 'portion') {
        portionFields.classList.remove('hidden');
        per100Fields.classList.add('hidden');
        document.getElementById('foodWeight').value = '';
        document.getElementById('foodCal100').value = '';
        document.getElementById('foodProtein100').value = '';
        document.getElementById('foodFat100').value = '';
        document.getElementById('foodCarbs100').value = '';
        document.getElementById('calcResult').textContent = '';
    } else {
        portionFields.classList.add('hidden');
        per100Fields.classList.remove('hidden');
        document.getElementById('foodPortion').value = '';
        document.getElementById('foodCalories').value = '';
        document.getElementById('foodProtein').value = '';
        document.getElementById('foodFat').value = '';
        document.getElementById('foodCarbs').value = '';
    }
}

function calcFrom100() {
    if (currentFoodMode !== '100') return;
    const weight = parseFloat(document.getElementById('foodWeight').value) || 0;
    const cal100 = parseFloat(document.getElementById('foodCal100').value) || 0;
    const protein100 = parseFloat(document.getElementById('foodProtein100').value) || 0;
    const fat100 = parseFloat(document.getElementById('foodFat100').value) || 0;
    const carbs100 = parseFloat(document.getElementById('foodCarbs100').value) || 0;
    const resultDiv = document.getElementById('calcResult');
    if (weight > 0 && (cal100 > 0 || protein100 > 0 || fat100 > 0 || carbs100 > 0)) {
        const cal = Math.round(cal100 * weight / 100);
        const prot = Math.round(protein100 * weight / 100);
        const fat = Math.round(fat100 * weight / 100);
        const carb = Math.round(carbs100 * weight / 100);
        resultDiv.innerHTML = `Итого: ${cal} ккал, Б ${prot}г, Ж ${fat}г, У ${carb}г`;
    } else {
        resultDiv.textContent = '';
    }
}

function filterFoodPresets() {
    const input = document.getElementById('foodName');
    const filter = input ? input.value.trim().toLowerCase() : '';
    const list = document.getElementById('foodPresetList');
    if (!list) return;
    /* The picker is a contextual dropdown: it must not occupy the form when the
       user has not entered a search term yet. */
    if (!filter) {
        list.innerHTML = '';
        list.classList.add('hidden');
        return;
    }
    const unique = {};
    data.foodDiary.entries.forEach(e => { if (e.name && !unique[e.name]) unique[e.name] = e; });
    data.productCatalog.forEach(prod => { if (!unique[prod.name]) unique[prod.name] = prod; });
    const filtered = Object.values(unique).filter(item => item.name.toLowerCase().startsWith(filter));
    if (!filtered.length) {
        list.innerHTML = '<div class="food-preset-item food-preset-empty" aria-live="polite">Ничего не найдено</div>';
        list.classList.remove('hidden');
        return;
    }
    list.innerHTML = filtered.slice(0, 10).map(item => {
        let info = '';
        if (item.type === 'dish') {
            info = ` (блюдо: ${item.calories} ккал)`;
        } else if (item.cal100 !== undefined) {
            info = ` (на 100г: ${item.cal100} ккал)`;
        }
        return `<div class="food-preset-item" data-food-preset-name="${escapeHtml(item.name)}" role="button" tabindex="0">
            ${escapeHtml(item.name)} ${info}
        </div>`;
    }).join('');
    list.classList.remove('hidden');
}

function selectFoodPreset(name) {
    const catalogItem = data.productCatalog.find(p => p.name === name);
    if (catalogItem) {
        if (catalogItem.type === 'dish') {
            switchFoodMode('portion');
            document.getElementById('foodName').value = catalogItem.name;
            document.getElementById('foodPortion').value = '1 блюдо';
            document.getElementById('foodCalories').value = catalogItem.calories;
            document.getElementById('foodProtein').value = catalogItem.protein;
            document.getElementById('foodFat').value = catalogItem.fat;
            document.getElementById('foodCarbs').value = catalogItem.carbs;
        } else {
            switchFoodMode('100');
            document.getElementById('foodName').value = catalogItem.name;
            document.getElementById('foodWeight').value = '';
            document.getElementById('foodCal100').value = catalogItem.cal100;
            document.getElementById('foodProtein100').value = catalogItem.protein100;
            document.getElementById('foodFat100').value = catalogItem.fat100;
            document.getElementById('foodCarbs100').value = catalogItem.carbs100;
            calcFrom100();
        }
        document.getElementById('foodPresetList').classList.add('hidden');
        return;
    }

    const entries = data.foodDiary.entries.filter(e => e.name === name);
    if (!entries.length) return;
    const last = entries[entries.length - 1];
    document.getElementById('foodName').value = last.name;
    document.getElementById('foodPresetList').classList.add('hidden');
    if (last.cal100) {
        switchFoodMode('100');
        document.getElementById('foodWeight').value = last.portion ? parseFloat(last.portion) || '' : '';
        document.getElementById('foodCal100').value = last.cal100;
        document.getElementById('foodProtein100').value = last.protein100 || '';
        document.getElementById('foodFat100').value = last.fat100 || '';
        document.getElementById('foodCarbs100').value = last.carbs100 || '';
        calcFrom100();
    } else {
        switchFoodMode('portion');
        document.getElementById('foodPortion').value = last.portion || '';
        document.getElementById('foodCalories').value = last.calories || '';
        document.getElementById('foodProtein').value = last.protein || '';
        document.getElementById('foodFat').value = last.fat || '';
        document.getElementById('foodCarbs').value = last.carbs || '';
    }
}

function addFoodEntry() {
    const date = document.getElementById('foodDate').value;
    const name = document.getElementById('foodName').value.trim();
    if (!name) { showToast('Введите название'); return; }
    let portion, calories, protein, fat, carbs, cal100, protein100, fat100, carbs100;
    if (currentFoodMode === 'portion') {
        portion = document.getElementById('foodPortion').value.trim() || '—';
        calories = parseFloat(document.getElementById('foodCalories').value) || 0;
        protein = parseFloat(document.getElementById('foodProtein').value) || 0;
        fat = parseFloat(document.getElementById('foodFat').value) || 0;
        carbs = parseFloat(document.getElementById('foodCarbs').value) || 0;
        cal100 = protein100 = fat100 = carbs100 = null;
        if (!calories) { showToast('Введите калории'); return; }
    } else {
        const weight = parseFloat(document.getElementById('foodWeight').value) || 0;
        cal100 = parseFloat(document.getElementById('foodCal100').value) || 0;
        protein100 = parseFloat(document.getElementById('foodProtein100').value) || 0;
        fat100 = parseFloat(document.getElementById('foodFat100').value) || 0;
        carbs100 = parseFloat(document.getElementById('foodCarbs100').value) || 0;
        if (!weight || !cal100) { showToast('Введите вес порции и калории на 100 г'); return; }
        portion = weight + ' г';
        calories = cal100 * weight / 100;
        protein = protein100 * weight / 100;
        fat = fat100 * weight / 100;
        carbs = carbs100 * weight / 100;
    }

    const entryData = {
        date, name, portion, calories, protein, fat, carbs,
        cal100, protein100, fat100, carbs100
    };

    if (editingFoodEntryIndex !== null) {
        data.foodDiary.entries[editingFoodEntryIndex] = entryData;
        showToast('Запись обновлена');
    } else {
        data.foodDiary.entries.push(entryData);
        const normalizeFoodCatalogName = (v) => String(v || '').normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[\u2010-\u2015]/g,'-').replace(/[«»„“”\"'`]/g,'').replace(/[^a-zа-я0-9]+/gi,' ').trim().replace(/\s+/g,' ');
        // Каталог идентифицирует продукт только по нормализованному названию.
        // «Йогурт за порцию» и «Йогурт на 100 г» не становятся двумя карточками.
        const existingInCatalog = data.productCatalog.find(p => normalizeFoodCatalogName(p.name) === normalizeFoodCatalogName(name));
        if (!existingInCatalog) {
            if (currentFoodMode === '100') {
                data.productCatalog.push({ name, type: 'per100', cal100, protein100, fat100, carbs100 });
            } else {
                data.productCatalog.push({ name, type: 'dish', calories, protein, fat, carbs });
            }
        }
        showToast('Продукт добавлен');
    }

    saveData();
    closeAddFoodModal();
    editingFoodEntryIndex = null;
    renderFoodDiary();
    if (document.getElementById('foodTabCatalog').classList.contains('active')) {
        renderCatalogList();
    }
}

function deleteFoodEntry(index) { pendingDeleteType = 'foodEntry'; pendingDeleteIndex = index; showDeleteConfirm('Удалить продукт?'); }

function setFoodLimit() {
    const date = document.getElementById('foodDate').value;
    const lim = getEffectiveFoodLimit(date);
    document.getElementById('foodLimitCal').value = lim.calories || '';
    document.getElementById('foodLimitProtein').value = lim.protein || '';
    document.getElementById('foodLimitFat').value = lim.fat || '';
    document.getElementById('foodLimitCarbs').value = lim.carbs || '';
    lockModalScroll(); document.getElementById('foodLimitModal').classList.remove('hidden');
}
function closeFoodLimitModal() { document.getElementById('foodLimitModal').classList.add('hidden'); }
function saveFoodLimit() {
    const date = document.getElementById('foodDate').value;
    const cal = parseInt(document.getElementById('foodLimitCal').value) || 0;
    const protein = parseInt(document.getElementById('foodLimitProtein').value) || 0;
    const fat = parseInt(document.getElementById('foodLimitFat').value) || 0;
    const carbs = parseInt(document.getElementById('foodLimitCarbs').value) || 0;
    data.foodDiary.limits[date] = { calories: cal, protein, fat, carbs, autoGoal:false };
    saveData();
    closeFoodLimitModal();
    renderFoodDiary();
}
function clearFoodLimit() {
    const date = document.getElementById('foodDate').value;
    delete data.foodDiary.limits[date];
    saveData();
    closeFoodLimitModal();
    renderFoodDiary();
}

let pendingFoodCopy = null;
function copyYesterday() {
    const today = document.getElementById('foodDate').value;
    const yesterday = new Date(today + 'T00:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    prepareFoodCopy(localDateString(yesterday), today);
}
function openCopyDatePicker() {
    document.getElementById('copyDateInput').value = '';
    document.getElementById('copyDayOfWeek').textContent = '';
    lockModalScroll(); document.getElementById('copyDatePickerModal').classList.remove('hidden');
    document.getElementById('copyDateInput').onchange = function() {
        document.getElementById('copyDayOfWeek').textContent = getDateWithWeekday(this.value);
    };
}
function closeCopyDatePicker() { document.getElementById('copyDatePickerModal').classList.add('hidden'); }
function copyFromDate() {
    const from = document.getElementById('copyDateInput').value;
    if (!from) return showToast('Выберите дату');
    const to = document.getElementById('foodDate').value;
    closeCopyDatePicker();
    prepareFoodCopy(from, to);
}
function prepareFoodCopy(fromDate, toDate) {
    const fromEntries = data.foodDiary.entries.filter(e => e.date === fromDate);
    const sourceLimit = data.foodDiary.limits[fromDate] || null;
    if (!fromEntries.length && !sourceLimit) return showToast('В выбранный день нет блюд и лимитов КБЖУ');
    pendingFoodCopy = {fromDate, toDate};
    const parts=[];
    if(fromEntries.length) parts.push(`${fromEntries.length} ${fromEntries.length===1?'запись':'записей'}`);
    if(sourceLimit) parts.push('лимиты КБЖУ');
    document.getElementById('foodCopyConfirmText').textContent = `${getDateWithWeekday(fromDate)} → ${getDateWithWeekday(toDate)}. Будут скопированы: ${parts.join(' + ')}.`;
    lockModalScroll(); document.getElementById('foodCopyConfirmModal').classList.remove('hidden');
}
function closeFoodCopyConfirm(){ document.getElementById('foodCopyConfirmModal').classList.add('hidden'); pendingFoodCopy=null; }
function confirmFoodCopy(){
    if(!pendingFoodCopy) return;
    const {fromDate,toDate}=pendingFoodCopy;
    const fromEntries=data.foodDiary.entries.filter(e=>e.date===fromDate);
    const sourceLimit=data.foodDiary.limits[fromDate];
    fromEntries.forEach(e=>data.foodDiary.entries.push({...e,date:toDate}));
    if(sourceLimit) data.foodDiary.limits[toDate]={...sourceLimit};
    saveData();
    closeFoodCopyConfirm();
    renderFoodDiary();
    const copied=[];
    if(fromEntries.length) copied.push(`${fromEntries.length} ${fromEntries.length===1?'запись':'записей'}`);
    if(sourceLimit) copied.push('лимиты КБЖУ');
    showToast(`Скопировано: ${copied.join(' + ')}`);
}
function copyEntriesFromDate(fromDate, toDate) {
    prepareFoodCopy(fromDate,toDate);
}

function showToast(msg) {
    // Единственная система системных уведомлений: старые toast-элементы удаляются.
    document.querySelectorAll('.toast').forEach(t=>t.remove());
    const toast=document.createElement('div');
    toast.className='toast';
    toast.setAttribute('role','status');
    toast.textContent=String(msg||'Готово');
    document.body.appendChild(toast);
    requestAnimationFrame(()=>toast.classList.add('toast-visible'));
    clearTimeout(window.__ftrackerToastTimer);
    window.__ftrackerToastTimer=setTimeout(()=>{
        toast.classList.remove('toast-visible');
        setTimeout(()=>toast.remove(),220);
    },2400);
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js?v=1.8.77', {updateViaCache:'none'}).catch(() => {});
    });
}



/* ===== Exercise Progress — modal exercise list ===== */
window.progressExerciseQuery = window.progressExerciseQuery || '';
window.progressSelectedExercise = window.progressSelectedExercise || '';

function setProgressPeriod(period){
    progressPeriod=period;
    renderProgressDashboard();
}
function setProgressExerciseSearch(value){
    window.progressExerciseQuery=value||'';
    renderProgressExercisePicker();
}
function chooseProgressExercise(name){
    window.progressSelectedExercise=name;
    window.progressExerciseQuery='';
    closeProgressExercisePicker();
    renderProgressDashboard();
}
function clearProgressExercise(){
    window.progressExerciseQuery='';
    window.progressSelectedExercise='';
    renderProgressDashboard();
}
function progressDelta(first,last,unit){
    if(!Number.isFinite(first)||!Number.isFinite(last)) return '<span class="progress-ex-neutral">—</span>';
    const diff=last-first;
    if(diff===0) return '<span class="progress-ex-neutral">Без изменений</span>';
    const pct=first!==0?(diff/first*100):null, sign=diff>0?'+':'';
    return `<span class="${diff>0?'progress-ex-positive':'progress-ex-negative'}">${sign}${formatNum(diff)}${unit}${pct!==null?` (${pct>0?'+':''}${pct.toFixed(1)}%)`:''}</span>`;
}
function getProgressExerciseNames(){
    const names = new Set();

    // Any exercise that has saved history is eligible for progress analysis,
    // regardless of whether it is strength, reps or cardio.
    (data.history || []).forEach(entry => {
        (entry.exercises || []).forEach(ex => {
            if(!ex || !ex.name || !(ex.sets || []).length) return;
            names.add(ex.name);
        });
    });

    // Also include currently active exercises if they already have history.
    (data.programs || []).forEach(program => {
        (program.exercises || []).forEach((name, idx) => {
            if(!name || program.active?.[idx] === false) return;
            const rows = getExerciseSeries(name, getHistoryInPeriod('all'));
            if(rows && rows.length) names.add(name);
        });
    });

    return [...names].sort((a,b)=>a.localeCompare(b,'ru'));
}
function openProgressExercisePicker(){
    const modal=document.getElementById('progressExercisePickerModal');
    if(!modal)return;
    const input=document.getElementById('progressExercisePickerSearch');
    if(input)input.value='';
    renderProgressExercisePicker();
    lockModalScroll();
    modal.classList.remove('hidden');
}
function closeProgressExercisePicker(){
    document.getElementById('progressExercisePickerModal')?.classList.add('hidden');
}
function renderProgressExercisePicker(){
    const list=document.getElementById('progressPickerList');
    const input=document.getElementById('progressExercisePickerSearch');
    if(!list)return;

    const q=(input?.value||'').trim().toLocaleLowerCase('ru');
    const current=window.progressSelectedExercise||'';
    const allNames=getProgressExerciseNames();
    const names=allNames.filter(n=>!q||n.toLocaleLowerCase('ru').includes(q));

    if(!names.length){
        list.innerHTML='<div style="padding:22px;text-align:center;color:var(--subtext);">Упражнений с сохранёнными данными не найдено</div>';
        return;
    }

    // Та же логика, что в справочнике: группа мышц → упражнения этой группы.
    const grouped={};
    names.forEach(name=>{
        const group=fScoreExerciseGroup(name,getExerciseTypeByName(name))||'Другое';
        (grouped[group]||(grouped[group]=[])).push(name);
    });
    const groups=Object.keys(grouped).sort((a,b)=>a.localeCompare(b,'ru'));

    list.innerHTML=groups.map(group=>{
        const items=grouped[group].sort((a,b)=>a.localeCompare(b,'ru'));
        return `<section class="picker-group"><div class="picker-group-title">${progressEsc(group)}</div>${items.map(name=>{
            const rows=getExerciseSeries(name,getHistoryInPeriod('all'))||[];
            const detail=`${rows.length} ${rows.length===1?'тренировка':(rows.length<5?'тренировки':'тренировок')}`;
            const safeName=progressEsc(name);
            return `<button type="button" class="progress-picker-row ${name===current?'selected':''}" data-progress-exercise-name="${safeName}" aria-label="Выбрать ${safeName}">
                <span class="progress-picker-row-main"><strong>${safeName}</strong><small>${progressEsc(detail)}</small></span>
                <span class="progress-picker-row-mark">${name===current?'✓':'›'}</span>
            </button>`;
        }).join('')}</section>`;
    }).join('');

    list.querySelectorAll('[data-progress-exercise-name]').forEach(button=>{
        button.addEventListener('click',function(e){
            e.preventDefault();
            e.stopPropagation();
            const name=this.getAttribute('data-progress-exercise-name');
            if(name) chooseProgressExercise(name);
        },{passive:false});
    });
}

function renderProgressDashboard(){
    const container=document.getElementById('progressContent'); if(!container)return;
    const names=getAllExerciseNames();
    const selected=names.includes(window.progressSelectedExercise)?window.progressSelectedExercise:'';
    window.progressSelectedExercise=selected;

    const history=getHistoryInPeriod(progressPeriod).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    const rows=selected?getExerciseSeries(selected,history):[];
    const type=selected?getExerciseTypeByName(selected):'strength';
    const cfg=selected?getExerciseMetricConfig(type):[];
    const record=selected?getExerciseRecordData(selected):null;
    const first=rows[0], last=rows[rows.length-1];
    const periodLabel=progressPeriod==='all'?'Всё время':`Последние ${progressPeriod} дней`;
    const metricKey=window.progressMetricKey && cfg.some(c=>c.key===window.progressMetricKey) ? window.progressMetricKey : (cfg[0]?.key||'');
    window.progressMetricKey=metricKey;

    let metrics='';
    if(record) metrics=record.metrics.map(m=>`<div class="progress-ex-metric"><div class="progress-ex-metric-label">${escapeHtml(m[0])}</div><div class="progress-ex-metric-value">${escapeHtml(m[1])}</div></div>`).join('');
    // Resolve the active metric BEFORE calculating the trend.  The previous
    // order referenced activeMetric before its const declaration, which threw
    // a ReferenceError after selecting an exercise: the picker closed, then
    // the dashboard render aborted and appeared to return to exercise choice.
    const activeMetric=cfg.find(c=>c.key===metricKey) || cfg[0];
    const progressTrend = (first&&last&&activeMetric&&Number.isFinite(Number(first[activeMetric.key]))&&Number.isFinite(Number(last[activeMetric.key]))&&Number(first[activeMetric.key])!==0)
      ? ((Number(last[activeMetric.key])-Number(first[activeMetric.key]))/Math.abs(Number(first[activeMetric.key]))*100) : null;
    const progressTrendHtml = selected && progressTrend!==null
      ? `<div class="progress-trend-summary"><span>Тренд за ${escapeHtml(periodLabel)}</span><b class="${progressTrend>0?'up':progressTrend<0?'down':'flat'}">${progressTrend>0?'+':''}${progressTrend.toFixed(1)}%</b></div>` : '';

    let changes='';
    if(first&&last){
        changes=cfg.map(c=>`<div class="progress-ex-change-row"><span>${escapeHtml(c.label)}</span>${progressDelta(Number(first[c.key])||0,Number(last[c.key])||0,c.unit?` ${c.unit}`:'')}</div>`).join('');
    }

    const metricButtons=cfg.map(c=>`<button type="button" class="progress-chart-metric ${metricKey===c.key?'active':''}" onclick="setProgressMetric('${c.key}')">${escapeHtml(c.label)}</button>`).join('');

    const chartBlock=(selected&&rows.length&&activeMetric)?`
        <div class="progress-ex-section progress-chart-section">
            <div class="progress-ex-section-head"><div><div class="progress-ex-section-title">Динамика</div></div><span class="progress-section-chevron">⌄</span></div>
            <div class="progress-chart-metrics">${metricButtons}</div>
            <div class="progress-ex-chart progress-single-chart"><canvas id="progressExChartMain"></canvas></div>
        </div>`:'';

    let historyHtml='';
    if(rows.length){
        historyHtml=rows.slice().reverse().map(r=>{
            let main='';
            if(type==='strength') main=`${formatKg(r.weight)} × ${formatNum(r.reps)} повт.`;
            else if(type==='cardio') main=`${formatNum(r.maxTime)} мин · интенсивность ${formatNum(r.maxIntensity)}`;
            else main=`${formatNum(r.reps)} повторов`;
            const historyEntryIndex=(data.history||[]).findIndex(h=>{
                if(!h || !Array.isArray(h.exercises)) return false;
                const sameDate=new Date(h.date).getTime()===r.date.getTime();
                return sameDate && h.exercises.some(ex=>normalizeExerciseKey(ex?.name)===normalizeExerciseKey(selected));
            });
            const clickable=historyEntryIndex>=0;
            return `<button type="button" class="progress-ex-history-row ${clickable?'is-clickable':''}" ${clickable?`data-progress-history-index="${historyEntryIndex}" data-progress-history-exercise="${escapeHtml(selected)}" aria-label="Открыть тренировку ${r.date.toLocaleDateString('ru-RU')}"`:''}>
                <span class="progress-ex-history-date">${r.date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'})}</span>
                <span class="progress-ex-history-value">${main}${type==='strength'?`<small>Объём ${formatKg(r.volume)}</small>`:''}</span>
                ${clickable?'<span class="progress-history-chevron">›</span>':''}
            </button>`;
        }).join('');
    } else historyHtml='<div class="progress-ex-no-results">За выбранный период данных нет</div>';

    const selectedRowsAll=selected ? (getExerciseSeries(selected,getHistoryInPeriod('all'))||[]) : [];
    const selectedWorkoutCount=selectedRowsAll.length;
    const pickerButton=selected
      ? `<button type="button" class="progress-selected-exercise progress-selected-exercise-tap" onclick="openProgressExercisePicker()" aria-label="Изменить упражнение">
            <span class="progress-selected-exercise-name">${progressEsc(selected)}</span>
            <span class="progress-selected-exercise-count" title="Количество тренировок">${selectedWorkoutCount}</span>
         </button>`
      : `<button type="button" class="progress-open-picker" onclick="openProgressExercisePicker()">Выбрать упражнение <span>›</span></button>`;

    container.innerHTML=`<div class="progress-ex">
        
        <div class="progress-ex-period"><button class="${progressPeriod===30?'active':''}" onclick="setProgressPeriod(30)" type="button">30 дней</button><button class="${progressPeriod===90?'active':''}" onclick="setProgressPeriod(90)" type="button">90 дней</button><button class="${progressPeriod==='all'?'active':''}" onclick="setProgressPeriod('all')" type="button">Всё время</button></div>
        <div class="progress-ex-picker">
            <div class="progress-ex-picker-label">Упражнение</div>
            ${pickerButton}
        </div>
        ${selected?`<div class="progress-ex-section"><div class="progress-ex-section-title">Сводка</div><div class="progress-ex-section-sub">${progressEsc(periodLabel)} · рекорды считаются за всё время.</div><div class="progress-ex-metrics">${metrics}</div>${progressTrendHtml}${changes?`<div class="progress-ex-change">${changes}</div>`:''}</div>`:''}
        ${chartBlock}
        ${selected?`<div class="progress-ex-section progress-history-section"><div class="progress-ex-section-head"><div><div class="progress-ex-section-title">История</div><div class="progress-ex-section-sub">Результаты по тренировкам за выбранный период.</div></div><span class="progress-section-chevron">⌄</span></div><div class="progress-ex-history">${historyHtml}</div></div>`:''}
    </div>`;

    if(selected&&rows.length&&activeMetric){
        drawLineChart(document.getElementById('progressExChartMain'),rows.map(r=>({date:r.date,value:Number(r[activeMetric.key])||0})));
    }
}
function setProgressMetric(key){ window.progressMetricKey=key; renderProgressDashboard(); }

function viewProgressExerciseHistory(historyIndex, exerciseName){
    const entry=data.history?.[Number(historyIndex)];
    if(!entry) return;
    const wanted=normalizeExerciseKey(exerciseName);
    const ex=(entry.exercises||[]).find(item=>normalizeExerciseKey(item?.name)===wanted);
    if(!ex) return;

    const dateLabel=new Date(entry.date).toLocaleDateString();
    const title=document.getElementById('workoutDetailTitle');
    if(title) title.innerHTML=`<strong>${escapeHtml(ex.name)}</strong><span>${escapeHtml(entry.program||'Тренировка')} · ${dateLabel}</span>`;

    let html='<div class="workout-history-detail-list"><section class="workout-history-exercise">';
    html+=`<div class="workout-history-exercise-name">${escapeHtml(ex.name)}</div>`;
    if(!ex.sets?.length){
        html+='<div class="workout-history-empty">Нет данных</div>';
    }else{
        html+='<div class="workout-history-sets">';
        ex.sets.forEach((s,i)=>{
            const value=s.weight!=null && s.weight!=='' ? `${escapeHtml(s.weight)} кг × ${escapeHtml(s.reps??'')}` :
                s.time!=null && s.time!=='' ? `${escapeHtml(s.time)} мин × ${escapeHtml(s.intensity??'')}` :
                `${escapeHtml(s.reps??'')} повт.`;
            html+=`<div class="workout-history-set"><span>Подход ${i+1}</span><b>${value}</b></div>`;
        });
        html+='</div>';
    }
    html+='</section></div>';
    const content=document.getElementById('workoutDetailContent');
    if(content) content.innerHTML=html;
    lockModalScroll();
    document.getElementById('workoutDetailModal')?.classList.remove('hidden');
}

let progressExerciseHistoryDelegationInstalled=false;
function installProgressExerciseHistoryDelegation(){
    if(progressExerciseHistoryDelegationInstalled) return;
    progressExerciseHistoryDelegationInstalled=true;
    document.addEventListener('click',function(e){
        const row=e.target.closest?.('[data-progress-history-index],[data-exercise-history-index]');
        if(!row) return;
        e.preventDefault();
        e.stopPropagation();
        const index=row.getAttribute('data-progress-history-index') ?? row.getAttribute('data-exercise-history-index');
        const name=row.getAttribute('data-progress-history-exercise') || row.getAttribute('data-exercise-history-name') || '';
        viewProgressExerciseHistory(index,name);
    },false);
    document.addEventListener('keydown',function(e){
        if(e.key!=='Enter' && e.key!==' ') return;
        const row=e.target.closest?.('[data-progress-history-index],[data-exercise-history-index]');
        if(!row) return;
        e.preventDefault();
        const index=row.getAttribute('data-progress-history-index') ?? row.getAttribute('data-exercise-history-index');
        const name=row.getAttribute('data-progress-history-exercise') || row.getAttribute('data-exercise-history-name') || '';
        viewProgressExerciseHistory(index,name);
    },false);
}
installProgressExerciseHistoryDelegation();



/* ===== Program order: reliable position editor for iPhone/Yandex ===== */
let exerciseOrderProgramIndex = null;
let exerciseOrderDraft = null;
function openExerciseOrderModal(idx) {
    const p = data.programs[idx];
    if (!p) return;
    exerciseOrderProgramIndex = idx;
    exerciseOrderDraft = {
        exercises: [...p.exercises],
        active: [...p.active],
        types: [...p.types]
    };
    document.getElementById('exerciseOrderTitle').textContent = 'Порядок';
    renderExerciseOrderModal();
    lockModalScroll(); document.getElementById('exerciseOrderModal').classList.remove('hidden');
}
function closeExerciseOrderModal() {
    document.getElementById('exerciseOrderModal').classList.add('hidden');
    exerciseOrderProgramIndex = null;
    exerciseOrderDraft = null;
}
function moveDraftToPosition(from, to) {
    if (!exerciseOrderDraft || from === to) return;
    const keys = ['exercises','active','types'];
    keys.forEach(key => {
        const item = exerciseOrderDraft[key].splice(from, 1)[0];
        exerciseOrderDraft[key].splice(to, 0, item);
    });
    renderExerciseOrderModal();
}
function renderExerciseOrderModal() {
    const p = exerciseOrderProgramIndex === null ? null : data.programs[exerciseOrderProgramIndex];
    const list = document.getElementById('exerciseOrderList');
    if (!p || !list || !exerciseOrderDraft) return;
    document.getElementById('exerciseOrderTitle').textContent = 'Порядок';
    list.innerHTML = exerciseOrderDraft.exercises.map((name, i) => {
        const options = exerciseOrderDraft.exercises.map((_, pos) => `<option value="${pos}" ${pos === i ? 'selected' : ''}>${pos + 1}</option>`).join('');
        return `<div class="order-position-row">\n            <div class="order-position-num">${i + 1}</div>\n            <div class="order-position-name">${escapeHtml(name)}</div>\n            <select class="order-position-select" onchange="moveDraftToPosition(${i}, Number(this.value))" aria-label="Новая позиция">${options}</select>\n        </div>`;
    }).join('');
}
function saveExerciseOrder() {
    if (exerciseOrderProgramIndex === null || !exerciseOrderDraft) return;
    const p = data.programs[exerciseOrderProgramIndex];
    p.exercises = [...exerciseOrderDraft.exercises];
    p.active = [...exerciseOrderDraft.active];
    p.types = [...exerciseOrderDraft.types];
    saveData();
    const idx = exerciseOrderProgramIndex;
    closeExerciseOrderModal();
    renderSettings();
    setTimeout(() => document.getElementById('splitCard_' + idx)?.classList.add('open'), 0);
    renderHome();
    showToast('Порядок упражнений сохранён');
}


const EXERCISE_IMGS = {"bench":["./bench-0.webp"],"bentrow":["./bentrow-0.webp"],"butterfly":["./butterfly-0.webp"],"calf":["./calf-0.webp","./calf-1.webp"],"cardio":["./cardio-0.webp"],"crunch":["./crunch-0.webp","./crunch-1.webp"],"curl":["./curl-0.webp"],"deadlift":["./deadlift-0.webp"],"french":["./french-0.webp"],"frontraise":["./frontraise-0.webp"],"hyper":["./hyper-0.webp","./hyper-1.webp"],"incline":["./incline-0.webp","./incline-1.webp"],"lateral":["./lateral-0.webp"],"legcurl":["./legcurl-0.webp"],"legext":["./legext-0.webp"],"legpress":["./legpress-0.webp"],"lunge":["./lunge-0.webp"],"ohp":["./ohp-0.webp"],"overhead_tri":["./overhead_tri-0.webp"],"pulldown":["./pulldown-0.webp"],"pullup":["./pullup-0.webp"],"pushdown":["./pushdown-0.webp"],"pushup":["./pushup-0.webp","./pushup-1.webp"],"reardelt":["./reardelt-0.webp"],"revcurl":["./revcurl-0.webp"],"row":["./row-0.webp"],"shrug":["./shrug-0.webp","./shrug-1.webp"],"squat":["./squat-0.webp"],"machine_press":["./machine_press-0.webp"],"biceps_incline":["./biceps_incline-0.webp"],"legraise":["./legraise-0.webp"],"treadmill":["./treadmill-0.webp"],"crossover":["./crossover-0.webp"],"dip_gravitron":["./dip_gravitron-0.webp"],"dip_machine":["./dip_machine-0.webp"]};
const MUSCLE_LABELS = { brachialis:'Плечевая мышца', adductors:'Приводящие мышцы', chest:'Грудь', delts:'Дельты', delts_front:'Передние дельты', delts_side:'Средние дельты', delts_rear:'Задние дельты', biceps:'Бицепс', triceps:'Трицепс', forearms:'Предплечья', abs:'Пресс', obliques:'Косые', lats:'Широчайшие', upperback:'Верх спины', traps:'Трапеции', lowerback:'Поясница', glutes:'Ягодицы', quads:'Квадрицепсы', hamstrings:'Бицепс бедра', calves:'Икры', cardio:'Сердце и ноги' };

const EXERCISE_GUIDES = [
 {
  "match": [
   "жим в тренажере под углом",
   "жим в тренажёре под углом"
  ],
  "anim": "press",
  "img": "machine_press",
  "primary": [
   "chest"
  ],
  "secondary": [
   "delts_front",
   "triceps"
  ],
  "steps": [
   "Спинка 30–45°, лопатки сведены и прижаты.",
   "Опускай вес к верхней части груди подконтрольно.",
   "Выжимай вверх без полного выпрямления локтей «в замок»."
  ],
  "mistakes": [
   "Слишком крутой угол — нагрузка уходит в передние дельты.",
   "Отрыв таза и поясницы от спинки."
  ],
  "recommendations": [
   "Настрой сиденье так, чтобы рукояти находились примерно на уровне верхней части груди; не выворачивай плечи вперёд.",
   "Выбирай вес, при котором вся амплитуда выполняется без отрыва таза и поясницы от спинки.",
   "Когда все повторы стабильны и подконтрольны, увеличивай вес небольшим шагом, а не за счёт рывка."
  ]
 },
 {
  "match": [
   "бицепс сидя под углом"
  ],
  "anim": "curl",
  "img": "biceps_incline",
  "primary": [
   "biceps"
  ],
  "secondary": [
   "forearms"
  ],
  "steps": [
   "Плотно прижми плечо к наклонной скамье.",
   "Сгибай руку без движения плечом вперёд.",
   "Опускай вес медленно до полного разгибания."
  ],
  "mistakes": [
   "Раскачка рукой.",
   "Слишком глубокое расслабление локтя."
  ],
  "recommendations": [
   "Совмести локоть с осью тренажёра и не позволяй плечу уходить вперёд во время подъёма.",
   "Работай в полной комфортной амплитуде, сохраняя запястье нейтральным.",
   "Если для последних повторов приходится раскачивать корпус, вес лучше снизить."
  ]
 },
 {
  "match": [
   "пресс подъем ног",
   "пресс подъём ног"
  ],
  "anim": "crunch",
  "img": "legraise",
  "primary": [
   "abs"
  ],
  "secondary": [
   "hipflexors"
  ],
  "steps": [
   "Зафиксируй корпус и поднимай ноги за счёт мышц живота.",
   "Не раскачивайся и не бросай ноги вниз.",
   "Опускай ноги подконтрольно."
  ],
  "mistakes": [
   "Инерция и раскачка.",
   "Рывок поясницей."
  ],
  "recommendations": [
   "Сначала зафиксируй корпус и слегка подкрути таз назад — движение должно начинаться прессом, а не махом ног.",
   "Не опускай ноги настолько низко, чтобы поясница начинала отрываться или прогибаться.",
   "Увеличивай сложность постепенно: сначала контроль и амплитуда, затем дополнительный вес."
  ]
 },
 {
  "match": [
   "пресс"
  ],
  "anim": "crunch",
  "img": "legraise",
  "primary": [
   "abs"
  ],
  "secondary": [
   "obliques"
  ],
  "steps": [
   "Поясница прижата, подбородок не тянется к груди.",
   "Скручивайся за счёт пресса, поднимая лопатки, а не всю спину.",
   "На усилии — выдох, вниз опускайся подконтрольно."
  ],
  "mistakes": [
   "Рывки руками за голову — нагружают шею, а не пресс.",
   "Полный подъём корпуса — работу забирают сгибатели бедра."
  ],
  "recommendations": [
   "Сделай акцент на плавном скручивании и выдохе в верхней точке, а не на большом подъёме корпуса.",
   "Не тяни голову руками и не превращай движение в рывок сгибателями бедра.",
   "Если техника распадается, сократи амплитуду или сопротивление."
  ]
 },
 {
  "match": [
   "дорожка"
  ],
  "anim": "run",
  "img": "treadmill",
  "primary": [
   "cardio",
   "quads"
  ],
  "secondary": [
   "calves",
   "hamstrings"
  ],
  "steps": [
   "Начни с лёгкого темпа после разминки.",
   "Сохраняй естественный шаг и положение корпуса.",
   "В конце постепенно снизь скорость."
  ],
  "mistakes": [
   "Резкий старт.",
   "Слишком сильная опора на поручни."
  ],
  "recommendations": [
   "Первые минуты используй как разминку, постепенно повышая скорость или наклон.",
   "Не держись за поручни ради дополнительной скорости — это меняет естественную механику шага.",
   "Для прогресса повышай только один параметр за раз: скорость, наклон или длительность."
  ]
 },
 {
  "match": [
   "эллипс"
  ],
  "anim": "run",
  "img": "cardio",
  "primary": [
   "cardio",
   "quads"
  ],
  "secondary": [
   "calves",
   "hamstrings"
  ],
  "steps": [
   "Начни с лёгкого темпа.",
   "Держи корпус ровно и плавно переноси усилие.",
   "Заверши тренировку постепенным снижением темпа."
  ],
  "mistakes": [
   "Резкий старт.",
   "Опора всем весом на поручни."
  ],
  "recommendations": [
   "Держи корпус вертикально и переноси усилие плавно через всю стопу.",
   "Не опирайся всем весом на поручни; при необходимости снизь сопротивление.",
   "Начинай с лёгкой интенсивности и повышай её постепенно, сохраняя устойчивый ритм."
  ]
 },
 {
  "match": [
   "кардио",
   "бег",
   "велотренаж",
   "эллипс",
   "дорожк",
   "гребн"
  ],
  "anim": "run",
  "img": "cardio",
  "primary": [
   "cardio",
   "quads"
  ],
  "secondary": [
   "calves",
   "hamstrings"
  ],
  "steps": [
   "Начни с 2–3 минут в лёгком темпе для разогрева.",
   "Держи целевой пульс: разговорный темп для базы, интервалы — для интенсивности.",
   "Последние 2 минуты — заминка в лёгком темпе."
  ],
  "mistakes": [
   "Старт сразу на высокой интенсивности без разминки.",
   "Держишься за поручни всем весом — снижает нагрузку."
  ],
  "recommendations": [
   "Подбирай интенсивность под цель: базовая работа — умеренный разговорный темп, интервалы — отдельные короткие отрезки высокой интенсивности.",
   "Перед основной частью дай телу несколько минут лёгкой работы, а в конце сделай заминку.",
   "Увеличивай длительность или интенсивность постепенно, а не оба параметра сразу."
  ]
 },
 {
  "match": [
   "пресс",
   "скручив",
   "планк"
  ],
  "anim": "crunch",
  "img": "crunch",
  "primary": [
   "abs"
  ],
  "secondary": [
   "obliques"
  ],
  "steps": [
   "Поясница прижата, подбородок не тянется к груди.",
   "Скручивайся за счёт пресса, поднимая лопатки, а не всю спину.",
   "На усилии — выдох, вниз опускайся подконтрольно."
  ],
  "mistakes": [
   "Рывки руками за голову — нагружают шею, а не пресс.",
   "Полный подъём корпуса — работу забирают сгибатели бедра."
  ],
  "recommendations": [
   "Сделай акцент на плавном скручивании и выдохе в верхней точке, а не на большом подъёме корпуса.",
   "Не тяни голову руками и не превращай движение в рывок сгибателями бедра.",
   "Если техника распадается, сократи амплитуду или сопротивление."
  ]
 },
 {
  "match": [
   "жим ногами"
  ],
  "anim": "legpress",
  "img": "legpress",
  "primary": [
   "quads"
  ],
  "secondary": [
   "glutes",
   "hamstrings"
  ],
  "steps": [
   "Стопы на ширине плеч по центру платформы, поясница прижата к спинке.",
   "Опускай платформу до угла ~90° в коленях, колени по линии носков.",
   "Выжимай пятками, не выпрямляя колени до замка."
  ],
  "mistakes": [
   "Отрыв поясницы и таза внизу — риск для позвоночника.",
   "Полное выпрямление коленей «в замок» под нагрузкой."
  ],
  "recommendations": [
   "Настрой сиденье так, чтобы в нижней точке таз и поясница оставались плотно прижатыми к спинке.",
   "Следи, чтобы колени двигались в направлении носков; глубина важнее веса, если она сохраняет положение таза.",
   "Не запирай колени в верхней точке и не увеличивай вес ценой сокращения амплитуды."
  ]
 },
 {
  "match": [
   "разгибание ног"
  ],
  "anim": "legext",
  "img": "legext",
  "primary": [
   "quads"
  ],
  "secondary": [],
  "steps": [
   "Валик на нижней части голени, колени по оси вращения тренажёра.",
   "Разгибай ноги подконтрольно до почти полного выпрямления.",
   "В верхней точке — короткая пауза, вниз медленно (2–3 сек)."
  ],
  "mistakes": [
   "Рывок и «бросание» веса вниз.",
   "Отрыв таза от сиденья на тяжёлых весах."
  ],
  "recommendations": [
   "Совмести ось коленного сустава с осью вращения тренажёра и настрой валик под нижнюю часть голени.",
   "Используй умеренный вес и плавное разгибание без удара стопором в верхней точке.",
   "Контролируй обратное движение особенно тщательно — не бросай вес вниз."
  ]
 },
 {
  "match": [
   "сгибание ног"
  ],
  "anim": "legcurl",
  "img": "legcurl",
  "primary": [
   "hamstrings"
  ],
  "secondary": [
   "calves"
  ],
  "steps": [
   "Валик чуть выше пяток, бёдра прижаты к скамье.",
   "Сгибай ноги, доводя валик к ягодицам.",
   "Опускай медленно, не разгибая колени полностью."
  ],
  "mistakes": [
   "Прогиб в пояснице и отрыв таза.",
   "Слишком большой вес — амплитуда сокращается вдвое."
  ],
  "recommendations": [
   "Настрой валик чуть выше ахилла и убедись, что таз остаётся прижатым к скамье.",
   "Сгибай колено плавно, не помогая себе подъёмом таза или раскачкой.",
   "Полезнее стабильная амплитуда с умеренным весом, чем тяжёлый вес с сокращённым движением."
  ]
 },
 {
  "match": [
   "присед"
  ],
  "anim": "squat",
  "img": "squat",
  "primary": [
   "quads",
   "glutes"
  ],
  "secondary": [
   "hamstrings",
   "lowerback"
  ],
  "steps": [
   "Стопы на ширине плеч, взгляд вперёд, спина нейтральная.",
   "Садись назад и вниз до параллели бедра с полом.",
   "Вставай через пятки, колени идут по линии носков."
  ],
  "mistakes": [
   "Колени заваливаются внутрь.",
   "Округление поясницы в нижней точке."
  ],
  "recommendations": [
   "Подбери стойку, в которой колени могут двигаться по линии носков, а корпус остаётся устойчивым.",
   "Опускайся настолько глубоко, насколько можешь сохранить нейтральное положение позвоночника и контроль коленей.",
   "Если техника начинает распадаться, снизь вес; прогрессируй постепенно."
  ]
 },
 {
  "match": [
   "выпад"
  ],
  "anim": "squat",
  "img": "lunge",
  "primary": [
   "quads",
   "glutes"
  ],
  "secondary": [
   "hamstrings"
  ],
  "steps": [
   "Шаг вперёд, корпус вертикально.",
   "Опускайся до угла 90° в обоих коленях.",
   "Возвращайся, отталкиваясь пяткой передней ноги."
  ],
  "mistakes": [
   "Колено уходит за носок с заваливанием корпуса вперёд.",
   "Слишком короткий шаг — вся нагрузка в колено."
  ],
  "recommendations": [
   "Выбирай длину шага, при которой сохраняешь равновесие и можешь контролировать оба колена.",
   "Следи, чтобы переднее колено двигалось по направлению носка и не заваливалось внутрь.",
   "Начинай с собственного веса или лёгкого сопротивления и добавляй нагрузку после освоения движения."
  ]
 },
 {
  "match": [
   "икр",
   "голень"
  ],
  "anim": "calf",
  "img": "calf",
  "primary": [
   "calves"
  ],
  "secondary": [],
  "steps": [
   "Поднимайся на носки максимально высоко.",
   "Пауза 1 сек в верхней точке.",
   "Опускайся медленно, растягивая икры внизу."
  ],
  "mistakes": [
   "Пружинящие короткие повторы без полной амплитуды.",
   "Сгибание коленей — снимает нагрузку с икр."
  ],
  "recommendations": [
   "Используй максимально доступную безболезненную амплитуду: поднимись высоко и опустись под контролем.",
   "Короткая пауза вверху помогает убрать инерцию и не превращать упражнение в пружину.",
   "Прогрессируй небольшим увеличением веса или повторений, сохраняя полную амплитуду."
  ]
 },
 {
  "match": [
   "станов"
  ],
  "anim": "hinge",
  "img": "deadlift",
  "primary": [
   "hamstrings",
   "glutes",
   "lowerback"
  ],
  "secondary": [
   "traps",
   "forearms",
   "quads"
  ],
  "steps": [
   "Гриф над серединой стопы, спина нейтральная, лопатки над грифом.",
   "Тяни за счёт ног, гриф скользит вдоль голеней.",
   "Наверху — полное разгибание бёдер без переразгиба поясницы."
  ],
  "mistakes": [
   "Округление спины при срыве.",
   "Гриф уходит вперёд от тела."
  ],
  "recommendations": [
   "Перед каждым повтором создай жёсткий корпус и начинай движение с грифа над серединой стопы.",
   "Держи гриф близко к ногам и не пытайся поднимать его руками раньше, чем начнётся разгибание ног и таза.",
   "В верхней точке достаточно полного разгибания; переразгибать поясницу не нужно."
  ]
 },
 {
  "match": [
   "из-за головы"
  ],
  "anim": "ohp",
  "img": "overhead_tri",
  "primary": [
   "triceps"
  ],
  "secondary": [
   "delts"
  ],
  "steps": [
   "Гантель над головой, локти направлены вверх и не расходятся.",
   "Опускай гантель за голову до растяжения трицепса.",
   "Разгибай руки, двигая только предплечьями."
  ],
  "mistakes": [
   "Локти разъезжаются в стороны.",
   "Прогиб в пояснице при тяжёлом весе."
  ],
  "recommendations": [
   "Подбери вес, позволяющий держать локти направленными вверх без сильного разведения в стороны.",
   "Двигай только предплечьями, сохраняя плечо стабильным.",
   "Не гонись за глубиной, если появляется дискомфорт в плече или локте; комфортная амплитуда важнее веса."
  ]
 },
 {
  "match": [
   "французск"
  ],
  "anim": "pushdown",
  "img": "french",
  "primary": [
   "triceps"
  ],
  "secondary": [
   "forearms"
  ],
  "steps": [
   "Лёжа, плечи вертикально и неподвижны.",
   "Опускай гриф ко лбу, сгибая только локти.",
   "Разгибай без рывка, не разводя локти."
  ],
  "mistakes": [
   "Плечи «гуляют» вперёд-назад — работа уходит из трицепса.",
   "Слишком большой вес и отбив от лба."
  ],
  "recommendations": [
   "Стабилизируй плечи и направляй движение через сгибание локтей, а не через движение всей руки.",
   "EZ-гриф и умеренный вес могут облегчить контроль положения кистей и локтей.",
   "Опускай вес медленно и не отбивай его от нижней точки."
  ]
 },
 {
  "match": [
   "трицепс"
  ],
  "anim": "pushdown",
  "img": "pushdown",
  "primary": [
   "triceps"
  ],
  "secondary": [
   "forearms"
  ],
  "steps": [
   "Локти прижаты к корпусу и неподвижны.",
   "Разгибай руки до конца, в нижней точке — пауза.",
   "Возвращай рукоять подконтрольно до угла 90°."
  ],
  "mistakes": [
   "Локти отходят от корпуса — включаются спина и грудь.",
   "Навал корпусом на рукоять."
  ],
  "recommendations": [
   "Настрой высоту блока так, чтобы движение начиналось без подъёма плеч и раскачки корпуса.",
   "Держи локти рядом с корпусом и полностью выпрямляй руки только в комфортной амплитуде.",
   "Возвращай рукоять медленно — контроль обратной фазы важнее дополнительного веса."
  ]
 },
 {
  "match": [
   "бицепс обратн",
   "молот"
  ],
  "anim": "curl",
  "img": "revcurl",
  "primary": [
   "forearms",
   "biceps"
  ],
  "secondary": [],
  "steps": [
   "Хват сверху (или нейтральный), локти у корпуса.",
   "Сгибай руки, не забрасывая вес плечами.",
   "Опускай медленно до полного разгибания."
  ],
  "mistakes": [
   "Раскачка корпусом.",
   "Кисти заламываются под весом — держи их жёстко."
  ],
  "recommendations": [
   "Держи запястья жёсткими и не позволяй локтям гулять вперёд-назад.",
   "Используй нейтральный или обратный хват в зависимости от варианта, но сохраняй одинаковую механику повторов.",
   "Если корпус начинает раскачиваться, снизь вес и верни контроль."
  ]
 },
 {
  "match": [
   "бицепс",
   "подъём штанги на",
   "сгибание рук"
  ],
  "anim": "curl",
  "img": "curl",
  "primary": [
   "biceps"
  ],
  "secondary": [
   "forearms"
  ],
  "steps": [
   "Локти зафиксированы у корпуса на всём повторе.",
   "Поднимай вес сгибанием рук, без раскачки.",
   "Опускай подконтрольно 2–3 секунды — это половина результата."
  ],
  "mistakes": [
   "Читинг корпусом и заброс веса.",
   "Локти уходят вперёд — включаются дельты."
  ],
  "recommendations": [
   "Зафиксируй локти около корпуса и не поднимай их вперёд, чтобы не переносить работу на плечи.",
   "Используй полный комфортный диапазон и нейтральное положение запястий.",
   "Прибавляй вес только после того, как все повторения выполняются без раскачки."
  ]
 },
 {
  "match": [
   "подтягив"
  ],
  "anim": "pullup",
  "img": "pullup",
  "primary": [
   "lats"
  ],
  "secondary": [
   "biceps",
   "upperback"
  ],
  "steps": [
   "Хват чуть шире плеч, в висе — лёгкое напряжение в лопатках.",
   "Тяни грудь к перекладине, сводя лопатки вниз и назад.",
   "Опускайся подконтрольно до почти полного выпрямления рук."
  ],
  "mistakes": [
   "Рывки и раскачка ногами.",
   "Половинная амплитуда сверху и снизу."
  ],
  "recommendations": [
   "Настрой противовес так, чтобы можешь выполнять полную контролируемую амплитуду без рывка.",
   "Начинай тягу с работы лопаток, затем подключай руки; не раскачивай корпус.",
   "По мере прогресса постепенно уменьшай помощь, сохраняя качество повторов."
  ]
 },
 {
  "match": [
   "вертикальная тяга",
   "тяга сверху",
   "верхнего блока"
  ],
  "anim": "pulldown",
  "img": "pulldown",
  "primary": [
   "lats"
  ],
  "secondary": [
   "biceps",
   "upperback"
  ],
  "steps": [
   "Хват шире плеч, корпус слегка отклонён назад.",
   "Тяни рукоять к верху груди, начиная движение лопатками.",
   "Возвращай вверх медленно, растягивая широчайшие."
  ],
  "mistakes": [
   "Тяга за голову или сильный завал корпуса назад.",
   "Работа только руками без сведения лопаток."
  ],
  "recommendations": [
   "Тяни рукоять к верхней части груди, а не за голову; лёгкий наклон корпуса допустим для устойчивости.",
   "Начинай движение с опускания лопаток и не превращай тягу только в сгибание локтей.",
   "Медленно возвращай рукоять вверх, сохраняя контроль и растяжение широчайших."
  ]
 },
 {
  "match": [
   "горизонтальная тяга",
   "тяга к поясу",
   "рычажная тяга",
   "тяга нижнего блока"
  ],
  "anim": "row",
  "img": "row",
  "primary": [
   "upperback",
   "lats"
  ],
  "secondary": [
   "biceps",
   "delts_rear"
  ],
  "steps": [
   "Спина нейтральная, лёгкий наклон корпуса допустим только в старте.",
   "Тяни рукоять к низу живота, сводя лопатки.",
   "Плечи не поднимаются к ушам; вперёд возвращай подконтрольно."
  ],
  "mistakes": [
   "Раскачка корпусом на каждом повторе.",
   "Круглая спина в растянутой позиции."
  ],
  "recommendations": [
   "Настрой сиденье и упор так, чтобы позвоночник оставался нейтральным и корпус не раскачивался.",
   "Тяни рукоять к поясу или низу живота, позволяя лопаткам двигаться естественно.",
   "Не поднимай плечи к ушам и не бросай вес вперёд в конце повтора."
  ]
 },
 {
  "match": [
   "кросс-тяга",
   "тяга в наклоне",
   "тяга штанги в наклоне",
   "тяга гантели в наклоне"
  ],
  "anim": "row",
  "img": "bentrow",
  "primary": [
   "lats",
   "upperback"
  ],
  "secondary": [
   "lowerback",
   "biceps",
   "delts_rear"
  ],
  "steps": [
   "Наклон корпуса 30–45°, спина жёсткая, колени слегка согнуты.",
   "Тяни вес к поясу, локти идут вдоль корпуса.",
   "Опускай подконтрольно, не роняя плечи вперёд."
  ],
  "mistakes": [
   "Округление поясницы.",
   "Тяга к груди с разведёнными локтями — уходит в трапеции."
  ],
  "recommendations": [
   "Сохраняй жёсткий корпус и такой наклон, при котором поясница остаётся нейтральной.",
   "Веди локти назад вдоль корпуса и не превращай движение в рывок всем телом.",
   "Сначала освой стабильную траекторию, затем увеличивай вес небольшими шагами."
  ]
 },
 {
  "match": [
   "разведение гантелей в наклоне",
   "разведение в наклоне",
   "обратная бабочка",
   "обратные разведения"
  ],
  "anim": "fly",
  "img": "reardelt",
  "primary": [
   "delts_rear"
  ],
  "secondary": [
   "upperback",
   "traps"
  ],
  "steps": [
   "Наклон корпуса почти параллельно полу, спина ровная.",
   "Разводи гантели в стороны с мягкими локтями.",
   "Веди движение локтями, вверху — короткая пауза."
  ],
  "mistakes": [
   "Слишком большой вес и подброс корпусом.",
   "Сведение лопаток в кучу — работа уходит из задней дельты."
  ],
  "recommendations": [
   "Возьми лёгкий вес: задняя дельта лучше работает при точном движении, чем при раскачке.",
   "Веди движение локтями и не превращай разведение в сведение лопаток.",
   "Сохраняй корпус неподвижным и контролируй опускание гантелей."
  ]
 },
 {
  "match": [
   "в стороны",
   "махи гантел"
  ],
  "anim": "fly",
  "img": "lateral",
  "primary": [
   "delts_side"
  ],
  "secondary": [
   "traps"
  ],
  "steps": [
   "Гантели у бёдер, локти слегка согнуты.",
   "Поднимай через стороны до уровня плеч, локоть выше кисти.",
   "Опускай медленно, не бросая вес."
  ],
  "mistakes": [
   "Подъём выше плеч с включением трапеций.",
   "Раскачка и рывок в старте."
  ],
  "recommendations": [
   "Поднимай руки примерно до уровня плеч, сохраняя небольшой сгиб в локтях.",
   "Не подбрасывай гантели корпусом и не поднимай плечи к ушам.",
   "Если приходится раскачиваться, снизь вес — для махов качество траектории важнее килограммов."
  ]
 },
 {
  "match": [
   "перед собой"
  ],
  "anim": "fly",
  "img": "frontraise",
  "primary": [
   "delts_front"
  ],
  "secondary": [
   "chest"
  ],
  "steps": [
   "Поднимай гантели перед собой до уровня плеч.",
   "Корпус неподвижен, локти слегка согнуты.",
   "Опускай подконтрольно, не ниже лёгкого натяжения."
  ],
  "mistakes": [
   "Отклонение корпуса назад для подброса.",
   "Подъём выше уровня глаз без необходимости."
  ],
  "recommendations": [
   "Поднимай гантели до уровня плеч без запрокидывания корпуса назад.",
   "Держи локти слегка согнутыми и не превращай движение в рывок.",
   "Передние дельты уже получают нагрузку в жимах, поэтому здесь обычно достаточно умеренного веса и строгой техники."
  ]
 },
 {
  "match": [
   "жим гантелей сидя",
   "жим сидя",
   "армейск",
   "жим стоя",
   "жим вверх"
  ],
  "anim": "ohp",
  "img": "ohp",
  "primary": [
   "delts"
  ],
  "secondary": [
   "triceps",
   "traps"
  ],
  "steps": [
   "Гантели на уровне ушей, предплечья вертикальны.",
   "Выжимай вверх по слегка сходящейся траектории.",
   "Опускай до уровня подбородка–ушей, без отбива внизу."
  ],
  "mistakes": [
   "Сильный прогиб в пояснице — жим превращается в наклонный.",
   "Неполная амплитуда внизу."
  ],
  "recommendations": [
   "Начинай с гантелей примерно на уровне ушей и сохраняй предплечья близкими к вертикали.",
   "Не компенсируй тяжёлый вес сильным прогибом поясницы или толчком ногами.",
   "Прогрессируй весом только при сохранении устойчивого корпуса и контролируемого опускания."
  ]
 },
 {
  "match": [
   "гиперэкстензи"
  ],
  "anim": "hinge",
  "img": "hyper",
  "primary": [
   "lowerback"
  ],
  "secondary": [
   "glutes",
   "hamstrings"
  ],
  "steps": [
   "Упор бёдрами на подушке, корпус опускается свободно.",
   "Поднимайся до прямой линии корпус–ноги.",
   "Без переразгиба вверху; движение плавное."
  ],
  "mistakes": [
   "Переразгибание в верхней точке.",
   "Рывковый темп с махом рук."
  ],
  "recommendations": [
   "Настрой валик так, чтобы таз был надёжно зафиксирован, но движение происходило в тазобедренном суставе.",
   "Поднимай корпус до прямой линии с ногами, не стараясь уйти выше за счёт поясницы.",
   "Если чувствуешь упражнение преимущественно в пояснице, сократи амплитуду и снизь нагрузку."
  ]
 },
 {
  "match": [
   "шраги"
  ],
  "anim": "shrug",
  "img": "shrug",
  "primary": [
   "traps"
  ],
  "secondary": [
   "forearms"
  ],
  "steps": [
   "Поднимай плечи строго вверх к ушам.",
   "Пауза 1 сек в верхней точке.",
   "Опускай медленно до полного растяжения."
  ],
  "mistakes": [
   "Вращение плечами — бесполезно и травмоопасно.",
   "Кивки головой в такт повторам."
  ],
  "recommendations": [
   "Двигай плечами вертикально вверх-вниз без круговых вращений.",
   "Короткая пауза в верхней точке помогает убрать инерцию и удержать напряжение.",
   "Не используй чрезмерный вес: качество движения важнее максимального подъёма."
  ]
 },
 {
  "match": [
   "бабочка",
   "сведение",
   "разведение гантелей лёжа",
   "разводка"
  ],
  "anim": "fly",
  "img": "butterfly",
  "primary": [
   "chest"
  ],
  "secondary": [
   "delts_front"
  ],
  "steps": [
   "Локти слегка согнуты и зафиксированы в одном угле.",
   "Своди руки по дуге до лёгкого касания.",
   "Разводи до растяжения груди, без боли в плечах."
  ],
  "mistakes": [
   "Превращение разводки в жим со сгибанием локтей.",
   "Слишком глубокое растяжение с большим весом."
  ],
  "recommendations": [
   "Настрой сиденье так, чтобы плечо и локоть находились в естественном положении, без сильного растяжения внизу.",
   "Своди руки плавно и не отрывай верхнюю часть спины от опоры.",
   "Если плечам неприятно в глубокой растянутой позиции, сократи амплитуду и снизь вес."
  ]
 },
 {
  "match": [
   "отжим"
  ],
  "anim": "bench",
  "img": "pushup",
  "primary": [
   "chest"
  ],
  "secondary": [
   "triceps",
   "delts_front",
   "abs"
  ],
  "steps": [
   "Корпус — прямая линия от головы до пяток.",
   "Опускайся до угла 90° в локтях, локти ~45° к корпусу.",
   "Выжимайся, не проваливая поясницу."
  ],
  "mistakes": [
   "Провисание таза.",
   "Разведение локтей строго в стороны — нагрузка на плечи."
  ],
  "recommendations": [
   "Держи тело одной линией и напрягай корпус на протяжении всего подхода.",
   "Локти направляй примерно под 30–45° к корпусу, а глубину выбирай по способности сохранить контроль.",
   "Если обычный вариант слишком тяжёлый, используй опору выше или другой регресс, сохраняя технику."
  ]
 },
 {
  "match": [
   "жим в тренажёре под углом",
   "жим под углом",
   "жим на наклонной",
   "наклонный жим"
  ],
  "anim": "bench",
  "img": "incline",
  "primary": [
   "chest"
  ],
  "secondary": [
   "delts_front",
   "triceps"
  ],
  "steps": [
   "Спинка 30–45°, лопатки сведены и прижаты.",
   "Опускай вес к верхней части груди подконтрольно.",
   "Выжимай вверх без полного выпрямления локтей «в замок»."
  ],
  "mistakes": [
   "Слишком крутой угол — нагрузка уходит в передние дельты.",
   "Отрыв таза и поясницы от спинки."
  ],
  "recommendations": [
   "Настрой наклон скамьи под комфортную работу верхней части груди; слишком большой угол сильнее нагружает передние дельты.",
   "Сохраняй лопатки и таз на опоре, опуская вес контролируемо.",
   "Не увеличивай вес, если из-за него сокращается амплитуда или появляется рывок."
  ]
 },
 {
  "match": [
   "жим лёжа",
   "жим штанги лёж",
   "жим гантелей лёж"
  ],
  "anim": "bench",
  "img": "bench",
  "primary": [
   "chest"
  ],
  "secondary": [
   "triceps",
   "delts_front"
  ],
  "steps": [
   "Лопатки сведены и прижаты, стопы упираются в пол.",
   "Опускай гриф к низу груди подконтрольно.",
   "Жми вверх по слегка дуговой траектории, локти ~45–60° к корпусу."
  ],
  "mistakes": [
   "Отбив грифа от груди.",
   "Отрыв таза от скамьи на тяжёлых подходах."
  ],
  "recommendations": [
   "Сведи и опусти лопатки, поставь стопы устойчиво и сохрани стабильный контакт корпуса со скамьёй.",
   "Опускай штангу контролируемо к нижней части груди, сохраняя запястья нейтральными.",
   "Для тяжёлых подходов используй страховку и не повышай вес, пока техника не остаётся стабильной."
  ]
 },
 {
  "match": [
   "жим"
  ],
  "anim": "bench",
  "img": "bench",
  "primary": [
   "chest"
  ],
  "secondary": [
   "triceps",
   "delts_front"
  ],
  "steps": [
   "Лопатки сведены, спина стабильна.",
   "Опускай вес подконтрольно до комфортной глубины.",
   "Выжимай без рывка, не выпрямляя локти «в замок»."
  ],
  "mistakes": [
   "Отбив веса в нижней точке.",
   "Разведение локтей строго в стороны."
  ],
  "recommendations": [
   "Сначала настрой положение скамьи, рукоятей или грифа так, чтобы траектория была естественной и устойчивой.",
   "Используй полный комфортный диапазон без отбива и рывка.",
   "Постепенно увеличивай сопротивление только при сохранении стабильного корпуса и контроля."
  ]
 },
 {
  "match": [
   "тяга"
  ],
  "anim": "row",
  "img": "bentrow",
  "primary": [
   "lats",
   "upperback"
  ],
  "secondary": [
   "biceps"
  ],
  "steps": [
   "Спина нейтральная на протяжении всего повтора.",
   "Начинай движение сведением лопаток, затем тяни руками.",
   "Возвращай вес подконтрольно, растягивая спину."
  ],
  "mistakes": [
   "Работа только руками без лопаток.",
   "Раскачка корпусом."
  ],
  "recommendations": [
   "Настрой тренажёр или скамью так, чтобы мог сохранять нейтральную спину и устойчивую опору.",
   "Начинай движение лопатками, затем подключай руки; не компенсируй вес раскачкой.",
   "Контролируй возвращение веса и не бросай его в растянутой позиции."
  ]
 }
];

// Retired built-ins stay out of the directory and picker, while legacy history can still keep their names.
for(let i=EXERCISE_GUIDES.length-1;i>=0;i--){ if(isRetiredExerciseName(EXERCISE_GUIDES[i]?.name)) EXERCISE_GUIDES.splice(i,1); }

function enhanceGuideForExercise(name, guide){
    if(!guide) return guide;
    const n=compactGuideKey(name);
    const upgrades=[
      {"keys":["кардио"],"steps":["Начни с 2–3 минут в лёгком темпе для разогрева.","Держи целевой пульс: разговорный темп для базы, интервалы — для интенсивности.","Последние 2 минуты — заминка в лёгком темпе."],"mistakes":["Старт сразу на высокой интенсивности без разминки.","Держишься за поручни всем весом — снижает нагрузку."]},
      {"keys":["жимлежа"],"steps":["Лопатки сведены и прижаты, стопы упираются в пол.","Опускай гриф к низу груди подконтрольно.","Жми вверх по слегка дуговой траектории, локти ~45–60° к корпусу."],"mistakes":["Отбив грифа от груди.","Отрыв таза от скамьи на тяжёлых подходах."]},
      {"keys":["бицепссezгрифомстоя"],"steps":["Локти зафиксированы у корпуса на всём повторе.","Поднимай вес сгибанием рук, без раскачки.","Опускай подконтрольно 2–3 секунды — это половина результата."],"mistakes":["Читинг корпусом и заброс веса.","Локти уходят вперёд — включаются дельты."]},
      {"keys":["жимвтренажереподуглом"],"steps":["Спинка 30–45°, лопатки сведены и прижаты.","Опускай вес к верхней части груди подконтрольно.","Выжимай вверх без полного выпрямления локтей «в замок»."],"mistakes":["Слишком крутой угол — нагрузка уходит в передние дельты.","Отрыв таза и поясницы от спинки."]},
      {"keys":["бицепссидяподуглом"],"steps":["Локти зафиксированы у корпуса на всём повторе.","Поднимай вес сгибанием рук, без раскачки.","Опускай подконтрольно 2–3 секунды — это половина результата."],"mistakes":["Читинг корпусом и заброс веса.","Локти уходят вперёд — включаются дельты."]},
      {"keys":["бабочкавтренажере"],"steps":["Локти слегка согнуты и зафиксированы в одном угле.","Своди руки по дуге до лёгкого касания.","Разводи до растяжения груди, без боли в плечах."],"mistakes":["Превращение разводки в жим со сгибанием локтей.","Слишком глубокое растяжение с большим весом."]},
      {"keys":["бицепсобратнымхватом"],"steps":["Хват сверху (или нейтральный), локти у корпуса.","Сгибай руки, не забрасывая вес плечами.","Опускай медленно до полного разгибания."],"mistakes":["Раскачка корпусом.","Кисти заламываются под весом — держи их жёстко."]},
      {"keys":["подтягиваниявтренажере"],"steps":["Хват чуть шире плеч, в висе — лёгкое напряжение в лопатках.","Тяни грудь к перекладине, сводя лопатки вниз и назад.","Опускайся подконтрольно до почти полного выпрямления рук."],"mistakes":["Рывки и раскачка ногами.","Половинная амплитуда сверху и снизу."]},
      {"keys":["кросстягавнаклоне"],"steps":["Наклон корпуса 30–45°, спина жёсткая, колени слегка согнуты.","Тяни вес к поясу, локти идут вдоль корпуса.","Опускай подконтрольно, не роняя плечи вперёд."],"mistakes":["Округление поясницы.","Тяга к груди с разведёнными локтями — уходит в трапеции."]},
      {"keys":["французскийжим"],"steps":["Лёжа, плечи вертикально и неподвижны.","Опускай гриф ко лбу, сгибая только локти.","Разгибай без рывка, не разводя локти."],"mistakes":["Плечи «гуляют» вперёд-назад — работа уходит из трицепса.","Слишком большой вес и отбив от лба."]},
      {"keys":["горизонтальнаятяга"],"steps":["Спина нейтральная, лёгкий наклон корпуса допустим только в старте.","Тяни рукоять к низу живота, сводя лопатки.","Плечи не поднимаются к ушам; вперёд возвращай подконтрольно."],"mistakes":["Раскачка корпусом на каждом повторе.","Круглая спина в растянутой позиции."]},
      {"keys":["жимгантелииззаголовы"],"steps":["Гантель над головой, локти направлены вверх и не расходятся.","Опускай гантель за голову до растяжения трицепса.","Разгибай руки, двигая только предплечьями."],"mistakes":["Локти разъезжаются в стороны.","Прогиб в пояснице при тяжёлом весе."]},
      {"keys":["вертикальнаятягавблоке"],"steps":["Хват шире плеч, корпус слегка отклонён назад.","Тяни рукоять к верху груди, начиная движение лопатками.","Возвращай вверх медленно, растягивая широчайшие."],"mistakes":["Тяга за голову или сильный завал корпуса назад.","Работа только руками без сведения лопаток."]},
      {"keys":["трицепсвблоке"],"steps":["Локти прижаты к корпусу и неподвижны.","Разгибай руки до конца, в нижней точке — пауза.","Возвращай рукоять подконтрольно до угла 90°."],"mistakes":["Локти отходят от корпуса — включаются спина и грудь.","Навал корпусом на рукоять."]},
      {"keys":["жимногамивтренажере"],"steps":["Стопы на ширине плеч по центру платформы, поясница прижата к спинке.","Опускай платформу до угла ~90° в коленях, колени по линии носков.","Выжимай пятками, не выпрямляя колени до замка."],"mistakes":["Отрыв поясницы и таза внизу — риск для позвоночника.","Полное выпрямление коленей «в замок» под нагрузкой."]},
      {"keys":["жимгантелейсидя"],"steps":["Гантели на уровне ушей, предплечья вертикальны.","Выжимай вверх по слегка сходящейся траектории.","Опускай до уровня подбородка–ушей, без отбива внизу."],"mistakes":["Сильный прогиб в пояснице — жим превращается в наклонный.","Неполная амплитуда внизу."]},
      {"keys":["разгибаниеногвтренажере"],"steps":["Валик на нижней части голени, колени по оси вращения тренажёра.","Разгибай ноги подконтрольно до почти полного выпрямления.","В верхней точке — короткая пауза, вниз медленно (2–3 сек)."],"mistakes":["Рывок и «бросание» веса вниз.","Отрыв таза от сиденья на тяжёлых весах."]},
      {"keys":["подъемгантелейпередсобой"],"steps":["Поднимай гантели перед собой до уровня плеч.","Корпус неподвижен, локти слегка согнуты.","Опускай подконтрольно, не ниже лёгкого натяжения."],"mistakes":["Отклонение корпуса назад для подброса.","Подъём выше уровня глаз без необходимости."]},
      {"keys":["сгибаниеногвтренажере"],"steps":["Валик чуть выше пяток, бёдра прижаты к скамье.","Сгибай ноги, доводя валик к ягодицам.","Опускай медленно, не разгибая колени полностью."],"mistakes":["Прогиб в пояснице и отрыв таза.","Слишком большой вес — амплитуда сокращается вдвое."]},
      {"keys":["подъемгантелейвстороны"],"steps":["Гантели у бёдер, локти слегка согнуты.","Поднимай через стороны до уровня плеч, локоть выше кисти.","Опускай медленно, не бросая вес."],"mistakes":["Подъём выше плеч с включением трапеций.","Раскачка и рывок в старте."]},
      {"keys":["разведениегантелейвнаклоне"],"steps":["Наклон корпуса почти параллельно полу, спина ровная.","Разводи гантели в стороны с мягкими локтями.","Веди движение локтями, вверху — короткая пауза."],"mistakes":["Слишком большой вес и подброс корпусом.","Сведение лопаток в кучу — работа уходит из задней дельты."]}
    ];
    for(const u of upgrades){ if(u.keys.some(k=>n.includes(k))){ return {...guide,steps:u.steps,mistakes:u.mistakes}; } }
    return guide;
}
function compactGuideKey(value){
    return String(value||'')
      .toLocaleLowerCase('ru-RU')
      .replace(/ё/g,'е')
      .replace(/[^a-zа-я0-9]+/gi,'');
}

/* ===== FTracker expert exercise knowledge base v1 =====
   Card-only content layer. Existing media and non-exercise app logic are untouched.
   Technique priorities follow current resistance-training evidence, with special
   attention to bench angle, ROM, joint position, stability and progressive loading. */
const EXPERT_GUIDE_OVERRIDES = [
  {
    keys:['жимлежа','жимштангилежа','жимгантелейлежа'],
    primary:['chest'], secondary:['triceps','delts_front'],
    steps:[
      'Сведи и слегка опусти лопатки, стопы устойчиво в пол; ягодицы и верх спины остаются на скамье.',
      'Опускай штангу подконтрольно к нижней/средней части груди; предплечья в нижней точке близки к вертикали.',
      'Выжимай вверх по естественной слегка диагональной траектории, сохраняя контроль и не теряя положение плеч.'
    ],
    mistakes:['Отбив штанги от груди или потеря контроля внизу.','Сильное разведение локтей и потеря стабильности плеч.','Отрыв ягодиц от скамьи при попытке поднять слишком большой вес.'],
    recommendations:['Для гипертрофии используй полный контролируемый диапазон, который сохраняет стабильность плеч и не вызывает боли.','Не превращай каждый подход в попытку максимума: техника должна оставаться одинаковой от первого до последнего повтора.','Увеличивай вес небольшими шагами только после того, как заданный диапазон повторений выполняется чисто.']
  },
  {
    keys:['жимвтренажереподуглом','жимподуглом','жимнанаклонной','наклонныйжим'],
    primary:['chest'], secondary:['delts_front','triceps'],
    steps:['Выставь спинку примерно на 30° как базовую точку; если конструкция тренажёра и антропометрия требуют, используй около 30–45°.','Сведи лопатки и прижми верх спины; рукояти должны приходиться примерно на верхнюю часть груди.','Опускай рукояти контролируемо и выжимай вверх без потери положения плеч.'],
    mistakes:['Слишком крутой угол: упражнение начинает сильнее смещаться в переднюю дельту.','Плечи уходят вперёд в нижней точке.','Отрыв таза/спины от опоры и рывок весом.'],
    recommendations:['30° — особенно разумная отправная точка для акцента на ключичную часть груди; исследования показывают высокую активацию верхней части груди при этом угле.','При 45° верх груди всё ещё работает, но передняя дельта обычно получает больше работы; выше 45–60° это уже заметно сильнее похоже на жим для плеч.','Оценивай угол именно по механике конкретной скамьи/тренажёра: одинаковая цифра не всегда даёт одинаковую траекторию.']
  },
  {
    keys:['бицепссezгрифомстоя','бицепссezгрифом','бицепсштангой'],
    primary:['biceps'], secondary:['brachialis','forearms'],
    steps:['Стой устойчиво, локти держи близко к корпусу и не выводи их вперёд в начале подъёма.','Поднимай гриф сгибанием в локте без раскачки корпуса.','Опускай вес медленно до почти полного разгибания, сохраняя напряжение.'],
    mistakes:['Читинг корпусом и заброс веса.','Локти уезжают вперёд, и плечо начинает помогать подъёму.','Сокращённая нижняя амплитуда.'],
    recommendations:['EZ-гриф позволяет выбрать удобное положение кистей; не жертвуй положением локтей ради большего веса.','Контролируй эксцентрическую фазу и не бросай гриф вниз.','Для набора мышц приоритет — стабильная техника и достаточная близость к отказу, а не рекордный вес.']
  },
  {
    keys:['бицепссидяподуглом','бицепсподуглом'],
    primary:['biceps'], secondary:['brachialis','forearms'],
    steps:['Скамья обычно 45–60°; чем ниже спинка, тем сильнее плечо уходит в разгибание и тем больше растягивается длинная головка бицепса.','Плотно прижми спину, оставь плечи неподвижными, локти направлены вниз.','Сгибай локоть без вывода плеча вперёд и опускай гантель до контролируемого растяжения.'],
    mistakes:['Скамья слишком вертикальная и теряется смысл упражнения.','Локти уходят вперёд в верхней половине повторения.','Разгибание до болезненного положения внизу.'],
    recommendations:['Для большинства людей разумный старт — 45–60°; выбирай угол, при котором можно получить растяжение бицепса без дискомфорта в передней части плеча.','Не обязательно опускаться до абсолютно прямого локтя, если это нарушает контроль или вызывает боль.','Используй умеренный вес: положение плеча делает упражнение существенно сложнее обычного подъёма.']
  },
  {
    keys:['бабочкавтренажере','бабочка','сведение','разводка'],
    primary:['chest'], secondary:['delts_front'],
    steps:['Настрой сиденье так, чтобы рукояти/локтевые упоры находились примерно на уровне средней части груди.','Сохраняй небольшой сгиб локтей и своди руки по дуге без изменения угла локтя.','В конце сведения сделай короткую паузу, затем возвращайся до комфортного растяжения груди.'],
    mistakes:['Слишком глубокое растяжение при большом весе.','Превращение движения в жим за счёт сильного сгибания локтей.','Плечи уходят вперёд и теряется контроль.'],
    recommendations:['Глубину растяжения выбирай по мобильности плеч и контролю, а не по принципу «чем глубже, тем лучше».','Держи грудную клетку стабильной и не бросай вес в растянутой точке.','Для гипертрофии достаточно плавного сведения с контролируемым возвратом.']
  },
  {
    keys:['подтягиваниявтренажере','подтягивания'],
    primary:['lats','upperback'], secondary:['biceps','forearms'],
    steps:['Начни с активного виса: плечи не зажаты у ушей, корпус стабилен.','Веди локти вниз и назад, подтягивая грудь к перекладине без рывка.','Опускайся контролируемо до почти полного разгибания рук.'],
    mistakes:['Раскачка и помощь ногами.','Подтягивание только подбородком вместо движения локтей вниз.','Половинная амплитуда.'],
    recommendations:['Используй такую помощь тренажёра, чтобы сохранять полный контролируемый диапазон.','Не тяни перекладину за голову.','По мере прогресса постепенно уменьшай помощь, сохраняя одинаковую технику.']
  },
  {
    keys:['кросстягавнаклоне','тяганаклоне'],
    primary:['lats','upperback'], secondary:['biceps','traps'],
    steps:['Наклони корпус примерно на 30–45° и создай жёсткий корпус; колени слегка согнуты.','Веди локти назад к тазу, сохраняя штангу/рукоять близко к ногам.','Опускай вес до контролируемого растяжения широчайших, не теряя положения позвоночника.'],
    mistakes:['Округление поясницы под нагрузкой.','Раскачка корпусом вместо тяги спиной.','Тяга слишком высоко к груди при цели нагрузить широчайшие.'],
    recommendations:['Угол корпуса не обязан быть одинаковым для всех: выбирай положение, в котором можешь стабильно тянуть локтями и сохранять корпус.','Чем больше движение превращается в горизонтальную тягу к животу, тем больше работы получает верх/середина спины.','Не увеличивай вес ценой потери контроля в нижней позиции.']
  },
  {
    keys:['французскийжим'],
    primary:['triceps'], secondary:['delts_front'],
    steps:['Ляг на скамью, плечо почти вертикально; локти направлены вверх и остаются стабильными.','Сгибай локти, уводя гриф за лоб или немного за голову для комфортного растяжения трицепса.','Разгибай локти без рывка и не превращай движение в жим плечами.'],
    mistakes:['Локти сильно расходятся в стороны.','Слишком большой вес и резкое торможение внизу.','Плечо постоянно двигается вместо изолированного сгибания/разгибания локтя.'],
    recommendations:['Выбирай вариант траектории, который даёт растяжение трицепса без дискомфорта в локтях.','Умеренный вес обычно позволяет лучше удерживать положение локтей.','Не нужен жёсткий «замок» локтей в верхней точке — сохраняй контроль.']
  },
  {
    keys:['горизонтальнаятяга'],
    primary:['upperback','lats'], secondary:['biceps','traps'],
    steps:['Сядь устойчиво, грудь раскрыта, позвоночник нейтрален; лёгкое движение корпуса допустимо только как часть старта.','Тяни рукоять к нижней части живота, ведя локти назад.','Возвращай рукоять медленно, позволяя лопаткам двигаться вперёд без округления поясницы.'],
    mistakes:['Раскачка корпусом на каждом повторе.','Сильное округление спины в растянутой позиции.','Тяга руками без движения плечевого пояса.'],
    recommendations:['Выбирай рукоять и ширину хвата под цель: более узкая нейтральная траектория часто удобна для широчайших, более широкая — для верхней части спины.','Не превращай тягу в движение поясницей.','Контролируй возврат — растянутая позиция должна быть частью повторения, а не падением веса.']
  },
  {
    keys:['вертикальнаятягавблоке'],
    primary:['lats'], secondary:['biceps','upperback'],
    steps:['Сядь устойчиво, зафиксируй бёдра, корпус слегка отклонён назад.','Тяни рукоять к верхней части груди, направляя локти вниз.','Возвращай рукоять вверх до контролируемого растяжения широчайших.'],
    mistakes:['Тяга за голову.','Сильный завал корпуса назад и превращение движения в тягу всем телом.','Слишком короткая верхняя амплитуда.'],
    recommendations:['Для большинства людей удобен умеренный наклон корпуса, а не глубокий завал назад.','Не нужно тянуть рукоять ниже груди ради дополнительной амплитуды.','Если хват ограничивает движение, попробуй нейтральную рукоять.']
  },
  {
    keys:['трицепсвблоке'],
    primary:['triceps'], secondary:['forearms'],
    steps:['Локти держи рядом с корпусом и стабильно.','Разгибай руки вниз до полного комфортного сокращения трицепса.','Возвращай рукоять вверх медленно, не позволяя плечам «гулять».'],
    mistakes:['Локти уезжают вперёд-назад.','Наваливание корпусом на рукоять.','Слишком большой вес и неполная амплитуда.'],
    recommendations:['Выбирай рукоять, которая позволяет держать запястья нейтрально.','В нижней точке можно сделать короткую паузу без потери положения локтей.','Если для повторения нужен толчок корпусом, снизь вес.']
  },
  {
    keys:['жимногамивтренажере'],
    primary:['quads'], secondary:['glutes','hamstrings'],
    steps:['Поставь стопы примерно на ширине плеч; положение выше/ниже меняет относительный вклад мышц и должно подбираться под комфорт.','Опускай платформу до глубины, при которой таз остаётся прижатым к спинке и колени движутся по линии носков.','Выжимай платформу всей стопой, не запирая колени в верхней точке.'],
    mistakes:['Отрыв таза и подкручивание таза внизу из-за чрезмерной глубины.','Колени заваливаются внутрь.','Полный «замок» коленей под тяжёлой нагрузкой.'],
    recommendations:['Не существует одного магического положения стоп: важнее стабильный таз, комфортная глубина и контроль колена.','Более глубокая амплитуда обычно увеличивает требования к квадрицепсам и ягодицам, если техника позволяет её сохранить.','Не опускай платформу глубже, чем позволяет стабильное положение таза.']
  },
  {
    keys:['жимгантелейсидя'],
    primary:['delts'], secondary:['triceps','traps'],
    steps:['Спинка около 70–85°: почти вертикальная, но без необходимости насильно прижимать голову.','Гантели стартуют около уровня ушей, предплечья близки к вертикали.','Выжимай вверх по естественной сходящейся траектории и опускай подконтрольно.'],
    mistakes:['Сильный прогиб поясницы.','Гантели опускаются слишком низко и теряется стабильность плеч.','Толчок ногами вместо жима.'],
    recommendations:['Почти вертикальная спинка сохраняет упражнение жимом для плеч; сильный наклон назад смещает механику в сторону верхней груди.','Не обязательно опускать гантели до плеч, если это ухудшает положение плечевого сустава.','Контролируемый диапазон важнее максимальной глубины.']
  },
  {
    keys:['разгибаниеногвтренажере'],
    primary:['quads'], secondary:[],
    steps:['Настрой ось вращения тренажёра на уровень коленного сустава, валик — на нижнюю часть голени.','Разгибай колено плавно до комфортного почти полного выпрямления.','Опускай вес медленно и сохраняй таз прижатым к сиденью.'],
    mistakes:['Рывок с инерцией.','Отрыв таза от сиденья.','Бросание веса вниз.'],
    recommendations:['Используй полный комфортный диапазон и контролируй нижнюю фазу.','Небольшая пауза в верхней точке может помочь убрать инерцию.','Если коленям неприятно, проверь настройку оси и валика прежде чем менять технику.']
  },
  {
    keys:['сгибаниеногвтренажере'],
    primary:['hamstrings'], secondary:['glutes','calves'],
    steps:['Настрой ось тренажёра по колену, валик — чуть выше пятки/ахилла; таз и бёдра прижаты к опоре.','Сгибай колено плавно, не поднимая таз.','Возвращай вес медленно до контролируемого растяжения задней поверхности бедра.'],
    mistakes:['Отрыв таза и прогиб поясницы.','Рывок в начале движения.','Слишком короткая амплитуда из-за чрезмерного веса.'],
    recommendations:['Настройка тренажёра важнее попытки поднять больше: колено должно совпадать с осью вращения.','Полный контролируемый диапазон обычно предпочтительнее укороченных повторов.','Если таз начинает двигаться, снизь вес.']
  },
  {
    keys:['подъемгантелейвстороны'],
    primary:['delts_side'], secondary:['traps'],
    steps:['Гантели у бёдер, локти слегка согнуты; корпус стабилен.','Поднимай руки в стороны примерно до уровня плеч, ведя движение локтями.','Опускай медленно и не бросай вес вниз.'],
    mistakes:['Раскачка корпусом.','Слишком тяжёлые гантели и превращение упражнения в шраг.','Подъём намного выше плеч без необходимости.'],
    recommendations:['Для средней дельты важнее направление движения и контроль, чем большой вес.','Небольшой естественный поворот кистей допустим; не нужно насильно разворачивать ладони строго вниз.','Если трапеции забирают движение, снизь вес и остановись около уровня плеч.']
  },
  {
    keys:['разведениегантелейвнаклоне'],
    primary:['delts_rear'], secondary:['upperback','traps'],
    steps:['Наклони корпус так, чтобы плечевой пояс мог свободно двигаться; спина стабильна.','Разводи гантели дугой в стороны, ведя движение локтями.','В верхней точке коротко удержи положение и вернись подконтрольно.'],
    mistakes:['Сведение лопаток вместо движения плеча — работа уходит в верх спины.','Слишком большой вес и раскачка.','Корпус почти вертикальный, из-за чего меняется механика.'],
    recommendations:['Выбирай угол корпуса, при котором задняя дельта ощущается лучше всего и нет дискомфорта в пояснице.','Лёгкий вес обычно позволяет лучше контролировать траекторию.','Не нужно максимально сводить лопатки в верхней точке.']
  },
  {
    keys:['гиперэкстензи'],
    primary:['glutes','hamstrings'], secondary:['lowerback'],
    steps:['Настрой валик так, чтобы таз был надёжно зафиксирован, а сгибание происходило в тазобедренном суставе.','Опускай корпус за счёт сгибания в тазу, сохраняя спину стабильной.','Поднимись до линии корпус–ноги и остановись без переразгибания поясницы.'],
    mistakes:['Переразгибание в верхней точке.','Движение в основном поясницей вместо тазобедренного сустава.','Рывки и махи руками.'],
    recommendations:['Для ягодиц и задней поверхности бедра думай о разгибании таза, а не о запрокидывании корпуса.','Полная амплитуда не означает уходить выше прямой линии.','При добавлении веса держи его близко к корпусу и прогрессируй постепенно.']
  },
  {
    keys:['шраги'],
    primary:['traps'], secondary:['forearms'],
    steps:['Стой/сиди устойчиво, руки прямые, плечи свободно опущены.','Подними плечи строго вверх, без кругового вращения.','Сделай короткую паузу и медленно опусти до комфортного растяжения.'],
    mistakes:['Круговые вращения плечами.','Рывок всем телом.','Слишком большой вес, из-за которого исчезает амплитуда.'],
    recommendations:['Двигай плечами по вертикали, а не по кругу.','Пауза в верхней точке помогает убрать инерцию.','Контролируемая нижняя позиция важна для полноценной амплитуды.']
  },
  {
    keys:['отжим'],
    primary:['chest'], secondary:['triceps','delts_front','abs'],
    steps:['Сохраняй прямую линию тела, напряги пресс и ягодицы.','Опускай грудь контролируемо, локти обычно направлены примерно на 30–45° от корпуса.','Выжимайся вверх, сохраняя положение таза и плеч.'],
    mistakes:['Провисание таза.','Локти строго в стороны.','Слишком короткая амплитуда.'],
    recommendations:['Используй полный комфортный диапазон, который позволяет сохранять стабильность корпуса.','Ширина постановки рук и угол локтей могут немного меняться под антропометрию.','Если техника разваливается, используй более высокий упор или другой регресс.']
  }
];

const NEW_EXERCISE_GUIDES = [
  {
    name:'Присед со штангой', match:['приседаниясоштангой','приседсоштангой','приседсоштангои','присед'], img:'squat',
    primary:['quads','glutes'], secondary:['hamstrings','adductors','lowerback'],
    steps:['Установи гриф на устойчивую позицию на верхней части спины; стопы примерно на ширине плеч, носки слегка наружу.','Сделай вдох и создай жёсткий корпус; одновременно сгибай колени и отводи таз, сохраняя колени по линии носков.','Опускайся до глубины, которую можешь контролировать без потери положения таза и стоп; затем встань, сохраняя корпус стабильным.'],
    mistakes:['Колени резко уходят внутрь.','Потеря устойчивости стоп и отрыв пяток.','Глубина достигается за счёт потери контроля таза.','Резкое увеличение веса при ухудшении техники.'],
    recommendations:['Для гипертрофии нижней части тела полный контролируемый диапазон обычно предпочтительнее коротких приседов; исследования показывают преимущества глубокой амплитуды для ряда мышц ног.','Глубина не должна быть фиксированной цифрой: подбирай её под мобильность, антропометрию и способность сохранять стабильность.','Если цель — больше квадрицепса, держи корпус более вертикальным и допускай большее сгибание колена; более выраженный наклон таза/корпуса увеличивает вклад разгибателей таза.']
  },
  {
    name:'Становая тяга', match:['становая','становаяга','deadlift'], img:'deadlift',
    primary:['glutes','hamstrings','lowerback'], secondary:['upperback','traps','forearms','quads'],
    steps:['Поставь стопы так, чтобы гриф находился близко к голени; возьмись за гриф и создай натяжение до отрыва.','Сохрани устойчивый корпус и веди гриф максимально близко к телу; одновременно разгибай колени и таз.','Вверху выпрями тело без переразгибания поясницы, затем верни гриф вниз через контролируемое движение таза назад и сгибание коленей.'],
    mistakes:['Гриф далеко от тела — растут требования к пояснице.','Рывок с пола без предварительного натяжения.','Переразгибание в верхней точке.','Попытка поднять вес за счёт округления и потери контроля.'],
    recommendations:['Один из наиболее устойчивых технических ориентиров — держать гриф близко к телу; биомеханические исследования связывают это с более эффективной механикой подъёма.','Не существует обязательного «идеального» угла спины для всех: важны контроль, способность удерживать нагрузку и постепенная адаптация.','Начинай с веса, при котором каждое повторение выглядит одинаково, и увеличивай нагрузку постепенно.']
  },
  {
    name:'Кроссовер', match:['кроссовер','кроссоверсведениеру','сведениеруквкроссовере'], img:'crossover',
    primary:['chest'], secondary:['delts_front'],
    remoteMedia:[{src:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Cable-crossover-1.png/500px-Cable-crossover-1.png',type:'image',credit:'Everkinetic · CC BY-SA 3.0'}],
    steps:['Установь блоки на уровне, соответствующем выбранной траектории: высокий блок — больше движения сверху вниз, средний — более горизонтальное сведение, низкий — снизу вверх.','Сделай небольшой наклон корпуса и удерживай плечи стабильными; локти слегка согнуты и сохраняют один угол.','Своди руки по дуге до сильного сокращения груди, затем медленно возвращайся в растянутую позицию без потери контроля.'],
    mistakes:['Слишком большой вес и превращение упражнения в жим.','Плечи уходят вперёд в конце повторения.','Слишком глубокая растяжка под большим весом.'],
    recommendations:['Для общего акцента на грудь начни с блоков примерно на уровне середины груди.','Если хочешь больше подчеркнуть верхнюю часть груди, используй траекторию снизу вверх; если больше нижнюю/стернальную часть — сверху вниз.','Не гонись за максимальным сведением кистей: важнее непрерывное напряжение и комфортная растяжка.']
  },

  {
    name:'Ягодичный мост со штангой', match:['ягодичныймостсоштангой','хиптраст','hipthrust'],
    remoteMedia:[{src:'https://exercise-dataset.com/images/flat/hip-thrust-peak.webp',type:'image',credit:'RepDB Exercise Dataset · free for personal and commercial in-app use with attribution'}],
    primary:['glutes'], secondary:['hamstrings','quads'],
    steps:['Лопатки опираются на край скамьи, гриф лежит на тазу через мягкую защиту; стопы примерно на ширине таза.','Подними таз разгибанием в тазобедренном суставе, сохраняя рёбра и таз подконтрольными.','Вверху достигни полного разгибания таза без переразгибания поясницы и опускайся плавно.'],
    mistakes:['Переразгибание поясницы вместо разгибания таза.','Стопы слишком далеко или близко, из-за чего меняется ощущение упражнения.','Рывок грифом вверх.'],
    recommendations:['Подбирай положение стоп так, чтобы в верхней точке голень была близка к вертикали и ягодицы выполняли основную работу.','Короткая пауза в верхней точке помогает убрать инерцию.','Хип-траст — хороший специализированный вариант для ягодичных; исследования показывают заметный рост ягодичных при его систематическом применении.']
  },
  {
    name:'Тяга штанги в наклоне', match:['тягаштангивнаклоне','тягаштангикживоту','barbellrow'], img:'bentrow',
    primary:['upperback','lats'], secondary:['biceps','traps','lowerback'],
    steps:['Наклони корпус от таза примерно на 30–45° или глубже, если можешь стабильно удерживать положение.','Тяни гриф к нижним рёбрам/животу, ведя локти назад и сохраняя гриф близко к телу.','Опускай вес до контролируемого растяжения широчайших и верхней части спины.'],
    mistakes:['Раскачка корпусом.','Округление поясницы под нагрузкой.','Подъём веса к груди при потере контроля корпуса.'],
    recommendations:['Угол корпуса выбирай по способности стабильно выполнять тягу; чем горизонтальнее корпус, тем больше требований к удержанию положения.','Не обязательно максимально сводить лопатки в каждом повторе — движение должно соответствовать выбранной траектории локтей.','Если поясница устаёт раньше спины, снизь вес или используй грудную опору в другом варианте тяги.']
  },
  {
    name:'Жим штанги стоя', match:['жимштангистоя','армейскийжим','жимстоя'],
    remoteMedia:[{src:'https://upload.wikimedia.org/wikipedia/commons/2/25/How_to_do_an_Overhead_Press.jpg',type:'image',credit:'RangerJim · Wikimedia Commons · CC BY-SA 4.0'}],
    primary:['delts'], secondary:['triceps','upperback','abs'],
    steps:['Стой с грифом на верхней части груди, ягодицы и пресс напряжены.','Выжми гриф вверх, пропуская голову под гриф после прохождения лба.','Вверху руки выпрямлены комфортно, гриф находится над серединой стоп; опускай подконтрольно.'],
    mistakes:['Сильный прогиб поясницы.','Гриф уходит далеко вперёд от тела.','Толчок ногами в строгом жиме.'],
    recommendations:['Держи гриф близко к вертикальной линии над стопами.','Не пытайся искусственно держать локти строго в стороны — выбери естественный угол плеч.','Если мобильность плеч ограничивает траекторию, используй комфортный диапазон вместо форсированного положения.']
  },
  {
    name:'Отжимания на брусьях в тренажере', match:['отжиманиянабрусьяхвтренажере','отжиманиянабрусьяхвтренажёре','брусьявтренажере','брусьявтренажёре'], img:'dip_machine',
    primary:['triceps'], secondary:['chest','delts_front'],
    steps:['Настрой противовес так, чтобы мог выполнять движение без раскачки; в зависимости от модели встань или встань коленями на платформу и возьмись за рукояти.','Сохрани корпус стабильным, опускайся контролируемо, сгибая локти назад; ориентир — около 90° или комфортная глубина без дискомфорта в плечах.','Нажми ладонями вниз и вернись вверх, не бросая плечи к ушам и не переразгибая локти.'],
    mistakes:['Слишком маленькая помощь и раскачка корпусом.','Слишком глубокое опускание при дискомфорте в плечах.','Прогиб поясницы и выдвижение плеч вперёд.','Резкая блокировка локтей в верхней точке.'],
    recommendations:['На тренажёре выбранный вес — это величина помощи, поэтому большее значение стека обычно делает упражнение легче.','Для акцента на трицепс держи корпус более вертикальным и локти направляй назад; умеренный наклон вперёд увеличивает вклад груди.','Начни с такой помощи, которая позволяет сделать полный контролируемый подход, затем постепенно уменьшай помощь по мере роста силы.']
  },
  {
    name:'Отжимания на брусьях в Гравитроне', match:['отжиманиянабрусьяхвгравитроне','брусьявгравитроне','гравитронбрусья'], img:'dip_gravitron',
    primary:['triceps'], secondary:['chest','delts_front'],
    steps:['Выбери помощь на стеке и встань коленями на платформу Гравитрона; возьмись за параллельные рукояти и стабилизируй корпус.','Опускай тело между рукоятями плавно, ведя локти назад; ориентир — около 90° сгибания локтей или комфортная глубина без боли.','Надави ладонями на рукояти и вернись вверх, сохраняя корпус собранным и плечи опущенными.'],
    mistakes:['Недостаточная помощь и попытка компенсировать её раскачкой.','Опускание слишком глубоко при неприятных ощущениях в плечах.','Плечи поднимаются к ушам или корпус разваливается.','Удар платформой вверх из-за резкого движения.'],
    recommendations:['В Гравитроне вес на стеке — это помощь: увеличь помощь, если техника начинает разрушаться.','Более вертикальный корпус обычно удобнее для акцента на трицепс; умеренный наклон вперёд увеличивает вклад груди.','Сохраняй плавную траекторию и не позволяй платформе резко подбрасывать тебя в нижней точке.']
  },
  {
    name:'Выпады с гантелями', match:['выпадысгантелями','выпады'], img:'lunge',
    primary:['quads','glutes'], secondary:['hamstrings','calves'],
    steps:['Сделай шаг вперёд и опускай таз вниз, сохраняя переднюю стопу полностью опёртой.','Колено передней ноги движется по линии носка; заднее колено опускается к полу.','Оттолкнись всей стопой передней ноги и вернись в исходное положение.'],
    mistakes:['Колено заваливается внутрь.','Слишком короткий шаг и потеря устойчивости.','Толчок только носком передней ноги.'],
    recommendations:['Длина шага и наклон корпуса меняют распределение нагрузки: более короткий шаг и более вертикальный корпус обычно сильнее нагружают квадрицепс.','Используй такую длину шага, при которой сохраняешь баланс и контроль.','Начинай с умеренного веса — односторонние упражнения требуют больше стабильности, чем кажется.']
  },
  {
    name:'Подъём на носки стоя', match:['подъемнаноскистоя','подъемынаноскистоя','икрыстоя'], img:'calf',
    primary:['calves'], secondary:[],
    steps:['Стой устойчиво, передняя часть стопы на платформе, пятки свободны.','Опускай пятки до контролируемого растяжения икр.','Поднимайся максимально высоко на носки без рывка и сделай короткую паузу.'],
    mistakes:['Пружинящие повторы.','Очень короткая амплитуда.','Разворот стоп как способ поднять больший вес.'],
    recommendations:['Икры хорошо переносят контролируемую полную амплитуду; не сокращай движение ради веса.','Пауза в верхней и нижней точках помогает убрать инерцию.','Положение стоп выбирай прежде всего по устойчивости и комфорту, а не по обещаниям о «магическом» акценте.']
  }
];

/* Add the new built-ins to the existing guide registry without touching existing media. */
if (Array.isArray(EXERCISE_GUIDES)) {
  const existingNames = new Set(EXERCISE_GUIDES.map(g=>compactGuideKey(g?.name||'')));
  for (const g of NEW_EXERCISE_GUIDES) {
    if (!existingNames.has(compactGuideKey(g.name))) EXERCISE_GUIDES.push(g);
  }
}

function applyExpertGuideOverride(name, guide){
  if(!guide) return guide;
  const n=compactGuideKey(name);
  const o=EXPERT_GUIDE_OVERRIDES.find(x=>(x.keys||[]).some(k=>n.includes(compactGuideKey(k))));
  if(!o) return guide;
  return {
    ...guide,
    primary:o.primary?.slice() || guide.primary,
    secondary:o.secondary?.slice() || guide.secondary,
    steps:o.steps?.slice() || guide.steps,
    mistakes:o.mistakes?.slice() || guide.mistakes,
    recommendations:o.recommendations?.slice() || guide.recommendations
  };
}

function findExerciseGuide(name) {
    const n = compactGuideKey(name);
    if (!n) return null;

    // 1) Exact normalized exercise name always wins.
    // This prevents broad match keys such as "отжим" or "жим"
    // from intercepting a more specific built-in exercise.
    const exact = EXERCISE_GUIDES.find(g =>
        g?.name && compactGuideKey(g.name) === n
    );
    if (exact) {
        return applyExpertGuideOverride(name, enhanceGuideForExercise(name, exact));
    }

    // 2) For aliases/partial matches, prefer the most specific (longest)
    // matching keyword instead of the first item in the registry.
    let best = null;
    let bestLen = -1;
    for (const g of EXERCISE_GUIDES) {
        for (const kw of (g.match || [])) {
            const key = compactGuideKey(kw);
            if (key && n.includes(key) && key.length > bestLen) {
                best = g;
                bestLen = key.length;
            }
        }
    }
    return best
        ? applyExpertGuideOverride(name, enhanceGuideForExercise(name, best))
        : null;
}



function buildMuscleMapSVG(primary, secondary) {
    const cls = key => {
        if (primary.includes(key)) return 'ex-muscle m-primary';
        if (secondary.includes(key)) return 'ex-muscle m-secondary';
        return 'ex-muscle';
    };
    const has = (list, ...keys) => keys.some(k => list.includes(k));
    const deltFrontCls = (has(primary,'delts','delts_front','delts_side')) ? 'ex-muscle m-primary' : (has(secondary,'delts','delts_front','delts_side')) ? 'ex-muscle m-secondary' : 'ex-muscle';
    const deltRearCls = (has(primary,'delts','delts_rear')) ? 'ex-muscle m-primary' : (has(secondary,'delts','delts_rear')) ? 'ex-muscle m-secondary' : 'ex-muscle';
    const front = `<svg viewBox="0 0 90 190" aria-label="Вид спереди">
      <g class="ex-body-base"><circle cx="45" cy="15" r="10"/><path d="M31 30 Q45 25 59 30 L62 78 Q45 86 28 78 Z"/><path d="M27 32 Q20 36 18 52 L15 84 Q19 87 23 85 L28 55 Z"/><path d="M63 32 Q70 36 72 52 L75 84 Q71 87 67 85 L62 55 Z"/><path d="M30 88 L28 132 Q31 136 38 135 L42 92 Z"/><path d="M60 88 L62 132 Q59 136 52 135 L48 92 Z"/><path d="M36 136 L34 176 Q38 180 42 178 L44 138 Z"/><path d="M54 136 L56 176 Q52 180 48 178 L46 138 Z"/></g>
      <ellipse class="${deltFrontCls}" cx="27" cy="37" rx="6.5" ry="8"/><ellipse class="${deltFrontCls}" cx="63" cy="37" rx="6.5" ry="8"/>
      <path class="${cls('chest')}" d="M33 36 Q45 33 45 33 L45 55 Q36 56 32 50 Z"/><path class="${cls('chest')}" d="M57 36 Q45 33 45 33 L45 55 Q54 56 58 50 Z"/>
      <ellipse class="${cls('biceps')}" cx="22" cy="56" rx="5" ry="10"/><ellipse class="${cls('biceps')}" cx="68" cy="56" rx="5" ry="10"/>
      <ellipse class="${cls('forearms')}" cx="18" cy="76" rx="4" ry="9"/><ellipse class="${cls('forearms')}" cx="72" cy="76" rx="4" ry="9"/>
      <rect class="${cls('abs')}" x="38" y="58" width="14" height="24" rx="5"/>
      <path class="${cls('obliques')}" d="M31 58 L36 58 L36 80 L30 77 Z"/><path class="${cls('obliques')}" d="M59 58 L54 58 L54 80 L60 77 Z"/>
      <ellipse class="${cls('quads')}" cx="35" cy="110" rx="7" ry="20"/><ellipse class="${cls('quads')}" cx="55" cy="110" rx="7" ry="20"/>
      <ellipse class="${cls('calves')}" cx="39" cy="156" rx="4.5" ry="14"/><ellipse class="${cls('calves')}" cx="51" cy="156" rx="4.5" ry="14"/>
    </svg>`;
    const back = `<svg viewBox="0 0 90 190" aria-label="Вид сзади">
      <g class="ex-body-base"><circle cx="45" cy="15" r="10"/><path d="M31 30 Q45 25 59 30 L62 78 Q45 86 28 78 Z"/><path d="M27 32 Q20 36 18 52 L15 84 Q19 87 23 85 L28 55 Z"/><path d="M63 32 Q70 36 72 52 L75 84 Q71 87 67 85 L62 55 Z"/><path d="M30 88 L28 132 Q31 136 38 135 L42 92 Z"/><path d="M60 88 L62 132 Q59 136 52 135 L48 92 Z"/><path d="M36 136 L34 176 Q38 180 42 178 L44 138 Z"/><path d="M54 136 L56 176 Q52 180 48 178 L46 138 Z"/></g>
      <path class="${cls('traps')}" d="M38 28 Q45 26 52 28 L50 42 Q45 44 40 42 Z"/>
      <ellipse class="${deltRearCls}" cx="27" cy="37" rx="6.5" ry="8"/><ellipse class="${deltRearCls}" cx="63" cy="37" rx="6.5" ry="8"/>
      <path class="${cls('upperback')}" d="M34 34 L44 40 L44 50 L34 47 Z"/><path class="${cls('upperback')}" d="M56 34 L46 40 L46 50 L56 47 Z"/>
      <path class="${cls('lats')}" d="M32 48 L43 52 L43 68 L34 62 Z"/><path class="${cls('lats')}" d="M58 48 L47 52 L47 68 L56 62 Z"/>
      <ellipse class="${cls('triceps')}" cx="22" cy="55" rx="5" ry="10"/><ellipse class="${cls('triceps')}" cx="68" cy="55" rx="5" ry="10"/>
      <ellipse class="${cls('forearms')}" cx="18" cy="76" rx="4" ry="9"/><ellipse class="${cls('forearms')}" cx="72" cy="76" rx="4" ry="9"/>
      <rect class="${cls('lowerback')}" x="39" y="64" width="12" height="14" rx="4"/>
      <ellipse class="${cls('glutes')}" cx="38" cy="90" rx="8" ry="8"/><ellipse class="${cls('glutes')}" cx="52" cy="90" rx="8" ry="8"/>
      <ellipse class="${cls('hamstrings')}" cx="35" cy="115" rx="7" ry="18"/><ellipse class="${cls('hamstrings')}" cx="55" cy="115" rx="7" ry="18"/>
      <ellipse class="${cls('calves')}" cx="39" cy="156" rx="4.5" ry="14"/><ellipse class="${cls('calves')}" cx="51" cy="156" rx="4.5" ry="14"/>
    </svg>`;
    return front + back;
}

/* ===== Мышцы и техника v3: модальная карточка со статичными фазами ===== */
let techniqueModalReturnFocus = null;

function openTechniqueModalBase(exerciseName,type){
    return window.openTechniqueModal ? window.openTechniqueModal(exerciseName,type,'view') : null;
}

function closeTechniqueModal() {
    const modal = document.getElementById('techniqueModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.pointerEvents='none';
    modal.setAttribute('aria-hidden','true');
    modal.scrollTop=0;
    const content=modal.querySelector('.technique-modal-content');
    if(content) content.scrollTop=0;
    /* Technique card is isolated from Modal Stack; do not touch body geometry here. */
}

function switchTechniqueTab(tabId) {
    const modal = document.getElementById('techniqueModal');
    if (!modal) return;
    modal.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    modal.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
    requestAnimationFrame(()=>{
      window.autosizeExerciseEditorTextareas(modal);
      requestAnimationFrame(()=>autosizeExerciseEditorTextareas(modal));
    });
}


loadData();

function adjustRestTime(delta){
    // Change the active countdown itself, not a separate variable.
    // The timer uses restEndTime, so the controls must modify that value.
    if (!restEndTime) return;

    restEndTime += delta * 1000;
    if (restEndTime < Date.now()) {
        restEndTime = Date.now();
    }

    updateRestTimerDisplay();
}




(function(){
  'use strict';

  /* ---------- Workout progress: "Выполнено X из Y упражнений" ---------- */
  const _updateWorkoutProgressUI_v44 = updateWorkoutProgressUI;
  updateWorkoutProgressUI = function(){
    const activeIndices=getActiveExerciseIndices();
    const total=activeIndices.length;
    const completed=activeIndices.reduce((n,idx)=>n+(isWorkoutExerciseCompleted(idx)?1:0),0);
    const pct=total?Math.round((completed/total)*100):0;
    const bar=document.getElementById('workoutProgressBar');
    if(bar) bar.style.width=pct+'%';
    const left=document.getElementById('workoutProgressLeft');
    if(left) left.textContent=`Выполнено ${completed} из ${total} упражнений`;
    const right=document.getElementById('workoutProgressRight');
    if(right) right.textContent='';
    const text=document.getElementById('workoutProgressText');
    if(text) text.textContent='';
    /* Keep the original helper available for any secondary state it maintains. */
    try{ _updateWorkoutProgressUI_v44(); }catch(e){}
    if(left) left.textContent=`Выполнено ${completed} из ${total} упражнений`;
    if(right) right.textContent='';
    if(bar) bar.style.width=pct+'%';
  };

  /* ---------- Programs: every split is collapsed on every render ---------- */
  const _renderSettings_v44 = renderSettings;
  renderSettings = function(){
    _renderSettings_v44();
    document.querySelectorAll('#programsEditor .program-v5-card.open').forEach(el=>el.classList.remove('open'));
  };

  /* ---------- Reliable program exercise picker ---------- */
  const _renderExercisePicker_v44 = renderExercisePickerBase;
  window.renderExercisePicker = function(){
    _renderExercisePicker_v44();
    const root=document.getElementById('exercisePickerList');
    if(!root) return;
    root.style.pointerEvents='auto';
    root.style.touchAction='pan-y';
    root.onclick=function(e){
      const btn=e.target.closest('[data-picker-name]');
      if(!btn || !root.contains(btn) || btn.disabled) return;
      e.preventDefault(); e.stopPropagation();
      const name=btn.getAttribute('data-picker-name');
      const item=getDirectoryExercises().find(x=>x.name===name);
      if(item) selectExerciseForProgram(exercisePickerProgramIndex,item.name,item.type||'strength');
    };
  };

  /* ---------- Reliable replacement picker ---------- */
  const _renderReplaceExerciseList_v44 = renderReplaceExerciseListBase;
  window.renderReplaceExerciseList = function(query=''){
    _renderReplaceExerciseList_v44(query);
    const list=document.getElementById('replaceExerciseList');
    if(!list) return;
    list.style.pointerEvents='auto';
    list.style.touchAction='pan-y';
    list.onclick=function(e){
      const btn=e.target.closest('.replace-exercise-option');
      if(!btn || !list.contains(btn)) return;
      e.preventDefault(); e.stopPropagation();
      const key=btn.getAttribute('data-replace-key');
      if(key) selectReplacementCandidate(key);
    };
  };

  /* ---------- Concrete muscle focus under exercise name ---------- */
  window.getWorkoutMuscleFocus = function(name,type,group){
    return String(group || inferExerciseGroup(name,type) || 'Другое').trim() || 'Другое';
  };

  /* Re-apply the muscle line after the existing renderer has built the exercise card. */
  const _renderExerciseBase_v44 = renderExerciseBase;
  window.renderExercise = function(){
    _renderExerciseBase_v44();
    try{
      const realIdx=getRealExerciseIndex();
      const meta=getWorkoutExercise(realIdx); if(!meta) return;
      updateWorkoutProgressUI();
    }catch(e){ console.warn('v45 workout render',e); }
  };

  /* Unified exercise card/editor is installed at the end of the file. */

  /* Finish confirmation stays modular on the last exercise. */
  window.confirmFinishWorkout=function(){
    lockModalScroll(); document.getElementById('finishWorkoutConfirmModal')?.classList.remove('hidden');
  };
  window.closeFinishWorkoutConfirm=function(){
    document.getElementById('finishWorkoutConfirmModal')?.classList.add('hidden');
  };


  /* Keep the workout progress in sync after the screen becomes visible. */
  if(document.readyState!=='loading') setTimeout(updateWorkoutProgressUI,0);
  else document.addEventListener('DOMContentLoaded',()=>setTimeout(updateWorkoutProgressUI,0),{once:true});
})();



(function(){
  'use strict';
  function cleanCardioGraphControls(){
    try{
      const name=window.openedExerciseName;
      if(!name || typeof getExerciseTypeByName!=='function') return;
      if(getExerciseTypeByName(name)!=='cardio') return;
      const box=document.getElementById('exerciseGraphControls');
      if(!box) return;
      box.querySelectorAll('button').forEach(btn=>{
        if((btn.textContent||'').trim()==='Повторы') btn.remove();
      });
    }catch(e){}
  }
  document.addEventListener('click',()=>setTimeout(cleanCardioGraphControls,0),true);
  const observer=new MutationObserver(()=>cleanCardioGraphControls());
  const start=()=>{const box=document.getElementById('exerciseGraphControls'); if(box) observer.observe(box,{childList:true,subtree:true});};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();



(function(){
  function removeDuplicateCloseButtons(root){
    const scope=root||document;
    scope.querySelectorAll?.('.workout-detail-content, .achievements-content, .catalog-modal-content, .technique-modal-content').forEach(box=>{
      if(!box.querySelector('.close-btn,.modal-close-btn')) return;
      box.querySelectorAll('button').forEach(btn=>{
        if(String(btn.textContent||'').trim()==='Закрыть') btn.remove();
      });
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>removeDuplicateCloseButtons());
  else removeDuplicateCloseButtons();
  new MutationObserver(muts=>{
    for(const m of muts){
      for(const n of m.addedNodes){
        if(n.nodeType===1) removeDuplicateCloseButtons(n);
      }
    }
  }).observe(document.body,{childList:true,subtree:true});
})();



(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  /* 1) Nutrition: always enter at the top, with the tab strip below the header. */
  function resetFoodScroll(){
    const screen=$('#foodScreen');
    if(!screen)return;
    screen.scrollTop=0;
    if(document.scrollingElement)document.scrollingElement.scrollTop=0;
    window.scrollTo(0,0);
    const tabs=$('.food-main-tabs',screen);
    if(tabs){tabs.style.scrollMarginTop='0px';}
  }
  const oldShowFood=window.showFoodDiary;
  window.showFoodDiary=function(){
    if(typeof oldShowFood==='function')oldShowFood.apply(this,arguments);
    requestAnimationFrame(()=>requestAnimationFrame(resetFoodScroll));
  };
  const foodScreen=$('#foodScreen');
  if(foodScreen){
    const obs=new MutationObserver(()=>{
      if(!foodScreen.classList.contains('hidden')) resetFoodScroll();
    });
    obs.observe(foodScreen,{attributes:true,attributeFilter:['class']});
  }

  /* 2) Clear buttons for exercise pickers. */
  function addSearchClear(inputId,buttonId,clearFn){
    const input=$('#'+inputId); if(!input)return;
    if($('#'+buttonId))return;
    const parent=input.parentElement;
    if(!parent)return;
    parent.style.position='relative';
    const btn=document.createElement('button');
    btn.id=buttonId; btn.type='button'; btn.className='v65-search-clear'; btn.textContent='×';
    btn.setAttribute('aria-label','Очистить поиск');
    btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();clearFn();});
    parent.appendChild(btn);
    input.style.paddingRight='46px';
    const sync=()=>btn.classList.toggle('hidden',!String(input.value||'').trim());
    input.addEventListener('input',sync); sync();
  }
  function clearProgramSearch(){const input=$('#exercisePickerSearch');if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}}
  function clearProgressSearch(){const input=$('#progressExercisePickerSearch');if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}}
  addSearchClear('exercisePickerSearch','v65ProgramSearchClear',clearProgramSearch);
  addSearchClear('progressExercisePickerSearch','v65ProgressSearchClear',clearProgressSearch);

  /* 3) Progress picker: count is next to the exercise name; selected card only gets a list affordance. */
  function progressNames(){
    if(typeof window.getProgressExerciseNames==='function')return window.getProgressExerciseNames();
    return [];
  }
  function renderProgressPickerV65(){
    const list=$('#progressPickerList'), input=$('#progressExercisePickerSearch');
    if(!list)return;
    const q=String(input?.value||'').trim().toLocaleLowerCase('ru');
    const current=window.progressSelectedExercise||'';
    const names=progressNames().filter(n=>!q||String(n).toLocaleLowerCase('ru').includes(q));
    if(!names.length){list.innerHTML='<div style="padding:22px;text-align:center;color:var(--subtext);">Упражнений с сохранёнными данными не найдено</div>';return;}
    list.innerHTML=names.map((name,i)=>{
      const rows=typeof window.getExerciseSeries==='function' ? (window.getExerciseSeries(name,window.getHistoryInPeriod?window.getHistoryInPeriod('all'):[])||[]) : [];
      const count=rows.length;
      const safe=typeof window.progressEsc==='function'?window.progressEsc(name):String(name).replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
      return `<button type="button" class="progress-picker-row ${name===current?'selected':''}" data-v65-progress-index="${i}">
        <span class="progress-picker-row-main"><strong>${safe}</strong></span>
        <span class="progress-picker-row-count" aria-label="${count} тренировок">${count}</span>
        <span class="progress-picker-row-mark">›</span>
      </button>`;
    }).join('');
    $$('.progress-picker-row[data-v65-progress-index]',list).forEach((btn,index)=>btn.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      const now=progressNames().filter(n=>!q||String(n).toLocaleLowerCase('ru').includes(q));
      if(now[index] && typeof window.chooseProgressExercise==='function')window.chooseProgressExercise(now[index]);
    },{passive:false}));
  }
  window.renderProgressExercisePicker=renderProgressPickerV65;

  function patchSelectedProgressV65(){
    const root=$('#progressContent');if(!root)return;
    const selected=$('.progress-selected-exercise',root);if(!selected)return;
    let old=$('.progress-list-indicator',selected);if(old)old.remove();
    const icon=document.createElement('span');icon.className='progress-list-indicator';icon.textContent='☷';icon.setAttribute('aria-hidden','true');icon.title='Открыть список упражнений';
    selected.appendChild(icon);
  }
  const oldDash=window.renderProgressDashboard;
  if(typeof oldDash==='function'){
    window.renderProgressDashboard=function(){oldDash.apply(this,arguments);requestAnimationFrame(patchSelectedProgressV65);};
  }

  /* Exercise directory has one neutral visual model; no origin badge is rendered. */

  /* 5) Make search clear buttons and list affordances visually consistent. */
  const style=document.createElement('style');
  style.id='v65-ui-polish';
  style.textContent=`
    .v65-search-clear{position:absolute!important;right:7px!important;top:50%!important;transform:translateY(-50%)!important;width:30px!important;height:30px!important;min-width:30px!important;padding:0!important;margin:0!important;border:0!important;border-radius:50%!important;background:rgba(255,255,255,.08)!important;color:var(--subtext)!important;font-size:20px!important;line-height:30px!important;text-align:center!important;z-index:20!important;display:flex!important;align-items:center!important;justify-content:center!important;}
    .v65-search-clear.hidden{display:none!important;}
    #progressExercisePickerModal .progress-picker-row{display:grid!important;grid-template-columns:minmax(0,1fr) 34px 22px!important;align-items:center!important;gap:10px!important;min-height:54px!important;}
    #progressExercisePickerModal .progress-picker-row-main{min-width:0!important;}
    #progressExercisePickerModal .progress-picker-row-main strong{display:block!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}
    #progressExercisePickerModal .progress-picker-row-count{width:30px!important;height:30px!important;min-width:30px!important;border-radius:50%!important;display:flex!important;align-items:center!important;justify-content:center!important;background:var(--input-bg)!important;border:1px solid var(--border)!important;color:var(--text)!important;font-size:12px!important;font-weight:900!important;}
    #progressExercisePickerModal .progress-picker-row-mark{justify-self:end!important;}
    #progressScreen .progress-selected-exercise{position:relative!important;padding-right:48px!important;}
    #progressScreen .progress-list-indicator{position:absolute!important;right:12px!important;top:50%!important;transform:translateY(-50%)!important;width:30px!important;height:30px!important;border-radius:9px!important;display:flex!important;align-items:center!important;justify-content:center!important;background:var(--input-bg)!important;border:1px solid var(--border)!important;color:var(--button-green)!important;font-size:17px!important;font-weight:900!important;pointer-events:none!important;}
    .directory-manual-pencil{display:inline-flex!important;align-items:center!important;justify-content:center!important;margin-left:8px!important;width:24px!important;height:24px!important;border-radius:7px!important;background:rgba(102,210,102,.10)!important;color:var(--button-green)!important;font-size:13px!important;font-weight:900!important;vertical-align:middle!important;flex:0 0 24px!important;}
    #foodScreen .food-main-tabs{margin-top:0!important;scroll-margin-top:0!important;position:relative!important;z-index:1!important;}
  `;
  document.head.appendChild(style);

  /* Re-run after any screen render. */
  document.addEventListener('click',()=>{
    requestAnimationFrame(()=>{try{patchSelectedProgressV65();}catch(e){}});
  },true);
})();



(function(){
'use strict';

/*
  FTracker v91 — ONE exercise model.

  Rules:
  1. There is one exercise directory. Origin does not matter.
  2. Directory = built-in app exercises + saved directory entries +
     exercises used in programs/history.
  3. Editing is available only from the directory.
  4. Workout opens a read-only card. No edit action is rendered there.
  5. Built-in and user media belong to the same exercise card.
  6. Editor changes are draft-only until Save.
  7. New user media is deleted from IndexedDB if the editor is cancelled.
  8. Existing media is deleted from IndexedDB only after Save.
*/

const MEDIA_DB = 'FTrackerExerciseMediaV1';
const MEDIA_STORE = 'media';
window.__FTRACKER_MEDIA_DB = MEDIA_DB;
window.__FTRACKER_MEDIA_STORE = MEDIA_STORE;
let mediaDbPromise = null;
let exerciseDraft = null;
let exerciseDirty = false;

const esc = v => typeof escapeHtml === 'function'
  ? escapeHtml(String(v ?? ''))
  : String(v ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const exKey = v => typeof normalizeExerciseKey === 'function'
  ? normalizeExerciseKey(String(v ?? ''))
  : String(v ?? '').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,'');

const guideLines = value => {
  if(Array.isArray(value)) return value.map(v=>String(v??'').trim()).filter(Boolean);
  return String(value??'').split(/\n+/).map(v=>v.trim()).filter(Boolean);
};
const cloneGuide = g => {
  const x = g && typeof g === 'object' ? g : {};
  const mistakes = guideLines(x.mistakes);
  const recommendations = guideLines(x.recommendations);
  return {
    steps: Array.isArray(x.steps) ? x.steps.map(v=>String(v??'').trim()).filter(Boolean) :
      guideLines(x.execution),
    execution: String(x.execution || ''),
    primary: Array.isArray(x.primary) ? x.primary.slice() :
      (Array.isArray(x.muscles) ? x.muscles.slice() : []),
    secondary: Array.isArray(x.secondary) ? x.secondary.slice() : [],
    muscles: Array.isArray(x.muscles) ? x.muscles.slice() :
      (Array.isArray(x.primary) ? x.primary.slice() : []),
    mistakes,
    recommendations,
    media: Array.isArray(x.media) ? x.media.map(v=>({...v})).filter(v=>v && v.id) : [],
    remoteMedia: Array.isArray(x.remoteMedia) ? x.remoteMedia.map(v=>({...v})).filter(v=>v && v.src) : [],
    hiddenBuiltinIndexes: Array.isArray(x.hiddenBuiltinIndexes)
      ? x.hiddenBuiltinIndexes.map(Number).filter(Number.isInteger)
      : []
  };
};

const emptyGuide = () => ({
  steps: [], execution: '', primary: [], secondary: [], muscles: [],
  remoteMedia: [],
  mistakes: [], recommendations: [], media: [], hiddenBuiltinIndexes: []
});

function findDirectoryEntry(name){
  return Array.isArray(data?.exerciseDirectory)
    ? data.exerciseDirectory.find(e => exKey(e?.name) === exKey(name)) || null
    : null;
}

function getExerciseViewRecord(name,type='strength'){
  const raw=String(name||'').trim().replace(/\s+/g,' ');
  const entry=findDirectoryEntry(raw);
  if(entry){
    return {
      name:String(entry.name||raw).trim().replace(/\s+/g,' '),
      type:entry.type||type||'strength',
      group:entry.group||inferExerciseGroup(entry.name||raw,entry.type||type||'strength'),
      entry
    };
  }
  return {
    name:raw,
    type:type||'strength',
    group:inferExerciseGroup(raw,type||'strength'),
    entry:null
  };
}

/* Preserve the original built-in identity even if the user later renames the exercise. */
function builtInGuideFor(entryOrName){
  const e = typeof entryOrName === 'object' ? entryOrName : findDirectoryEntry(entryOrName);
  const builtinName = e?.builtinName || (typeof entryOrName === 'string' ? entryOrName : e?.name);
  if(typeof findExerciseGuide !== 'function' || !builtinName) return null;
  return findExerciseGuide(builtinName) || null;
}

function baseGuide(name,type,entryObj=null){
  const g = builtInGuideFor(entryObj || name);
  if(g){
    const steps = Array.isArray(g.steps) ? g.steps.slice() : [];
    return {
      ...emptyGuide(),
      steps,
      execution: steps.join('\n'),
      primary: Array.isArray(g.primary) ? g.primary.slice() : [],
      secondary: Array.isArray(g.secondary) ? g.secondary.slice() : [],
      muscles: Array.isArray(g.primary) ? g.primary.slice() : [],
      mistakes: Array.isArray(g.mistakes) ? g.mistakes.slice() : [],
      recommendations: guideLines(g.recommendations),
      remoteMedia: Array.isArray(g.remoteMedia) ? g.remoteMedia.map(v=>({...v})) : []
    };
  }

  const group = entryObj?.group ||
    findDirectoryEntry(name)?.group ||
    (typeof inferExerciseGroup === 'function'
      ? inferExerciseGroup(name,type || 'strength')
      : 'Другое');

  const gm = {
    'Грудь':['chest',['delts_front','triceps']],
    'Бицепс':['biceps',['forearms']],
    'Спина':['lats',['biceps','traps']],
    'Трицепс':['triceps',['delts_front']],
    'Плечи':['delts',['traps','triceps']],
    'Ноги':['quads',['glutes','hamstrings']],
    'Пресс':['abs',['obliques']],
    'Кардио':['cardio',[]]
  }[group];

  return {
    ...emptyGuide(),
    primary: gm ? [gm[0]] : [],
    secondary: gm ? gm[1] : []
  };
}

function ensureExercise(name,type='strength',group=null){
  const clean = canonicalExerciseName(String(name || '').trim().replace(/\s+/g,' '));
  if(!clean) return null;

  if(!Array.isArray(data.exerciseDirectory)) data.exerciseDirectory = [];

  let e = findDirectoryEntry(clean);

  if(!e){
    e = {
      name: clean,
      type: type || 'strength',
      group: group || (typeof inferExerciseGroup === 'function'
        ? inferExerciseGroup(clean,type || 'strength') : 'Другое'),
      guide: emptyGuide()
    };
    const bg = typeof findExerciseGuide === 'function' ? findExerciseGuide(clean) : null;
    if(bg) e.builtinName = clean;
    data.exerciseDirectory.push(e);
  } else {
    e.type = e.type || type || 'strength';
    e.group = e.group || group ||
      (typeof inferExerciseGroup === 'function'
        ? inferExerciseGroup(clean,e.type) : 'Другое');

    /* Legacy data migration: remove all exercise-origin flags. */
    ['manualBlank','createdManually','userCreated','origin',
     '__universalEditable','__builtInSnapshot','__builtInImg',
     '__hideBuiltInMedia'].forEach(k=>{ if(k in e) delete e[k]; });

    if(!e.builtinName && typeof findExerciseGuide === 'function' && findExerciseGuide(clean)){
      e.builtinName = clean;
    }
    e.guide = cloneGuide(e.guide);
  }
  return e;
}

function resolvedGuide(name,type,e){
  const base = baseGuide(name,type,e);
  const custom = cloneGuide(e?.guide);
  return {
    ...base,
    ...custom,
    steps: custom.steps.length ? custom.steps : base.steps,
    execution: custom.execution || custom.steps.join('\n') || base.execution,
    primary: custom.primary.length ? custom.primary : base.primary,
    muscles: custom.muscles.length ? custom.muscles : custom.primary.length ? custom.primary : base.muscles,
    secondary: custom.secondary.length ? custom.secondary : base.secondary,
    mistakes: custom.mistakes.length ? custom.mistakes : base.mistakes,
    recommendations: custom.recommendations.length ? custom.recommendations : (base.recommendations||[])
  };
}

/* ---------- Media storage ---------- */
function openMediaDB(){
  if(mediaDbPromise) return mediaDbPromise;
  mediaDbPromise = new Promise((resolve,reject)=>{
    if(!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const r = indexedDB.open(MEDIA_DB,1);
    r.onupgradeneeded = () => {
      if(!r.result.objectStoreNames.contains(MEDIA_STORE))
        r.result.createObjectStore(MEDIA_STORE,{keyPath:'id'});
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return mediaDbPromise;
}

async function putMedia(id,blob,type,name){
  const db = await openMediaDB();
  await new Promise((resolve,reject)=>{
    const tx = db.transaction(MEDIA_STORE,'readwrite');
    tx.objectStore(MEDIA_STORE).put({id,blob,type,name,createdAt:Date.now()});
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getMedia(id){
  try{
    const db = await openMediaDB();
    return await new Promise((resolve,reject)=>{
      const r = db.transaction(MEDIA_STORE,'readonly').objectStore(MEDIA_STORE).get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  }catch(e){ return null; }
}

async function deleteMedia(id){
  try{
    const db = await openMediaDB();
    await new Promise((resolve,reject)=>{
      const tx = db.transaction(MEDIA_STORE,'readwrite');
      tx.objectStore(MEDIA_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }catch(e){}
}

async function purgeLegacyDipMedia(){
  try{
    const names = new Set([
      normalizeExerciseKey('Отжимания на брусьях в тренажере'),
      normalizeExerciseKey('Отжимания на брусьях в Гравитроне')
    ]);
    let changed=false;
    for(const e of (data.exerciseDirectory||[])){
      if(!names.has(normalizeExerciseKey(e?.name))) continue;
      const media=Array.isArray(e?.guide?.media)?e.guide.media.slice():[];
      if(!media.length) continue;
      for(const m of media) if(m?.id) await deleteMedia(m.id);
      e.guide=cloneGuide(e.guide);
      e.guide.media=[];
      changed=true;
    }
    if(changed){
      localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
      try{ await createAutoBackup('Очистка старых изображений брусьев'); }catch(e){}
      if(typeof renderAll==='function') renderAll();
    }
  }catch(e){ console.warn('Legacy dip media cleanup skipped',e); }
}

purgeLegacyDipMedia();

const mediaType = file => {
  const t = String(file?.type || '').toLowerCase();
  const n = String(file?.name || '').toLowerCase();
  if(t.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(n)) return 'video';
  if(t.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(n)) return 'image';
  return null;
};

const mediaId = () =>
  `exm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;

async function optimizeImage(file){
  /* GIF stays GIF so animation is never destroyed. */
  if(!file || mediaType(file)!=='image' || /gif$/i.test(file.type || '') || /\.gif$/i.test(file.name || ''))
    return file;

  try{
    const bitmap = await createImageBitmap(file);
    const MAX = 1600;
    const scale = Math.min(1,MAX/Math.max(bitmap.width,bitmap.height));
    const w = Math.max(1,Math.round(bitmap.width*scale));
    const h = Math.max(1,Math.round(bitmap.height*scale));
    if(scale===1 && file.size <= 900*1024) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d',{alpha:true});
    ctx.drawImage(bitmap,0,0,w,h);
    bitmap.close?.();

    let blob = await new Promise(r=>canvas.toBlob(r,'image/webp',0.82));
    if(!blob || blob.size>=file.size){
      blob = await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.84));
    }
    if(!blob || blob.size>=file.size) return file;
    return new File([blob],(file.name||'image')+'.webp',{type:blob.type||'image/webp'});
  }catch(e){
    return file;
  }
}

async function mediaMarkup(item){
  const r = await getMedia(item.id);
  if(!r) return '<div class="exercise-card-empty">Файл недоступен</div>';
  const url = URL.createObjectURL(r.blob);
  if(item.type==='video')
    return `<video class="exercise-media-view" src="${url}" controls playsinline preload="metadata"></video>`;
  return `<img class="exercise-media-view" src="${url}" alt="${esc(item.name||'Медиа')}" loading="lazy" decoding="async">`;
}

/* Built-in frames are resolved through the exercise's stable builtInName. */
function builtInFrames(name,type,g,e){
  const source = builtInGuideFor(e || name);
  if(!source?.img || !Array.isArray(EXERCISE_IMGS?.[source.img])) return [];
  const hidden = new Set((g?.hiddenBuiltinIndexes || []).map(Number));
  return EXERCISE_IMGS[source.img]
    .map((src,index)=>({src,index}))
    .filter(x=>!hidden.has(x.index));
}

function ensureTechniqueModal(){
  let m = document.getElementById('techniqueModal');
  if(!m){
    m=document.createElement('div');
    m.id='techniqueModal';
    m.className='technique-modal hidden';
    m.onclick=e=>{ if(e.target===m) window.closeTechniqueModal?.(); };
    document.body.appendChild(m);
  }
  /* The exercise card is a full-screen app surface, not a compact stack modal. */
  m.classList.remove('modal-stack-root','modal-stack-content');
  const existingContent = m.firstElementChild;
  existingContent?.classList.remove('modal-stack-content');
  /* Exercise Card is intentionally outside Modal Stack: do not lock/fix <body>. */
  m.classList.remove('hidden');
  m.style.pointerEvents='auto';
  m.setAttribute('aria-hidden','false');
  return m;
}

function muscleNames(list){
  return (list||[])
    .map(k=>(typeof MUSCLE_LABELS!=='undefined'?MUSCLE_LABELS[k]:k)||k)
    .filter(Boolean);
}

async function renderExerciseMedia(root,name,type,g,e){
  if(!root) return;
  root.innerHTML='';
  const built = builtInFrames(name,type,g,e);
  const custom = Array.isArray(g.media) ? g.media : [];
  const remote = Array.isArray(g.remoteMedia) ? g.remoteMedia : [];
  if(!built.length && !custom.length && !remote.length) return;

  const box=document.createElement('div');
  box.className='exercise-media-gallery';

  built.forEach(f=>{
    const d=document.createElement('div');
    d.className='exercise-media-item';
    d.innerHTML=`<img class="exercise-media-view" src="${f.src}" alt="${esc(name)} — иллюстрация ${f.index+1}" loading="lazy" decoding="async">`;
    box.appendChild(d);
  });

  for(const m of remote){
    const d=document.createElement('div');
    d.className='exercise-media-item';
    d.innerHTML=`<img class="exercise-media-view" src="${esc(m.src)}" alt="${esc(name)} — иллюстрация" loading="lazy" decoding="async">${m.credit?`<div style="font-size:10px;color:var(--subtext);padding:4px 7px;text-align:center">${esc(m.credit)}</div>`:''}`;
    box.appendChild(d);
  }
  for(const m of custom){
    const d=document.createElement('div');
    d.className='exercise-media-item';
    d.innerHTML=await mediaMarkup(m);
    box.appendChild(d);
  }
  root.appendChild(box);
}

function renderExerciseCard(name,type,mode='view'){
  const record=getExerciseViewRecord(name,type);
  if(!record.name) return null;
  const e=record.entry || {
    name:record.name,
    type:record.type,
    group:record.group,
    guide:emptyGuide()
  };
  const g=resolvedGuide(record.name,record.type,e);
  const m=ensureTechniqueModal();
  const p=muscleNames(g.primary).join(' · ');
  const s=muscleNames(g.secondary).join(' · ');
  const steps=g.steps||[], bad=g.mistakes||[];
  const rec=Array.isArray(g.recommendations)?g.recommendations.filter(Boolean):[];

  // Редактирование из карточки убрано: в справочнике уже есть кнопка-карандаш.

  m.innerHTML=`
    <div class="technique-modal-content exercise-card-unified">
      <div class="unified-surface-header ft-modal-header exercise-card-header">
        <button type="button" class="surface-back-btn" onclick="closeTechniqueModal()" aria-label="Назад">← Назад</button>
        <div class="surface-title exercise-name-header-title">${esc(e.name)}</div>
        <span class="surface-header-spacer" aria-hidden="true"></span>
      </div>

      <div class="tabs technique-tabs exercise-card-tabs">
        <div class="tab active" data-tab="exerciseViewExec" onclick="switchTechniqueTab('exerciseViewExec')">Выполнение</div>
        <div class="tab" data-tab="exerciseViewMuscles" onclick="switchTechniqueTab('exerciseViewMuscles')">Мышцы</div>
        <div class="tab" data-tab="exerciseViewTips" onclick="switchTechniqueTab('exerciseViewTips')">Советы</div>
      </div>

      <div class="tab-content active" id="exerciseViewExec">
        <div class="exercise-card-media-wrap">
          <div class="exercise-card-section-title">ФОТО И АНИМАЦИЯ</div>
          <div id="exerciseUnifiedMedia"></div>
        </div>
        <div class="exercise-card-panel">
          <div class="exercise-card-section-title">ТЕХНИКА ВЫПОЛНЕНИЯ</div>
          ${steps.length
            ? `<ol class="exercise-card-steps">${steps.map((x,i)=>`<li><span class="exercise-step-badge">${i+1}</span><span>${esc(x)}</span></li>`).join('')}</ol>`
            : '<div class="exercise-card-empty">Техника пока не добавлена.</div>'}
        </div>
      </div>

      <div class="tab-content" id="exerciseViewMuscles">
        <div class="exercise-card-panel">
          <div class="exercise-card-section-title">ЗАДЕЙСТВОВАННЫЕ МЫШЦЫ</div>
          ${(g.primary.length||g.secondary.length)&&typeof buildMuscleMapSVG==='function'
            ? `<div class="exercise-card-muscles">
                <div class="exercise-card-muscle-map">${buildMuscleMapSVG(g.primary,g.secondary)}</div>
                <div class="exercise-card-muscle-chips">
                  ${g.primary.length ? `<div class="exercise-muscle-label">Основные</div><div class="exercise-chip-row">${g.primary.map(k=>`<span class="exercise-chip exercise-chip-primary">${esc(MUSCLE_LABELS?.[k]||k)}</span>`).join('')}</div>`:''}
                  ${g.secondary.length ? `<div class="exercise-muscle-label">Дополнительно</div><div class="exercise-chip-row">${g.secondary.map(k=>`<span class="exercise-chip">${esc(MUSCLE_LABELS?.[k]||k)}</span>`).join('')}</div>`:''}
                </div>
              </div>`
            : '<div class="exercise-card-empty">Мышцы пока не указаны.</div>'}
        </div>
      </div>

      <div class="tab-content" id="exerciseViewTips">
        <div class="exercise-card-panel">
          ${bad.length
            ? `<div class="exercise-card-section-title">ТИПИЧНЫЕ ОШИБКИ</div><ul class="exercise-card-mistakes-list">${bad.map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul>`
            : ''}
          ${rec.length
            ? `<div class="exercise-card-section-title">РЕКОМЕНДАЦИИ</div><ul class="exercise-card-recommendations-list">${rec.map(x=>`<li><span>${esc(x)}</span></li>`).join('')}</ul>`
            : ''}
          ${!bad.length&&!rec.length ? '<div class="exercise-card-empty">Советы пока не добавлены.</div>' : ''}
        </div>
      </div>

    </div>`;

  /* Technique surface must not enter Modal Stack or lock <body>. */
  m.classList.remove('hidden');
  renderExerciseMedia(document.getElementById('exerciseUnifiedMedia'),e.name,e.type,g,e);
  return m;
}

function editorMarkup(d){
  const g=d.guide;
  const steps=g.steps.length?g.steps:[''];
  const bad = guideLines(g?.mistakes);
  const rec = guideLines(g?.recommendations).length
    ? guideLines(g?.recommendations)
    : guideLines(g?.recommendation || g?.recs);
  const frames=builtInFrames(d.name,d.type,g,d.entry);
  const opts=(selected,role)=>Object.keys(typeof MUSCLE_LABELS!=='undefined'?MUSCLE_LABELS:{})
    .filter(k=>k!=='cardio')
    .map(k=>`<button type="button" class="exercise-muscle-option ${(selected||[]).includes(k)?'active':''}" data-role="${role}" data-key="${esc(k)}" onclick="toggleExerciseMuscle(this)">${esc(MUSCLE_LABELS[k]||k)}</button>`)
    .join('');

  const row=(value,cls,placeholder,i,kind)=>{
    const advice = kind==='bad' || kind==='rec';
    return `<div class="exercise-editor-row ${advice?'exercise-editor-advice-row':''}">
      <span class="exercise-editor-num ${advice?'exercise-editor-advice-marker':''}">${advice?'×':i+1}</span>
      <textarea class="${cls}" rows="1" placeholder="${placeholder}" oninput="exerciseEditorAutosize(this)">${esc(value)}</textarea>
      <button type="button" class="exercise-editor-remove" onclick="removeExerciseEditorRow(this)">×</button>
    </div>`;
  };

  const built = frames.map(f=>`
    <div class="exercise-editor-built-item" data-index="${f.index}">
      <img src="${f.src}" alt="${esc(d.name)} — встроенная иллюстрация ${f.index+1}">
      <button type="button" class="exercise-editor-built-delete" data-built-delete="${f.index}" aria-label="Удалить встроенное фото">×</button>
    </div>`).join('');

  return `
    <div class="technique-modal-content exercise-editor-unified">
      <div class="unified-surface-header ft-modal-header exercise-editor-header">
        <button type="button" class="surface-back-btn" onclick="closeExerciseEditor()" aria-label="Назад">← Назад</button>
        <div class="surface-title">${esc(d.name)}</div>
        <span class="surface-header-spacer" aria-hidden="true"></span>
      </div>
      <div class="technique-group">${esc(d.group)}</div>

      <div class="tabs technique-tabs">
        <div class="tab active" data-tab="exerciseEditExec" onclick="switchTechniqueTab('exerciseEditExec')">Выполнение</div>
        <div class="tab" data-tab="exerciseEditMuscles" onclick="switchTechniqueTab('exerciseEditMuscles')">Мышцы</div>
        <div class="tab" data-tab="exerciseEditTips" onclick="switchTechniqueTab('exerciseEditTips')">Советы</div>
      </div>

      <div class="tab-content active" id="exerciseEditExec">
        <div class="exercise-editor-section-title">ТЕХНИКА ВЫПОЛНЕНИЯ</div>
        <div id="exerciseStepsList">${steps.map((v,i)=>row(v,'exercise-step-input','Описание пункта',i,'step')).join('')}</div>
        <button type="button" class="exercise-editor-add" onclick="addExerciseEditorRow('step')">＋ Добавить пункт</button>

        <div class="exercise-editor-media-box">
          <div class="exercise-editor-section-title">ФОТО И АНИМАЦИЯ</div>
          <div class="exercise-editor-note">Все материалы принадлежат этому упражнению. Изменения вступают в силу только после сохранения.</div>
          ${built ? `<div class="exercise-editor-built-list">${built}</div>` : ''}
          <input id="exerciseMediaInput" type="file" accept="image/*,video/*" multiple hidden>
          <button type="button" class="exercise-editor-add" onclick="document.getElementById('exerciseMediaInput')?.click()">＋ Добавить фото / анимацию</button>
          <div id="exerciseMediaList"></div>
        </div>
      </div>

      <div class="tab-content" id="exerciseEditMuscles">
        <div class="exercise-editor-section-title">МЫШЦЫ</div>
        <div class="exercise-muscle-grid">
          <div><div class="exercise-editor-note">Основные</div><div class="exercise-muscle-options">${opts(g.primary,'primary')}</div></div>
          <div><div class="exercise-editor-note">Дополнительно</div><div class="exercise-muscle-options">${opts(g.secondary,'secondary')}</div></div>
          <div class="exercise-muscle-preview">${typeof buildMuscleMapSVG==='function'?buildMuscleMapSVG(g.primary,g.secondary):''}</div>
        </div>
      </div>

      <div class="tab-content" id="exerciseEditTips">
        <div class="exercise-editor-section-title">ЧАСТЫЕ ОШИБКИ</div>
        <div id="exerciseMistakesList">${bad.map((v,i)=>row(v,'exercise-mistake-input','Описание ошибки',i,'bad')).join('')}</div>
        <button type="button" class="exercise-editor-add" onclick="addExerciseEditorRow('bad')">＋ Добавить ошибку</button>
        <div class="exercise-editor-section-title">РЕКОМЕНДАЦИИ</div>
        <div id="exerciseRecommendationsList">${rec.map((v,i)=>row(v,'exercise-recommendation-input','Полезная рекомендация',i,'rec')).join('')}</div>
        <button type="button" class="exercise-editor-add" onclick="addExerciseEditorRow('rec')">＋ Добавить рекомендацию</button>
      </div>

      <button type="button" class="exercise-save-btn" onclick="saveExerciseEditor()">Сохранить изменения</button>
    </div>`;
}

async function renderEditorMedia(){
  const root=document.getElementById('exerciseMediaList');
  if(!root || !exerciseDraft) return;
  const list=exerciseDraft.guide.media||[];
  if(!list.length){
    root.innerHTML='<div class="exercise-editor-empty">Пока нет добавленных материалов.</div>';
    return;
  }
  root.innerHTML='';
  for(let i=0;i<list.length;i++){
    const item=list[i], row=document.createElement('div');
    row.className='exercise-editor-media-row';
    row.dataset.id=item.id;
    row.innerHTML=`
      <div class="exercise-editor-media-preview"></div>
      <div class="exercise-editor-media-info"><b>${esc(item.name||'Материал')}</b><small>${item.type==='video'?'Видео':'Фото / GIF'} · ${i+1}</small></div>
      <div class="exercise-editor-media-actions">
        <button type="button" data-up ${i?'':'disabled'}>↑</button>
        <button type="button" data-down ${i===list.length-1?'disabled':''}>↓</button>
        <button type="button" data-delete aria-label="Удалить материал">×</button>
      </div>`;
    root.appendChild(row);
    row.querySelector('.exercise-editor-media-preview').innerHTML=await mediaMarkup(item);
  }

  root.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=()=>{
    const row=btn.closest('.exercise-editor-media-row');
    const i=exerciseDraft.guide.media.findIndex(x=>x.id===row?.dataset.id);
    if(i<0) return;
    const id=exerciseDraft.guide.media[i].id;
    if(!exerciseDraft.pendingDelete.includes(id)) exerciseDraft.pendingDelete.push(id);
    exerciseDraft.guide.media.splice(i,1);
    exerciseDirty=true;
    renderEditorMedia();
  });

  root.querySelectorAll('[data-up]').forEach(btn=>btn.onclick=()=>{
    const row=btn.closest('.exercise-editor-media-row');
    const i=exerciseDraft.guide.media.findIndex(x=>x.id===row?.dataset.id);
    if(i>0){
      [exerciseDraft.guide.media[i-1],exerciseDraft.guide.media[i]] =
      [exerciseDraft.guide.media[i],exerciseDraft.guide.media[i-1]];
      exerciseDirty=true; renderEditorMedia();
    }
  });

  root.querySelectorAll('[data-down]').forEach(btn=>btn.onclick=()=>{
    const row=btn.closest('.exercise-editor-media-row');
    const i=exerciseDraft.guide.media.findIndex(x=>x.id===row?.dataset.id);
    if(i>=0 && i<exerciseDraft.guide.media.length-1){
      [exerciseDraft.guide.media[i+1],exerciseDraft.guide.media[i]] =
      [exerciseDraft.guide.media[i],exerciseDraft.guide.media[i+1]];
      exerciseDirty=true; renderEditorMedia();
    }
  });
}

async function addExerciseFiles(files){
  if(!exerciseDraft) return;
  const valid=Array.from(files||[]).filter(mediaType);
  const free=4-exerciseDraft.guide.media.length;
  if(free<=0){showToast('Можно добавить максимум 4 материала');return;}

  for(const original of valid.slice(0,free)){
    const type=mediaType(original);
    const file=type==='image' ? await optimizeImage(original) : original;
    const mediaKey=mediaId();
    await putMedia(mediaKey,file,type,original.name);
    exerciseDraft.guide.media.push({id:mediaKey,type,name:original.name});
    exerciseDraft.newMedia.push(mediaKey);
  }
  exerciseDirty=true;
  const input=document.getElementById('exerciseMediaInput');
  if(input) input.value='';
  await renderEditorMedia();
}

function collectEditorValues(){
  if(!exerciseDraft) return;
  const g=exerciseDraft.guide;
  g.steps=[...document.querySelectorAll('.exercise-step-input')].map(x=>String(x.value||'').trim()).filter(Boolean);
  g.execution=g.steps.join('\n');
  g.mistakes=[...document.querySelectorAll('.exercise-mistake-input')].map(x=>String(x.value||'').trim()).filter(Boolean);
  g.recommendations=[...document.querySelectorAll('.exercise-recommendation-input')].map(x=>String(x.value||'').trim()).filter(Boolean);
  g.primary=[...document.querySelectorAll('#exerciseEditMuscles [data-role="primary"].active')].map(x=>x.dataset.key);
  g.secondary=[...document.querySelectorAll('#exerciseEditMuscles [data-role="secondary"].active')].map(x=>x.dataset.key).filter(k=>!g.primary.includes(k));
  g.muscles=g.primary.slice();
}

window.openExerciseEditor=function(name,type){
  const cleanName = String(name||'').trim().replace(/\s+/g,' ');
  if(!cleanName) return;

  // Do NOT call ensureExercise() here. Opening the editor is read-only with
  // respect to persistent application data. A new directory record is created
  // only by Save.
  const e = findDirectoryEntry(cleanName);
  const effectiveType = e?.type || type || 'strength';
  const effectiveGroup = e?.group ||
    (typeof inferExerciseGroup==='function'
      ? inferExerciseGroup(cleanName,effectiveType) : 'Другое');

  exerciseDraft={
    name:e?.name || cleanName,
    type:effectiveType,
    group:effectiveGroup,
    entry:e || null,
    guide:resolvedGuide(e?.name || cleanName,effectiveType,e || {name:cleanName,type:effectiveType,group:effectiveGroup,guide:emptyGuide()}),
    newMedia:[],pendingDelete:[]
  };
  exerciseDirty=false;

  const m=ensureTechniqueModal();
  m.innerHTML=editorMarkup(exerciseDraft);
  ensureUnifiedModalHeader(m);
  /* Technique editor uses the same isolated surface; never lock <body>. */
  m.classList.remove('hidden');

  requestAnimationFrame(()=>{
    window.autosizeExerciseEditorTextareas(m);
    requestAnimationFrame(()=>autosizeExerciseEditorTextareas(m));
  });

  const input=document.getElementById('exerciseMediaInput');
  if(input) input.addEventListener('change',e=>addExerciseFiles(e.target.files));

  m.querySelectorAll('[data-built-delete]').forEach(btn=>{
    btn.onclick=()=>{
      if(!exerciseDraft) return;
      const index=Number(btn.dataset.builtDelete);
      const set=new Set(exerciseDraft.guide.hiddenBuiltinIndexes||[]);
      set.add(index);
      exerciseDraft.guide.hiddenBuiltinIndexes=[...set];
      exerciseDirty=true;
      btn.closest('.exercise-editor-built-item')?.remove();
    };
  });

  renderEditorMedia();
};

window.closeExerciseEditor=async function(){
  if(!exerciseDraft){
    closeTechniqueModal?.();
    return;
  }

  if(exerciseDirty){
    const ok=await window.showSystemConfirm('Есть несохранённые изменения. Выйти без сохранения?', 'Выйти без сохранения?');
    if(!ok) return;
  }

  /* Only newly added files are provisional. Existing files stay untouched. */
  for(const id of exerciseDraft.newMedia) await deleteMedia(id);

  exerciseDraft=null;
  exerciseDirty=false;
  closeTechniqueModal?.();
};

window.saveExerciseEditor=async function(){
  if(!exerciseDraft || exerciseDraft.saving) return;
  exerciseDraft.saving=true;

  try{
    collectEditorValues();

    /* Create/update the persistent directory record only on Save. */
    const e=ensureExercise(exerciseDraft.name,exerciseDraft.type,exerciseDraft.group);
    e.guide=cloneGuide(exerciseDraft.guide);
    if(exerciseDraft.entry?.builtinName) e.builtinName=exerciseDraft.entry.builtinName;
    else if(e.builtinName) e.builtinName=e.builtinName;

    /* Physical deletion happens only after the user explicitly pressed Save. */
    for(const id of exerciseDraft.pendingDelete) await deleteMedia(id);

    /* Files added and then removed before Save are provisional. */
    for(const id of exerciseDraft.newMedia){
      if(!e.guide.media.some(m=>m.id===id)) await deleteMedia(id);
    }

    saveData();

    /* Close FIRST. Never render another technique card over the editor. */
    const savedName=e.name;
    exerciseDraft=null;
    exerciseDirty=false;
    closeTechniqueModal();

    /* Refresh only the directory behind the closed modal. */
    if(typeof renderExerciseDirectory==='function') renderExerciseDirectory();

    showToast('Карточка упражнения сохранена');
    return savedName;
  }catch(err){
    console.error('saveExerciseEditor failed',err);
    if(exerciseDraft) exerciseDraft.saving=false;
    showToast('Не удалось сохранить изменения');
  }
};

window.toggleExerciseMuscle=function(btn){
  btn.classList.toggle('active');
  exerciseDirty=true;
  const primary=[...document.querySelectorAll('#exerciseEditMuscles [data-role="primary"].active')].map(x=>x.dataset.key);
  const secondary=[...document.querySelectorAll('#exerciseEditMuscles [data-role="secondary"].active')].map(x=>x.dataset.key).filter(k=>!primary.includes(k));
  const map=document.querySelector('.exercise-muscle-preview');
  if(map && typeof buildMuscleMapSVG==='function') map.innerHTML=buildMuscleMapSVG(primary,secondary);
};

window.exerciseEditorAutosize=function(t){
  if(!t) return;
  // Temporarily collapse, then measure the full content. This prevents
  // the old 38/40px rules from clipping the last line.
  t.style.height='auto';
  t.style.overflowY='hidden';
  const cs=getComputedStyle(t);
  const min=Math.max(44,parseFloat(cs.minHeight)||44);
  const border=(parseFloat(cs.borderTopWidth)||0)+(parseFloat(cs.borderBottomWidth)||0);
  t.style.height=Math.max(min,t.scrollHeight+border)+'px';
  exerciseDirty=true;
};

function autosizeExerciseEditorTextareas(root=document){
  root.querySelectorAll?.('.exercise-editor-unified textarea')?.forEach(t=>{
    t.style.height='auto';
    t.style.overflowY='hidden';
    const cs=getComputedStyle(t);
    const min=Math.max(44,parseFloat(cs.minHeight)||44);
    const border=(parseFloat(cs.borderTopWidth)||0)+(parseFloat(cs.borderBottomWidth)||0);
    t.style.height=Math.max(min,t.scrollHeight+border)+'px';
  });
}
window.autosizeExerciseEditorTextareas=autosizeExerciseEditorTextareas;

window.addExerciseEditorRow=function(kind){
  const list=kind==='step'
    ? document.getElementById('exerciseStepsList')
    : kind==='bad'
      ? document.getElementById('exerciseMistakesList')
      : document.getElementById('exerciseRecommendationsList');
  if(!list) return;

  const cls=kind==='step'?'exercise-step-input':kind==='bad'?'exercise-mistake-input':'exercise-recommendation-input';
  const ph=kind==='step'?'Описание пункта':kind==='bad'?'Описание ошибки':'Полезная рекомендация';
  const i=list.children.length;
  const row=document.createElement('div');
  row.className='exercise-editor-row';
  const advice=kind==='bad'||kind==='rec';
  row.className='exercise-editor-row'+(advice?' exercise-editor-advice-row':'');
  row.innerHTML=`<span class="exercise-editor-num ${advice?'exercise-editor-advice-marker':''}">${advice?'×':i+1}</span><textarea class="${cls}" rows="1" placeholder="${ph}" oninput="exerciseEditorAutosize(this)"></textarea><button type="button" class="exercise-editor-remove" onclick="removeExerciseEditorRow(this)">×</button>`;
  list.appendChild(row);
  exerciseDirty=true;
  row.querySelector('textarea')?.focus();
};

window.removeExerciseEditorRow=function(btn){
  const row=btn?.closest('.exercise-editor-row');
  if(!row) return;
  const list=row.parentElement;
  row.remove();
  if(list){
    [...list.querySelectorAll('.exercise-editor-row .exercise-editor-num')]
      .forEach((el,i)=>el.textContent=String(i+1));
  }
  exerciseDirty=true;
};

/* One public route for the entire app. */
window.openTechniqueModalBase=function(name,type){
  return renderExerciseCard(name,type,'view');
};
window.openTechniqueModal=function(name,type,mode='view'){
  return renderExerciseCard(name,type,mode==='directory' || mode==='edit' ? 'directory' : 'view');
};
window.openDirectoryExerciseByKey=function(name){
  const record=getExerciseViewRecord(name,'strength');
  if(!record.name) return;
  return renderExerciseCard(record.name,record.type,'directory');
};
window.openTechniqueFromWorkout=function(index){
  const m=typeof getWorkoutExercise==='function' ? getWorkoutExercise(index) : null;
  if(!m) return;
  return renderExerciseCard(m.name,m.type||'strength','view');
};

/* Final migration: no exercise has a "manual" identity anymore. */
(function migrateExerciseData(){
  if(!Array.isArray(data?.exerciseDirectory)) return;
  let changed=false;

  for(const e of data.exerciseDirectory){
    if(!e || typeof e!=='object' || !e.name) continue;

    ['manualBlank','createdManually','userCreated','origin',
     '__universalEditable','__builtInSnapshot','__builtInImg'].forEach(k=>{
      if(k in e){ delete e[k]; changed=true; }
    });

    if(!e.builtinName && typeof findExerciseGuide==='function' && findExerciseGuide(e.name)){
      e.builtinName=e.name; changed=true;
    }

    if(e.__hideBuiltInMedia===true){
      const bg=findExerciseGuide(e.builtinName||e.name);
      const count=bg?.img && Array.isArray(EXERCISE_IMGS?.[bg.img]) ? EXERCISE_IMGS[bg.img].length : 0;
      e.guide=cloneGuide(e.guide);
      e.guide.hiddenBuiltinIndexes=Array.from({length:count},(_,i)=>i);
      delete e.__hideBuiltInMedia;
      changed=true;
    }

    const normalized=cloneGuide(e.guide);
    if(JSON.stringify(e.guide||{})!==JSON.stringify(normalized)){
      e.guide=normalized;
      changed=true;
    }
  }

  if(changed) saveData();
})();

/* The old UI polish called an obsolete markManualRows(). Never call it again. */
window.markManualRows=function(){};
})();


window.exerciseEditorAutosize=function(el){
  if(!el || el.tagName!=='TEXTAREA') return;
  el.style.height='auto';
  const cs=getComputedStyle(el);
  const border=(parseFloat(cs.borderTopWidth)||0)+(parseFloat(cs.borderBottomWidth)||0);
  const next=Math.max(el.scrollHeight+border,48);
  el.style.height=next+'px';
  el.style.overflowY='hidden';
};


(function(){
  function auto(t){
    if(window.exerciseEditorAutosize) window.exerciseEditorAutosize(t);
  }
  document.addEventListener('input',function(e){
    if(e.target && e.target.tagName==='TEXTAREA') auto(e.target);
  },true);
  document.addEventListener('focusin',function(e){
    if(e.target && e.target.tagName==='TEXTAREA') requestAnimationFrame(()=>auto(e.target));
  },true);
  window.addEventListener('resize',function(){
    document.querySelectorAll('#techniqueModal textarea, textarea.exercise-editor-textarea').forEach(auto);
  });
  window.addEventListener('load',function(){
    document.querySelectorAll('#techniqueModal textarea, textarea.exercise-editor-textarea').forEach(auto);
  });
})();



(function(){
  function resize(t){
    if(!t || t.tagName!=='TEXTAREA') return;
    t.style.height='auto';
    t.style.overflowY='hidden';
    const h=Math.max(48,t.scrollHeight);
    t.style.height=h+'px';
  }
  window.refreshAllExerciseTextareas=function(root=document){
    root.querySelectorAll?.('textarea')?.forEach(resize);
  };
  document.addEventListener('input',e=>{
    if(e.target?.tagName==='TEXTAREA') resize(e.target);
  },true);
  document.addEventListener('focusin',e=>{
    if(e.target?.tagName==='TEXTAREA') requestAnimationFrame(()=>resize(e.target));
  },true);
  const ro=new ResizeObserver(entries=>{
    entries.forEach(e=>{ if(e.target?.tagName==='TEXTAREA') resize(e.target); });
  });
  function observe(){
    document.querySelectorAll('#techniqueModal textarea').forEach(t=>{
      try{ro.observe(t);}catch(e){}
      resize(t);
    });
  }
  const mo=new MutationObserver(()=>requestAnimationFrame(observe));
  mo.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('resize',observe);
  window.addEventListener('load',observe);
  observe();
})();



(function(){
  function sync(screen){
    if(!screen) return;
    const h=screen.querySelector('.screen-header');
    if(!h) return;
    const rect=h.getBoundingClientRect();
    const height=Math.ceil(rect.height);
    document.documentElement.style.setProperty('--current-screen-header-height',height+'px');
    screen.style.setProperty('--screen-header-height',height+'px');
  }
  window.__syncScreenHeader=sync;
  window.addEventListener('resize',()=>{
    const active=[...document.querySelectorAll('#app > div:not(.hidden)')][0];
    sync(active);
  });
  window.addEventListener('orientationchange',()=>setTimeout(()=>{
    const active=[...document.querySelectorAll('#app > div:not(.hidden)')][0];
    sync(active);
  },120));
  requestAnimationFrame(()=>{
    const active=[...document.querySelectorAll('#app > div:not(.hidden)')][0];
    sync(active);
  });
})();



(function(){
'use strict';

/* ===== iPhone-safe layout ===== */
/* Removed runtime layout CSS: canonical PWA layout is defined once at the end of the document. */


/* Auto-growing textareas, including rows created after render. */
function autosize(el){
  if(!el || el.tagName!=='TEXTAREA') return;
  el.classList.add('auto-grow-textarea');
  el.style.height='auto';
  el.style.height=Math.max(42,el.scrollHeight)+'px';
}
function bindAutosize(root=document){
  root.querySelectorAll('textarea').forEach(autosize);
}
document.addEventListener('input',e=>{if(e.target?.tagName==='TEXTAREA')autosize(e.target);},true);
new MutationObserver(()=>bindAutosize(document)).observe(document.body,{childList:true,subtree:true});
})();



(function(){
  'use strict';
  function grow(el){
    if(!el || el.tagName!=='TEXTAREA') return;
    el.style.setProperty('height','auto','important');
    el.style.setProperty('height',Math.max(44,el.scrollHeight+2)+'px','important');
    el.style.setProperty('overflow-y','hidden','important');
  }
  function bind(root){
    (root||document).querySelectorAll('textarea').forEach(grow);
  }
  window.__ftrackerGrowTextareas=bind;
  document.addEventListener('input',function(e){
    if(e.target && e.target.tagName==='TEXTAREA') grow(e.target);
  },true);
  document.addEventListener('focusin',function(e){
    if(e.target && e.target.tagName==='TEXTAREA') requestAnimationFrame(()=>grow(e.target));
  },true);
  new MutationObserver(function(muts){
    for(const m of muts){
      for(const node of m.addedNodes||[]){
        if(node.nodeType===1){
          if(node.tagName==='TEXTAREA') grow(node);
          bind(node);
        }
      }
    }
  }).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('resize',()=>bind(document));
  requestAnimationFrame(()=>bind(document));
})();



(function(){'use strict';window.__duplicateLogicVersion='v109-canonical';})();



(function(){
'use strict';
const $=(id)=>document.getElementById(id);
const esc=(v)=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'');
const norm=(v)=>typeof normalizeExerciseKey==='function'?normalizeExerciseKey(v):String(v||'').toLocaleLowerCase('ru').replace(/[\s\p{P}\p{S}]+/gu,'');

/* ---------- Canonical food duplicate protection: exact = block, similar = user choice ---------- */
function foodNorm(v){
  return String(v??'').normalize('NFKC').toLocaleLowerCase('ru')
    .replace(/ё/g,'е')
    .replace(/[\u2010-\u2015]/g,'-')
    .replace(/[«»„“”"'`]/g,'')
    .replace(/[^a-zа-я0-9]+/gi,' ')
    .trim()
    .replace(/\s+/g,' ');
}
function foodFullKey(v){ return foodNorm(v).replace(/ /g,''); }
function foodWords(v){
  return [...new Set(foodNorm(v).split(' ').filter(Boolean))];
}
function foodEditDistance(a,b){
  a=String(a);b=String(b);
  if(a===b)return 0;
  if(!a)return b.length;if(!b)return a.length;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++){
      cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    }
    prev=cur;
  }
  return prev[b.length];
}
function foodCatalogList(){
  const result=[],seen=new Set();
  (data.productCatalog||[]).forEach((p,i)=>{
    if(!p?.name)return;
    const key=foodFullKey(p.name);
    if(!key)return;
    result.push({index:i,name:String(p.name).trim(),type:p.type||'per100',key});
    seen.add(key);
  });
  return result;
}
window.findFoodDuplicate=function(name,excludeIndex=null){
  const inputKey=foodFullKey(name);
  const inputWords=foodWords(name);
  const exact=[],similar=[];
  for(const item of foodCatalogList()){
    if(item.index===excludeIndex)continue;
    if(item.key===inputKey){
      exact.push({...item,reason:'Название совпадает после приведения регистра, пробелов, знаков и е/ё.'});
      continue;
    }
    let reason='';
    const words=foodWords(item.name);
    outer: for(const a of inputWords){
      for(const b of words){
        if(a===b || (Math.min(a.length,b.length)>=4 && (a.includes(b)||b.includes(a)))){
          reason=`Совпадает или частично совпадает слово «${b}».`;break outer;
        }
        const min=Math.min(a.length,b.length);
        if(min>=4 && foodEditDistance(a,b)<=1){
          reason=`Найдено очень близкое по написанию слово «${b}».`;break outer;
        }
      }
    }
    if(!reason){
      const min=Math.min(inputKey.length,item.key.length);
      const d=foodEditDistance(inputKey,item.key);
      if(min>=5 && (d<=2 || (min>=10 && d<=Math.floor(min*0.2)))) reason='Название очень похоже по написанию.';
    }
    if(reason)similar.push({...item,reason});
  }
  return {exact,similar};
};
function foodEsc(v){return typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&#39;'}[m]));}
window.showFoodDuplicateModal=function(name,matches,exact,onAllow){
  let modal=$('foodDuplicateModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='foodDuplicateModal';
    modal.className='hidden';
    modal.innerHTML=`<div class="exercise-dup-sheet">
      <div class="unified-surface-header ft-modal-header exercise-dup-header">
        <button type="button" class="surface-back-btn" id="foodDupBack" aria-label="Назад">← Назад</button>
        <div id="foodDupTitle" class="surface-title"></div>
        <span class="surface-header-spacer" aria-hidden="true"></span>
      </div>
      <div id="foodDupSub" class="exercise-dup-sub"></div>
      <div id="foodDupList" class="exercise-dup-list"></div>
      <div id="foodDupNote" class="exercise-dup-note"></div>
      <div id="foodDupActions" class="exercise-dup-actions">
        <button type="button" class="dup-cancel gray" id="foodDupCancel"></button>
        <button type="button" class="dup-add" id="foodDupAdd">Всё равно добавить</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  }
  modal.querySelector('#foodDupTitle').innerHTML=exact?'Продукт уже<br>существует':'Найдены похожие<br>продукты';
  modal.querySelector('#foodDupSub').textContent=exact?'Точную копию создать нельзя.':`Для «${name}» найдены похожие названия.`;
  modal.querySelector('#foodDupList').innerHTML=matches.slice(0,8).map(x=>
    `<div class="exercise-dup-item"><div class="exercise-dup-name">${foodEsc(x.name)}</div><div class="exercise-dup-meta">${x.type==='dish'?'Блюдо':'На 100 г'}</div><div class="exercise-dup-reason">${foodEsc(x.reason||'Похожее название.')}</div></div>`
  ).join('');
  modal.querySelector('#foodDupNote').textContent=exact
    ?'Создание второй записи запрещено.'
    :'Если это действительно другой продукт, его можно добавить отдельно.';
  const actions=modal.querySelector('#foodDupActions');
  const cancel=modal.querySelector('#foodDupCancel');
  const add=modal.querySelector('#foodDupAdd');
  actions.classList.toggle('single',!!exact);
  add.style.display=exact?'none':'';
  cancel.textContent=exact?'Закрыть':'Нет, отменить';
  const close=()=>{modal.classList.add('hidden');modal._onAllow=null;};
  modal.querySelector('#foodDupBack').onclick=close;
  /* Remove any stale legacy close button from a DOM instance created by an older runtime. */
  modal.querySelector('#foodDupClose,.exercise-dup-close')?.remove();
  cancel.onclick=close;
  modal.onclick=e=>{if(e.target===modal)close();};
  if(!exact){
    modal._onAllow=onAllow;
    add.onclick=()=>{const fn=modal._onAllow;close();if(typeof fn==='function')fn();};
  }else add.onclick=null;
  lockModalScroll();modal.classList.remove('hidden');
  modal.querySelector('.exercise-dup-sheet')?.scrollTo(0,0);
};

/* ---------- Nutrition product picker ---------- */
function productTypeLabel(item){return item?.type==='dish' ? 'блюдо' : 'за 100 грамм';}
function getSavedFoodProducts(){
  const map=new Map();
  (data.productCatalog||[]).forEach(p=>{
    if(!p?.name)return;
    const k=foodFullKey(p.name);if(!map.has(k))map.set(k,{...p,source:'catalog'});
  });
  (data.foodDiary?.entries||[]).forEach(e=>{
    if(!e?.name)return;
    const k=foodFullKey(e.name);if(map.has(k))return;
    map.set(k,{...e,type:e.cal100!=null?'per100':'dish',source:'history'});
  });
  return [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru',{sensitivity:'base'}));
}
function renderFoodPresetList(){
  const input=$('foodName'), list=$('foodPresetList');if(!input||!list)return;
  const q=foodNorm(input.value);
  if(!q){list.innerHTML='';list.classList.add('hidden');return;}
  const items=getSavedFoodProducts().filter(item=>foodNorm(item.name).includes(q));
  if(!items.length){list.innerHTML='<div class="food-preset-item food-preset-empty" aria-live="polite">Ничего не найдено</div>';list.classList.remove('hidden');return;}
  list.innerHTML=items.map(item=>`<div class="food-preset-item" data-food-preset-name="${foodEsc(item.name)}" role="button" tabindex="0"><span style="min-width:0;overflow-wrap:anywhere;">${foodEsc(item.name)}</span><span style="margin-left:auto;padding-left:10px;color:var(--subtext);font-size:12px;white-space:nowrap;">(${productTypeLabel(item)})</span></div>`).join('');
  list.classList.remove('hidden');
}
window.filterFoodPresets=renderFoodPresetList;
window.openAddFoodModal=function(){
  editingFoodEntryIndex=null;
  const modal=$('addFoodModal');if(!modal)return;
  lockModalScroll();modal.classList.remove('hidden');
  ['foodName','foodPortion','foodCalories','foodProtein','foodFat','foodCarbs','foodWeight','foodCal100','foodProtein100','foodFat100','foodCarbs100'].forEach(id=>{if($(id))$(id).value='';});
  if($('calcResult'))$('calcResult').textContent='';
  switchFoodMode('portion');renderFoodPresetList();setTimeout(()=>$('foodName')?.focus(),50);
};
window.clearFoodSearch=function(){const i=$('foodName');if(i){i.value='';renderFoodPresetList();i.focus();}};
function ensureFoodSearchClear(){
  const input=$('foodName');if(!input||$('v66FoodSearchClear'))return;
  const parent=input.parentElement;if(!parent)return;
  parent.classList.add('v66-search-wrap');
  const b=document.createElement('button');b.id='v66FoodSearchClear';b.type='button';b.className='v66-search-clear hidden';b.textContent='×';b.setAttribute('aria-label','Очистить поиск');
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();window.clearFoodSearch();});parent.appendChild(b);
  const sync=()=>b.classList.toggle('hidden',!String(input.value||'').trim());input.addEventListener('input',sync);sync();
}
ensureFoodSearchClear();

/* ---------- Catalog creation: exact block, similar = explicit choice ---------- */
window.saveCatalogProduct=function(){
  const name=String($('catalogName')?.value||'').trim().replace(/\s+/g,' ');
  if(!name){showToast('Введите название');return;}
  const type=$('catalogType')?.value||'per100';let product={name,type};
  if(type==='dish'){
    product.calories=parseFloat($('catalogDishCalories')?.value)||0;product.protein=parseFloat($('catalogDishProtein')?.value)||0;product.fat=parseFloat($('catalogDishFat')?.value)||0;product.carbs=parseFloat($('catalogDishCarbs')?.value)||0;
    if(!product.calories){showToast('Введите калории блюда');return;}
  }else{
    product.cal100=parseFloat($('catalogCal100')?.value)||0;product.protein100=parseFloat($('catalogProtein100')?.value)||0;product.fat100=parseFloat($('catalogFat100')?.value)||0;product.carbs100=parseFloat($('catalogCarbs100')?.value)||0;
    if(!product.cal100){showToast('Введите калории на 100 г');return;}
  }
  const commit=()=>{
    if(editingCatalogProduct!==null)data.productCatalog[editingCatalogProduct]=product;else data.productCatalog.push(product);
    saveData();closeCatalogEdit();renderCatalogList();showToast('Продукт сохранён в каталоге');
  };
  const dup=window.findFoodDuplicate(name,editingCatalogProduct);
  if(dup.exact.length){window.showFoodDuplicateModal(name,dup.exact,true);return;}
  if(dup.similar.length){window.showFoodDuplicateModal(name,dup.similar,false,commit);return;}
  commit();
};

/* ---------- Day entries: unified catalog identity ---------- */
window.addFoodEntry=function(){
  const date=$('foodDate')?.value,name=String($('foodName')?.value||'').trim().replace(/\s+/g,' ');
  if(!name){showToast('Введите название');return;}
  let portion,calories,protein,fat,carbs,cal100,protein100,fat100,carbs100;
  if(currentFoodMode==='portion'){
    portion=$('foodPortion')?.value.trim()||'—';calories=parseFloat($('foodCalories')?.value)||0;protein=parseFloat($('foodProtein')?.value)||0;fat=parseFloat($('foodFat')?.value)||0;carbs=parseFloat($('foodCarbs')?.value)||0;cal100=protein100=fat100=carbs100=null;
    if(!calories){showToast('Введите калории');return;}
  }else{
    const weight=parseFloat($('foodWeight')?.value)||0;cal100=parseFloat($('foodCal100')?.value)||0;protein100=parseFloat($('foodProtein100')?.value)||0;fat100=parseFloat($('foodFat100')?.value)||0;carbs100=parseFloat($('foodCarbs100')?.value)||0;
    if(!weight||!cal100){showToast('Введите вес порции и калории на 100 г');return;}
    portion=weight+' г';calories=Math.round(cal100*weight/100);protein=Math.round(protein100*weight/100);fat=Math.round(fat100*weight/100);carbs=Math.round(carbs100*weight/100);
  }
  const entryData={date,name,portion,calories,protein,fat,carbs,cal100,protein100,fat100,carbs100};
  const commit=(catalogProduct=null)=>{
    if(editingFoodEntryIndex!==null){data.foodDiary.entries[editingFoodEntryIndex]=entryData;showToast('Запись обновлена');}
    else{
      if(!catalogProduct){
        const product=currentFoodMode==='100'
          ? {name,type:'per100',cal100,protein100,fat100,carbs100}
          : {name,type:'dish',calories,protein,fat,carbs};
        data.productCatalog.push(product);
      }
      data.foodDiary.entries.push(entryData);showToast('Продукт добавлен и сохранён в каталог');
    }
    saveData();closeAddFoodModal();editingFoodEntryIndex=null;renderFoodDiary();if($('foodTabCatalog')?.classList.contains('active'))renderCatalogList();
  };
  if(editingFoodEntryIndex!==null){commit();return;}
  const dup=typeof window.findFoodDuplicate==='function'?window.findFoodDuplicate(name):{exact:[],similar:[]};
  if(dup.exact?.length){
    /* Exact identity already exists: do not create a second catalog card, add only today's entry. */
    commit(dup.exact[0]);return;
  }
  if(dup.similar?.length){
    window.showFoodDuplicateModal(name,dup.similar,false,()=>commit());return;
  }
  commit();
};

/* ---------- Confirmation when adding exercise to a split ---------- */
let v66PendingProgramAdd=null;
function ensureProgramAddConfirm(){
  let m=$('v66ProgramAddConfirm'); if(m)return m;
  m=document.createElement('div');m.id='v66ProgramAddConfirm';m.className='confirm-modal hidden';
  m.innerHTML='<div class="confirm-modal-content"><div style="font-size:20px;font-weight:700;margin-bottom:10px;">Добавить упражнение?</div><div id="v66ProgramAddText" style="color:var(--subtext);margin-bottom:16px;"></div><button type="button" id="v66ProgramAddYes">Да, добавить</button><button type="button" class="gray" id="v66ProgramAddNo">Нет</button></div>';
  document.body.appendChild(m);
  const close=()=>{closeModalElement(m);v66PendingProgramAdd=null;};
  $('v66ProgramAddNo').onclick=close;m.onclick=e=>{if(e.target===m)close();};
  $('v66ProgramAddYes').onclick=()=>{const x=v66PendingProgramAdd;if(!x)return;close();setTimeout(()=>window.__v66CommitProgramAdd(x.progIdx,x.name,x.type),0);};
  return m;
}
window.__v66CommitProgramAdd=function(progIdx,name,type){
  const p=data.programs[progIdx];if(!p)return;const key=norm(name);
  if((p.exercises||[]).some(x=>norm(x)===key)){showToast('Это упражнение уже есть в сплите');return;}
  p.exercises.push(name);p.active=p.active||[];p.types=p.types||[];p.active.push(true);p.types.push(type||'strength');
  /* Do not turn built-in exercises into manual entries merely because they were copied to another split. */
  const existing=(data.exerciseDirectory||[]).find(e=>norm(e?.name)===key);
  if(!existing){
    const builtIn=typeof findExerciseGuide==='function' && !!findExerciseGuide(name);
    if(builtIn){
      data.exerciseDirectory.push({name:String(name).trim(),type:type||'strength',group:inferExerciseGroup(name,type||'strength')});
    }else{
      ensureDirectoryEntry(name,type);
    }
  }
  saveData();closeExercisePicker();renderSettings();setTimeout(()=>document.getElementById('splitCard_'+progIdx)?.classList.add('open'),0);showToast('Упражнение добавлено в сплит');
};
window.selectExerciseForProgram=function(progIdx,name,type){
  const p=data.programs[progIdx];if(!p)return;const key=norm(name);
  if((p.exercises||[]).some(x=>norm(x)===key)){showToast('Это упражнение уже есть в сплите');return;}
  v66PendingProgramAdd={progIdx,name,type:type||'strength'};const m=ensureProgramAddConfirm();$('v66ProgramAddText').textContent=`Добавить «${name}» в «${p.name||'сплит'}»?`;openModal(m);
};


/* ---------- Progress: all directory exercises, including 0 workouts ---------- */
window.getProgressExerciseNames=function(){
  const names=new Map();
  (data.exerciseDirectory||[]).forEach(e=>{if(e?.name)names.set(norm(e.name),e.name);});
  (data.programs||[]).forEach(p=>(p.exercises||[]).forEach(n=>{if(n)names.set(norm(n),n);}));
  (data.history||[]).forEach(h=>(h.exercises||[]).forEach(e=>{if(e?.name)names.set(norm(e.name),e.name);}));
  return [...names.values()].sort((a,b)=>String(a).localeCompare(String(b),'ru',{sensitivity:'base'}));
};
const oldProgressRender=window.renderProgressExercisePicker;
if(typeof oldProgressRender==='function')window.renderProgressExercisePicker=function(){
  oldProgressRender.apply(this,arguments);
  const list=$('progressPickerList');if(!list)return;
  const names=window.getProgressExerciseNames();const q=norm($('progressExercisePickerSearch')?.value||'');
  if(q && !names.some(n=>norm(n).includes(q)))list.innerHTML='<div style="padding:22px;text-align:center;color:var(--subtext);">Ничего не найдено</div>';
};

/* ---------- Search clear buttons for every existing picker ---------- */
function addClear(inputId,buttonId,clearFn){
  const input=$(inputId);if(!input||$(buttonId))return;const parent=input.parentElement;if(!parent)return;parent.classList.add('v66-search-wrap');
  const b=document.createElement('button');b.id=buttonId;b.type='button';b.className='v66-search-clear hidden';b.textContent='×';b.setAttribute('aria-label','Очистить поиск');b.onclick=e=>{e.preventDefault();e.stopPropagation();clearFn();};parent.appendChild(b);
  const sync=()=>b.classList.toggle('hidden',!String(input.value||'').trim());input.addEventListener('input',sync);sync();
}
addClear('exercisePickerSearch','v66ProgramClear',()=>{const i=$('exercisePickerSearch');if(i){i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));i.focus();}});
addClear('progressExercisePickerSearch','v66ProgressClear',()=>{const i=$('progressExercisePickerSearch');if(i){i.value='';i.dispatchEvent(new Event('input',{bubbles:true}));i.focus();}});
addClear('replaceExerciseSearch','v66ReplaceClear',()=>window.clearReplaceExerciseSearch&&window.clearReplaceExerciseSearch());

/* ---------- Replacement picker: force a fresh synchronous rebuild on open ---------- */
const oldOpenReplace=window.openReplaceExerciseModal;
window.openReplaceExerciseModal=function(slotIndex){
  if(typeof oldOpenReplace==='function')oldOpenReplace.apply(this,arguments);
  const list=$('replaceExerciseList');if(list){list.scrollTop=0;list.style.display='block';}
  requestAnimationFrame(()=>{try{renderReplaceExerciseList(replaceExerciseSearchText||'');}catch(e){console.warn('v66 replacement refresh',e);}});
};

/* ---------- Measurement manager: reserve a real text column ---------- */
const style=document.createElement('style');style.textContent=`
.measurement-manager-row{display:grid!important;grid-template-columns:minmax(0,1fr) 40px 40px!important;align-items:center!important;gap:7px!important;}
.measurement-manager-row-name{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;padding-right:4px!important;}
.measurement-manager-row button{width:40px!important;min-width:40px!important;height:40px!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;}
`;document.head.appendChild(style);

/* Install food list delegation once more in case a later patch replaced the function. */
const foodList=$('foodPresetList');if(foodList&&!foodList.dataset.v66Bound){foodList.dataset.v66Bound='1';foodList.addEventListener('click',e=>{const item=e.target.closest('.food-preset-item[data-food-preset-name]');if(item){e.preventDefault();selectFoodPreset(item.getAttribute('data-food-preset-name'));}});}

})();



(function(){
  function fix(){document.querySelectorAll('#workoutScreen #exerciseStrip .exercise-dot-label span').forEach(el=>{el.style.whiteSpace='normal';el.style.overflow='visible';el.style.textOverflow='clip';el.style.overflowWrap='anywhere';el.style.textAlign='center';});}
  fix();
  const old=window.renderExerciseStrip;
  if(typeof old==='function'&&!old.__v83fix){const w=function(){const r=old.apply(this,arguments);requestAnimationFrame(fix);return r;};w.__v83fix=true;window.renderExerciseStrip=w;}
})();



(function(){
  const oldToast=window.showToast;
  window.showToast=function(msg){
    document.querySelectorAll('.toast').forEach(x=>x.remove());
    const toast=document.createElement('div');
    toast.className='toast';toast.setAttribute('role','status');toast.textContent=String(msg??'');
    document.body.appendChild(toast);
    setTimeout(()=>toast.remove(),2200);
  };
})();



(function(){
  window.showSystemConfirm=function(message,title='Подтверждение'){
    return new Promise(resolve=>{
      let m=document.getElementById('systemConfirmModal');
      if(!m){
        m=document.createElement('div');
        m.id='systemConfirmModal';m.className='confirm-modal hidden';
        m.innerHTML=`<div class="confirm-modal-content system-confirm-content">
          <div class="system-confirm-title"></div>
          <div class="system-confirm-text"></div>
          <div class="system-confirm-actions">
            <button type="button" class="gray system-confirm-no">Отмена</button>
            <button type="button" class="system-confirm-yes">Да</button>
          </div>
        </div>`;
        document.body.appendChild(m);
      }
      const finish=value=>{m.classList.add('hidden');resolve(value);};
      m.querySelector('.system-confirm-title').textContent=title;
      m.querySelector('.system-confirm-text').textContent=message;
      m.querySelector('.system-confirm-no').onclick=()=>finish(false);
      m.querySelector('.system-confirm-yes').onclick=()=>finish(true);
      m.onclick=e=>{if(e.target===m)finish(false);};
      lockModalScroll(); m.classList.remove('hidden');
    });
  };
})();



(function(){
  'use strict';

  /* ---------- Calendar-period semantics ----------
     Progress periods are calendar days, not rolling 24-hour windows. */
  const originalGetHistoryInPeriod = window.getHistoryInPeriod;
  window.getHistoryInPeriod = function(period){
    try{
      if(period === 'all') return Array.isArray(data?.history) ? data.history.slice() : [];
      const days = Number(period);
      if(!Number.isFinite(days) || days <= 0) return [];
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start.setDate(start.getDate() - (Math.floor(days) - 1));
      const startKey = typeof localDateString === 'function' ? localDateString(start) : start.toISOString().slice(0,10);
      return (Array.isArray(data?.history) ? data.history : []).filter(entry=>{
        const d = new Date(entry?.date || 0);
        if(!Number.isFinite(d.getTime())) return false;
        const key = typeof localDateString === 'function' ? localDateString(d) : d.toISOString().slice(0,10);
        return key >= startKey;
      });
    }catch(e){
      return typeof originalGetHistoryInPeriod === 'function' ? originalGetHistoryInPeriod(period) : [];
    }
  };

  /* ---------- FTracker durable backup engine (schema v2) ----------
     Backups are a transport format, not a replacement for live state.
     The importer:
       1) migrates legacy backups to the canonical schema;
       2) keeps stable ids for programs/exercises/products;
       3) merges historical data instead of replacing it;
       4) restores edited split programs from the backup;
       5) preserves the previous conflicting program/product version in a bounded conflict archive;
       6) preserves current data on any failure (atomic rollback);
       7) remembers imported fingerprints to prevent duplicate imports.
  */
  let pendingImportSummary = null;

  function importClone(value){
    try { return JSON.parse(JSON.stringify(value)); } catch(e) { return value; }
  }

  function importStable(value){
    if(value === null || typeof value !== 'object') return JSON.stringify(value);
    if(Array.isArray(value)) return '[' + value.map(importStable).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+importStable(value[k])).join(',') + '}';
  }

  function importFingerprint(value){
    const s=importStable(value);
    let h1=0x811c9dc5, h2=0x01000193;
    for(let i=0;i<s.length;i++){
      const c=s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1,16777619);
      h2 ^= (c + i); h2 = Math.imul(h2,2246822519);
    }
    return (h1>>>0).toString(16).padStart(8,'0') + (h2>>>0).toString(16).padStart(8,'0');
  }

  function importSourceFingerprint(root){
    const clean=importClone(root||{});
    if(clean && typeof clean==='object'){
      delete clean._backupMeta;
      delete clean.exportMeta;
      delete clean.schemaVersion;
      delete clean._importedBackupFingerprints;
    }
    return importFingerprint(clean);
  }

  function importArray(root, keys){
    for(const key of keys){
      if(Array.isArray(root?.[key])) return root[key];
    }
    return [];
  }

  function importObject(root, keys){
    for(const key of keys){
      if(root?.[key] && typeof root[key]==='object' && !Array.isArray(root[key])) return root[key];
    }
    return {};
  }

  function normalizeImportedHistory(raw){
    const source = Array.isArray(raw) ? raw : [];
    return source.filter(h=>h && typeof h==='object').map(h=>{
      const out={...importClone(h)};
      if(!out.date && out.timestamp) out.date=out.timestamp;
      if(!out.date && out.createdAt) out.date=out.createdAt;
      if(!out.program && out.split) out.program=out.split;
      if(!out.program && out.programName) out.program=out.programName;
      const exRaw=Array.isArray(out.exercises) ? out.exercises : (out.exercise ? [out.exercise] : []);
      out.exercises=exRaw.filter(e=>e && typeof e==='object').map(e=>{
        const ex={...importClone(e)};
        if(!ex.name && ex.exerciseName) ex.name=ex.exerciseName;
        ex.name=ftCanonicalName(ex.name||'');
        const sets=Array.isArray(ex.sets) ? ex.sets : (ex.set ? [ex.set] : []);
        ex.sets=sets.filter(s=>s && typeof s==='object').map(s=>({...importClone(s)}));
        return ex;
      }).filter(e=>e.name);
      return out;
    }).filter(h=>h.exercises.length || h.date || h.program);
  }

  function normalizeImportedMeasurements(raw){
    if(Array.isArray(raw)) return raw.filter(x=>x && typeof x==='object').map(x=>{
      const out={...importClone(x)};
      if(!out.date && out.timestamp) out.date=out.timestamp;
      return out;
    });
    if(raw && typeof raw==='object'){
      return Object.entries(raw).map(([date,value])=>{
        if(value && typeof value==='object') return {...importClone(value),date:value.date||date};
        return {date,value};
      });
    }
    return [];
  }

  function normalizeImportedFoodEntries(root){
    const entries=importArray(root,['entries','foodEntries','foods','foodHistory']);
    return entries.filter(x=>x && typeof x==='object').map(x=>{
      const out={...importClone(x)};
      if(!out.date && out.day) out.date=out.day;
      if(!out.name && out.product) out.name=out.product;
      return out;
    });
  }

  function normalizeImportedProgram(raw,index){
    if(!raw || typeof raw!=='object') return null;
    return ensureProgramShape(importClone(raw),index);
  }

  function normalizeImportedState(candidate){
    if(!candidate || typeof candidate!=='object') return null;
    const root=(candidate.data && typeof candidate.data==='object' && !Array.isArray(candidate.data))
      ? candidate.data : candidate;

    const history=normalizeImportedHistory(importArray(root,['history','workoutHistory','trainingHistory','workouts']));
    const measurements=normalizeImportedMeasurements(root.measurements ?? root.bodyMeasurements);
    const foodRoot=(root.foodDiary && typeof root.foodDiary==='object') ? root.foodDiary : {};
    const foodEntries=normalizeImportedFoodEntries(foodRoot).length
      ? normalizeImportedFoodEntries(foodRoot) : normalizeImportedFoodEntries(root);
    const foodLimits=importObject(foodRoot,['limits','dailyLimits']);
    const products=importArray(root,['productCatalog','products','foodCatalog','productCatalogue']);
    const directories=importArray(root,['exerciseDirectory','exercises','exerciseCatalog','exerciseReference']);
    const archived=importArray(root,['exerciseDirectoryArchived','archivedExercises']);
    const hidden=Array.isArray(root.exerciseDirectoryHidden) ? root.exerciseDirectoryHidden : [];
    const fields=importArray(root,['measurementFields','bodyMeasurementFields']);
    const rawPrograms=importArray(root,['programs','splits','trainingPrograms']);
    const programs=rawPrograms.map(normalizeImportedProgram).filter(Boolean);
    const guideOverrides=(root.exerciseGuideOverrides && typeof root.exerciseGuideOverrides==='object') ? root.exerciseGuideOverrides : {};
    const exerciseAliases=(root.exerciseAliases && typeof root.exerciseAliases==='object') ? root.exerciseAliases : {};
    const programAliases=(root.programAliases && typeof root.programAliases==='object') ? root.programAliases : {};

    const hasRecognized =
      history.length || measurements.length || foodEntries.length ||
      Object.keys(foodLimits).length || products.length || directories.length ||
      archived.length || fields.length || programs.length ||
      Object.keys(guideOverrides).length || hidden.length;

    if(!hasRecognized) return null;

    const canonical=migrateFTrackerState({
      programs,
      history,
      measurements,
      measurementFields:fields,
      foodDiary:{limits:foodLimits,entries:foodEntries},
      productCatalog:products,
      exerciseDirectory:directories,
      exerciseDirectoryArchived:archived,
      exerciseDirectoryHidden:hidden,
      exerciseGuideOverrides:guideOverrides,
      exerciseAliases,
      programAliases,
      schemaVersion: Number(root.schemaVersion || root._backupMeta?.schemaVersion || 1),
      // F-Score / Индекс динамики is part of the durable app state.
      // Keep the selected goal and saved custom goals during a full backup
      // import; otherwise a clean reset followed by restore silently loses
      // the Index configuration even though the rest of the backup imports.
      fscoreGoal: ['cut','gain','maintain','custom'].includes(root.fscoreGoal) ? root.fscoreGoal : undefined,
      fscoreCustomGoals: Array.isArray(root.fscoreCustomGoals) ? importClone(root.fscoreCustomGoals) : [],
      fscoreCustomGoal: root.fscoreCustomGoal && typeof root.fscoreCustomGoal==='object' ? importClone(root.fscoreCustomGoal) : null,
      fscoreActiveCustomGoalId: root.fscoreActiveCustomGoalId != null ? String(root.fscoreActiveCustomGoalId) : null
    });

    return {
      ...canonical,
      sourceFingerprint:importSourceFingerprint(root),
      sourceSchemaVersion:Number(root.schemaVersion || root._backupMeta?.schemaVersion || 1)
    };
  }

  function importExactAppend(targetArray,incomingArray){
    if(!Array.isArray(targetArray)) targetArray=[];
    const seen=new Set(targetArray.map(importFingerprint));
    let added=0;
    for(const item of incomingArray){
      const fp=importFingerprint(item);
      if(seen.has(fp)) continue;
      targetArray.push(importClone(item));
      seen.add(fp); added++;
    }
    return added;
  }

  function importMergeMeasurementFields(incoming){
    if(!Array.isArray(data.measurementFields)) data.measurementFields=[];
    const byKey=new Map(data.measurementFields.map(f=>[String(f?.key||'').trim(),f]).filter(([k])=>k));
    let added=0, merged=0;
    incoming.forEach(f=>{
      const key=String(f?.key||'').trim(), label=String(f?.label||'').trim();
      if(!key || !label) return;
      const target=byKey.get(key);
      if(!target){ data.measurementFields.push({...importClone(f),key,label}); byKey.set(key,data.measurementFields.at(-1)); added++; }
      else if(!target.label && label){ target.label=label; merged++; }
    });
    return {added,merged};
  }

  function importMergeFoodLimits(incoming){
    if(!data.foodDiary || typeof data.foodDiary!=='object') data.foodDiary={limits:{},entries:[]};
    if(!data.foodDiary.limits || typeof data.foodDiary.limits!=='object') data.foodDiary.limits={};
    if(!Array.isArray(data.foodDiary.limitHistory)) data.foodDiary.limitHistory=[];
    const current=data.foodDiary.limits;
    const historySeen=new Set(data.foodDiary.limitHistory.map(importFingerprint));
    let added=0, conflicts=0;
    Object.entries(incoming||{}).forEach(([date,limit])=>{
      if(!date || !limit || typeof limit!=='object') return;
      if(current[date]===undefined){ current[date]=importClone(limit); added++; return; }
      if(importFingerprint(current[date])===importFingerprint(limit)) return;
      const item={date,...importClone(limit)};
      const fp=importFingerprint(item);
      if(!historySeen.has(fp)){ data.foodDiary.limitHistory.push(item); historySeen.add(fp); conflicts++; }
    });
    return {added,conflicts};
  }

  function recordImportConflict(type, key, currentValue, incomingValue, sourceFingerprint){
    if(!data._backupConflicts || !Array.isArray(data._backupConflicts)) data._backupConflicts=[];
    const item={
      id:ftStableId('conflict',type+'|'+String(key||'')+'|'+String(sourceFingerprint||'')+'|'+Date.now()),
      type:String(type||'unknown'),
      key:String(key||''),
      detectedAt:new Date().toISOString(),
      sourceFingerprint:String(sourceFingerprint||''),
      current:importClone(currentValue),
      incoming:importClone(incomingValue)
    };
    data._backupConflicts.push(item);
    if(data._backupConflicts.length>100) data._backupConflicts=data._backupConflicts.slice(-100);
    return item;
  }

  function importMergeProducts(incoming, sourceFingerprint=''){
    if(!Array.isArray(data.productCatalog)) data.productCatalog=[];
    const byId=new Map(), byName=new Map();
    data.productCatalog.forEach(p=>{
      if(!p) return;
      if(p.id) byId.set(String(p.id),p);
      if(p.name) byName.set(normalizeExerciseKey(p.name),p);
    });
    let added=0, merged=0, conflicts=0;
    (incoming||[]).forEach(raw=>{
      if(!raw || typeof raw!=='object') return;
      const p={...importClone(raw),type:raw.type||'per100'};
      p.name=ftCanonicalName(p.name||'');
      if(!p.name) return;
      p.id=String(p.id||ftStableId('food',normalizeExerciseKey(p.name)));
      const target=byId.get(p.id)||byName.get(normalizeExerciseKey(p.name));
      if(!target){
        data.productCatalog.push(p); byId.set(p.id,p); byName.set(normalizeExerciseKey(p.name),p); added++;
      }else{
        const before=importStable(target);
        if(before!==importStable(p)){
          // The backup is authoritative for the user's saved product values, but the
          // previous live value is retained in a bounded conflict archive so nothing
          // is silently lost if the newer app had newer edits.
          recordImportConflict('product',target.id||target.name,target,p,sourceFingerprint);
          Object.keys(p).forEach(k=>{
            if(k==='id') return; // never break references by changing the live id
            if(p[k]!==undefined) target[k]=importClone(p[k]);
          });
          if(p.id && !target.id) target.id=p.id;
          merged++; conflicts++;
        }
      }
    });
    return {added,merged,conflicts};
  }

  function importDirectoryItem(raw){
    if(!raw) return null;
    const name=ftCanonicalName(raw.name||raw.exerciseName||'');
    if(!name) return null;
    const type=raw.type||'strength';
    const out={...importClone(raw),name,type,group:raw.group||inferExerciseGroup(name,type)};
    out.id=String(out.id||out.exerciseId||ftStableId('ex',normalizeExerciseKey(name)));
    if(raw.guide) out.guide=importClone(raw.guide);
    return out;
  }

  function importMergeExerciseDirectory(incoming, authoritative=false){
    if(!Array.isArray(data.exerciseDirectory)) data.exerciseDirectory=[];
    if(!Array.isArray(data.exerciseDirectoryArchived)) data.exerciseDirectoryArchived=[];
    if(!Array.isArray(data.exerciseDirectoryHidden)) data.exerciseDirectoryHidden=[];

    const activeById=new Map(), activeByName=new Map(), archivedById=new Map(), archivedByName=new Map();
    data.exerciseDirectory.forEach(e=>{ if(e?.id) activeById.set(String(e.id),e); if(e?.name) activeByName.set(normalizeExerciseKey(e.name),e); });
    data.exerciseDirectoryArchived.forEach(e=>{ if(e?.id) archivedById.set(String(e.id),e); if(e?.name) archivedByName.set(normalizeExerciseKey(e.name),e); });

    let added=0, merged=0;
    (incoming||[]).forEach(raw=>{
      const item=importDirectoryItem(raw); if(!item) return;
      const oldKey=normalizeExerciseKey(item.name);
      const aliasKey=data.exerciseAliases?.[oldKey];
      const target=activeById.get(item.id) || activeByName.get(oldKey) ||
        (aliasKey ? activeById.get(String(aliasKey)) : null) ||
        archivedById.get(item.id) || archivedByName.get(oldKey);

      if(target){
        const before=importStable(target);
        if(authoritative){
          const stableId=String(target.id||item.id);
          Object.keys(target).forEach(k=>{ if(k!=='id') delete target[k]; });
          Object.keys(item).forEach(k=>{ if(k!=='id') target[k]=importClone(item[k]); });
          target.id=stableId;
        }else{
          if(item.guide) target.guide=mergeExerciseGuides(target.guide||emptyGuide(),item.guide);
          if(item.type && !target.type) target.type=item.type;
          if(item.group && !target.group) target.group=item.group;
          /* Restore legacy/user metadata only when the new version has no value.
             Never overwrite the canonical name, stable id or shipped knowledge. */
          ['equipment','notes','media','remoteMedia','tags'].forEach(k=>{
            if(target[k]===undefined && item[k]!==undefined) target[k]=importClone(item[k]);
          });
          if(!target.id) target.id=item.id;
        }
        normalizeExerciseGuideContent(target);
        if(before!==importStable(target)) merged++;
        return;
      }
      if(item.guide) normalizeExerciseGuideContent(item);
      data.exerciseDirectory.push(item);
      activeById.set(item.id,item); activeByName.set(oldKey,item); added++;
    });
    return {added,merged};
  }

  function importMergeGuideOverrides(overrides, authoritative=false){
    if(!overrides || typeof overrides!=='object') return {added:0,merged:0};
    let added=0, merged=0;
    Object.entries(overrides).forEach(([rawKey,guide])=>{
      const key=normalizeExerciseKey(rawKey);
      if(!key || !guide || typeof guide!=='object') return;
      const target=(data.exerciseDirectory||[]).find(e=>normalizeExerciseKey(e?.name)===key) ||
        (data.exerciseDirectory||[]).find(e=>String(e?.id||'')===String(guide.exerciseId||''));
      if(target){
        const before=importStable(target.guide||{});
        target.guide=authoritative ? importClone(guide) : mergeExerciseGuides(target.guide||emptyGuide(),guide);
        normalizeExerciseGuideContent(target);
        if(before!==importStable(target.guide||{})) merged++;
      }else{
        const name=ftCanonicalName(guide.name||rawKey);
        if(!name) return;
        const item={name,id:String(guide.exerciseId||ftStableId('ex',key)),type:guide.type||'strength',group:guide.group||inferExerciseGroup(name,guide.type||'strength'),guide:importClone(guide)};
        normalizeExerciseGuideContent(item);
        data.exerciseDirectory.push(item); added++;
      }
    });
    return {added,merged};
  }

  function collectProgramExercises(programs){
    const result=[];
    (programs||[]).forEach(p=>{
      if(!p || !Array.isArray(p.exercises)) return;
      p.exercises.forEach((name,i)=>{
        const n=ftCanonicalName(name);
        if(!n) return;
        result.push({
          name:n,
          id:String(p.exerciseIds?.[i]||ftStableId('ex',normalizeExerciseKey(n))),
          type:Array.isArray(p.types) ? (p.types[i]||'strength') : 'strength',
          group:inferExerciseGroup(n,Array.isArray(p.types)?(p.types[i]||'strength'):'strength')
        });
      });
    });
    return result;
  }

  function programSimilarity(a,b){
    const ae=(a?.exercises||[]).map(x=>normalizeExerciseKey(x)).filter(Boolean);
    const be=(b?.exercises||[]).map(x=>normalizeExerciseKey(x)).filter(Boolean);
    if(!ae.length || !be.length) return 0;
    const A=new Set(ae), B=new Set(be);
    let common=0; A.forEach(x=>{if(B.has(x)) common++;});
    return common/Math.max(A.size,B.size);
  }

  function importMergePrograms(incoming, sourceFingerprint=''){
    if(!Array.isArray(data.programs)) data.programs=[];
    if(!data.programAliases || typeof data.programAliases!=='object') data.programAliases={};
    const byId=new Map(), byName=new Map();
    data.programs.forEach(p=>{
      ensureProgramShape(p, data.programs.indexOf(p));
      byId.set(String(p.id),p);
      byName.set(normalizeExerciseKey(p.name),p);
    });
    let added=0, replaced=0, merged=0, conflicts=0;

    (incoming||[]).forEach((raw,i)=>{
      const p=ensureProgramShape(importClone(raw),i);
      const key=normalizeExerciseKey(p.name);
      const aliasId=data.programAliases?.[key];
      let target=byId.get(String(p.id)) || byName.get(key) || (aliasId ? byId.get(String(aliasId)) : null);

      // Legacy backups may not have a stable program id and the user may have
      // renamed the split. Before creating a duplicate, accept a unique high-
      // confidence structural match (same exercise set) as the same program.
      if(!target){
        const candidates=data.programs.filter(q=>programSimilarity(q,p)>=0.75);
        if(candidates.length===1) target=candidates[0];
      }

      if(!target){
        data.programs.push(p); byId.set(String(p.id),p); byName.set(key,p); added++;
        return;
      }

      const before=importStable(target);
      if(before!==importStable(p)){
        recordImportConflict('program',target.id||target.name,target,p,sourceFingerprint);
        // Backup is authoritative for the user's saved split configuration.
        // Keep the live stable id so history/drafts in the newer version keep
        // pointing at the same program object.
        const stableId=String(target.id||p.id);
        Object.keys(target).forEach(k=>{ if(k!=='id') delete target[k]; });
        Object.keys(p).forEach(k=>{ if(k!=='id') target[k]=importClone(p[k]); });
        target.id=stableId;
        if(before!==importStable(target)){ replaced++; merged++; conflicts++; }
      }
      byId.set(String(target.id),target); byName.set(key,target);
    });

    return {added,replaced,merged,conflicts};
  }

  function importRepairProgramExerciseIds(){
    const exercises=[...(data.exerciseDirectory||[]),...(data.exerciseDirectoryArchived||[])];
    const byId=new Map(exercises.filter(e=>e?.id).map(e=>[String(e.id),e]));
    const byName=new Map(exercises.filter(e=>e?.name).map(e=>[normalizeExerciseKey(e.name),e]));
    (data.programs||[]).forEach(p=>{
      if(!p || !Array.isArray(p.exercises)) return;
      p.exerciseIds=p.exercises.map((name,i)=>{
        const oldId=Array.isArray(p.exerciseIds) ? p.exerciseIds[i] : '';
        const byOld=oldId ? byId.get(String(oldId)) : null;
        const byN=byName.get(normalizeExerciseKey(name));
        // Prefer the exercise name when available. A restored/new app version may
        // reuse an old ID for a different exercise; never let that accidental ID
        // collision redirect a program to the wrong exercise.
        const matched = byN || (byOld && normalizeExerciseKey(byOld.name)===normalizeExerciseKey(name) ? byOld : null);
        return String(matched?.id || oldId || ftStableId('ex',normalizeExerciseKey(name)));
      });
    });
  }

  function importTranslateReferences(src){
    const programById=new Map((data.programs||[]).map(p=>[String(p.id),p]));
    const programByName=new Map((data.programs||[]).map(p=>[normalizeExerciseKey(p.name),p]));
    const exerciseById=new Map([...(data.exerciseDirectory||[]),...(data.exerciseDirectoryArchived||[])].map(e=>[String(e.id),e]).filter(([k])=>k));
    const exerciseByName=new Map([...(data.exerciseDirectory||[]),...(data.exerciseDirectoryArchived||[])].map(e=>[normalizeExerciseKey(e.name),e]).filter(([k])=>k));

    (data.history||[]).forEach(h=>{
      const p=programById.get(String(h.programId||'')) ||
        programByName.get(normalizeExerciseKey(h.program||'')) ||
        (h.program && data.programAliases?.[normalizeExerciseKey(h.program)] ? programById.get(String(data.programAliases[normalizeExerciseKey(h.program)])) : null);
      if(p){ h.programId=p.id; h.program=p.name; }
      (h.exercises||[]).forEach(ex=>{
        const byIdMatch=exerciseById.get(String(ex.exerciseId||''));
        const byNameMatch=exerciseByName.get(normalizeExerciseKey(ex.name||''));
        const e=byNameMatch || (byIdMatch && normalizeExerciseKey(byIdMatch.name)===normalizeExerciseKey(ex.name||'') ? byIdMatch : null);
        if(e){ ex.exerciseId=e.id; ex.name=e.name; }
      });
    });
    return src;
  }

  function updateImportModalSummary(summary){
    const el=document.querySelector('#importConfirmModal .confirm-modal-content > div[style*="color:var(--subtext)"]');
    if(!el) return;
    el.innerHTML =
      `<b>Готово к импорту</b><br>` +
      `Тренировки: ${summary.history} · Замеры: ${summary.measurements} · Питание: ${summary.foodEntries}<br>` +
      `Сплиты: ${summary.programs} · Продукты: ${summary.products} · Упражнения: ${summary.exercises}` +
      (summary.conflicts ? `<br><span style="color:var(--subtext)">Конфликты будут сохранены отдельно.</span>` : '');
  }

  window.importData=function(event){
    const file=event?.target?.files?.[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=function(e){
      try{
        const raw=JSON.parse(e.target.result);
        const normalized=normalizeImportedState(raw);
        if(!normalized){ showToast('Файл не содержит поддерживаемых данных FTracker'); return; }
        pendingImportData=normalized;
        pendingImportSummary=null;
        updateImportModalSummary({
          programs:normalized.programs.length,
          programsUpdated:0,
          history:normalized.history.length,
          measurements:normalized.measurements.length,
          foodEntries:normalized.foodDiary.entries.length,
          products:normalized.productCatalog.length,
          productsUpdated:0,
          conflicts:0,
          exercises:normalized.exerciseDirectory.length + normalized.exerciseDirectoryArchived.length + collectProgramExercises(normalized.programs).length,
          exerciseMerged:0,
          fields:normalized.measurementFields.length,
          fieldsMerged:0,
          limits:Object.keys(normalized.foodDiary.limits||{}).length,
          limitConflicts:0
        });
        lockModalScroll(); document.getElementById('importConfirmModal')?.classList.remove('hidden');
      }catch(err){
        console.error('FTracker import parse error',err);
        showToast('Ошибка чтения JSON-файла');
      }finally{
        if(event?.target) event.target.value='';
      }
    };
    reader.readAsText(file);
  };

  window.closeImportConfirm=function(){
    document.getElementById('importConfirmModal')?.classList.add('hidden');
    pendingImportData=null;
    pendingImportSummary=null;
  };

  window.__ftrackerDurableApplyImport=function(src, options={}){
    if(!src) return false;
    const authoritative=!!options.authoritativeExercises;
    let before=null;
    try { before=importClone(data); } catch(e) { before=null; }

    try{
      data=migrateFTrackerState(data);

      if(!Array.isArray(data._importedBackupFingerprints)) data._importedBackupFingerprints=[];
      if(data._importedBackupFingerprints.includes(src.sourceFingerprint)){
        showToast('Этот файл уже импортирован — данные не дублированы');
        closeImportConfirm();
        return true;
      }

      const normalizedSrc=migrateFTrackerState(importClone(src));
      const summary={
        programs:0,programsUpdated:0,history:0,measurements:0,foodEntries:0,
        products:0,productsUpdated:0,conflicts:0,exercises:0,exerciseMerged:0,
        fields:0,fieldsMerged:0,limits:0,limitConflicts:0
      };
      const failed=[];
      const strictImport=!!options.strictImport;
      const step=(name,fn)=>{
        try{return fn();}catch(err){
          failed.push(name);
          console.error('FTracker import section failed:',name,err);
          if(strictImport) throw new Error('Раздел импорта «'+name+'» не восстановлен: '+(err?.message||err));
          return null;
        }
      };

      // Aliases must be available before matching programs/exercises.
      step('алиасы',()=>{
        if(!data.exerciseAliases || typeof data.exerciseAliases!=='object') data.exerciseAliases={};
        if(!data.programAliases || typeof data.programAliases!=='object') data.programAliases={};
        Object.entries(normalizedSrc.exerciseAliases||{}).forEach(([k,v])=>{if(data.exerciseAliases[k]===undefined)data.exerciseAliases[k]=v;});
        Object.entries(normalizedSrc.programAliases||{}).forEach(([k,v])=>{if(data.programAliases[k]===undefined)data.programAliases[k]=v;});
      });

      // First merge reference/configuration data so historical references can be translated.
      const pResult=step('сплиты',()=>importMergePrograms(normalizedSrc.programs||[],src.sourceFingerprint));
      if(pResult){summary.programs=pResult.added||0;summary.programsUpdated=pResult.replaced||0;summary.conflicts+=(pResult.conflicts||0);}

      const fieldResult=step('поля замеров',()=>importMergeMeasurementFields(normalizedSrc.measurementFields||[]));
      if(fieldResult){summary.fields=fieldResult.added||0;summary.fieldsMerged=fieldResult.merged||0;}

      const productResult=step('продукты',()=>importMergeProducts(normalizedSrc.productCatalog||[],src.sourceFingerprint));
      if(productResult){summary.products=productResult.added||0;summary.productsUpdated=productResult.merged||0;summary.conflicts+=(productResult.conflicts||0);}

      /* EXERCISE COMPATIBILITY CONTRACT (v1.7.60)
         A full backup is a historical data source, not a replacement for the
         exercise knowledge shipped with the new application. New built-ins
         must survive import, while legacy/user exercises, guides and exercise
         references from older backups must be restored and made resolvable. */
      const backupHiddenKeys = new Set(
        (normalizedSrc.exerciseDirectoryHidden || [])
          .map(normalizeExerciseKey)
          .filter(Boolean)
      );

      const incomingDirectory = [
        ...(normalizedSrc.exerciseDirectory || []),
        ...(normalizedSrc.exerciseDirectoryArchived || []),
        ...collectProgramExercises(normalizedSrc.programs || [])
      ]
        .map(importDirectoryItem)
        .filter(Boolean)
        .filter(item => !backupHiddenKeys.has(normalizeExerciseKey(item.name)));

      const dirResult = step('справочник упражнений', () => {
        if (!Array.isArray(data.exerciseDirectory)) data.exerciseDirectory = [];
        if (!Array.isArray(data.exerciseDirectoryArchived)) data.exerciseDirectoryArchived = [];

        /* Merge legacy/user exercises into the new directory. Never delete
           exercises shipped by the new version and never replace the current
           directory wholesale. Stable IDs are preserved where possible. */
        const result = importMergeExerciseDirectory(incomingDirectory, false);

        /* Preserve archived status from the backup without hiding newly shipped
           exercises. An archived legacy exercise remains available in the
           archive; an exercise referenced by a program/history is repaired below. */
        const archivedIncoming = (normalizedSrc.exerciseDirectoryArchived || [])
          .map(importDirectoryItem)
          .filter(Boolean);
        const activeNames = new Set((data.exerciseDirectory || []).map(e => normalizeExerciseKey(e?.name)).filter(Boolean));
        archivedIncoming.forEach(item => {
          const key=normalizeExerciseKey(item.name);
          if(!key || activeNames.has(key)) return;
          if(!(data.exerciseDirectoryArchived || []).some(e => normalizeExerciseKey(e?.name)===key)){
            data.exerciseDirectoryArchived.push(item);
          }
        });
        data.exerciseDirectoryHidden = Array.from(new Set([
          ...(Array.isArray(data.exerciseDirectoryHidden) ? data.exerciseDirectoryHidden : []),
          ...backupHiddenKeys
        ]));
        return result;
      });

      if(dirResult){
        summary.exercises=dirResult.added||0;
        summary.exerciseMerged=dirResult.merged||0;
      }

      const guideResult=step(
        'описания упражнений',
        ()=>importMergeGuideOverrides(normalizedSrc.exerciseGuideOverrides||{}, authoritative)
      );
      if(guideResult){
        summary.exercises+=guideResult.added||0;
        summary.exerciseMerged+=guideResult.merged||0;
      }

      summary.history=step('тренировки',()=>importExactAppend(data.history,normalizedSrc.history||[]))||0;
      summary.measurements=step('замеры',()=>importExactAppend(data.measurements,normalizedSrc.measurements||[]))||0;
      summary.foodEntries=step('питание',()=>importExactAppend(data.foodDiary.entries,normalizedSrc.foodDiary?.entries||[]))||0;

      const limitResult=step('лимиты КБЖУ',()=>importMergeFoodLimits(normalizedSrc.foodDiary?.limits||{}));
      if(limitResult){summary.limits=limitResult.added||0;summary.limitConflicts=limitResult.conflicts||0;}

      // Translate old references to the stable ids/names that exist in the new version.
      step('связи программ с упражнениями',()=>importRepairProgramExerciseIds());
      step('перевод ссылок',()=>importTranslateReferences(normalizedSrc));

      // Restore the Dynamics Index configuration from the backup itself.
      // History/measurements alone are not enough: a custom goal, its targets,
      // weights and the selected goal determine how the imported data is scored.
      // Older backups without these fields are left untouched.
      step('Индекс динамики',()=>{
        const hasGoal=['cut','gain','maintain','custom'].includes(normalizedSrc.fscoreGoal);
        const hasCustomGoals=Array.isArray(normalizedSrc.fscoreCustomGoals);
        const hasActiveCustomId=normalizedSrc.fscoreActiveCustomGoalId!==undefined &&
          normalizedSrc.fscoreActiveCustomGoalId!==null;
        const hasLegacyCustom=normalizedSrc.fscoreCustomGoal &&
          typeof normalizedSrc.fscoreCustomGoal==='object';
        if(hasGoal) data.fscoreGoal=normalizedSrc.fscoreGoal;
        if(hasCustomGoals) data.fscoreCustomGoals=importClone(normalizedSrc.fscoreCustomGoals);
        if(hasActiveCustomId) data.fscoreActiveCustomGoalId=String(normalizedSrc.fscoreActiveCustomGoalId);
        if(hasLegacyCustom) data.fscoreCustomGoal=importClone(normalizedSrc.fscoreCustomGoal);
        // Keep the active custom goal synchronized with the restored collection.
        if(Array.isArray(data.fscoreCustomGoals)){
          const active=data.fscoreCustomGoals.find(g=>String(g?.id||'')===String(data.fscoreActiveCustomGoalId||''));
          if(active) data.fscoreCustomGoal=importClone(active);
          else if(data.fscoreGoal==='custom' && data.fscoreCustomGoals.length){
            data.fscoreActiveCustomGoalId=String(data.fscoreCustomGoals[0].id);
            data.fscoreCustomGoal=importClone(data.fscoreCustomGoals[0]);
          }else if(!data.fscoreCustomGoals.length){
            data.fscoreCustomGoal=null;
            data.fscoreActiveCustomGoalId=null;
            if(data.fscoreGoal==='custom') data.fscoreGoal='cut';
          }
        }
      });

      // Repair is optional; it must never cancel a valid import.
      try{if(typeof repairExerciseDirectoryDuplicates==='function')repairExerciseDirectoryDuplicates(false);}catch(err){console.warn('FTracker exercise repair skipped',err);}

      data._importedBackupFingerprints.push(src.sourceFingerprint);
      if(data._importedBackupFingerprints.length>100)data._importedBackupFingerprints=data._importedBackupFingerprints.slice(-100);

      if(!saveData(false)) throw new Error('Не удалось сохранить объединённые данные в localStorage');

      // Rehydrate the legacy F-Score preference mirrors as well. The canonical
      // source is `data`, but older UI paths still read these localStorage keys.
      // This matters after a complete app reset, where those keys were deleted.
      try{
        if(['cut','gain','maintain','custom'].includes(data.fscoreGoal)) localStorage.setItem('ftracker_fscore_goal',data.fscoreGoal);
        if(Array.isArray(data.fscoreCustomGoals)) localStorage.setItem('ftracker_fscore_custom_goals',JSON.stringify(data.fscoreCustomGoals));
        if(data.fscoreCustomGoal) localStorage.setItem('ftracker_fscore_custom_goal',JSON.stringify(data.fscoreCustomGoal));
      }catch(e){ console.warn('FScore preference mirror restore skipped',e); }

      try{renderHome();}catch(e){}
      try{if(typeof renderExerciseDirectory==='function')renderExerciseDirectory();}catch(e){}
      try{if(typeof renderFoodDiary==='function')renderFoodDiary();}catch(e){}
      try{if(typeof renderProgressDashboard==='function')renderProgressDashboard();}catch(e){}
      try{if(typeof renderMeasurements==='function')renderMeasurements();}catch(e){}
      try{if(typeof renderSettings==='function')renderSettings();}catch(e){}

      closeImportConfirm();
      const suffix=failed.length ? ` (пропущены повреждённые разделы: ${failed.join(', ')})` : '';
      showToast(`Импорт выполнен: +${summary.programs} сплитов, обновлено ${summary.programsUpdated}, +${summary.history} тренировок, +${summary.measurements} замеров, +${summary.foodEntries} записей питания${summary.conflicts ? `, защищённых конфликтов ${summary.conflicts}` : ''}${suffix}`);
    }catch(err){
      console.error('FTracker durable import error',err);
      if(before) data=before;
      if(before){
        try{localStorage.setItem(STORAGE_KEY,JSON.stringify(before));}catch(restoreErr){console.error('FTracker rollback persistence failed',restoreErr);}
      }
      showToast('Импорт не выполнен: текущие данные сохранены без изменений');
      return false;
    }finally{
      pendingImportData=null;
    }

    return true;
  };

  window.__ftrackerNormalizeImport=function(raw){
    return normalizeImportedState(raw);
  };

  window.confirmImport=function(){
    return window.__ftrackerDurableApplyImport(pendingImportData);
  };

  /* ---------- Safe save guard ----------
     Prevent accidental storage of non-object state after runtime errors. */
  const originalSaveData=window.saveData;
  window.saveData=function(){
    try{
      if(!data || typeof data!=='object' || !Array.isArray(data.programs) || !Array.isArray(data.history)){
        if(typeof showToast==='function') showToast('Ошибка: состояние данных не сохранено');
        return false;
      }
    }catch(e){ return false; }
    return typeof originalSaveData==='function' ? originalSaveData.apply(this,arguments) : false;
  };

  /* ---------- Accessibility / keyboard activation for dynamically rendered
     food presets ---------- */
  document.addEventListener('keydown',function(e){
    if((e.key==='Enter'||e.key===' ') && e.target?.classList?.contains('food-preset-item')){
      e.preventDefault();
      const name=e.target.getAttribute('data-food-preset-name');
      if(name!=null && typeof selectFoodPreset==='function') selectFoodPreset(name);
    }
  },true);

  window.__ftrackerV113QA = {
    version:'115',
    calendarPeriods:true,
    importValidation:true,
    additiveImport:true,
    workoutIntegrity:true,
    saveGuard:true
  };
})();



(function(){
'use strict';
const FB_FORMAT='FTracker Full Backup';
const FB_VERSION=2;

function fbErr(e){ return String(e?.message || e || 'Неизвестная ошибка'); }
function fbClone(v){ return JSON.parse(JSON.stringify(v)); }
function fbToast(m){ try{showToast(m)}catch(e){alert(m)} }

function fbOpen(){
  return new Promise((resolve,reject)=>{
    if(!indexedDB) return reject(new Error('IndexedDB недоступна'));
    const r=indexedDB.open(window.__FTRACKER_MEDIA_DB,1);
    r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains(window.__FTRACKER_MEDIA_STORE)) r.result.createObjectStore(window.__FTRACKER_MEDIA_STORE,{keyPath:'id'}); };
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error||new Error('Не удалось открыть хранилище медиа'));
    r.onblocked=()=>reject(new Error('Хранилище медиа занято'));
  });
}
function fbReadAll(db){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(window.__FTRACKER_MEDIA_STORE,'readonly');
    const q=tx.objectStore(window.__FTRACKER_MEDIA_STORE).getAll();
    q.onsuccess=()=>resolve(Array.isArray(q.result)?q.result:[]);
    q.onerror=()=>reject(q.error||new Error('Не удалось прочитать медиа'));
  });
}
function fbDataURL(blob){
  return new Promise((resolve,reject)=>{
    if(!(blob instanceof Blob)) return reject(new Error('Запись медиа не содержит Blob'));
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result));
    r.onerror=()=>reject(r.error||new Error('Не удалось сериализовать медиа'));
    r.readAsDataURL(blob);
  });
}
function fbBlob(data){
  const p=String(data||'').indexOf(',');
  if(p<0) throw new Error('Повреждённое медиа в бэкапе');
  const header=data.slice(0,p), b64=data.slice(p+1);
  const type=(header.match(/^data:([^;,]+)/)||[])[1]||'application/octet-stream';
  const bin=atob(b64), bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type});
}
function fbReferencedIds(root){
  const ids=new Set(), seen=new WeakSet();
  const walk=v=>{
    if(!v || typeof v!=='object') return;
    if(seen.has(v)) return; seen.add(v);
    if(Array.isArray(v)){ for(const x of v) walk(x); return; }
    if(Array.isArray(v.media)){
      for(const m of v.media) if(m && typeof m==='object' && m.id) ids.add(String(m.id));
    }
    for(const k of Object.keys(v)) walk(v[k]);
  };
  walk(root); return ids;
}
async function fbSnapshot(){
  const db=await fbOpen();
  try{
    const rows=await fbReadAll(db);
    const map=new Map(), media=[];
    for(const r of rows){
      if(!r?.id) throw new Error('Найдена медиа-запись без ID');
      if(map.has(String(r.id))) throw new Error('Дублирующийся ID медиа');
      if(!(r.blob instanceof Blob)) throw new Error('Медиа '+r.id+' повреждено');
      const data=await fbDataURL(r.blob);
      const check=fbBlob(data);
      if(check.size!==r.blob.size) throw new Error('Не прошла проверка медиа '+r.id);
      const item={id:String(r.id),type:String(r.type||r.blob.type||''),name:String(r.name||''),createdAt:Number(r.createdAt)||0,size:r.blob.size,data};
      map.set(item.id,item); media.push(item);
    }
    return {media,map};
  } finally { db.close(); }
}
async function fbReplace(media){
  if(!Array.isArray(media)) throw new Error('Неверный список медиа');
  const ids=new Set(), prepared=[];
  for(const m of media){
    if(!m?.id || ids.has(String(m.id))) throw new Error('Некорректный ID медиа');
    ids.add(String(m.id));
    const blob=fbBlob(m.data);
    if(Number.isFinite(Number(m.size)) && Number(m.size)!==blob.size) throw new Error('Размер медиа '+m.id+' не совпадает');
    prepared.push({id:String(m.id),blob,type:String(m.type||blob.type||''),name:String(m.name||''),createdAt:Number(m.createdAt)||Date.now()});
  }
  const db=await fbOpen();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(window.__FTRACKER_MEDIA_STORE,'readwrite'), store=tx.objectStore(window.__FTRACKER_MEDIA_STORE);
      store.clear();
      for(const x of prepared) store.put(x);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Ошибка записи медиа'));
      tx.onabort=()=>reject(tx.error||new Error('Запись медиа отменена'));
    });
    const actual=await fbReadAll(db);
    if(actual.length!==prepared.length) throw new Error('Проверка: неверное количество медиа');
    const byId=new Map(actual.map(x=>[String(x.id),x]));
    for(const x of prepared){
      const got=byId.get(x.id);
      if(!got || !(got.blob instanceof Blob) || got.blob.size!==x.blob.size) throw new Error('Проверка: медиа '+x.id+' не восстановлено');
    }
  } finally { db.close(); }
}
function fbValidateLinks(state, media){
  const refs=fbReferencedIds(state), ids=new Set(media.map(x=>String(x.id)));
  for(const id of refs) if(!ids.has(id)) throw new Error('Для карточки отсутствует медиа: '+id);
  return refs.size;
}
function fbStable(v){
  if(v===null || typeof v!=='object') return JSON.stringify(v);
  if(Array.isArray(v)) return '['+v.map(fbStable).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+fbStable(v[k])).join(',')+'}';
}
function fbFingerprint(v){
  const s=fbStable(v); let h1=0x811c9dc5, h2=0x01000193;
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i); h1^=c; h1=Math.imul(h1,16777619);
    h2^=(c+i); h2=Math.imul(h2,2246822519);
  }
  return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
}

async function fbDownload(payload){
  const json=JSON.stringify(payload);
  const blob=new Blob([json],{type:'application/json;charset=utf-8'});
  const d=new Date(); const pad=n=>String(n).padStart(2,'0'); const stamp=`${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}_${pad(d.getHours())}-${pad(d.getMinutes())}`; const name=`${stamp}_FTracker_backup.json`;
  /* On iPhone/iPad the reliable way to put a generated file into Files is the native share sheet. */
  if(typeof File==='function' && navigator.share){
    const file=new File([blob],name,{type:'application/json'});
    try{
      if(!navigator.canShare || navigator.canShare({files:[file]})){
        await navigator.share({files:[file]});
        return {name,shared:true};
      }
    }catch(e){
      if(e?.name==='AbortError') throw e;
      console.warn('Native file share failed, using download fallback',e);
    }
  }
  /* Exactly one generated artifact: JSON only. */
  const u=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=u; a.download=name; a.type='application/json'; a.rel='noopener';
  a.style.display='none'; document.body.appendChild(a);
  try{a.click();}finally{a.remove(); setTimeout(()=>URL.revokeObjectURL(u),60000);}
  return {name,shared:false};
}

window.exportData=async function(){
  try{
    const state=fbClone(data);
    const refs=fbReferencedIds(state);
    const snap=await fbSnapshot();
    for(const id of refs) if(!snap.map.has(id)) throw new Error('Экспорт остановлен: не найден файл '+id);
    const payload={_backupMeta:{format:FB_FORMAT,version:FB_VERSION,exportedAt:new Date().toISOString(),mediaCount:snap.media.length,referencedMediaCount:refs.size},data:state,media:snap.media};
    const result=await fbDownload(payload);
    try{localStorage.setItem(LAST_EXPORT_KEY,String(Date.now()));}catch(e){}
    renderDataHistoryStatus();
    fbToast(result?.shared ? 'Бэкап готов: выберите «Сохранить в Файлы».' : 'Бэкап создан: '+result.name);
    return true;
  }catch(e){
    if(e?.name!=='AbortError') fbToast('Бэкап не создан: '+fbErr(e));
    return false;
  }
};

window.importData=function(event){
  const file=event?.target?.files?.[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const raw=JSON.parse(e.target.result);
      if(raw?._backupMeta?.format===FB_FORMAT && raw.data && Array.isArray(raw.media)){
        if(Number(raw._backupMeta.mediaCount)!==raw.media.length)
          throw new Error('Количество медиа не совпадает с метаданными');
        fbValidateLinks(raw.data,raw.media);
        pendingImportData={__backupKind:'full',data:raw.data,media:raw.media};
        fbToast('Полный бэкап готов');
      } else {
        const normalized=window.__ftrackerNormalizeImport
          ? window.__ftrackerNormalizeImport(raw) : null;
        if(!normalized) throw new Error('Файл не похож на бэкап FTracker');
        if(!normalized.sourceFingerprint) normalized.sourceFingerprint=fbFingerprint(normalized);
        pendingImportData={__backupKind:'legacy',data:normalized,media:null};
        fbToast('Бэкап готов к импорту');
      }
      lockModalScroll(); document.getElementById('importConfirmModal')?.classList.remove('hidden');
    }catch(err){ fbToast('Импорт отменён: '+fbErr(err)); }
    finally{event.target.value='';}
  };
  reader.onerror=()=>fbToast('Не удалось прочитать файл бэкапа');
  reader.readAsText(file);
};

async function fbUpsert(media){
  if(!Array.isArray(media)) throw new Error('Неверный список медиа');
  const prepared=[], ids=new Set();
  for(const m of media){
    if(!m?.id || ids.has(String(m.id))) throw new Error('Некорректный ID медиа');
    ids.add(String(m.id));
    const blob=fbBlob(m.data);
    if(Number.isFinite(Number(m.size)) && Number(m.size)!==blob.size)
      throw new Error('Размер медиа '+m.id+' не совпадает');
    prepared.push({id:String(m.id),blob,type:String(m.type||blob.type||''),name:String(m.name||''),createdAt:Number(m.createdAt)||Date.now()});
  }
  if(!prepared.length) return;
  const db=await fbOpen();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(window.__FTRACKER_MEDIA_STORE,'readwrite'), store=tx.objectStore(window.__FTRACKER_MEDIA_STORE);
      prepared.forEach(x=>store.put(x));
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Ошибка записи медиа'));
      tx.onabort=()=>reject(tx.error||new Error('Запись медиа отменена'));
    });
    const actual=await fbReadAll(db), byId=new Map(actual.map(x=>[String(x.id),x]));
    for(const x of prepared){
      const got=byId.get(x.id);
      if(!got || !(got.blob instanceof Blob) || got.blob.size!==x.blob.size)
        throw new Error('Проверка: медиа '+x.id+' не восстановлено');
    }
  } finally { db.close(); }
}

window.confirmImport=async function(){
  const p=pendingImportData;
  if(!p?.__backupKind) return;
  let oldState=null, oldMedia=null;
  try{
    oldState=fbClone(data);
    oldMedia=(await fbSnapshot()).media;

    if(p.__backupKind==='full'){
      fbValidateLinks(p.data,p.media);
      const normalized=window.__ftrackerNormalizeImport
        ? window.__ftrackerNormalizeImport(p.data) : null;
      if(!normalized) throw new Error('Не удалось подготовить данные полного бэкапа');
      normalized.sourceFingerprint=fbFingerprint({data:p.data,media:p.media});

      const ok=window.__ftrackerDurableApplyImport
        ? window.__ftrackerDurableApplyImport(normalized,{authoritativeExercises:true,strictImport:true})
        : false;
      if(!ok) throw new Error('Не удалось объединить данные полного бэкапа');

      await fbUpsert(p.media);

      const currentRefs=fbReferencedIds(data);
      const oldRefs=fbReferencedIds(oldState);
      const incomingRefs=fbReferencedIds(p.data);
      const stale=[];
      oldRefs.forEach(id=>{ if(incomingRefs.has(id) && !currentRefs.has(id)) stale.push(id); });
      for(const id of stale) await deleteMedia(id);

      const refs=fbReferencedIds(data), snap=await fbSnapshot();
      for(const id of refs){
        if(!snap.map.has(id)) throw new Error('После импорта отсутствует медиа: '+id);
      }
      var successMessage='Импорт выполнен: история объединена, упражнения и карточки сохранены, сплиты и медиа восстановлены';
    }else{
      const ok=window.__ftrackerDurableApplyImport
        ? window.__ftrackerDurableApplyImport(p.data,{authoritativeExercises:false})
        : false;
      if(!ok) throw new Error('Не удалось объединить старый бэкап. Проверьте свободное место в памяти приложения.');
      var successMessage='Импорт выполнен успешно';
    }

    try{localStorage.setItem(LAST_IMPORT_KEY,String(Date.now()));}catch(e){}
    pendingImportData=null;
    document.getElementById('importConfirmModal')?.classList.add('hidden');
    try{renderAll();}catch(renderErr){console.warn('renderAll after import failed',renderErr);}
    renderDataHistoryStatus();
    setTimeout(()=>fbToast(successMessage),80);
  }catch(e){
    console.error('FTracker unified import error',e);
    try{
      if(oldMedia) await fbReplace(oldMedia);
      if(oldState){ data=oldState; saveData(false); }
    }catch(rollbackErr){ console.error('FTracker import rollback failed',rollbackErr); }
    fbToast('Импорт не выполнен: текущие данные сохранены без изменений. Причина: '+fbErr(e));
    pendingImportData=null;
    document.getElementById('importConfirmModal')?.classList.add('hidden');
  }
};

window.closeImportConfirm=function(){
  document.getElementById('importConfirmModal')?.classList.add('hidden');
  pendingImportData=null;
};
})();



(function(){
  'use strict';
  /* iOS standalone/PWA import bridge.
     File inputs hidden with display:none can fail to open the native Files picker.
     Keep the input visually hidden and trigger it synchronously from a real user tap. */
  function bindPwaImport(){
    const trigger=document.getElementById('importFileTrigger');
    const input=document.getElementById('importFile');
    if(!trigger||!input||trigger.dataset.pwaImportBound==='1') return;
    trigger.dataset.pwaImportBound='1';
    trigger.addEventListener('click',function(e){
      // The label association handles normal browsers. This direct call is the
      // reliable fallback for iOS standalone mode and stays inside the tap gesture.
      e.preventDefault();
      try{ input.click(); }catch(err){ console.error('FTracker PWA import picker error',err); }
    },false);
    input.addEventListener('click',function(){
      // allow choosing the same file again after a previous cancelled/imported attempt
    },false);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindPwaImport,{once:true});
  else bindPwaImport();
})();

(function(){
  'use strict';
  /* No global focus, blur, pointerdown or click interception. */
  function closeThemeForImport(){
    const input=document.getElementById('importFile');
    if(!input) return;
    input.addEventListener('change',function(){
      const modal=document.getElementById('themeModal');
      if(modal) modal.classList.add('hidden');
    },{once:true});
  }
  closeThemeForImport();
  window.addEventListener('load',closeThemeForImport,{once:true});
})();



(function(){
  'use strict';
  const $=id=>document.getElementById(id);

  /* 1. Remove the old touchend food-selection path. A touchend is NOT a tap:
        it also fires after a swipe, which was the exact bug seen on iPhone. */
  const foodList=$('foodPresetList');
  if(foodList){
    const cleanFoodListeners=()=>{
      /* The legacy listener is anonymous and cannot be removed directly.
         Replace the node with a clean clone, preserving only its current
         children/state. This intentionally removes every old listener on
         the list; the canonical click delegation below is installed once. */
      const clone=foodList.cloneNode(true);
      foodList.parentNode.replaceChild(clone,foodList);
      clone.addEventListener('click',function(e){
        const item=e.target.closest?.('.food-preset-item[data-food-preset-name]');
        if(!item || !clone.contains(item)) return;
        e.preventDefault();
        e.stopPropagation();
        const name=item.getAttribute('data-food-preset-name');
        if(name!=null && typeof window.selectFoodPreset==='function') window.selectFoodPreset(name);
      },false);
    };
    cleanFoodListeners();
  }

  /* 2. Give each search field its own positioning context. The old helper
        positioned the clear button against the whole modal, so its top:50%
        moved whenever the modal's content height changed. */
  function wrapSearch(inputId){
    const input=$(inputId);
    if(!input || input.closest('.ft-search-wrap')) return;
    const parent=input.parentElement;
    if(!parent) return;
    const wrap=document.createElement('div');
    wrap.className='ft-search-wrap';
    parent.insertBefore(wrap,input);
    wrap.appendChild(input);

    /* Move any already-created clear buttons into the same wrapper. */
    Array.from(parent.children).forEach(el=>{
      if(el===wrap) return;
      if(el.matches?.('[id*="SearchClear"],[id*="ProgramClear"],[id*="ProgressClear"],[id*="ReplaceClear"]')){
        wrap.appendChild(el);
      }
    });
  }
  wrapSearch('exercisePickerSearch');
  wrapSearch('progressExercisePickerSearch');
  wrapSearch('replaceExerciseSearch');

  /* Existing clear buttons may have been appended to the parent after the
     wrapper was created. Re-home them once after the current event loop. */
  setTimeout(()=>{
    wrapSearch('exercisePickerSearch');
    wrapSearch('progressExercisePickerSearch');
    wrapSearch('replaceExerciseSearch');
    ['exercisePickerSearch','progressExercisePickerSearch','replaceExerciseSearch'].forEach(id=>{
      const input=$(id), wrap=input?.closest('.ft-search-wrap');
      if(!input||!wrap) return;
      const parent=wrap.parentElement;
      if(parent) Array.from(parent.children).forEach(el=>{
        if(el!==wrap && el.matches?.('[id*="SearchClear"],[id*="ProgramClear"],[id*="ProgressClear"],[id*="ReplaceClear"]')) wrap.appendChild(el);
      });
    });
  },0);
})();



(function(){
  const stack=[];
  window.FTrackerWindowManager={
    open(el, opener){
      if(!el) return;
      const current=document.querySelector('.active-window-layer');
      if(current && current!==el){ current.classList.remove('active-window-layer'); current.classList.add('background-locked'); }
      stack.push({el:el, opener:opener||document.activeElement, scroll:window.scrollY});
      el.classList.add('active-window-layer');
      document.body.classList.add('layer-locked');
      el.querySelector('[autofocus],button,input,textarea')?.focus?.();
    },
    close(el){
      if(el) el.classList.remove('active-window-layer');
      const item=stack.pop();
      const prev=stack[stack.length-1];
      if(prev && prev.el){ prev.el.classList.remove('background-locked'); prev.el.classList.add('active-window-layer'); prev.opener?.focus?.(); }
      else { document.body.classList.remove('layer-locked'); item?.opener?.focus?.(); }
    }
  };
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      const active=document.querySelector('.active-window-layer');
      if(active) window.FTrackerWindowManager.close(active);
    }
  });
})();


/* ===== v1.2.4 PROGRESS PICKER: DIRECT DIRECTORY STRUCTURE ===== */
(function(){
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function key(v){
    try { return typeof normalizeExerciseKey==='function' ? normalizeExerciseKey(v) : String(v||'').toLocaleLowerCase('ru').trim(); }
    catch(e){ return String(v||'').toLocaleLowerCase('ru').trim(); }
  }
  function progressNames(){
    try { return (typeof getProgressExerciseNames==='function' ? getProgressExerciseNames() : []).filter(Boolean); }
    catch(e){ return []; }
  }
  function progressGroupMap(names){
    const map=new Map();
    try{
      const directory=(typeof getDirectoryExercises==='function' ? getDirectoryExercises() : []);
      directory.forEach(function(item){ map.set(key(item.name), item.group||'Другое'); });
    }catch(e){}
    names.forEach(function(name){
      if(!map.has(key(name))){
        let group='Другое';
        try{ if(typeof inferExerciseGroup==='function') group=inferExerciseGroup(name, typeof getExerciseTypeByName==='function'?getExerciseTypeByName(name):'strength')||'Другое'; }catch(e){}
        map.set(key(name),group);
      }
    });
    return map;
  }

  // This renderer deliberately copies the DIRECTORY layout: group heading -> exercise rows -> next group.
  // No selector, no dropdown and no "Все группы мышц" control exists here.
  window.renderProgressExercisePicker=function(){
    const root=document.getElementById('progressPickerList');
    const input=document.getElementById('progressExercisePickerSearch');
    if(!root) return;

    const query=key(input&&input.value||'');
    const current=window.progressSelectedExercise||'';
    const names=progressNames().filter(function(name){ return !query || key(name).includes(query); });

    if(!names.length){
      root.innerHTML='<div class="card" style="text-align:center;color:var(--subtext);">Упражнений с сохранённым прогрессом не найдено</div>';
      return;
    }

    const groups=(typeof DIRECTORY_GROUPS!=='undefined' && Array.isArray(DIRECTORY_GROUPS))
      ? DIRECTORY_GROUPS.slice() : ['Грудь','Бицепс','Спина','Трицепс','Плечи','Ноги','Пресс','Кардио','Другое'];
    const groupMap=progressGroupMap(names);
    const grouped=new Map(groups.map(function(g){return [g,[]];}));

    names.forEach(function(name){
      const group=groupMap.get(key(name))||'Другое';
      if(!grouped.has(group)) grouped.set(group,[]);
      grouped.get(group).push(name);
    });

    const ordered=[];
    groups.forEach(function(g){ if((grouped.get(g)||[]).length) ordered.push(g); });
    Array.from(grouped.keys()).filter(function(g){return !groups.includes(g) && grouped.get(g).length;})
      .sort(function(a,b){return a.localeCompare(b,'ru');}).forEach(function(g){ordered.push(g);});

    root.innerHTML=ordered.map(function(group){
      const items=(grouped.get(group)||[]).slice().sort(function(a,b){return a.localeCompare(b,'ru');});
      return '<section class="directory-group progress-directory-group">'
        +'<div class="directory-group-title">'+esc(group)+'</div>'
        +'<div class="directory-list">'
        +items.map(function(name){
          let count=0;
          try{
            count=(typeof getExerciseSeries==='function' && typeof getHistoryInPeriod==='function')
              ? (getExerciseSeries(name,getHistoryInPeriod('all'))||[]).length : 0;
          }catch(e){}
          const selected=name===current;
          return '<button type="button" class="directory-item-main progress-directory-row '+(selected?'selected':'')+'" data-progress-pick="'+esc(name)+'">'
            +'<span class="directory-item-name">'+esc(name)+'</span>'
            +'<span class="progress-picker-row-count" aria-label="'+count+' тренировок">'+count+'</span>'
            +'<span class="directory-chevron">'+(selected?'✓':'›')+'</span>'
            +'</button>';
        }).join('')
        +'</div></section>';
    }).join('');

    root.querySelectorAll('[data-progress-pick]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.preventDefault(); e.stopPropagation();
        const name=this.getAttribute('data-progress-pick');
        if(name && typeof window.chooseProgressExercise==='function') window.chooseProgressExercise(name);
      },{passive:false});
    });
  };

  window.openProgressExercisePicker=function(){
    const modal=document.getElementById('progressExercisePickerModal');
    if(!modal) return;
    const input=document.getElementById('progressExercisePickerSearch');
    if(input) input.value='';
    if(typeof openModal==='function') openModal(modal); else { if(typeof lockModalScroll==='function') lockModalScroll(); modal.classList.remove('hidden'); }
    window.renderProgressExercisePicker();
  };

  // Hard CSS isolation: the progress picker uses the same visible hierarchy as the directory.
  const style=document.createElement('style');
  style.textContent='\n'
    +'#progressPickerList{display:flex!important;flex:1 1 auto!important;min-height:0!important;max-height:none!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;padding:2px 0 18px!important;}\n'
    +'#progressPickerList .directory-group{display:block!important;margin:0 0 18px!important;}\n'
    +'#progressPickerList .directory-group-title{display:block!important;font-size:16px!important;font-weight:850!important;padding:8px 2px!important;margin:0 0 7px!important;text-transform:uppercase!important;letter-spacing:.08em!important;color:var(--subtext)!important;background:transparent!important;}\n'
    +'#progressPickerList .directory-list{display:flex!important;flex-direction:column!important;gap:7px!important;}\n'
    +'#progressPickerList .progress-directory-row{width:100%!important;min-height:58px!important;margin:0!important;padding:12px 13px!important;border:1px solid var(--border)!important;background:var(--card-bg)!important;border-radius:14px!important;color:var(--text)!important;text-align:left!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;cursor:pointer!important;}\n'
    +'#progressPickerList .progress-directory-row .directory-item-name{flex:1!important;min-width:0!important;font-size:16px!important;font-weight:750!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important;}\n'
    +'#progressPickerList .progress-directory-row .progress-picker-row-count{flex:0 0 30px!important;width:30px!important;height:30px!important;border:1px solid var(--border)!important;border-radius:50%!important;background:var(--input-bg)!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:12px!important;font-weight:900!important;}\n'
    +'#progressPickerList .progress-directory-row .directory-chevron{flex:none!important;font-size:24px!important;color:var(--subtext)!important;}\n'
    +'#progressPickerList .progress-directory-row.selected{outline:2px solid var(--accent)!important;}\n';
  document.head.appendChild(style);
})();
/* ===== END v1.2.4 PROGRESS PICKER ===== */

/* ===== CONSOLIDATED RUNTIME BLOCK 2 ===== */
/* ===== CANONICAL FOOD CATALOG + WORKOUT PROGRESS ===== */
/* [FIX] v1.3.9 audit cleanup: only confirmed syntax/duplicate cleanup; working legacy chains preserved. */
(function(){
  'use strict';
  const categoryFor=function(name,builtin){
    const n=String(name||'').toLowerCase();
    if(/кур|индей|говя|свинин|фарш|тефтел|кордон|мяс/.test(n))return '🥩 Мясо и птица';
    if(/лосос|тун|треск|рыб|кревет/.test(n))return '🐟 Рыба и морепродукты';
    if(/яйц/.test(n))return '🥚 Яйца';
    if(/творог|йогурт|молок|кефир|сыр|skyr/.test(n))return '🥛 Молочные продукты';
    if(/рис|греч|макарон|картоф|овся|булгур|паст/.test(n))return '🍚 Крупы и гарниры';
    if(/хлеб|лаваш|блин/.test(n))return '🍞 Хлеб и выпечка';
    if(/огур|помидор|броккол|морков|перец|овощ/.test(n))return '🥦 Овощи';
    if(/банан|яблок|апельсин|ягод|фрукт/.test(n))return '🍌 Фрукты';
    if(/арахис|миндал|масло|орех/.test(n))return '🥜 Орехи и жиры';
    if(/шоколад|мёд|сахар|пикник|батон/.test(n))return '🍫 Перекусы и сладкое';
    if(builtin)return '🍲 Блюда и другое';
    return '⭐ Мои продукты';
  };
  renderCatalogList=function(){
    const c=document.getElementById('catalogContainer');if(!c)return;
    const q=String(document.getElementById('catalogSearch')?.value||'').trim().toLowerCase();
    const items=(data.productCatalog||[]).map((p,i)=>({...p,_idx:i})).filter(p=>!q||String(p.name||'').toLowerCase().includes(q));
    if(!items.length){c.innerHTML='<div class="catalog-empty">Ничего не найдено</div>';return;}
    const groups={};
    items.forEach(p=>{const g=categoryFor(p.name,!!p.builtin);(groups[g]||(groups[g]=[])).push(p);});
    const order=['⭐ Мои продукты','🥩 Мясо и птица','🐟 Рыба и морепродукты','🥚 Яйца','🥛 Молочные продукты','🍚 Крупы и гарниры','🍞 Хлеб и выпечка','🥦 Овощи','🍌 Фрукты','🥜 Орехи и жиры','🍫 Перекусы и сладкое','🍲 Блюда и другое'];
    c.innerHTML=order.filter(g=>groups[g]?.length).map(g=>`<div class="catalog-section"><div class="catalog-section-title"><span>${g} <small style="color:var(--subtext)">(${groups[g].length})</small></span></div><div class="catalog-section-items">${groups[g].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru')).map(p=>`<div class="food-item"><div style="flex:1"><div style="font-weight:600">${escapeHtml(p.name)}</div><div style="font-size:12px;color:var(--subtext)">${p.type==='dish'?`Блюдо: ${p.calories} ккал, Б ${p.protein}, Ж ${p.fat}, У ${p.carbs}`:`на 100 г: ${p.cal100} ккал, Б ${p.protein100}, Ж ${p.fat100}, У ${p.carbs100}`}</div></div><button class="small-btn gray" onclick="editCatalogProduct(${p._idx})">✏️</button><button class="small-btn gray" onclick="deleteCatalogProduct(${p._idx})">🗑️</button></div>`).join('')}</div></div>`).join('');
  };
  // Search is bound once to the actual input and calls the canonical renderer.
  function bind(){const input=document.getElementById('catalogSearch');if(!input||input.dataset.catalogBound)return;input.dataset.catalogBound='1';input.addEventListener('input',renderCatalogList);input.addEventListener('search',renderCatalogList);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  // Global workout progress counts every actual set slot.
  // Base target: strength=3, cardio/bodyweight=1. Any user-added set beyond
  // that base target expands the total denominator by one as well.
  updateWorkoutProgressUI=function(){
    const active=getActiveExerciseIndices();
    let done=0,total=0,completedExercises=0;
    active.forEach(idx=>{
      const meta=getWorkoutExercise(idx); if(!meta) return;
      const required=getWorkoutCompletionTarget(meta.type);
      const rows=Array.isArray(workoutSets[idx]) ? workoutSets[idx].length : 0;
      const completed=countWorkoutSetResults(idx);
      total += required + Math.max(0, rows-required);
      done += completed;
      if(completed>=required) completedExercises++;
    });
    const pct=total?Math.round(done/total*100):0;
    const bar=document.getElementById('workoutProgressBar');
    const left=document.getElementById('workoutProgressLeft');
    const right=document.getElementById('workoutProgressRight');
    const text=document.getElementById('workoutProgressText');
    if(bar) bar.style.width=Math.min(100,pct)+'%';
    if(left) left.textContent=total?`Выполнено ${done} из ${total} подходов`:'Нет упражнений';
    if(right) right.textContent=active.length?`${completedExercises} из ${active.length} упражнений`:'';
    if(text) text.textContent='';
  };

  // Inline onclick/oninput attributes use global bindings, not just window properties.
  // Synchronize both paths so old implementations cannot win in the PWA.
  window.renderCatalogList=renderCatalogList;
  // [FIX] Removed no-op self-alias assignments for saveCatalogProduct/addFoodEntry.
  // Their existing implementations remain the single active public API and are not wrapped here.
  window.updateWorkoutProgressUI=updateWorkoutProgressUI;
})();

/* ===== CONSOLIDATED RUNTIME BLOCK 3 ===== */
(function(){
  /* One and only runtime implementation. Replaces all older toast wrappers. */
  window.showToast=function(message){
    document.querySelectorAll('.toast').forEach(function(node){ node.remove(); });
    var toast=document.createElement('div');
    toast.className='toast';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    toast.textContent=String(message || 'Готово');
    document.body.appendChild(toast);
    requestAnimationFrame(function(){ toast.classList.add('toast-visible'); });
    clearTimeout(window.__ftrackerToastTimer);
    window.__ftrackerToastTimer=setTimeout(function(){
      toast.classList.remove('toast-visible');
      setTimeout(function(){ if(toast.parentNode) toast.remove(); },260);
    },2400);
  };
})();

/* ===== CONSOLIDATED RUNTIME BLOCK 4 ===== */
/* FTracker — explicit full local reset.
   This action clears ALL application data stored in this browser origin:
   localStorage, sessionStorage, Cache Storage and FTracker IndexedDB databases.
   It intentionally asks for confirmation and reloads into a clean state. */
async function __ftDeleteDatabase(name){
  return new Promise(resolve=>{
    if(!name || !window.indexedDB) return resolve();
    try{
      const req=indexedDB.deleteDatabase(name);
      req.onsuccess=req.onerror=req.onblocked=()=>resolve();
    }catch(_){ resolve(); }
  });
}
async function clearTemporaryFiles(){
  const message='Полностью очистить все сохранённые данные приложения? Будут удалены тренировки, история, замеры, питание, прогресс, программы, каталог, черновики, резервные данные и кэш. Это действие нельзя отменить.';
  if(!window.confirm(message)) return;
  try{
    // Stop every delayed persistence job before touching storage. Otherwise a
    // pending auto-backup can recreate deleted data during the 250 ms reload gap.
    try{ clearTimeout(autoBackupTimer); autoBackupTimer=null; }catch(_){}
    try{ if(autoBackupDbPromise){ autoBackupDbPromise.then(db=>{try{db.close();}catch(_){}}).catch(()=>{}); } }catch(_){}
    try{ if(mediaDbPromise){ mediaDbPromise.then(db=>{try{db.close();}catch(_){}}).catch(()=>{}); } }catch(_){}

    // 1) Clear every storage key used by the app.
    try{ localStorage.clear(); }catch(_){}
    try{ sessionStorage.clear(); }catch(_){}

    // 2) Clear browser caches for the application shell and media responses.
    try{
      if(window.caches){
        const keys=await caches.keys();
        await Promise.all(keys.map(key=>caches.delete(key)));
      }
    }catch(_){}

    // 3) Delete known FTracker IndexedDB stores, including media and automatic backups.
    const dbNames=new Set(['FTrackerAutoBackupV1','FTrackerExerciseMediaV1']);
    try{
      if(indexedDB.databases){
        const dbs=await indexedDB.databases();
        (dbs||[]).forEach(db=>{
          const name=String(db?.name||'');
          if(/ftracker|exercisemedia|autobackup/i.test(name)) dbNames.add(name);
        });
      }
    }catch(_){}
    await Promise.all([...dbNames].map(__ftDeleteDatabase));

    // 4) Drop the current in-memory references before reloading.
    try{ if(typeof clearDraft==='function') clearDraft(); }catch(_){}
    try{ if(Array.isArray(modalStack)) modalStack.length=0; }catch(_){}

    if(typeof showToast==='function') showToast('Все данные приложения очищены. Перезапуск…');
    setTimeout(()=>{
      // Force the current clean app shell to initialise data from defaults.
      location.replace(location.pathname+'?v=1.8.77&reset='+Date.now());
    },250);
  }catch(err){
    console.error('Full application reset failed',err);
    if(typeof showToast==='function') showToast('Не удалось полностью очистить данные приложения');
  }
}

/* ===== CONSOLIDATED RUNTIME BLOCK 5 ===== */
(function(){
  /* Display only: remove “Сплит N:” from the workout title without changing program data. */
  function normalizeWorkoutTitle(){
    const el=document.getElementById('workoutTitle');
    if(!el) return;
    const raw=String(el.textContent||'');
    const clean=raw.replace(/^\s*Сплит\s*\d+\s*[:\-–—]\s*/i,'').trim();
    if(clean && clean!==raw) el.textContent=clean;
  }
  const title=document.getElementById('workoutTitle');
  if(title){
    new MutationObserver(normalizeWorkoutTitle).observe(title,{childList:true,characterData:true,subtree:true});
    normalizeWorkoutTitle();
  }

  /* Latest measurement comparison starts collapsed. */
  window.toggleLatestMeasurementComparison=function(){
    const card=document.querySelector('#comparisonBlock .body-comparison-card');
    if(!card) return;
    const open=!card.classList.contains('is-open');
    card.classList.toggle('is-open',open);
    card.classList.toggle('is-collapsed',!open);
    const btn=card.querySelector('.body-comparison-toggle');
    if(btn) btn.setAttribute('aria-expanded',String(open));
  };
  const previousShow=window.showLatestMeasurementComparison;
  window.showLatestMeasurementComparison=function(){
    const block=document.getElementById('comparisonBlock');
    if(!block) return;
    if(typeof data==='undefined' || !Array.isArray(data.measurements) || !data.measurements.length){block.innerHTML='';return;}
    const latestIndex=data.measurements.length-1;
    const content=typeof buildMeasurementComparison==='function'
      ? buildMeasurementComparison(latestIndex) : '';
    block.innerHTML='<div class="body-comparison-card is-collapsed">'
      +'<button type="button" class="body-comparison-toggle" aria-expanded="false" onclick="toggleLatestMeasurementComparison()">'
      +'<span class="body-comparison-toggle-title">Сравнение с предыдущим замером</span>'
      +'<span class="body-comparison-toggle-icon" aria-hidden="true">⌄</span>'
      +'</button>'+(content||'')+'</div>';
  };
})();

/* ===== CONSOLIDATED RUNTIME BLOCK 6 ===== */
(function(){
  function sync(){
    const screen=document.getElementById('workoutScreen');
    if(!screen || screen.classList.contains('hidden')) return;
    const bar=screen.querySelector(':scope > .workout-topbar');
    if(!bar) return;
    const h=Math.ceil(bar.getBoundingClientRect().height);
    screen.style.setProperty('--ft-workout-content-top', Math.max(0,h)+'px');
  }
  window.__ftSyncWorkoutViewport=sync;
  window.addEventListener('resize',sync,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(sync,80),{passive:true});
  document.addEventListener('DOMContentLoaded',()=>{
    sync();
    const screen=document.getElementById('workoutScreen');
    const bar=screen?.querySelector(':scope > .workout-topbar');
    if(window.ResizeObserver && bar) new ResizeObserver(sync).observe(bar);
  });
  requestAnimationFrame(sync);
})();
