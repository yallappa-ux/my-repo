/* NutriGuard client: wires the existing HTML to the backend API */
const API = '/api';
let token = localStorage.getItem('ng_token') || null;
let scanMode = 'dish';
let selectedFile = null;
let captchaId = null;
let pendingEmail = '';
let pendingResetEmail = '';
let currentProfile = {
  conditions: ['diabetes_t2', 'celiac'],
  allergens: ['peanut'],
  metrics: { age: 28, heightCm: 170, weightKg: 68, workoutHours: 1, gender: 'unspecified' },
};

const PROFILE_OPTIONS = {
  conditions: [
    { id: 'diabetes_t2', label: 'Type 2 Diabetes' },
    { id: 'diabetes_t1', label: 'Type 1 Diabetes' },
    { id: 'celiac', label: 'Celiac Disease' },
    { id: 'low_sugar', label: 'Low Sugar Goal' },
  ],
  allergens: [
    { id: 'peanut', label: 'Peanut' },
    { id: 'milk', label: 'Milk' },
    { id: 'soy', label: 'Soy' },
    { id: 'egg', label: 'Egg' },
    { id: 'wheat', label: 'Wheat' },
    { id: 'sesame', label: 'Sesame' },
    { id: 'fish', label: 'Fish' },
    { id: 'shellfish', label: 'Shellfish' },
  ],
};

const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setStatus(text) { $('header-status').innerHTML = `<span class="status-dot"></span>${text}`; }

/* ---------- navigation ---------- */
function navigateToLanding() { hide('auth-section'); hide('core-engine-section'); show('landing-section'); }
function navigateToAuth(tab) { hide('landing-section'); show('auth-section'); switchAuthTab(tab); }

function switchAuthTab(tab) {
  const reg = tab === 'register';
  $('toggle-reg-btn').classList.toggle('active', reg);
  $('toggle-login-btn').classList.toggle('active', !reg);
  reg ? show('register-form') : hide('register-form');
  hide('otp-form');
  hide('forgot-password-form');
  hide('reset-password-form');
  clearFormMessage('register-message');
  clearFormMessage('otp-message');
  clearFormMessage('login-message');
  clearFormMessage('reset-request-message');
  clearFormMessage('reset-password-message');
  reg ? hide('login-form') : show('login-form');
  if (!reg) generateCaptcha();
}

function showForgotPassword() {
  switchAuthTab('login');
  hide('login-form');
  show('forgot-password-form');
  $('reset-email').value = $('login-email').value.trim();
}

function returnToLogin(message = '') {
  hide('forgot-password-form');
  hide('reset-password-form');
  show('login-form');
  $('toggle-reg-btn').classList.remove('active');
  $('toggle-login-btn').classList.add('active');
  if (pendingResetEmail) $('login-email').value = pendingResetEmail;
  clearFormMessage('reset-request-message');
  clearFormMessage('reset-password-message');
  if (message) setFormMessage('login-message', message);
  generateCaptcha();
}

/* ---------- auth ---------- */
async function handleRegisterStep1(e) {
  e.preventDefault();
  const email = $('reg-email').value, password = $('reg-password').value;
  const age = Number($('reg-age').value);
  const heightCm = Number($('reg-height').value);
  const weightKg = Number($('reg-weight').value);
  const workoutHours = Number($('reg-workout-hours').value || 0);
  const gender = $('reg-gender').value;

  if (!/^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/.test(password)) {
    return setFormMessage('register-message', 'Use at least 8 characters, including 1 uppercase letter and 1 special character.', true);
  }
  if (password !== $('reg-confirm-password').value) return setFormMessage('register-message', 'Passwords do not match.', true);
  if (!Number.isFinite(age) || age < 10 || age > 100 || !Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250 || !Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250 || !Number.isFinite(workoutHours) || workoutHours < 0 || workoutHours > 12) {
    return setFormMessage('register-message', 'Check your age, height, weight, and workout hours and try again.', true);
  }

  const submit = $('reg-submit-btn');
  submit.disabled = true;
  submit.textContent = 'Sending code...';
  clearFormMessage('register-message');
  try {
    const d = await api('/auth/register', {
      method: 'POST',
      body: {
        email,
        password,
        metrics: { age, heightCm, weightKg, workoutHours, gender },
      },
    });
    pendingEmail = email.trim().toLowerCase();
    $('sent-email-display').textContent = pendingEmail;
    hide('register-form'); show('otp-form');
  } catch (err) { setFormMessage('register-message', err.message, true); }
  finally { submit.disabled = false; submit.textContent = 'Send Verification OTP'; }
}

async function handleVerifyOTP(e) {
  e.preventDefault();
  const submit = $('otp-submit-btn');
  submit.disabled = true;
  submit.textContent = 'Verifying...';
  clearFormMessage('otp-message');
  try {
    const d = await api('/auth/verify-otp', { method: 'POST', body: { email: pendingEmail, otp: $('otp-input').value } });
    startSession(d);
  } catch (err) { setFormMessage('otp-message', err.message, true); }
  finally { submit.disabled = false; submit.textContent = 'Verify OTP & Complete Setup'; }
}

async function handlePasswordResetRequest(e) {
  e.preventDefault();
  const email = $('reset-email').value.trim().toLowerCase();
  const submit = $('reset-request-submit-btn');
  submit.disabled = true;
  submit.textContent = 'Sending code...';
  clearFormMessage('reset-request-message');
  try {
    const result = await api('/auth/forgot-password', { method: 'POST', body: { email } });
    pendingResetEmail = email;
    $('reset-sent-email').textContent = email;
    setFormMessage('reset-password-message', result.message);
    hide('forgot-password-form');
    show('reset-password-form');
  } catch (err) {
    setFormMessage('reset-request-message', err.message, true);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Send Recovery Code';
  }
}

async function handlePasswordReset(e) {
  e.preventDefault();
  const password = $('new-password').value;
  if (!/^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/.test(password)) {
    return setFormMessage('reset-password-message', 'Use at least 8 characters, including 1 uppercase letter and 1 special character.', true);
  }
  if (password !== $('confirm-new-password').value) {
    return setFormMessage('reset-password-message', 'Passwords do not match.', true);
  }

  const submit = $('reset-password-submit-btn');
  submit.disabled = true;
  submit.textContent = 'Updating password...';
  clearFormMessage('reset-password-message');
  try {
    await api('/auth/reset-password', {
      method: 'POST',
      body: { email: pendingResetEmail, otp: $('reset-otp').value, password },
    });
    returnToLogin('Password updated. Sign in with your new password.');
  } catch (err) {
    setFormMessage('reset-password-message', err.message, true);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Update Password';
  }
}

function cancelOTP() { hide('otp-form'); show('register-form'); }

function setFormMessage(id, message, isError = false) {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle('is-error', isError);
  element.classList.remove('hidden');
}

function clearFormMessage(id) {
  const element = $(id);
  if (!element) return;
  element.textContent = '';
  element.classList.add('hidden');
  element.classList.remove('is-error');
}

async function generateCaptcha() {
  try {
    const d = await api('/auth/captcha');
    captchaId = d.id;
    $('captcha-code').textContent = d.code;
    $('captcha-input').value = '';
  } catch (_) {}
}

async function handleLogin(e) {
  e.preventDefault();
  clearFormMessage('login-message');
  try {
    const d = await api('/auth/login', {
      method: 'POST',
      body: { email: $('login-email').value, password: $('login-password').value, captchaId, captchaInput: $('captcha-input').value },
    });
    startSession(d);
  } catch (err) { setFormMessage('login-message', err.message, true); generateCaptcha(); }
}

async function openDemoMode() {
  try { startSession(await api('/auth/demo', { method: 'POST' })); } catch (err) { alert(err.message); }
}

function startSession(d) {
  token = d.token;
  localStorage.setItem('ng_token', token);
  showDashboard(d.user);
}

function showDashboard(user) {
  hide('landing-section'); hide('auth-section'); show('core-engine-section');
  currentProfile = {
    conditions: Array.isArray(user.profile?.conditions) ? user.profile.conditions : [],
    allergens: Array.isArray(user.profile?.allergens) ? user.profile.allergens : [],
    metrics: user.profile?.metrics || { age: 28, heightCm: 170, weightKg: 68, workoutHours: 1, gender: 'unspecified' },
  };
  $('user-display').textContent = `Logged in as: ${user.email}`;
  $('active-profile-text').textContent = user.profileText || 'No profile selected';
  renderProfileControls();
  syncMetricsForm();
  resetMonitor();
}

function renderProfileControls() {
  renderChipGroup('condition-chips', 'conditions', currentProfile.conditions);
  renderChipGroup('allergen-chips', 'allergens', currentProfile.allergens);
  syncMetricsForm();
}

function syncMetricsForm() {
  const m = currentProfile.metrics || { age: 25, heightCm: 170, weightKg: 68, workoutHours: 0, gender: 'unspecified' };
  const ids = ['profile-gender', 'profile-age', 'profile-height', 'profile-weight', 'profile-workout-hours'];
  const values = [m.gender || 'unspecified', m.age, m.heightCm, m.weightKg, m.workoutHours];
  ids.forEach((id, index) => {
    const el = $(id);
    if (el) el.value = values[index];
  });
}

function renderChipGroup(containerId, groupKey, activeValues) {
  const container = $(containerId);
  const activeSet = new Set((activeValues || []).map((value) => String(value).toLowerCase()));
  container.innerHTML = PROFILE_OPTIONS[groupKey].map((option) => {
    const active = activeSet.has(String(option.id).toLowerCase()) ? 'active' : '';
    return `<button type="button" class="profile-chip ${active}" data-group="${groupKey}" data-value="${option.id}" onclick="toggleProfileChip('${groupKey}', '${option.id}')">${option.label}</button>`;
  }).join('');
}

function toggleProfileChip(groupKey, value) {
  const target = currentProfile[groupKey] || [];
  const normalized = String(value).toLowerCase();
  const active = target.some((item) => String(item).toLowerCase() === normalized);
  currentProfile[groupKey] = active
    ? target.filter((item) => String(item).toLowerCase() !== normalized)
    : [...target, normalized];

  $('active-profile-text').textContent = buildProfileText(currentProfile);
  renderProfileControls();
}

function buildProfileText(profile) {
  const conditions = (profile.conditions || []).map((item) => {
    const option = PROFILE_OPTIONS.conditions.find((entry) => String(entry.id).toLowerCase() === String(item).toLowerCase());
    return option ? option.label : item;
  });
  const allergens = (profile.allergens || []).map((item) => {
    const option = PROFILE_OPTIONS.allergens.find((entry) => String(entry.id).toLowerCase() === String(item).toLowerCase());
    return option ? option.label : item;
  });
  const parts = [...conditions, ...allergens.map((item) => `${item} Allergy`)];
  return parts.length ? parts.join(' / ') : 'No medical profile selected';
}

async function saveProfileChanges() {
  try {
    currentProfile.metrics = {
      gender: $('profile-gender').value,
      age: Number($('profile-age').value || 25),
      heightCm: Number($('profile-height').value || 170),
      weightKg: Number($('profile-weight').value || 68),
      workoutHours: Number($('profile-workout-hours').value || 0),
    };
    if (!['female', 'male', 'unspecified'].includes(currentProfile.metrics.gender)) {
      return alert('Select a valid gender option for the nutrition estimate.');
    }

    const d = await api('/profile', {
      method: 'PUT',
      body: {
        conditions: currentProfile.conditions,
        allergens: currentProfile.allergens,
        metrics: currentProfile.metrics,
      },
    });

    currentProfile = {
      conditions: Array.isArray(d.user.profile?.conditions) ? d.user.profile.conditions : currentProfile.conditions,
      allergens: Array.isArray(d.user.profile?.allergens) ? d.user.profile.allergens : currentProfile.allergens,
      metrics: d.user.profile?.metrics || currentProfile.metrics,
    };
    $('active-profile-text').textContent = d.user.profileText || buildProfileText(currentProfile);
    renderProfileControls();
    setStatus('Profile saved');
  } catch (err) {
    alert(err.message);
  }
}

function handleLogout() {
  token = null; localStorage.removeItem('ng_token');
  selectedFile = null;
  $('image-preview').classList.add('hidden'); show('canvas-placeholder');
  hide('core-engine-section'); show('landing-section');
  setStatus('System Ready');
}

/* ---------- scanning ---------- */
function setScanMode(mode) {
  scanMode = mode;
  $('btn-scan-dish').classList.toggle('active', mode === 'dish');
  $('btn-scan-barcode').classList.toggle('active', mode === 'barcode');
}

function handleImageUpload(e) {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 25 * 1024 * 1024) return alert('File must be under 25 MB');
  selectedFile = f;

  const img = $('image-preview');
  const placeholder = $('canvas-placeholder');
  const label = placeholder.querySelector('span');

  if (f.type.startsWith('image/')) {
    img.src = URL.createObjectURL(f);
    img.classList.remove('hidden');
    hide('canvas-placeholder');
  } else {
    img.classList.add('hidden');
    show('canvas-placeholder');
    label.textContent = `${f.name} • ready for scan`;
  }

  resetMonitor();
}

function resetMonitor() {
  $('status-monitor').className = 'status-monitor idle';
  $('verdict-value').textContent = 'AWAITING SCAN';
  $('food-details-value').textContent = '--';
  $('threat-value').textContent = '--';
  $('glycemic-value').textContent = '--';
}

async function runDietaryAudit() {
  if (!selectedFile) {
    selectedFile = new File(['demo-image'], 'demo-food.jpg', { type: 'image/jpeg' });
  }

  if (!token) {
    alert('Please log in first or use Demo Scan to test the food analysis.');
    openDemoMode();
    return;
  }

  const btn = $('audit-btn');
  btn.disabled = true; btn.textContent = '⏳ ANALYZING...';
  setStatus('Analyzing...');
  try {
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('mode', scanMode);
    const r = await api('/audit', { method: 'POST', body: fd });
    renderResult(r);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false; btn.textContent = '⚡ RUN DIETARY HEALTH AUDIT';
    setStatus('System Ready');
  }
}

function renderResult(r) {
  const cls = { SAFE: 'safe', CAUTION: 'caution', UNSAFE: 'danger' }[r.verdict] || 'idle';
  $('status-monitor').className = `status-monitor ${cls}`;
  $('verdict-value').textContent = `${r.verdict}${r.foodName ? ' — ' + r.foodName : ''}`;
  const ingredients = Array.isArray(r.ingredients) && r.ingredients.length ? r.ingredients.join(', ') : 'No ingredient list available';
  const allergens = Array.isArray(r.detectedAllergens) && r.detectedAllergens.length ? r.detectedAllergens.join(', ') : 'Not detected';
  $('food-details-value').textContent = `${r.foodName || 'Food item'} • Ingredients: ${ingredients} • Allergens: ${allergens}`;
  $('threat-value').textContent = r.threat;
  const g = r.glycemic || {};
  $('glycemic-value').textContent = `${g.level}${g.estimatedGI ? ` (GI ≈ ${g.estimatedGI})` : ''} — ${g.note || ''}`;
  $('status-monitor').title = r.disclaimer || '';
}

async function buildDietPlan() {
  const button = document.querySelector('.btn-diet-plan');
  button.disabled = true;
  button.textContent = 'Building plan...';
  try {
    const plan = await api('/diet-plan');
    const output = $('diet-plan-output');
    output.innerHTML = `
      <div class="diet-plan-intro">
        <p>${plan.dailyGoal}</p>
        <p class="diet-plan-caveat">${plan.estimateNote} This is an estimate, not medical advice.</p>
      </div>
      <div class="diet-stats" aria-label="Estimated daily nutrition targets">
        <div><strong>${plan.targetCalories}</strong><span>kcal target</span></div>
        <div><strong>${plan.proteinGrams} g</strong><span>protein</span></div>
        <div><strong>${plan.carbGrams} g</strong><span>carbohydrates</span></div>
        <div><strong>${plan.fatGrams} g</strong><span>fat</span></div>
      </div>
      <p class="diet-hydration">Estimated hydration: <strong>${plan.waterLiters} L/day</strong></p>
      ${plan.profileNote ? `<p class="diet-profile-note">${plan.profileNote}</p>` : ''}
      <div class="diet-section">
        <h4>Meal ideas</h4>
        <div class="diet-meal-list">
          ${plan.meals.map((meal) => `<div class="diet-meal"><strong>${meal.meal} · ${meal.calories} kcal</strong><span>${meal.foods.join(' · ')}</span></div>`).join('')}
        </div>
      </div>
      <div class="diet-section">
        <h4>Energy-dense choices</h4>
        <p>${plan.highCalorieFoods.join(' · ')}</p>
      </div>
      <div class="diet-section">
        <h4>Protein sources</h4>
        <p>${plan.proteinSources.join(' · ')}</p>
      </div>
      <div class="diet-section">
        <h4>Micronutrient-rich foods</h4>
        <p>${plan.vitaminsMinerals.join(' · ')}</p>
      </div>
    `;
  } catch (err) { $('diet-plan-output').textContent = err.message; }
  finally { button.disabled = false; button.textContent = 'Build My Diet Plan'; }
}

/* ---------- restore session on load ---------- */
(async () => {
  if (!token) return;
  try { showDashboard((await api('/auth/me')).user); }
  catch (_) { token = null; localStorage.removeItem('ng_token'); }
})();
