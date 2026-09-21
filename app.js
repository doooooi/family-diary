/* ============ CONFIG ============ */
const PALETTE = ['#FF9B85','#7FB8DE','#B39DDB','#FFCB57','#8FB37E','#F2A65A','#ACA9A4','#F49AC2','#7FD1C1','#C98BDB'];

const DEFAULT_MEMBERS = [
  { id:'mom',   label:'엄마', color:'#FF9B85', kind:'person', inCalendar:true,  items:[{id:'supplement', name:'영양제'}, {id:'diabetes', name:'당뇨약'}] },
  { id:'dad',   label:'아빠', color:'#7FB8DE', kind:'person', inCalendar:true,  items:[{id:'supplement', name:'영양제'}] },
  { id:'doi',   label:'도이', color:'#B39DDB', kind:'person', inCalendar:true,  items:[{id:'supplement', name:'영양제'}] },
  { id:'taeng', label:'탱이', color:'#FFCB57', kind:'person', inCalendar:true,  items:[{id:'supplement', name:'영양제'}] },
  { id:'honi',  label:'호니', color:'#ACA9A4', kind:'cat',    inCalendar:false, items:[{id:'omega', name:'오메가'}] },
  { id:'mori',  label:'모리', color:'#F2A65A', kind:'cat',    inCalendar:false, items:[{id:'omega', name:'오메가'}, {id:'heart', name:'심장약'}] },
];

/* ============ STATE ============ */
let state = {
  tab: 'calendar',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  medFolder: 'mom',
  medYear: new Date().getFullYear(),
  medMonth: new Date().getMonth(),
  openScheduleDay: null,
  openMedDetail: null,
  openMemberSettings: false,
  editingItem: null,        // { folderId, itemId }
  editingMemberId: null,    // memberId being renamed
  deleteConfirmId: null,    // memberId pending delete confirm
  members: [],
  schedule: {},
  medData: {},
  loaded: false,
};

const todayStr = fmtDate(new Date());
function fmtDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function genId(prefix){ return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); }
function calMembers(){ return state.members.filter(m=>m.inCalendar); }
function getMember(id){ return state.members.find(m=>m.id===id); }
function lighten(hex, amt=0.72){
  const c = hex.replace('#','');
  const r = parseInt(c.substring(0,2),16), g = parseInt(c.substring(2,4),16), b = parseInt(c.substring(4,6),16);
  return '#'+[r,g,b].map(v=>Math.round(v+(255-v)*amt).toString(16).padStart(2,'0')).join('');
}


function normalizeSchedule(raw){
  const out = {};
  if(!raw || typeof raw !== 'object') return out;

  Object.entries(raw).forEach(([date, value])=>{
    const source = Array.isArray(value) ? value : [value];
    const items = source
      .filter(ev => ev && typeof ev === 'object')
      .map(ev => ({
        ...ev,
        id: ev.id || genId('ev'),
        scheduleType: ev.scheduleType === 'personal' ? 'personal' : 'family',
        ownerId: ev.ownerId || '',
        time: ev.time || '',
        endDate: ev.endDate || '',
        members: ev.members && typeof ev.members === 'object' ? ev.members : {},
        note: ev.note || '',
      }));
    if(items.length) out[date] = items;
  });
  return out;
}

/* ============ STORAGE ============ */
const SUPABASE_URL = 'https://urkzpylwprqpgvdirvdc.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XUFvvHSSYBbd8SctX_mOxw_bo1q9UAt';
const SUPABASE_TABLE_URL = `${SUPABASE_URL}/rest/v1/family_diary_data?id=eq.main`;

function supabaseHeaders(extra={}){
  return {
    'apikey': SUPABASE_PUBLISHABLE_KEY,
    ...extra,
  };
}

async function loadAll(){
  try{
    const response = await fetch(`${SUPABASE_TABLE_URL}&select=schedule,med_data,members`, {
      headers: supabaseHeaders(),
      cache: 'no-store',
    });
    if(!response.ok) throw new Error(`불러오기 실패 (${response.status})`);
    const rows = await response.json();
    const row = rows[0];
    if(!row) throw new Error('가족 다이어리 저장 행을 찾을 수 없습니다.');

    state.schedule = normalizeSchedule(row.schedule);
    state.medData = row.med_data && typeof row.med_data === 'object' ? row.med_data : {};
    if(Array.isArray(row.members) && row.members.length){
      state.members = row.members;
      state.members.forEach(m=>{
        if(m.kind==='baby') m.kind='person';
        if(!m.avatarStyle) m.avatarStyle='name';
      });
    } else {
      state.members = JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
      saveMembers();
    }
  }catch(e){
    console.error('load error', e);
    state.schedule = {};
    state.medData = {};
    state.members = JSON.parse(JSON.stringify(DEFAULT_MEMBERS));
    alert('저장된 기록을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해 주세요.');
  }
  state.loaded = true;
  render();
}

async function saveCloud(changes){
  const response = await fetch(SUPABASE_TABLE_URL, {
    method: 'PATCH',
    headers: supabaseHeaders({
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    }),
    body: JSON.stringify({...changes, updated_at: new Date().toISOString()}),
  });
  if(!response.ok) throw new Error(`저장 실패 (${response.status})`);
}
function showSaveSpark(){
  const spark=document.createElement('div');
  spark.className='save-spark';
  spark.textContent='♥';
  document.body.appendChild(spark);
  setTimeout(()=>spark.remove(),900);
}
async function saveSchedule(){ try{ await saveCloud({schedule:state.schedule}); showSaveSpark(); }catch(e){ console.error(e); alert('일정을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.'); } }
async function saveMedData(){ try{ await saveCloud({med_data:state.medData}); showSaveSpark(); }catch(e){ console.error(e); alert('약 기록을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.'); } }
async function saveMembers(){ try{ await saveCloud({members:state.members}); showSaveSpark(); }catch(e){ console.error(e); alert('가족 정보를 저장하지 못했어요. 인터넷 연결을 확인해 주세요.'); } }

/* ============ ICONS ============ */
function capsuleIcon(taken, size=22){
  const fill = taken ? '#FFB84D' : '#E4DAC8';
  const fill2 = taken ? '#FFE1A8' : '#F1E9D8';
  return `<svg class="pill-icon" width="${size}" height="${size}" viewBox="0 0 32 32">
    <g transform="rotate(45 16 16)">
      <rect x="4" y="11" width="24" height="10" rx="5" fill="${fill2}"/>
      <path d="M16 11 H23 A5 5 0 0 1 23 21 H16 Z" fill="${fill}"/>
      <line x1="16" y1="11" x2="16" y2="21" stroke="#fff" stroke-width="1.2" opacity=".6"/>
    </g>
  </svg>`;
}
function fishIcon(active, size=16){
  const c = active ? '#7FB8DE' : '#D9D1C2';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">
    <path d="M3 12 C7 6, 15 6, 20 12 C15 18, 7 18, 3 12 Z" fill="${c}"/>
    <path d="M20 12 L24 8 V16 Z" fill="${c}"/>
    <circle cx="8" cy="11" r="1.2" fill="#fff"/>
  </svg>`;
}
function heartIcon(active, size=16){
  const c = active ? '#FF9B85' : '#D9D1C2';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">
    <path d="M12 21 C6 16 2 12.5 2 8.5 C2 5.5 4.4 3 7.4 3 C9.2 3 10.8 3.9 12 5.3 C13.2 3.9 14.8 3 16.6 3 C19.6 3 22 5.5 22 8.5 C22 12.5 18 16 12 21 Z" fill="${c}"/>
  </svg>`;
}
function bloodDropIcon(taken, size=22){
  const c = taken ? '#E0684F' : '#E4DAC8';
  const c2 = taken ? '#FFB3A3' : '#F1E9D8';
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32">
    <path d="M16 4 C16 4 6 17 6 22.5 A10 10 0 0 0 26 22.5 C26 17 16 4 16 4 Z" fill="${c}"/>
    <ellipse cx="12.5" cy="20" rx="2.6" ry="3.4" fill="${c2}" opacity=".8"/>
  </svg>`;
}
function iconForItem(itemId, taken, size){
  if(itemId==='diabetes') return bloodDropIcon(taken, size||22);
  if(itemId==='omega') return fishIcon(taken, size||16);
  if(itemId==='heart') return heartIcon(taken, size||16);
  return capsuleIcon(taken, size||22);
}
function catAvatar(color, size=64){
  const soft = lighten(color, .78);
  const inner = lighten(color, .5);
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="47" fill="${soft}"/>
    <path d="M25 39 L27 19 Q28 14 33 18 L45 29 Q50 27 55 29 L67 18 Q72 14 73 20 L75 40 C82 48 80 68 70 77 C60 86 40 86 30 77 C20 68 18 48 25 39Z" fill="${color}" stroke="#403832" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M30 33 L31 23 L40 31Z" fill="${inner}"/><path d="M60 31 L69 23 L70 33Z" fill="${inner}"/>
    <path d="M36 48 Q40 45 44 48 M56 48 Q60 45 64 48" fill="none" stroke="#403832" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M46 57 Q50 54 54 57 Q52 61 50 61 Q48 61 46 57Z" fill="#A96F68"/>
    <path d="M50 61 Q46 66 42 63 M50 61 Q54 66 58 63" fill="none" stroke="#403832" stroke-width="2" stroke-linecap="round"/>
    <path d="M27 57 L41 59 M26 64 L40 63 M73 57 L59 59 M74 64 L60 63" stroke="#403832" stroke-width="1.7" stroke-linecap="round" opacity=".65"/>
  </svg>`;
}
function personAvatar(hex, size=64){
  const soft = lighten(hex, .78);
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="47" fill="${soft}"/>
    <path d="M20 93 Q22 71 37 66 L63 66 Q78 71 80 93Z" fill="${hex}"/>
    <path d="M31 43 Q31 24 50 24 Q69 24 69 43 V52 Q69 70 50 74 Q31 70 31 52Z" fill="#F7D8C5" stroke="#403832" stroke-width="2"/>
    <path d="M29 45 Q27 19 50 17 Q74 19 71 49 L65 39 Q50 38 39 30 Q35 39 29 45Z" fill="#403832"/>
    <path d="M38 49 Q42 46 46 49 M54 49 Q58 46 62 49" fill="none" stroke="#403832" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M44 60 Q50 65 56 60" fill="none" stroke="#A96F68" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`;
}
function memberAvatar(member, size){
  const known = ['mom','dad','doi','taeng','honi','mori'].includes(member.id);
  const style = member.avatarStyle || 'name';
  const extraClass = style==='adult-man'?'avatar-adult-man':style==='grandpa'?'avatar-grandpa':style==='grandma'?'avatar-grandma':'';
  const hasExtra = member.kind==='person' && !!extraClass;
  return `<div class="avatar-art ${hasExtra?'avatar-extra '+extraClass:(known?'avatar-'+member.id:'avatar-fallback')}" style="width:${size}px;height:${size}px">${known||hasExtra?'':escapeHtml(member.label.slice(0,3))}</div>`;
}

/* ============ RENDER ROOT ============ */
function render(){
  const app = document.getElementById('app');
  if(!state.loaded){
    app.innerHTML = `<div style="text-align:center;padding-top:120px;font-family:'Gaegu';font-size:18px;color:var(--ink-light);">불러오는 중... 🐾</div>`;
    return;
  }
  app.innerHTML = `
    <div class="app-header">
      <button class="settings-btn" id="open-settings" title="가족 구성원 관리" aria-label="가족 구성원 관리"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="7" r="2" fill="#FFF9F2" stroke="currentColor" stroke-width="1.8"/><circle cx="15" cy="12" r="2" fill="#FFF9F2" stroke="currentColor" stroke-width="1.8"/><circle cx="10" cy="17" r="2" fill="#FFF9F2" stroke="currentColor" stroke-width="1.8"/></svg></button>
      <img class="title-art title-art-new" src="assets/image-03.png" alt="우리 가족 다이어리">
    </div>
    <div class="tabbar">
      <button class="tab-btn cal ${state.tab==='calendar'?'active':''}" data-tab="calendar"><span class="tab-icon tab-icon-cal"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6.5" width="24" height="21" rx="6" fill="#FFF7F2" stroke="currentColor" stroke-width="2.2"/><path d="M4.8 12h22.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M10 4.5v4M22 4.5v4" stroke="#594B43" stroke-width="2.5" stroke-linecap="round"/><path d="M16 24.1s-5.1-2.8-5.1-6.2c0-2.7 3.4-3.6 5.1-1.3 1.7-2.3 5.1-1.4 5.1 1.3 0 3.4-5.1 6.2-5.1 6.2Z" fill="#F59A8C"/></svg></span><span>가족 일정</span></button>
      <button class="tab-btn med ${state.tab==='meds'?'active':''}" data-tab="meds"><span class="tab-icon tab-icon-med"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="9" y="7" width="14" height="20.5" rx="5" fill="#F1FAF4" stroke="currentColor" stroke-width="2.2"/><rect x="11" y="3.5" width="10" height="5" rx="2" fill="#FFF8ED" stroke="#594B43" stroke-width="2.1"/><path d="M12.5 14.5h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 24s-4.1-2.3-4.1-5c0-2.1 2.7-2.9 4.1-1 1.4-1.9 4.1-1.1 4.1 1 0 2.7-4.1 5-4.1 5Z" fill="#F6A39B"/></svg></span><span>약 타임</span></button>
    </div>
    <div id="tab-content"></div>
    <footer>매일매일, 우리 가족의 작은 기록</footer>
  `;
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.addEventListener('click', ()=>{ state.tab = b.dataset.tab; render(); });
  });
  document.getElementById('open-settings').addEventListener('click', ()=>{ state.openMemberSettings = true; render(); });

  const content = document.getElementById('tab-content');
  if(state.tab==='calendar'){
    content.innerHTML = renderCalendarTab();
    attachCalendarEvents();
  } else {
    content.innerHTML = renderMedsTab();
    attachMedsEvents();
  }
  if(state.openScheduleDay) renderScheduleModal(state.openScheduleDay);
  if(state.openMedDetail) renderMedDetailModal(state.openMedDetail.folderId, state.openMedDetail.dateStr);
  if(state.openMemberSettings) renderMemberSettingsModal();
}

function monthGridDates(year, month){
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells = [];
  for(let i=0;i<startOffset;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(d);
  return cells;
}

function scheduleItemsForDate(dateStr){
  const items = [];
  Object.entries(state.schedule).forEach(([startDate, bucket])=>{
    const events = Array.isArray(bucket) ? bucket : [];
    events.forEach(event=>{
      const endDate = event.endDate || startDate;
      if(startDate <= dateStr && dateStr <= endDate){
        items.push({startDate, event});
      }
    });
  });
  items.sort((a,b)=>{
    const ta = a.event.time || '99:99';
    const tb = b.event.time || '99:99';
    if(ta !== tb) return ta.localeCompare(tb);
    return a.startDate.localeCompare(b.startDate);
  });
  return items;
}

function scheduleEventTitle(event){
  const note = (event.note || '').trim();
  if(note) return note;
  if(event.scheduleType === 'personal'){
    const owner = getMember(event.ownerId);
    return `${owner ? owner.label : '개인'} 일정`;
  }
  return '가족 일정';
}

function scheduleEventPeople(event){
  if(event.scheduleType === 'personal'){
    const owner = getMember(event.ownerId);
    return owner ? [owner] : [];
  }
  return calMembers().filter(m => event.members && event.members[m.id]);
}

function removeScheduleEvent(startDate, eventId){
  const bucket = Array.isArray(state.schedule[startDate]) ? state.schedule[startDate] : [];
  state.schedule[startDate] = bucket.filter(ev => ev.id !== eventId);
  if(!state.schedule[startDate].length) delete state.schedule[startDate];
}

function shortDate(dateStr){
  const parts = (dateStr || '').split('-');
  return parts.length === 3 ? `${Number(parts[1])}.${Number(parts[2])}` : dateStr;
}

/* ============ CALENDAR TAB ============ */
function renderCalendarTab(){
  const members = calMembers();
  const cells = monthGridDates(state.calYear, state.calMonth);
  const weekdays = ['일','월','화','수','목','금','토'];
  let cellsHtml = cells.map(d=>{
    if(d===null) return `<div class="day-cell empty"></div>`;
    const dateStr = state.calYear+'-'+String(state.calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const isToday = dateStr === todayStr;
    const entries = scheduleItemsForDate(dateStr);
    const isRangeDay = entries.some(({startDate,event}) => (event.endDate || '') > startDate);
    const preview = entries.slice(0,2).map(({event})=>{
      const people = scheduleEventPeople(event);
      const owner = event.scheduleType === 'personal' ? getMember(event.ownerId) : null;
      const accent = owner?.color || people[0]?.color || '#E58F7D';
      const badge = event.scheduleType === 'personal' ? (owner?.label?.charAt(0) || '나') : '가';
      const title = scheduleEventTitle(event);
      const timeText = event.time ? `${event.time} ` : '';
      return `<div class="calendar-event-mini ${event.scheduleType==='personal'?'personal':'family'}" title="${escapeAttr(title)}">
        <span class="calendar-event-dot" style="background:${accent}">${escapeHtml(badge)}</span>
        <span class="calendar-event-text">${escapeHtml(timeText + title)}</span>
      </div>`;
    }).join('');
    const more = entries.length > 2 ? `<div class="calendar-event-more">+${entries.length-2}개</div>` : '';

    return `<div class="day-cell ${isToday?'today':''} ${isRangeDay?'range-day':''}" data-date="${dateStr}">
      <div class="day-num">${d}</div>
      <div class="calendar-events-mini">${preview}${more}</div>
    </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="cal-nav">
        <button data-nav="-1" aria-label="이전 달"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6.5-5 5.5 5 5.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="cal-title">${state.calYear}년 ${state.calMonth+1}월</div>
        <button data-nav="1" aria-label="다음 달"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6.5 5 5.5-5 5.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div class="weekdays">${weekdays.map(w=>`<div>${w}</div>`).join('')}</div>
      <div class="grid">${cellsHtml}</div>
    </div>
    <div class="card" style="padding:14px 18px;">
      <div style="font-size:13px;color:var(--ink-light);margin-bottom:8px;">날짜를 눌러 가족 일정과 각자의 일정을 여러 개 등록해보세요 🐾</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;">
        ${members.map(m=>`<div style="display:flex;align-items:center;gap:6px;font-size:13px;">
          <div style="width:16px;height:16px;border-radius:50%;background:${m.color};"></div>${m.label}
        </div>`).join('')}
      </div>
    </div>
  `;
}
function attachCalendarEvents(){
  document.querySelectorAll('[data-nav]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const dir = parseInt(b.dataset.nav);
      state.calMonth += dir;
      if(state.calMonth<0){ state.calMonth=11; state.calYear--; }
      if(state.calMonth>11){ state.calMonth=0; state.calYear++; }
      render();
    });
  });
  document.querySelectorAll('.day-cell[data-date]').forEach(c=>{
    c.addEventListener('click', ()=>{ state.openScheduleDay = c.dataset.date; render(); });
  });
}

/* ---- Schedule Modal ---- */
function renderScheduleModal(selectedDate){
  const existing = document.getElementById('schedule-overlay');
  if(existing) existing.remove();

  const members = calMembers();
  const [y,m,d] = selectedDate.split('-').map(Number);
  let editingRef = null;
  let deleteTarget = null;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'schedule-overlay';
  document.body.appendChild(overlay);

  function closeModal(){
    state.openScheduleDay = null;
    overlay.remove();
  }
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeModal(); });

  function renderList(){
    const entries = scheduleItemsForDate(selectedDate);
    overlay.innerHTML = `
      <div class="sheet schedule-sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-title">${y}년 ${m}월 ${d}일 📌</div>
        <div class="sheet-sub">이 날의 일정을 각각 추가하고 관리할 수 있어요</div>

        <div class="schedule-list">
          ${entries.length ? entries.map(({startDate,event})=>{
            const people = scheduleEventPeople(event);
            const owner = event.scheduleType === 'personal' ? getMember(event.ownerId) : null;
            const isDelete = deleteTarget && deleteTarget.startDate===startDate && deleteTarget.eventId===event.id;
            const rangeText = event.endDate && event.endDate > startDate ? `${shortDate(startDate)} ~ ${shortDate(event.endDate)}` : shortDate(startDate);
            const peopleText = event.scheduleType === 'personal'
              ? (owner ? owner.label : '개인')
              : (people.length ? people.map(p=>p.label).join(' · ') : '가족 공통');
            return `<div class="schedule-item-card ${event.scheduleType==='personal'?'personal':'family'}">
              <div class="schedule-item-top">
                <div class="schedule-type-badge ${event.scheduleType==='personal'?'personal':'family'}">${event.scheduleType==='personal' ? '개인 일정' : '가족 일정'}</div>
                <div class="schedule-item-meta">${escapeHtml(rangeText)}${event.time ? ` · ${escapeHtml(event.time)}` : ''}</div>
              </div>
              <div class="schedule-item-title">${escapeHtml(scheduleEventTitle(event))}</div>
              <div class="schedule-item-people">
                ${event.scheduleType==='personal' && owner ? `<span class="schedule-person-dot" style="background:${owner.color}"></span>` : ''}
                ${escapeHtml(peopleText)}
              </div>
              ${isDelete ? `
                <div class="schedule-delete-confirm">
                  <span>이 일정만 삭제할까요?</span>
                  <div>
                    <button class="schedule-confirm-delete" data-confirm-delete="${escapeAttr(startDate+'|'+event.id)}">삭제</button>
                    <button class="schedule-confirm-cancel">취소</button>
                  </div>
                </div>
              ` : `
                <div class="schedule-item-actions">
                  <button class="schedule-edit-btn" data-edit-schedule="${escapeAttr(startDate+'|'+event.id)}">수정</button>
                  <button class="schedule-remove-btn" data-delete-schedule="${escapeAttr(startDate+'|'+event.id)}">삭제</button>
                </div>
              `}
            </div>`;
          }).join('') : `
            <div class="schedule-empty">
              <div class="schedule-empty-icon">📅</div>
              <div class="schedule-empty-title">등록된 일정이 없어요</div>
              <div class="schedule-empty-sub">가족 일정이나 개인 일정을 따로 추가해보세요.</div>
            </div>
          `}
        </div>

        <button class="schedule-add-btn" id="add-schedule">＋ 일정 추가하기</button>
        <button class="schedule-close-list" id="close-schedule-list">닫기</button>
      </div>
    `;

    overlay.querySelector('#close-schedule-list').addEventListener('click', closeModal);
    overlay.querySelector('#add-schedule').addEventListener('click', ()=>{
      editingRef = null;
      deleteTarget = null;
      renderForm();
    });
    overlay.querySelectorAll('[data-edit-schedule]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const [startDate,eventId] = btn.dataset.editSchedule.split('|');
        const bucket = state.schedule[startDate] || [];
        const event = bucket.find(ev=>ev.id===eventId);
        if(event){ editingRef = {startDate,event}; deleteTarget = null; renderForm(); }
      });
    });
    overlay.querySelectorAll('[data-delete-schedule]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const [startDate,eventId] = btn.dataset.deleteSchedule.split('|');
        deleteTarget = {startDate,eventId};
        renderList();
      });
    });
    overlay.querySelectorAll('[data-confirm-delete]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const [startDate,eventId] = btn.dataset.confirmDelete.split('|');
        removeScheduleEvent(startDate,eventId);
        saveSchedule();
        state.openScheduleDay = selectedDate;
        render();
      });
    });
    overlay.querySelectorAll('.schedule-confirm-cancel').forEach(btn=>{
      btn.addEventListener('click', ()=>{ deleteTarget=null; renderList(); });
    });
  }

  function renderForm(){
    const current = editingRef?.event || {scheduleType:'family', ownerId:'', time:'', endDate:'', members:{}, note:''};
    const originalStart = editingRef?.startDate || selectedDate;
    let scheduleType = current.scheduleType === 'personal' ? 'personal' : 'family';
    let ownerId = current.ownerId || '';
    let selectedMembers = {};
    members.forEach(mem=> selectedMembers[mem.id] = !!(current.members && current.members[mem.id]));

    overlay.innerHTML = `
      <div class="sheet schedule-sheet schedule-form-sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-title">${editingRef ? '일정 수정' : '새 일정 추가'} ✏️</div>
        <div class="sheet-sub">가족 전체 일정과 각자의 일정을 구분해서 기록해보세요</div>

        <div class="field-block">
          <div class="field-label">일정 종류</div>
          <div class="schedule-type-toggle">
            <button type="button" class="schedule-type-btn ${scheduleType==='family'?'active':''}" data-schedule-type="family">👨‍👩‍👧‍👦 가족 일정</button>
            <button type="button" class="schedule-type-btn ${scheduleType==='personal'?'active':''}" data-schedule-type="personal">👤 개인 일정</button>
          </div>
        </div>

        <div class="schedule-date-row">
          <div class="field-block">
            <div class="field-label">시작 날짜</div>
            <input type="date" class="time-input" id="ev-start-date" value="${escapeAttr(originalStart)}"/>
          </div>
          <div class="field-block">
            <div class="field-label">끝나는 날짜 <span>선택</span></div>
            <input type="date" class="time-input" id="ev-end-date" min="${escapeAttr(originalStart)}" value="${escapeAttr(current.endDate||'')}"/>
          </div>
        </div>

        <div class="field-block">
          <div class="field-label">시간 <span>선택</span></div>
          <input type="time" class="time-input" id="ev-time" value="${escapeAttr(current.time||'')}"/>
        </div>

        <div class="field-block schedule-family-field" style="display:${scheduleType==='family'?'block':'none'};">
          <div class="field-label">누가 함께해요? <span>선택하지 않으면 가족 공통</span></div>
          <div class="chip-select-row">
            ${members.map(mem=>`<div class="member-chip ${selectedMembers[mem.id]?'selected':''}" data-member="${mem.id}">
              <div class="dot" style="background:${mem.color}">${escapeHtml(mem.label.charAt(0))}</div>${escapeHtml(mem.label)}
            </div>`).join('')}
          </div>
        </div>

        <div class="field-block schedule-personal-field" style="display:${scheduleType==='personal'?'block':'none'};">
          <div class="field-label">누구의 일정인가요?</div>
          <div class="chip-select-row">
            ${members.map(mem=>`<div class="member-chip ${ownerId===mem.id?'selected':''}" data-owner="${mem.id}">
              <div class="dot" style="background:${mem.color}">${escapeHtml(mem.label.charAt(0))}</div>${escapeHtml(mem.label)}
            </div>`).join('')}
          </div>
        </div>

        <div class="field-block">
          <div class="field-label">일정 내용</div>
          <textarea class="text-input" id="ev-note" placeholder="예) 병원 예약, 친구 만나기, 부산 여행 등">${escapeHtml(current.note||'')}</textarea>
        </div>
        <div class="schedule-form-error" id="schedule-form-error"></div>

        <div class="sheet-actions">
          <button class="close-btn" id="save-schedule-form">저장</button>
          <button class="cancel-btn" id="cancel-schedule-form">취소</button>
        </div>
        ${editingRef ? `<button class="delete-btn" id="delete-from-form">이 일정 삭제하기</button>` : ''}
      </div>
    `;

    function syncTypeUI(){
      overlay.querySelectorAll('[data-schedule-type]').forEach(btn=>btn.classList.toggle('active', btn.dataset.scheduleType===scheduleType));
      overlay.querySelector('.schedule-family-field').style.display = scheduleType==='family' ? 'block' : 'none';
      overlay.querySelector('.schedule-personal-field').style.display = scheduleType==='personal' ? 'block' : 'none';
    }

    overlay.querySelectorAll('[data-schedule-type]').forEach(btn=>{
      btn.addEventListener('click', ()=>{ scheduleType = btn.dataset.scheduleType; syncTypeUI(); });
    });
    overlay.querySelectorAll('[data-member]').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        const id = chip.dataset.member;
        selectedMembers[id] = !selectedMembers[id];
        chip.classList.toggle('selected', selectedMembers[id]);
      });
    });
    overlay.querySelectorAll('[data-owner]').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        ownerId = chip.dataset.owner;
        overlay.querySelectorAll('[data-owner]').forEach(other=>other.classList.toggle('selected', other.dataset.owner===ownerId));
      });
    });

    const startInput = overlay.querySelector('#ev-start-date');
    const endInput = overlay.querySelector('#ev-end-date');
    startInput.addEventListener('change', ()=>{
      endInput.min = startInput.value;
      if(endInput.value && endInput.value < startInput.value) endInput.value = '';
    });

    overlay.querySelector('#cancel-schedule-form').addEventListener('click', ()=>{ editingRef=null; renderList(); });
    if(editingRef){
      overlay.querySelector('#delete-from-form').addEventListener('click', ()=>{
        deleteTarget = {startDate:editingRef.startDate, eventId:editingRef.event.id};
        editingRef = null;
        renderList();
      });
    }

    overlay.querySelector('#save-schedule-form').addEventListener('click', ()=>{
      const error = overlay.querySelector('#schedule-form-error');
      const startDate = startInput.value || selectedDate;
      const rawEndDate = endInput.value;
      const endDate = rawEndDate && rawEndDate > startDate ? rawEndDate : '';
      const time = overlay.querySelector('#ev-time').value;
      const note = overlay.querySelector('#ev-note').value.trim();

      if(scheduleType==='personal' && !ownerId){
        error.textContent = '개인 일정의 가족 구성원을 선택해주세요.';
        return;
      }
      if(!note && !time){
        error.textContent = '일정 내용이나 시간을 입력해주세요.';
        return;
      }

      const eventId = editingRef?.event?.id || genId('ev');
      const eventMembers = {};
      members.forEach(mem=>{
        eventMembers[mem.id] = scheduleType==='personal' ? mem.id===ownerId : !!selectedMembers[mem.id];
      });
      const event = {
        id:eventId,
        scheduleType,
        ownerId:scheduleType==='personal' ? ownerId : '',
        time,
        endDate,
        members:eventMembers,
        note,
      };

      if(editingRef) removeScheduleEvent(editingRef.startDate,eventId);
      if(!Array.isArray(state.schedule[startDate])) state.schedule[startDate] = [];
      state.schedule[startDate].push(event);
      saveSchedule();
      state.openScheduleDay = selectedDate;
      render();
    });
  }

  renderList();
}

/* ============ MEDS TAB ============ */
function renderMedsTab(){
  if(!getMember(state.medFolder) && state.members.length){ state.medFolder = state.members[0].id; }
  const folder = getMember(state.medFolder);
  if(!folder) return `<div class="card">가족 구성원을 먼저 추가해주세요 🙂</div>`;

  const chips = state.members.map(f=>{
    return `<div class="folder-chip ${state.medFolder===f.id?'active':''}" data-folder="${f.id}">
      <div class="fc-icon">${memberAvatar(f, 44)}</div>
      <div class="fc-label">${f.label}</div>
    </div>`;
  }).join('');

  const cells = monthGridDates(state.medYear, state.medMonth);
  const weekdays = ['일','월','화','수','목','금','토'];
  const folderData = state.medData[folder.id] || {};

  const headerHtml = `
    <div class="med-header">
      <div class="icon-lg">${memberAvatar(folder, 64)}</div>
      <div>
        <div class="med-name">${folder.label}</div>
        <div class="item-tag-row">
          ${folder.items.map(it=>`<span class="item-tag">${escapeHtml(it.name)}</span>`).join('')}
        </div>
      </div>
    </div>
  `;

  const cellsHtml = cells.map(d=>{
    if(d===null) return `<div class="day-cell empty"></div>`;
    const dateStr = state.medYear+'-'+String(state.medMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const dayInfo = folderData[dateStr] || {};
    const times = folder.items.map(it => dayInfo[it.id] && dayInfo[it.id].time).filter(Boolean);
    return `<div class="day-cell med-day-cell" data-med-cell="${dateStr}">
      <div class="day-num">${d}</div>
      <div class="icon-row">
        ${folder.items.map(it => iconForItem(it.id, !!(dayInfo[it.id] && dayInfo[it.id].taken), folder.items.length>1?16:22)).join('')}
      </div>
      ${times.length ? `<div class="time-chip-mini">${times.join(' · ')}</div>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="folder-row">${chips}</div>
    <div class="card">
      ${headerHtml}
      <div class="cal-nav" style="margin-top:14px;">
        <button data-med-nav="-1" aria-label="이전 달"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6.5-5 5.5 5 5.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="cal-title">${state.medYear}년 ${state.medMonth+1}월</div>
        <button data-med-nav="1" aria-label="다음 달"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6.5 5 5.5-5 5.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div class="weekdays">${weekdays.map(w=>`<div>${w}</div>`).join('')}</div>
      <div class="grid">${cellsHtml}</div>
    </div>
  `;
}
function attachMedsEvents(){
  document.querySelectorAll('[data-folder]').forEach(c=>{
    c.addEventListener('click', ()=>{ state.medFolder = c.dataset.folder; render(); });
  });
  document.querySelectorAll('[data-med-nav]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const dir = parseInt(b.dataset.medNav);
      state.medMonth += dir;
      if(state.medMonth<0){ state.medMonth=11; state.medYear--; }
      if(state.medMonth>11){ state.medMonth=0; state.medYear++; }
      render();
    });
  });
  document.querySelectorAll('[data-med-cell]').forEach(c=>{
    c.addEventListener('click', ()=>{
      state.openMedDetail = { folderId: state.medFolder, dateStr: c.dataset.medCell };
      render();
    });
  });
}

/* ---- Med Detail Modal ---- */
function renderMedDetailModal(folderId, dateStr){
  const existing = document.getElementById('med-overlay');
  if(existing) existing.remove();
  const folder = getMember(folderId);
  if(!folder){ state.openMedDetail = null; return; }
  const folderData = state.medData[folderId] || {};
  const dayInfo = folderData[dateStr] || {};
  const [y,m,d] = dateStr.split('-').map(Number);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'med-overlay';
  overlay.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">${folder.label} · ${m}월 ${d}일</div>
      <div class="sheet-sub">체크하지 않아도 시간만 기록할 수 있어요</div>
      ${folder.items.map(it=>{
        const info = dayInfo[it.id] || {taken:false, time:''};
        const isEditing = state.editingItem && state.editingItem.folderId===folderId && state.editingItem.itemId===it.id;
        return `<div class="item-row">
          <div class="item-icon">${iconForItem(it.id, info.taken, 30)}</div>
          <div class="item-name-wrap">
            ${isEditing
              ? `<input class="inline-edit-input" id="name-edit-${it.id}" value="${escapeAttr(it.name)}"/>`
              : `<div class="item-name-display" data-edit-name="${it.id}">${escapeHtml(it.name)} <span class="pencil">✎ 이름수정</span></div>`
            }
            <input type="time" class="item-time-input" data-time="${it.id}" value="${escapeAttr(info.time||'')}" style="margin-top:6px;"/>
          </div>
          <button class="toggle ${info.taken?'on':''}" data-taken="${it.id}"><div class="toggle-knob"></div></button>
        </div>`;
      }).join('')}
      <button class="close-btn" id="close-med-sheet">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e)=>{ if(e.target===overlay){ closeModal(); } });
  document.getElementById('close-med-sheet').addEventListener('click', closeModal);

  overlay.querySelectorAll('[data-taken]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const itemId = btn.dataset.taken;
      ensureDayInfo(folderId, dateStr, itemId);
      state.medData[folderId][dateStr][itemId].taken = !state.medData[folderId][dateStr][itemId].taken;
      saveMedData();
      renderMedDetailModal(folderId, dateStr);
    });
  });
  overlay.querySelectorAll('[data-time]').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const itemId = inp.dataset.time;
      ensureDayInfo(folderId, dateStr, itemId);
      state.medData[folderId][dateStr][itemId].time = inp.value;
      saveMedData();
    });
  });
  overlay.querySelectorAll('[data-edit-name]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.editingItem = { folderId, itemId: el.dataset.editName };
      renderMedDetailModal(folderId, dateStr);
      const input = document.getElementById('name-edit-'+state.editingItem.itemId);
      if(input){ input.focus(); input.select(); }
    });
  });
  folder.items.forEach(it=>{
    const input = document.getElementById('name-edit-'+it.id);
    if(input){
      const commit = ()=>{
        const val = input.value.trim();
        if(val){ it.name = val; saveMembers(); }
        state.editingItem = null;
        renderMedDetailModal(folderId, dateStr);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ input.blur(); } });
    }
  });

  function closeModal(){
    state.editingItem = null;
    state.openMedDetail = null;
    overlay.remove();
    render();
  }
}
function ensureDayInfo(folderId, dateStr, itemId){
  if(!state.medData[folderId]) state.medData[folderId] = {};
  if(!state.medData[folderId][dateStr]) state.medData[folderId][dateStr] = {};
  if(!state.medData[folderId][dateStr][itemId]) state.medData[folderId][dateStr][itemId] = {taken:false, time:''};
}

/* ============ MEMBER SETTINGS MODAL ============ */
function renderMemberSettingsModal(){
  const existing = document.getElementById('member-overlay');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'member-overlay';
  overlay.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">가족 구성원 관리 🐾</div>
      <div class="sheet-sub">이름, 색깔을 바꾸거나 새 가족을 추가해보세요</div>
      <div id="member-list"></div>
      <button class="add-member-btn" id="add-member">+ 새 가족 추가하기</button>
      <button class="close-btn" id="close-member-sheet">닫기</button>
    </div>
  `;
  document.body.appendChild(overlay);
  renderMemberList();

  overlay.addEventListener('click', (e)=>{ if(e.target===overlay){ closeModal(); } });
  document.getElementById('close-member-sheet').addEventListener('click', closeModal);
  document.getElementById('add-member').addEventListener('click', ()=>{
    const newMember = {
      id: genId('m'),
      label: '새 가족',
      color: PALETTE[state.members.length % PALETTE.length],
      kind: 'person',
      avatarStyle: 'name',
      inCalendar: true,
      items: [{ id:'supplement', name:'영양제' }],
    };
    state.members.push(newMember);
    saveMembers();
    state.editingMemberId = newMember.id;
    renderMemberList();
  });

  function closeModal(){
    state.openMemberSettings = false;
    state.editingMemberId = null;
    state.deleteConfirmId = null;
    overlay.remove();
    render();
  }
}

function renderMemberList(){
  const wrap = document.getElementById('member-list');
  if(!wrap) return;
  wrap.innerHTML = state.members.map(m=>{
    const isEditingName = state.editingMemberId === m.id;
    const confirmingDelete = state.deleteConfirmId === m.id;
    return `<div class="member-card" data-card="${m.id}">
      <div class="member-card-top">
        <div class="member-card-avatar">${memberAvatar(m, 44)}</div>
        <div class="member-card-name">
          ${isEditingName
            ? `<input class="inline-edit-input" id="mname-${m.id}" value="${escapeAttr(m.label)}"/>`
            : `<div class="item-name-display" data-edit-member="${m.id}">${escapeHtml(m.label)} <span class="pencil">✎</span></div>`
          }
        </div>
      </div>
      <div class="kind-toggle-row">
        <div class="kind-btn ${m.kind==='person'?'active':''}" data-kind="${m.id}|person">🧑 사람</div>
        <div class="kind-btn ${m.kind==='cat'?'active':''}" data-kind="${m.id}|cat">🐱 고양이</div>
      </div>
      ${m.kind==='person' ? `<div class="profile-picker">
        <div class="profile-picker-title">프로필 선택하기 <span>사진을 눌러 변경</span></div>
        <div class="profile-style-row">
        <button class="profile-style-btn ${(m.avatarStyle||'name')==='name'?'active':''}" data-avatarstyle="${m.id}|name"><span class="profile-style-thumb">${memberAvatar({...m,avatarStyle:'name'},54)}</span><span>기본</span></button>
        <button class="profile-style-btn ${m.avatarStyle==='adult-man'?'active':''}" data-avatarstyle="${m.id}|adult-man"><span class="profile-style-thumb"><span class="avatar-art avatar-extra avatar-adult-man"></span></span><span>성인 남성</span></button>
        <button class="profile-style-btn ${m.avatarStyle==='grandpa'?'active':''}" data-avatarstyle="${m.id}|grandpa"><span class="profile-style-thumb"><span class="avatar-art avatar-extra avatar-grandpa"></span></span><span>할아버지</span></button>
        <button class="profile-style-btn ${m.avatarStyle==='grandma'?'active':''}" data-avatarstyle="${m.id}|grandma"><span class="profile-style-thumb"><span class="avatar-art avatar-extra avatar-grandma"></span></span><span>할머니</span></button>
        </div>
      </div>` : ''}
      <div class="color-picker-title">대표 색상</div>
      <div class="swatch-row">
        ${PALETTE.map(c=>`<div class="swatch ${m.color===c?'selected':''}" style="background:${c}" data-color="${m.id}|${c}"></div>`).join('')}
      </div>
      <div class="cal-toggle-row">
        <span>가족일정에 표시</span>
        <button class="toggle small ${m.inCalendar?'on':''}" data-calshow="${m.id}"><div class="toggle-knob"></div></button>
      </div>
      ${confirmingDelete
        ? `<button class="member-delete-btn" data-confirmdelete="${m.id}">정말 삭제할까요? 한번 더 누르면 삭제돼요</button>`
        : `<button class="member-delete-btn" data-delete="${m.id}">이 가족 삭제하기</button>`
      }
    </div>`;
  }).join('') || `<div style="text-align:center;color:var(--ink-light);font-size:13px;padding:20px 0;">아직 가족이 없어요. 추가해보세요!</div>`;

  wrap.querySelectorAll('[data-edit-member]').forEach(el=>{
    el.addEventListener('click', ()=>{
      state.editingMemberId = el.dataset.editMember;
      renderMemberList();
      const input = document.getElementById('mname-'+state.editingMemberId);
      if(input){ input.focus(); input.select(); }
    });
  });
  state.members.forEach(m=>{
    const input = document.getElementById('mname-'+m.id);
    if(input){
      const commit = ()=>{
        const val = input.value.trim();
        if(val) m.label = val;
        state.editingMemberId = null;
        saveMembers();
        renderMemberList();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ input.blur(); } });
    }
  });
  wrap.querySelectorAll('[data-kind]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const [id, kind] = btn.dataset.kind.split('|');
      const mem = getMember(id);
      if(mem){ mem.kind = kind; saveMembers(); renderMemberList(); }
    });
  });
  wrap.querySelectorAll('[data-avatarstyle]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const [id, avatarStyle] = btn.dataset.avatarstyle.split('|');
      const mem = getMember(id);
      if(mem){ mem.kind='person'; mem.avatarStyle=avatarStyle; saveMembers(); renderMemberList(); }
    });
  });
  wrap.querySelectorAll('[data-color]').forEach(sw=>{
    sw.addEventListener('click', ()=>{
      const [id, color] = sw.dataset.color.split('|');
      const mem = getMember(id);
      if(mem){ mem.color = color; saveMembers(); renderMemberList(); }
    });
  });
  wrap.querySelectorAll('[data-calshow]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const mem = getMember(btn.dataset.calshow);
      if(mem){ mem.inCalendar = !mem.inCalendar; saveMembers(); renderMemberList(); }
    });
  });
  wrap.querySelectorAll('[data-delete]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.deleteConfirmId = btn.dataset.delete;
      renderMemberList();
    });
  });
  wrap.querySelectorAll('[data-confirmdelete]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.confirmdelete;
      state.members = state.members.filter(m=>m.id!==id);
      state.deleteConfirmId = null;
      if(state.medFolder===id && state.members.length) state.medFolder = state.members[0].id;
      saveMembers();
      renderMemberList();
    });
  });
}

/* ============ UTIL ============ */
function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s){ return escapeHtml(s); }

/* ============ INIT ============ */
loadAll();
