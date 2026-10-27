(() => {
  'use strict';
  const STORAGE_KEY = 'studentAttendanceTracker_v1';
  const $ = id => document.getElementById(id);
  const today = () => new Date().toLocaleDateString('en-CA');
  let state = loadState();
  let currentPage = 'dashboard';
  let attendanceDraft = {};

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.students) && Array.isArray(saved.records)) {
        return {students:saved.students, records:saved.records, threshold:Number(saved.threshold)||75};
      }
    } catch (e) { console.warn('Could not read saved data:', e); }
    return {students:[], records:[], threshold:75};
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save data. Your browser storage may be full.', true); }
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function toast(message, error=false) {
    const root=$('toastRoot'); root.innerHTML=`<div class="toast ${error?'error':''}">${escapeHTML(message)}</div>`;
    setTimeout(()=>{root.innerHTML='';},3000);
  }
  function getStudent(id) { return state.students.find(s=>s.id===id); }
  function getRecord(studentId,date) { return state.records.find(r=>r.studentId===studentId && r.date===date); }
  function recordsFor(id) { return state.records.filter(r=>r.studentId===id); }
  function countsFor(id) {
    const records=recordsFor(id);
    const present=records.filter(r=>r.status==='Present'||r.status==='Late').length;
    const absent=records.filter(r=>r.status==='Absent').length;
    const leave=records.filter(r=>r.status==='Leave').length;
    const marked=records.length;
    return {present,absent,leave,marked,percentage:marked?Math.round(present/marked*1000)/10:0};
  }
  function overallCounts() {
    const date=$('dashboardDate')?.value || today();
    const todays=state.students.map(s=>getRecord(s.id,date)).filter(Boolean);
    const present=todays.filter(r=>r.status==='Present'||r.status==='Late').length;
    const absent=todays.filter(r=>r.status==='Absent').length;
    const marked=state.records.length;
    const overallPresent=state.records.filter(r=>r.status==='Present'||r.status==='Late').length;
    return {total:state.students.length,present,absent,rate:marked?Math.round(overallPresent/marked*100):null};
  }
  function statusBadge(status) {
    const key=status==='Not marked'?'not-marked':String(status||'Not marked').toLowerCase().replace(/\s+/g,'-');
    return `<span class="badge ${key}">${escapeHTML(status||'Not marked')}</span>`;
  }
  function studentRate(s) { const c=countsFor(s.id); return c.marked?c.percentage:null; }
  function isLow(s) { const rate=studentRate(s); return rate!==null && rate<state.threshold; }
  function initials(name) { return name.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase(); }
  function attendanceStatus(s,date) { return getRecord(s.id,date)?.status || 'Not marked'; }

  function switchPage(page) {
    currentPage=page;
    document.querySelectorAll('.page').forEach(el=>el.classList.add('hidden'));
    $(page+'Page').classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.page===page));
    if(page==='dashboard') renderDashboard();
    if(page==='students') renderStudents();
    if(page==='attendance') renderAttendance();
    if(page==='history') { refreshStudentSelect(); renderHistory(); }
    if(page==='settings') $('thresholdInput').value=state.threshold;
  }
  function renderDashboard() {
    const date=$('dashboardDate').value||today(); const c=overallCounts();
    $('totalStudents').textContent=c.total; $('presentToday').textContent=c.present; $('absentToday').textContent=c.absent;
    $('overallRate').textContent=c.rate===null?'—':c.rate+'%';
    $('dashboardDateLabel').textContent='Status for '+date;
    const rows=state.students.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>{
      const status=attendanceStatus(s,date), rate=studentRate(s);
      return `<tr><td><span class="avatar">${escapeHTML(initials(s.name))}</span><span class="student-name">${escapeHTML(s.name)}</span><div class="subtext">${escapeHTML(s.studentId)}</div></td><td>${escapeHTML(s.department)}</td><td>${statusBadge(status)}</td><td>${rate===null?'—':`<span class="percentage ${isLow(s)?'below':''}">${rate}%</span>`}</td></tr>`;
    }).join('');
    $('dashboardTable').innerHTML=state.students.length?`<div class="table-wrap"><table><thead><tr><th>Student</th><th>Department</th><th>Today’s status</th><th>Attendance</th></tr></thead><tbody>${rows}</tbody></table></div>`:emptyBlock('No students yet','Add students to begin tracking attendance.');
    const lows=state.students.filter(isLow).sort((a,b)=>studentRate(a)-studentRate(b));
    $('lowAttendanceTable').innerHTML=lows.length?`<div class="table-wrap"><table><thead><tr><th>Student</th><th>Department</th><th>Attendance</th><th>Alert</th><th></th></tr></thead><tbody>${lows.map(s=>`<tr><td><span class="student-name">${escapeHTML(s.name)}</span><div class="subtext">${escapeHTML(s.studentId)}</div></td><td>${escapeHTML(s.department)}</td><td><span class="percentage below">${studentRate(s)}%</span></td><td>${statusBadge('Low attendance')}</td><td><button class="secondary small" data-history="${escapeHTML(s.id)}">View history</button></td></tr>`).join('')}</tbody></table></div>`:emptyBlock('No low-attendance alerts','No students are below the current threshold.');
  }
  function emptyBlock(title,message) { return `<div class="empty"><strong>${escapeHTML(title)}</strong>${escapeHTML(message)}</div>`; }
  function renderStudents() {
    const q=$('studentSearch').value.trim().toLowerCase(), dep=$('departmentFilter').value, filter=$('studentStatusFilter').value, date=today();
    const depts=[...new Set(state.students.map(s=>s.department).filter(Boolean))].sort();
    const select=$('departmentFilter'), current=select.value;
    select.innerHTML='<option value="">All departments</option>'+depts.map(d=>`<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`).join('');
    if(depts.includes(current)) select.value=current;
    const list=state.students.filter(s=>{
      const matches=[s.name,s.studentId,s.department].some(v=>String(v).toLowerCase().includes(q));
      const status=attendanceStatus(s,date);
      return matches&&(!dep||s.department===dep)&&(!filter|| (filter==='Low attendance'?isLow(s):status===filter));
    }).sort((a,b)=>a.name.localeCompare(b.name));
    $('studentsTable').innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th>Student</th><th>Department</th><th>Today</th><th>Attendance %</th><th>Actions</th></tr></thead><tbody>${list.map(s=>{
      const rate=studentRate(s);
      return `<tr><td><span class="avatar">${escapeHTML(initials(s.name))}</span><span class="student-name">${escapeHTML(s.name)}</span><div class="subtext">${escapeHTML(s.studentId)} · ${escapeHTML(s.college||'')}</div></td><td>${escapeHTML(s.department)}</td><td>${statusBadge(attendanceStatus(s,date))}</td><td>${rate===null?'—':`<div class="percentage ${isLow(s)?'below':''}">${rate}%</div><div class="progress"><span style="width:${Math.min(100,rate)}%;${isLow(s)?'background:#c0394b':''}"></span></div>`}</td><td><div class="actions"><button class="secondary small" data-edit="${escapeHTML(s.id)}">Edit</button><button class="secondary small" data-history="${escapeHTML(s.id)}">History</button><button class="danger small" data-delete="${escapeHTML(s.id)}">Delete</button></div></td></tr>`;
    }).join('')}</tbody></table></div>`:emptyBlock('No matching students','Try another search or add a student record.');
  }
  function renderAttendance() {
    const date=$('attendanceDate').value||today(), q=$('attendanceSearch').value.trim().toLowerCase();
    state.students.slice().sort((a,b)=>a.name.localeCompare(b.name)).filter(s=>[s.name,s.studentId,s.department].some(v=>String(v).toLowerCase().includes(q))).forEach(s=>{
      if(attendanceDraft[s.id]===undefined) attendanceDraft[s.id]=getRecord(s.id,date)?.status||'Absent';
    });
    const list=state.students.filter(s=>[s.name,s.studentId,s.department].some(v=>String(v).toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name));
    $('attendanceTable').innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th>Student</th><th>Department</th><th>Saved status</th><th>Set status</th></tr></thead><tbody>${list.map(s=>{
      const saved=getRecord(s.id,date);
      const selected=attendanceDraft[s.id]??saved?.status??'Absent';
      return `<tr><td><span class="student-name">${escapeHTML(s.name)}</span><div class="subtext">${escapeHTML(s.studentId)}</div></td><td>${escapeHTML(s.department)}</td><td>${statusBadge(saved?.status||'Not marked')}</td><td><select data-attendance="${escapeHTML(s.id)}" aria-label="Attendance status for ${escapeHTML(s.name)}"><option ${selected==='Present'?'selected':''}>Present</option><option ${selected==='Absent'?'selected':''}>Absent</option><option ${selected==='Late'?'selected':''}>Late</option><option ${selected==='Leave'?'selected':''}>Leave</option></select></td></tr>`;
    }).join('')}</tbody></table></div>`:emptyBlock('No students available','Add students before marking attendance.');
  }
  function refreshStudentSelect() {
    const sel=$('historyStudent'), old=sel.value;
    sel.innerHTML='<option value="">Select a student</option>'+state.students.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)} (${escapeHTML(s.studentId)})</option>`).join('');
    if(state.students.some(s=>s.id===old)) sel.value=old;
  }
  function renderHistory() {
    const id=$('historyStudent').value, from=$('historyFrom').value, to=$('historyTo').value;
    if(!id) { $('historyContent').innerHTML=emptyBlock('Choose a student','Select a student to view their attendance history.'); return; }
    const s=getStudent(id); if(!s) return;
    const all=recordsFor(id).filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)).sort((a,b)=>b.date.localeCompare(a.date));
    const c=countsFor(id);
    $('historyContent').innerHTML=`<div class="panel-title"><div><h3>${escapeHTML(s.name)}</h3><p>${escapeHTML(s.studentId)} · ${escapeHTML(s.department)}</p></div>${isLow(s)?statusBadge('Low attendance'):''}</div><div class="history-meta"><div class="mini-stat"><span>Attendance rate</span><strong>${c.marked?c.percentage+'%':'—'}</strong></div><div class="mini-stat"><span>Present / Late</span><strong>${c.present}</strong></div><div class="mini-stat"><span>Absent</span><strong>${c.absent}</strong></div></div>${all.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Status</th><th>Recorded</th></tr></thead><tbody>${all.map(r=>`<tr><td>${escapeHTML(r.date)}</td><td>${statusBadge(r.status)}</td><td>${escapeHTML(r.updatedAt||'')}</td></tr>`).join('')}</tbody></table></div>`:emptyBlock('No attendance records','No records match this student and date range.')}`;
  }
  function openStudentModal(student=null) {
    const editing=!!student;
    $('modalRoot').innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="studentModalTitle"><div class="modal-head"><h3 id="studentModalTitle">${editing?'Edit student':'Add student'}</h3><button class="close" id="closeModal" aria-label="Close">✕</button></div><form id="studentForm"><div class="form-grid"><div class="field"><label for="studentName">Full name *</label><input id="studentName" required maxlength="100" value="${escapeHTML(student?.name||'')}" placeholder="e.g. Ananya Kumar"></div><div class="field"><label for="studentId">Student ID / Register number *</label><input id="studentId" required maxlength="40" value="${escapeHTML(student?.studentId||'')}" placeholder="e.g. CSE2026001"></div><div class="field"><label for="studentDepartment">Department *</label><input id="studentDepartment" required maxlength="80" value="${escapeHTML(student?.department||'')}" placeholder="e.g. Computer Science"></div><div class="field"><label for="studentCollege">College (optional)</label><input id="studentCollege" maxlength="120" value="${escapeHTML(student?.college||'')}" placeholder="College name"></div></div><div class="form-actions"><button type="button" class="secondary" id="cancelModal">Cancel</button><button class="primary" type="submit">${editing?'Save changes':'Add student'}</button></div></form></div></div>`;
    const close=()=>{$('modalRoot').innerHTML='';};
    $('closeModal').onclick=close; $('cancelModal').onclick=close;
    $('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')close();});
    $('studentForm').onsubmit=e=>{
      e.preventDefault();
      const name=$('studentName').value.trim(), studentId=$('studentId').value.trim(), department=$('studentDepartment').value.trim(), college=$('studentCollege').value.trim();
      if(!name||!studentId||!department){toast('Please fill all required fields.',true);return;}
      if(state.students.some(s=>s.studentId.toLowerCase()===studentId.toLowerCase()&&s.id!==student?.id)){toast('That student ID is already in use.',true);return;}
      if(editing) Object.assign(student,{name,studentId,department,college});
      else state.students.push({id:crypto.randomUUID?crypto.randomUUID():'s'+Date.now()+Math.random().toString(16).slice(2),name,studentId,department,college,createdAt:today()});
      persist(); close(); refreshAll(); toast(editing?'Student updated.':'Student added.');
    };
    $('studentName').focus();
  }
  function deleteStudent(id) {
    const s=getStudent(id); if(!s)return;
    if(!confirm(`Delete ${s.name} and all of their attendance records? This cannot be undone.`))return;
    state.students=state.students.filter(x=>x.id!==id); state.records=state.records.filter(r=>r.studentId!==id); delete attendanceDraft[id];
    persist();refreshAll();toast('Student and their attendance records deleted.');
  }
  function saveAttendance() {
    const date=$('attendanceDate').value;
    if(!date){toast('Choose an attendance date.',true);return;}
    let changed=0;
    for(const s of state.students) {
      const status=attendanceDraft[s.id];
      if(!status) continue;
      const existing=getRecord(s.id,date);
      if(existing) { if(existing.status!==status){existing.status=status;existing.updatedAt=new Date().toLocaleString();changed++;} }
      else { state.records.push({id:'r'+Date.now()+Math.random().toString(16).slice(2),studentId:s.id,date,status,updatedAt:new Date().toLocaleString()});changed++; }
    }
    persist(); refreshAll(); toast(changed?`Attendance saved for ${date}.`:'No attendance changes to save.');
  }
  function exportCSV() {
    const rows=[['Student Name','Student ID','Department','College','Date','Status','Attendance Percentage']];
    state.students.forEach(s=>{
      const records=recordsFor(s.id).sort((a,b)=>a.date.localeCompare(b.date));
      const rate=studentRate(s);
      if(!records.length) rows.push([s.name,s.studentId,s.department,s.college,'','',rate===null?'':rate+'%']);
      else records.forEach(r=>rows.push([s.name,s.studentId,s.department,s.college,r.date,r.status,rate+'%']));
    });
    const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download='student-attendance-'+today()+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('CSV export downloaded.');
  }
  function refreshAll() {
    renderDashboard();renderStudents();renderAttendance();refreshStudentSelect();
    if(currentPage==='history')renderHistory();
  }
  function loadDemo() {
    if(state.students.length&&!confirm('Demo data will be added to your existing students. Continue?'))return;
    const examples=[
      {name:'Ananya Kumar',studentId:'CSE2026001',department:'Computer Science',college:'Demo College'},
      {name:'Rahul Sharma',studentId:'CSE2026002',department:'Computer Science',college:'Demo College'},
      {name:'Meena Priya',studentId:'ECE2026001',department:'Electronics',college:'Demo College'},
      {name:'Arjun Raj',studentId:'IT2026001',department:'Information Technology',college:'Demo College'},
      {name:'Farah Khan',studentId:'ECE2026002',department:'Electronics',college:'Demo College'}
    ];
    const idMap=[];
    examples.forEach(ex=>{
      let s=state.students.find(x=>x.studentId===ex.studentId);
      if(!s){s={...ex,id:'demo-'+ex.studentId,createdAt:today()};state.students.push(s);}
      idMap.push(s);
    });
    const dates=[-4,-3,-2,-1,0].map(n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toLocaleDateString('en-CA');});
    const statuses=[['Present','Present','Present','Absent','Present'],['Present','Absent','Present','Present','Present'],['Present','Present','Leave','Present','Present'],['Absent','Absent','Present','Absent','Present'],['Present','Late','Present','Absent','Present']];
    dates.forEach((date,di)=>idMap.forEach((s,si)=>{
      if(!getRecord(s.id,date))state.records.push({id:'demo-r-'+date+'-'+s.id,studentId:s.id,date,status:statuses[si][di],updatedAt:'Demo data'});
    }));
    persist();refreshAll();toast('Demo students and attendance added.');
  }
  function clearAll() {
    if(!confirm('Delete ALL students and attendance records stored in this browser? Export a CSV first if you need a backup.'))return;
    state={students:[],records:[],threshold:75};attendanceDraft={};persist();refreshAll();toast('All project data cleared.');
  }

  document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>switchPage(btn.dataset.page)));
  document.querySelectorAll('[data-goto]').forEach(btn=>btn.addEventListener('click',()=>switchPage(btn.dataset.goto)));
  $('addStudentTop').onclick=()=>openStudentModal();$('addStudentBtn').onclick=()=>openStudentModal();
  $('exportBtn').onclick=exportCSV;$('exportSettings').onclick=exportCSV;
  $('dashboardDate').value=today();$('attendanceDate').value=today();
  $('dashboardDate').addEventListener('change',renderDashboard);
  $('studentSearch').addEventListener('input',renderStudents);$('departmentFilter').addEventListener('change',renderStudents);$('studentStatusFilter').addEventListener('change',renderStudents);
  $('attendanceDate').addEventListener('change',()=>{attendanceDraft={};renderAttendance();});
  $('attendanceSearch').addEventListener('input',renderAttendance);
  $('attendanceTable').addEventListener('change',e=>{const id=e.target.dataset.attendance;if(id)attendanceDraft[id]=e.target.value;});
  $('markAllPresent').onclick=()=>{state.students.forEach(s=>attendanceDraft[s.id]='Present');renderAttendance();toast('Draft updated: all students set to Present. Save to apply.');};
  $('saveAttendance').onclick=saveAttendance;
  $('historyStudent').addEventListener('change',renderHistory);$('historyFrom').addEventListener('change',renderHistory);$('historyTo').addEventListener('change',renderHistory);
  $('clearHistoryFilters').onclick=()=>{$('historyFrom').value='';$('historyTo').value='';renderHistory();};
  $('saveThreshold').onclick=()=>{
    const value=Number($('thresholdInput').value);
    if(!Number.isFinite(value)||value<1||value>100){toast('Threshold must be between 1 and 100.',true);return;}
    state.threshold=value;persist();refreshAll();toast(`Low-attendance threshold set to ${value}%.`);
  };
  $('sampleData').onclick=loadDemo;$('clearData').onclick=clearAll;
  document.addEventListener('click',e=>{
    const edit=e.target.closest('[data-edit]'), del=e.target.closest('[data-delete]'), hist=e.target.closest('[data-history]');
    if(edit)openStudentModal(getStudent(edit.dataset.edit));
    if(del)deleteStudent(del.dataset.delete);
    if(hist){switchPage('history');$('historyStudent').value=hist.dataset.history;renderHistory();}
  });

  // Optional dark mode: theme preference is saved locally in this browser.
  const themeToggle = document.getElementById('themeToggle');
  try {
    if (localStorage.getItem('studentAttendanceTheme') === 'dark') document.body.classList.add('dark');
  } catch (e) {}
  function updateThemeButton() {
    if (!themeToggle) return;
    const dark = document.body.classList.contains('dark');
    themeToggle.textContent = dark ? '☀ Light mode' : '☾ Dark mode';
    themeToggle.setAttribute('aria-pressed', String(dark));
  }
  if (themeToggle) {
    updateThemeButton();
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      try { localStorage.setItem('studentAttendanceTheme', document.body.classList.contains('dark') ? 'dark' : 'light'); } catch (e) {}
      updateThemeButton();
    });
  }

  // A fresh empty project is ready for the first student. Demo data is optional.
  refreshAll();
})();
