const STORAGE_KEYS = {
  data: 'idealiza_painel_data_v2',
  accounts: 'idealiza_painel_accounts_v2'
};

const dataStoreEl = document.getElementById('dataStore');
const accountsStoreEl = document.getElementById('accountsStore');
const supabaseClient = window.supabase && window.IDEALIZA_SUPABASE
  ? window.supabase.createClient(window.IDEALIZA_SUPABASE.url, window.IDEALIZA_SUPABASE.publishableKey)
  : null;

function safeParse(text, fallback) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function loadPersisted(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? safeParse(saved, fallback) : fallback;
  } catch (error) {
    return fallback;
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function restoreObject(target, source) {
  Object.keys(target).forEach(key => delete target[key]);
  Object.assign(target, deepClone(source));
}

function normalizeData(data) {
  Object.keys(data).forEach(day => {
    if (!data[day] || typeof data[day] !== 'object') data[day] = {};
    Object.keys(data[day]).forEach(className => {
      if (!Array.isArray(data[day][className])) data[day][className] = [];
      data[day][className].forEach(record => {
        if (!Array.isArray(record)) return;
        while (record.length < 8) record.push('');
        if (!Array.isArray(record[7])) record[7] = [];
        if (!record[5]) record[5] = 'NAO';
        if (!record[4]) record[4] = 'EM DIA';
      });
    });
  });
  return data;
}

const embeddedData = safeParse(dataStoreEl.textContent, {});
const embeddedAccounts = safeParse(accountsStoreEl.textContent, {});
const RAW = normalizeData(loadPersisted(STORAGE_KEYS.data, embeddedData));
let ACCOUNTS = loadPersisted(STORAGE_KEYS.accounts, embeddedAccounts);
const DAYS = Object.keys(RAW);
const FIXED_HOURS = ['8 HORAS', '14 HORAS', '16 HORAS', '18 HORAS'];
const FIXED_TURMAS = [
  ...['SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO']
    .flatMap(day => FIXED_HOURS.map(hour => [day, `${day.replace('-FEIRA', '')} ${hour}`])),
  ['FLEX', 'FLEX']
];

let activeDay = DAYS[0] || '';
let dirty = false;
let canEdit = true;
let statusFilter = 'TODOS';
let currentUser = null;
let currentProfile = null;
let remoteMode = Boolean(supabaseClient);
let pendingPhoto = '';
let stuCtx = null;
const THEME_STORAGE_KEY = 'idealiza_painel_theme';

const STATUS_ORDER = ['ADIANTADO', 'EM DIA', 'ATRASADO', 'CONCLUÍDO'];
const FILTERS = [
  { key: 'TODOS', label: 'Todos', cls: '' },
  { key: 'ADIANTADO', label: 'Adiantados', cls: 'adv' },
  { key: 'EM DIA', label: 'Em dia', cls: 'ok' },
  { key: 'ATRASADO', label: 'Atrasados', cls: 'late' },
  { key: 'CONCLUÍDO', label: 'Concluídos', cls: '' },
  { key: 'FALTANTE', label: 'Faltantes', cls: 'miss' }
];

const gate = document.getElementById('gate');
const heroActions = document.getElementById('heroActions');
const menuBtn = document.getElementById('menuBtn');
const menuDropdown = document.getElementById('menuDropdown');
const userAv = document.getElementById('userAv');
const userLabel = document.getElementById('userLabel');
const profileModal = document.getElementById('profileModal');
const usersModal = document.getElementById('usersModal');
const addModal = document.getElementById('addModal');
const studentModal = document.getElementById('studentModal');
const modalAvatar = document.getElementById('modalAvatar');

function applyTheme(theme) {
  const selectedTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = selectedTheme;
  const themeButton = document.getElementById('menuTheme');
  if (themeButton) themeButton.textContent = selectedTheme === 'dark' ? 'Modo claro' : 'Modo escuro';
}

function loadTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'light';
  } catch (error) {
    return 'light';
  }
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch (error) { /* preferência opcional */ }
  menuDropdown.classList.remove('show');
}

function rawFromRemoteRows(rows) {
  const data = Object.fromEntries(DAYS.map(day => [day, {}]));
  rows.forEach(row => {
    if (!data[row.day]) data[row.day] = {};
    if (!data[row.day][row.schedule]) data[row.day][row.schedule] = [];
    data[row.day][row.schedule].push([
      row.name, row.module || '', row.start_date || '', row.due_date || '',
      row.status || 'EM DIA', row.absent ? 'SIM' : 'NAO', row.notes || '',
      Array.isArray(row.history) ? row.history : [], row.id
    ]);
  });
  return normalizeData(data);
}

function countStudents(data) {
  return Object.values(data || {}).reduce((total, classes) =>
    total + Object.values(classes || {}).reduce((subtotal, students) => subtotal + (Array.isArray(students) ? students.length : 0), 0), 0);
}

async function hydrateRemoteState(userId) {
  if (!supabaseClient) return false;
  const [profilesResult, studentsResult] = await Promise.all([
    supabaseClient.from('profiles').select('id,display_name,role,photo_url').limit(500),
    supabaseClient.from('students').select('id,name,day,schedule,module,start_date,due_date,status,absent,notes,history').limit(1000)
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (studentsResult.error) throw studentsResult.error;
  const nextAccounts = {};
  (profilesResult.data || []).forEach(profile => {
    nextAccounts[profile.display_name] = {
      id: profile.id,
      email: '',
      role: profile.role,
      photo: profile.photo_url || ''
    };
    if (profile.id === userId) currentProfile = profile;
  });
  ACCOUNTS = nextAccounts;
  const remoteRows = studentsResult.data || [];
  // RLS/permissões podem devolver [] mesmo com a base local preenchida.
  // Nunca substituir alunos existentes por uma resposta remota vazia.
  if (remoteRows.length > 0) {
    restoreObject(RAW, rawFromRemoteRows(remoteRows));
  } else if (countStudents(RAW) === 0 && countStudents(embeddedData) > 0) {
    restoreObject(RAW, normalizeData(deepClone(embeddedData)));
  }
  return true;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function badgeClass(status) {
  if (status === 'ATRASADO') return 'late';
  if (status === 'ADIANTADO') return 'adv';
  if (status === 'CONCLUÍDO') return 'done';
  return 'ok';
}

function isAdmin() {
  return Boolean(currentUser && ACCOUNTS[currentUser] && ACCOUNTS[currentUser].role === 'admin');
}

function markDirty() {
  dirty = true;
  document.getElementById('saveMsg').textContent = canEdit ? 'Alterações não salvas' : '';
}

function renderFilters() {
  const box = document.getElementById('filters');
  box.innerHTML = '';
  FILTERS.forEach(filter => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (statusFilter === filter.key ? ' active ' + filter.cls : '');
    chip.textContent = filter.label;
    chip.addEventListener('click', () => {
      statusFilter = filter.key;
      renderFilters();
      renderContent();
    });
    box.appendChild(chip);
  });
}

function parseDateBR(value) {
  const parts = String(value || '').split('/');
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (!day || !month || !year) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function autoAtraso() {
  let changed = false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  DAYS.forEach(day => {
    Object.values(RAW[day] || {}).forEach(list => {
      list.forEach(record => {
        if (record[4] === 'CONCLUÍDO') return;
        const due = parseDateBR(record[3]);
        if (due && today > due && record[4] !== 'ATRASADO') {
          record[4] = 'ATRASADO';
          changed = true;
        }
      });
    });
  });
  return changed;
}

async function persistAutomaticLateStatus() {
  if (!autoAtraso()) return false;
  render();
  try {
    await persistAll();
    dirty = false;
    document.getElementById('saveMsg').textContent = 'Status atualizados automaticamente.';
    return true;
  } catch (error) {
    document.getElementById('saveMsg').textContent = 'Status atualizados nesta sessão; salve manualmente para confirmar.';
    return false;
  }
}

function computeStats() {
  let total = 0;
  let ok = 0;
  let late = 0;
  let adv = 0;
  let miss = 0;
  DAYS.forEach(day => {
    Object.values(RAW[day] || {}).forEach(list => {
      list.forEach(record => {
        total += 1;
        if (record[4] === 'ATRASADO') late += 1;
        else if (record[4] === 'ADIANTADO') adv += 1;
        else ok += 1;
        if (record[5] === 'SIM') miss += 1;
      });
    });
  });
  document.getElementById('st-total').textContent = total;
  document.getElementById('st-adv').textContent = adv;
  document.getElementById('st-ok').textContent = ok;
  document.getElementById('st-late').textContent = late;
  document.getElementById('st-miss').textContent = miss;
}

function renderTabs() {
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = '';
  DAYS.forEach(day => {
    const count = Object.values(RAW[day] || {}).reduce(
      (sum, list) => sum + list.filter(record => record[4] !== 'CONCLUÍDO').length,
      0
    );
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab' + (day === activeDay ? ' active' : '');
    button.innerHTML = `${escapeHTML(day.replace('-FEIRA', ''))} <span class="n">${count}</span>`;
    button.addEventListener('click', () => {
      activeDay = day;
      document.getElementById('search').value = '';
      render();
    });
    tabs.appendChild(button);
  });
}

function renderContent() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  const query = document.getElementById('search').value.trim().toUpperCase();
  const daysToShow = query ? DAYS : (activeDay ? [activeDay] : []);
  let any = false;

  daysToShow.forEach(day => {
    const classes = RAW[day] || {};
    Object.keys(classes).forEach(className => {
      const students = classes[className];
      let filtered = query
        ? students.filter(student => String(student[0] || '').toUpperCase().includes(query))
        : students.slice();

      if (statusFilter === 'FALTANTE') filtered = filtered.filter(student => student[5] === 'SIM');
      else if (statusFilter === 'CONCLUÍDO') filtered = filtered.filter(student => student[4] === 'CONCLUÍDO');
      else if (statusFilter !== 'TODOS') filtered = filtered.filter(student => student[4] === statusFilter);
      else filtered = filtered.filter(student => student[4] !== 'CONCLUÍDO');

      if (!filtered.length) return;
      any = true;

      const stats = {
        adv: students.filter(student => student[4] === 'ADIANTADO').length,
        ok: students.filter(student => student[4] === 'EM DIA').length,
        late: students.filter(student => student[4] === 'ATRASADO').length,
        miss: students.filter(student => student[5] === 'SIM').length,
        done: students.filter(student => student[4] === 'CONCLUÍDO').length
      };

      const classBox = document.createElement('section');
      classBox.className = 'turma';
      const classHead = document.createElement('div');
      classHead.className = 'turma-head';
      classHead.innerHTML = `<span>${escapeHTML(className)}${query ? ` · ${escapeHTML(day.replace('-FEIRA', ''))}` : ''}</span>
        <div class="turma-stats">
          ${stats.adv ? `<span class="tadv">${stats.adv} adi.</span>` : ''}
          ${stats.ok ? `<span class="tok">${stats.ok} ok</span>` : ''}
          ${stats.late ? `<span class="tlate">${stats.late} atr.</span>` : ''}
          ${stats.miss ? `<span class="tmiss">${stats.miss} falt.</span>` : ''}
          ${statusFilter === 'CONCLUÍDO' && stats.done ? `<span class="tok">${stats.done} concl.</span>` : ''}
        </div>`;
      classBox.appendChild(classHead);

      filtered.forEach(record => {
        const index = students.indexOf(record);
        const row = document.createElement('article');
        row.className = 'aluno' + (record[5] === 'SIM' ? ' faltante' : '');

        const top = document.createElement('div');
        top.className = 'aluno-top';
        const info = document.createElement('div');
        info.style.flex = '1';
        info.innerHTML = `<div class="aluno-nome">${escapeHTML(record[0])} <button class="edit-btn" type="button">✎ Editar</button></div>
          <div class="aluno-datas">Início: ${escapeHTML(record[2] || '—')} · Previsão: ${escapeHTML(record[3] || '—')}</div>`;
        info.querySelector('.aluno-nome').addEventListener('click', () => openStudentModal(day, className, record));
        info.querySelector('.edit-btn').addEventListener('click', event => {
          event.stopPropagation();
          openStudentModal(day, className, record);
        });

        const moduleInput = document.createElement('input');
        moduleInput.className = 'aluno-mod';
        moduleInput.type = 'text';
        moduleInput.placeholder = 'Módulo / curso atual...';
        moduleInput.value = record[1] || '';
        moduleInput.readOnly = !canEdit;
        moduleInput.addEventListener('input', () => {
          record[1] = moduleInput.value;
          markDirty();
        });
        info.insertBefore(moduleInput, info.children[1]);

        const flagRow = document.createElement('div');
        flagRow.className = 'flagrow';
        const flagCheckbox = document.createElement('input');
        flagCheckbox.type = 'checkbox';
        flagCheckbox.id = `flag_${index}_${Math.random().toString(36).slice(2, 7)}`;
        flagCheckbox.checked = record[5] === 'SIM';
        flagCheckbox.disabled = !canEdit;
        const flagLabel = document.createElement('label');
        flagLabel.htmlFor = flagCheckbox.id;
        flagLabel.textContent = 'Aluno faltante';
        flagCheckbox.addEventListener('change', () => {
          record[5] = flagCheckbox.checked ? 'SIM' : 'NAO';
          row.className = 'aluno' + (record[5] === 'SIM' ? ' faltante' : '');
          computeStats();
          renderFilters();
          markDirty();
        });
        flagRow.append(flagCheckbox, flagLabel);
        info.appendChild(flagRow);
        top.appendChild(info);

        const statusSelect = document.createElement('select');
        statusSelect.className = `status-select ${badgeClass(record[4])}`;
        STATUS_ORDER.forEach(status => {
          const option = document.createElement('option');
          option.value = status;
          option.textContent = status;
          option.selected = status === record[4];
          statusSelect.appendChild(option);
        });
        statusSelect.disabled = !canEdit;
        statusSelect.addEventListener('change', () => {
          record[4] = statusSelect.value;
          statusSelect.className = `status-select ${badgeClass(record[4])}`;
          computeStats();
          renderFilters();
          markDirty();
        });
        top.appendChild(statusSelect);
        row.appendChild(top);

        const observation = document.createElement('textarea');
        observation.className = 'obs';
        observation.rows = 1;
        observation.placeholder = 'Observação (clique para adicionar)...';
        observation.value = record[6] || '';
        observation.readOnly = !canEdit;
        observation.addEventListener('input', () => {
          record[6] = observation.value;
          markDirty();
        });
        row.appendChild(observation);
        classBox.appendChild(row);
      });
      content.appendChild(classBox);
    });
  });

  if (!any) content.innerHTML = '<div class="empty">Nenhum aluno encontrado.</div>';
}

function render() {
  renderTabs();
  renderFilters();
  renderContent();
  computeStats();
}

async function persistAll() {
  const dataJSON = JSON.stringify(RAW);
  const accountsJSON = JSON.stringify(ACCOUNTS);
  let localSaved = false;
  let remoteSaved = false;
  let lastError = null;

  try {
    localStorage.setItem(STORAGE_KEYS.data, dataJSON);
    localStorage.setItem(STORAGE_KEYS.accounts, accountsJSON);
    localSaved = true;
  } catch (error) {
    lastError = error;
  }

  dataStoreEl.textContent = dataJSON;
  accountsStoreEl.textContent = accountsJSON;

  if (supabaseClient && currentProfile) {
    const rows = [];
    DAYS.forEach(day => {
      Object.entries(RAW[day] || {}).forEach(([schedule, records]) => {
        records.forEach(record => {
          const row = {
            name: record[0] || 'Aluno sem nome', day, schedule,
            module: record[1] || '', start_date: record[2] || '', due_date: record[3] || '',
            status: record[4] || 'EM DIA', absent: record[5] === 'SIM',
            notes: record[6] || '', history: Array.isArray(record[7]) ? record[7] : [],
            updated_by: currentProfile.id
          };
          if (record[8]) row.id = record[8];
          rows.push(row);
        });
      });
    });
    const { error: studentsError } = await supabaseClient.from('students').upsert(rows, { onConflict: 'id' });
    if (studentsError) throw studentsError;
    const account = currentUser && ACCOUNTS[currentUser];
    if (account) {
      const { error: profileError } = await supabaseClient.from('profiles').update({
        display_name: currentUser, photo_url: account.photo || ''
      }).eq('id', currentProfile.id);
      if (profileError) throw profileError;
    }
    await hydrateRemoteState(currentProfile.id);
    remoteSaved = true;
  }

  if (!localSaved && !remoteSaved) throw lastError || new Error('Não foi possível persistir os dados.');
  return { localSaved, remoteSaved };
}

function avatarHTML(name) {
  const account = ACCOUNTS[name];
  const photo = account && account.photo;
  if (photo) return `<img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}">`;
  const initials = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return escapeHTML(initials || '?');
}

function showLoggedIn(name) {
  if (!ACCOUNTS[name]) return;
  currentUser = name;
  userAv.innerHTML = avatarHTML(name);
  userLabel.textContent = name;
  document.getElementById('userRole').textContent = isAdmin() ? 'Administrador' : 'Professor(a)';
  document.getElementById('menuUsers').style.display = isAdmin() ? 'block' : 'none';
  const settingsUserButton = document.getElementById('openUserManager');
  if (settingsUserButton) settingsUserButton.style.display = isAdmin() ? 'block' : 'none';
  heroActions.style.display = 'block';
  gate.style.display = 'none';
}

function findAccountName(input) {
  const normalized = String(input || '').trim().toLocaleLowerCase('pt-BR');
  return Object.keys(ACCOUNTS).find(name => name.toLocaleLowerCase('pt-BR') === normalized) || '';
}

async function checkLogin() {
  if (supabaseClient) {
    const { data, error } = await supabaseClient.auth.getSession();
    if (!error && data.session) {
      try {
        await hydrateRemoteState(data.session.user.id);
        if (currentProfile) showLoggedIn(currentProfile.display_name);
      } catch (remoteError) {
        document.getElementById('gateErr').textContent = 'Não foi possível carregar os dados do banco.';
      }
    }
    return;
  }
  let saved = '';
  try {
    saved = sessionStorage.getItem('idealiza_user') || '';
  } catch (error) {
    saved = '';
  }
  if (saved && ACCOUNTS[saved]) showLoggedIn(saved);
}

async function loginWithSupabase(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await hydrateRemoteState(data.user.id);
  if (!currentProfile) throw new Error('Perfil do usuário não encontrado.');
  showLoggedIn(currentProfile.display_name);
}

function closeProfile() {
  profileModal.classList.remove('show');
  usersModal.classList.remove('show');
  pendingPhoto = '';
}

function openProfile() {
  if (!currentUser || !ACCOUNTS[currentUser]) return;
  menuDropdown.classList.remove('show');
  const account = ACCOUNTS[currentUser];
  modalAvatar.innerHTML = avatarHTML(currentUser);
  document.getElementById('editUserName').value = currentUser;
  document.getElementById('newPass1').value = '';
  document.getElementById('newPass2').value = '';
  pendingPhoto = account.photo || '';
  document.getElementById('profileMsg').textContent = '';
  document.getElementById('profileMsg').className = 'modal-msg';
  const managerButton = document.getElementById('openUserManager');
  if (managerButton) managerButton.style.display = isAdmin() ? 'block' : 'none';
  profileModal.classList.add('show');
}

function openUserManager() {
  if (!isAdmin()) return;
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserEmail').value = '';
  document.getElementById('newUserPass').value = '';
  document.getElementById('newUserRole').value = 'professor';
  document.getElementById('usersMsg').textContent = '';
  document.getElementById('usersMsg').className = 'modal-msg';
  renderUsersList();
  usersModal.classList.add('show');
}

function refreshTurmaList() {
  const day = document.getElementById('addDia').value;
  const existingClasses = Object.keys(RAW[day] || {});
  const fixedClasses = FIXED_TURMAS
    .filter(([optionDay]) => optionDay === day)
    .map(([, label]) => label);
  const classes = [...new Set([...fixedClasses, ...existingClasses])];
  const turmaList = document.getElementById('turmaList');
  turmaList.innerHTML = classes
    .map(className => `<option value="${escapeHTML(className)}">${escapeHTML(className)}</option>`)
    .join('');
  const turmaSelect = document.getElementById('addTurma');
  if (turmaSelect && turmaSelect.tagName === 'SELECT') {
    turmaSelect.innerHTML = classes
      .map(className => `<option value="${escapeHTML(className)}">${escapeHTML(className)}</option>`)
      .join('');
  }
}

function openAddStudent() {
  if (!currentUser) return;
  menuDropdown.classList.remove('show');
  document.getElementById('addNome').value = '';
  document.getElementById('addTurma').value = '';
  document.getElementById('addModulo').value = '';
  document.getElementById('addInicio').value = '';
  document.getElementById('addFim').value = '';
  document.getElementById('addDia').value = activeDay || DAYS[0] || '';
  refreshTurmaList();
  document.getElementById('addMsg').textContent = '';
  document.getElementById('addMsg').className = 'modal-msg';
  addModal.classList.add('show');
}

function openStudentModal(day, className, record) {
  stuCtx = { day, className, record };
  document.getElementById('studentModalTitle').textContent = record[0] || 'Aluno';
  document.getElementById('stuNome').value = record[0] || '';
  const daySelect = document.getElementById('stuDia');
  daySelect.innerHTML = DAYS
    .map(item => `<option value="${escapeHTML(item)}"${item === day ? ' selected' : ''}>${escapeHTML(item)}</option>`)
    .join('');
  const turmaSelect = document.getElementById('stuTurma');
  turmaSelect.innerHTML = FIXED_TURMAS
    .map(([optionDay, label]) => `<option value="${escapeHTML(label)}" data-day="${escapeHTML(optionDay)}"${label === className ? ' selected' : ''}>${escapeHTML(label)}</option>`)
    .join('');
  if (!FIXED_TURMAS.some(([, label]) => label === className)) {
    turmaSelect.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(className)}" selected>${escapeHTML(className)} (atual)</option>`);
  }
  document.getElementById('stuModulo').value = record[1] || '';
  document.getElementById('stuInicio').value = record[2] || '';
  document.getElementById('stuFim').value = record[3] || '';
  const statusSelect = document.getElementById('stuStatus');
  statusSelect.innerHTML = STATUS_ORDER
    .map(status => `<option value="${status}"${status === record[4] ? ' selected' : ''}>${status}</option>`)
    .join('');
  document.getElementById('stuFaltante').checked = record[5] === 'SIM';
  document.getElementById('stuObs').value = record[6] || '';
  const history = record[7] || [];
  document.getElementById('stuHistorico').innerHTML = history.length
    ? history.map(item => `• ${escapeHTML(item.modulo)} (concluído em ${escapeHTML(item.data)})`).join('<br>')
    : 'Nenhum módulo concluído ainda.';
  document.getElementById('studentMsg').textContent = '';
  document.getElementById('studentMsg').className = 'modal-msg';
  studentModal.querySelectorAll('input, select, textarea, button.modal-btn.save, #stuFinish').forEach(element => {
    element.disabled = !canEdit;
  });
  studentModal.classList.add('show');
}

function renderUsersList() {
  const box = document.getElementById('usersList');
  box.innerHTML = '';
  Object.keys(ACCOUNTS).forEach(name => {
    const account = ACCOUNTS[name];
    const row = document.createElement('div');
    row.className = 'user-row';
    row.innerHTML = `<div><b>${escapeHTML(name)}</b><span>${account.role === 'admin' ? 'Administrador' : 'Professor(a)'}</span></div>`;
    if (name !== currentUser) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remover';
      removeButton.addEventListener('click', async () => {
        if (!isAdmin()) return;
        if (!window.confirm(`Remover o usuário “${name}”?`)) return;
        const snapshot = deepClone(ACCOUNTS);
        delete ACCOUNTS[name];
        try {
          await persistAll();
          renderUsersList();
          document.getElementById('usersMsg').textContent = 'Usuário removido.';
          document.getElementById('usersMsg').className = 'modal-msg ok';
        } catch (error) {
          restoreObject(ACCOUNTS, snapshot);
          renderUsersList();
          document.getElementById('usersMsg').textContent = 'Não foi possível remover agora.';
          document.getElementById('usersMsg').className = 'modal-msg err';
        }
      });
      row.appendChild(removeButton);
    }
    box.appendChild(row);
  });
}

function setModalMessage(id, message, type = '') {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = `modal-msg${type ? ` ${type}` : ''}`;
}

function bindEvents() {
  document.getElementById('search').addEventListener('input', renderContent);

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const message = document.getElementById('saveMsg');
    if (!canEdit) {
      message.textContent = 'Edição indisponível nesta visualização.';
      return;
    }
    message.textContent = 'Salvando...';
    try {
      const result = await persistAll();
      dirty = false;
      message.textContent = result.remoteSaved ? 'Salvo com sucesso.' : 'Salvo neste navegador.';
    } catch (error) {
      message.textContent = 'Não foi possível salvar agora. Tente novamente.';
    }
  });

  document.getElementById('gateBtn').addEventListener('click', async () => {
    const typedName = document.getElementById('gateUser').value.trim();
    const password = document.getElementById('gatePass').value;
    if (supabaseClient) {
      if (!typedName || !password) {
        document.getElementById('gateErr').textContent = 'Informe e-mail e senha.';
        return;
      }
      document.getElementById('gateErr').textContent = 'Entrando...';
      try {
        await loginWithSupabase(typedName, password);
        document.getElementById('gateErr').textContent = '';
      } catch (error) {
        document.getElementById('gateErr').textContent = 'E-mail ou senha incorretos.';
      }
      return;
    }
    const accountName = findAccountName(typedName);
    const account = accountName ? ACCOUNTS[accountName] : null;
    if (account && account.password === password) {
      try { sessionStorage.setItem('idealiza_user', accountName); } catch (error) { /* sessão opcional */ }
      showLoggedIn(accountName);
      document.getElementById('gateErr').textContent = '';
    } else {
      document.getElementById('gateErr').textContent = 'Nome ou senha incorretos.';
    }
  });

  ['gateUser', 'gatePass'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', event => {
      if (event.key === 'Enter') document.getElementById('gateBtn').click();
    });
  });

  menuBtn.addEventListener('click', event => {
    event.stopPropagation();
    menuDropdown.classList.toggle('show');
  });
  menuDropdown.addEventListener('click', event => event.stopPropagation());
  document.addEventListener('click', () => menuDropdown.classList.remove('show'));

  document.getElementById('menuLogout').addEventListener('click', () => {
    if (supabaseClient) supabaseClient.auth.signOut();
    try { sessionStorage.removeItem('idealiza_user'); } catch (error) { /* sessão opcional */ }
    currentUser = null;
    heroActions.style.display = 'none';
    menuDropdown.classList.remove('show');
    gate.style.display = 'flex';
    document.getElementById('gateUser').value = '';
    document.getElementById('gatePass').value = '';
  });

  document.getElementById('menuProfile').addEventListener('click', openProfile);
  document.getElementById('menuTheme').addEventListener('click', toggleTheme);
  document.getElementById('profileCancel').addEventListener('click', closeProfile);
  document.getElementById('openUserManager').addEventListener('click', openUserManager);

  document.getElementById('menuAddStudent').addEventListener('click', openAddStudent);
  document.getElementById('addCancel').addEventListener('click', () => addModal.classList.remove('show'));
  document.getElementById('addDia').addEventListener('change', refreshTurmaList);
  document.getElementById('stuTurma').addEventListener('change', event => {
    const option = event.target.selectedOptions[0];
    if (option && option.dataset.day) document.getElementById('stuDia').value = option.dataset.day;
  });

  document.getElementById('addSave').addEventListener('click', async () => {
    const name = document.getElementById('addNome').value.trim();
    const day = document.getElementById('addDia').value;
    const className = document.getElementById('addTurma').value.trim();
    if (!name || !day || !className) {
      setModalMessage('addMsg', 'Preencha ao menos o nome e a turma.', 'err');
      return;
    }
    if (!RAW[day]) RAW[day] = {};
    if (!RAW[day][className]) RAW[day][className] = [];
    const record = [
      name,
      document.getElementById('addModulo').value.trim(),
      document.getElementById('addInicio').value.trim(),
      document.getElementById('addFim').value.trim(),
      'EM DIA',
      'NAO',
      '',
      []
    ];
    RAW[day][className].push(record);
    setModalMessage('addMsg', 'Salvando...');
    try {
      await persistAll();
      activeDay = day;
      render();
      setModalMessage('addMsg', 'Aluno adicionado!', 'ok');
      window.setTimeout(() => addModal.classList.remove('show'), 700);
    } catch (error) {
      RAW[day][className].pop();
      setModalMessage('addMsg', 'Não foi possível salvar agora.', 'err');
    }
  });

  document.getElementById('photoInput').addEventListener('change', event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingPhoto = String(reader.result || '');
      modalAvatar.innerHTML = avatarHTML(currentUser).replace(avatarHTML(currentUser), `<img src="${escapeHTML(pendingPhoto)}" alt="Nova foto">`);
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('profileSave').addEventListener('click', async () => {
    if (!currentUser || !ACCOUNTS[currentUser]) return;
    const oldName = currentUser;
    const oldAccounts = deepClone(ACCOUNTS);
    const newName = document.getElementById('editUserName').value.trim();
    const password1 = document.getElementById('newPass1').value;
    const password2 = document.getElementById('newPass2').value;
    if (!newName) {
      setModalMessage('profileMsg', 'Informe um nome de usuário.', 'err');
      return;
    }
    if (password1 || password2) {
      if (password1.length < 3) {
        setModalMessage('profileMsg', 'A nova senha deve ter pelo menos 3 caracteres.', 'err');
        return;
      }
      if (password1 !== password2) {
        setModalMessage('profileMsg', 'As senhas não coincidem.', 'err');
        return;
      }
    }
    const existingName = findAccountName(newName);
    if (existingName && existingName !== oldName) {
      setModalMessage('profileMsg', 'Já existe um usuário com esse nome.', 'err');
      return;
    }

    const updatedAccount = deepClone(ACCOUNTS[oldName]);
    if (password1) updatedAccount.password = password1;
    if (pendingPhoto !== undefined) updatedAccount.photo = pendingPhoto;
    if (newName !== oldName) {
      delete ACCOUNTS[oldName];
      ACCOUNTS[newName] = updatedAccount;
    } else {
      ACCOUNTS[oldName] = updatedAccount;
    }

    setModalMessage('profileMsg', 'Salvando...');
    const previousUser = currentUser;
    try {
      if (supabaseClient && password1) {
        const { error: passwordError } = await supabaseClient.auth.updateUser({ password: password1 });
        if (passwordError) throw passwordError;
      }
      currentUser = newName;
      await persistAll();
      try { sessionStorage.setItem('idealiza_user', newName); } catch (error) { /* sessão opcional */ }
      showLoggedIn(newName);
      userAv.innerHTML = avatarHTML(newName);
      setModalMessage('profileMsg', 'Configurações atualizadas.', 'ok');
    } catch (error) {
      restoreObject(ACCOUNTS, oldAccounts);
      currentUser = previousUser || oldName;
      setModalMessage('profileMsg', 'Não foi possível salvar agora.', 'err');
    }
  });

  document.getElementById('menuUsers').addEventListener('click', () => {
    menuDropdown.classList.remove('show');
    openUserManager();
  });
  document.getElementById('usersCancel').addEventListener('click', () => usersModal.classList.remove('show'));

  document.getElementById('userAdd').addEventListener('click', async () => {
    if (!isAdmin()) {
      setModalMessage('usersMsg', 'Apenas administradores podem adicionar usuários.', 'err');
      return;
    }
    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPass').value.trim();
    const role = document.getElementById('newUserRole').value;
    if (!name || !email || !password) {
      setModalMessage('usersMsg', 'Preencha nome, e-mail e senha.', 'err');
      return;
    }
    if (password.length < 6) {
      setModalMessage('usersMsg', 'A senha deve ter pelo menos 6 caracteres.', 'err');
      return;
    }
    if (supabaseClient) {
      setModalMessage('usersMsg', 'Criando usuário...');
      const { error } = await supabaseClient.functions.invoke('admin-create-user', {
        body: { display_name: name, email, password, role }
      });
      if (error) {
        setModalMessage('usersMsg', error.message || 'Não foi possível criar o usuário.', 'err');
        return;
      }
      await hydrateRemoteState(currentProfile.id);
      renderUsersList();
      document.getElementById('newUserName').value = '';
      document.getElementById('newUserEmail').value = '';
      document.getElementById('newUserPass').value = '';
      setModalMessage('usersMsg', 'Usuário adicionado!', 'ok');
      return;
    }
    if (findAccountName(name)) {
      setModalMessage('usersMsg', 'Já existe um usuário com esse nome.', 'err');
      return;
    }
    const snapshot = deepClone(ACCOUNTS);
    ACCOUNTS[name] = { password, photo: '', role: role === 'admin' ? 'admin' : 'professor' };
    setModalMessage('usersMsg', 'Salvando...');
    try {
      await persistAll();
      renderUsersList();
      document.getElementById('newUserName').value = '';
      document.getElementById('newUserEmail').value = '';
      document.getElementById('newUserPass').value = '';
      setModalMessage('usersMsg', 'Usuário adicionado!', 'ok');
    } catch (error) {
      restoreObject(ACCOUNTS, snapshot);
      setModalMessage('usersMsg', 'Não foi possível salvar agora.', 'err');
    }
  });

  document.getElementById('studentCancel').addEventListener('click', () => studentModal.classList.remove('show'));
  document.getElementById('stuFinish').addEventListener('click', () => {
    if (!stuCtx || !stuCtx.record[1]) {
      setModalMessage('studentMsg', 'Informe o módulo atual antes de concluí-lo.', 'err');
      return;
    }
    const record = stuCtx.record;
    if (!Array.isArray(record[7])) record[7] = [];
    const today = new Date();
    const dateString = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    record[7].push({ modulo: record[1], data: dateString });
    record[1] = '';
    record[2] = '';
    record[3] = '';
    record[4] = 'EM DIA';
    document.getElementById('stuModulo').value = '';
    document.getElementById('stuInicio').value = '';
    document.getElementById('stuFim').value = '';
    document.getElementById('stuStatus').value = 'EM DIA';
    document.getElementById('stuHistorico').innerHTML = record[7]
      .map(item => `• ${escapeHTML(item.modulo)} (concluído em ${escapeHTML(item.data)})`)
      .join('<br>');
    markDirty();
    setModalMessage('studentMsg', 'Módulo arquivado. Salve para confirmar.', 'ok');
  });

  document.getElementById('studentSave').addEventListener('click', async () => {
    if (!stuCtx) return;
    const messageId = 'studentMsg';
    const snapshot = deepClone(RAW);
    const record = stuCtx.record;
    const newDay = document.getElementById('stuDia').value;
    const newClassName = document.getElementById('stuTurma').value.trim();
    if (!newDay || !newClassName) {
      setModalMessage(messageId, 'Informe o dia e a turma.', 'err');
      return;
    }
    record[0] = document.getElementById('stuNome').value.trim() || record[0];
    record[1] = document.getElementById('stuModulo').value.trim();
    record[2] = document.getElementById('stuInicio').value.trim();
    record[3] = document.getElementById('stuFim').value.trim();
    record[4] = document.getElementById('stuStatus').value;
    record[5] = document.getElementById('stuFaltante').checked ? 'SIM' : 'NAO';
    record[6] = document.getElementById('stuObs').value.trim();
    if (newDay !== stuCtx.day || newClassName !== stuCtx.className) {
      const oldList = RAW[stuCtx.day] && RAW[stuCtx.day][stuCtx.className];
      if (oldList) {
        const index = oldList.indexOf(record);
        if (index >= 0) oldList.splice(index, 1);
      }
      if (!RAW[newDay]) RAW[newDay] = {};
      if (!RAW[newDay][newClassName]) RAW[newDay][newClassName] = [];
      RAW[newDay][newClassName].push(record);
      stuCtx.day = newDay;
      stuCtx.className = newClassName;
      activeDay = newDay;
    }
    autoAtraso();
    setModalMessage(messageId, 'Salvando...');
    try {
      await persistAll();
      dirty = false;
      render();
      setModalMessage(messageId, 'Aluno salvo.', 'ok');
      window.setTimeout(() => studentModal.classList.remove('show'), 700);
    } catch (error) {
      restoreObject(RAW, snapshot);
      setModalMessage(messageId, 'Não foi possível salvar agora.', 'err');
      render();
    }
  });

  [profileModal, addModal, usersModal, studentModal].forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target !== modal) return;
      if (modal === profileModal) closeProfile();
      else modal.classList.remove('show');
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (studentModal.classList.contains('show')) studentModal.classList.remove('show');
    else if (usersModal.classList.contains('show')) usersModal.classList.remove('show');
    else if (profileModal.classList.contains('show')) closeProfile();
    else if (addModal.classList.contains('show')) addModal.classList.remove('show');
    else menuDropdown.classList.remove('show');
  });
}

applyTheme(loadTheme());
bindEvents();
document.getElementById('addDia').innerHTML = DAYS
  .map(day => `<option value="${escapeHTML(day)}">${escapeHTML(day)}</option>`)
  .join('');
if (DAYS.length) document.getElementById('addDia').value = activeDay;
refreshTurmaList();
const initialAutoLateChanges = autoAtraso();
render();
checkLogin();
if (initialAutoLateChanges) persistAll().catch(() => {});
window.setInterval(persistAutomaticLateStatus, 60000);
