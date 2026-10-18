const $ = (s) => document.querySelector(s);
const form = $('#searchForm'), queryInput = $('#query'), submitBtn = $('#submitBtn');
const results = $('#results'), statusBox = $('#status'), settingsDialog = $('#settingsDialog');
let deferredInstallPrompt = null;
const API_KEY_STORAGE = 'japaneseDictGeminiApiKey';
const MODEL = 'gemini-2.5-flash';

function setStatus(message='', type='info') {
  statusBox.innerHTML = message ? `<div class="status-${type}">${escapeHTML(message)}</div>` : '';
}
function escapeHTML(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function nl2br(value='') { return escapeHTML(value).replace(/\n/g, '<br>'); }
function levelClass(level='') {
  const l = String(level).toUpperCase();
  return ['N1','N2','N3','N4','N5'].find(x => l.includes(x)) || '';
}
function renderResult(data, searchedWord) {
  const level = escapeHTML(data.level || '未分類');
  const lvlClass = levelClass(data.level);
  const examples = (data.examples || []).map(ex => `<article class="example"><div class="japanese">${escapeHTML(ex.japanese)}</div><div class="reading">${escapeHTML(ex.reading)}</div><div class="translation"><b>中</b>　${escapeHTML(ex.chinese)}</div></article>`).join('');
  const comparisons = (data.comparisons || []).map(c => `<article class="compare"><strong>${escapeHTML(c.item)}</strong><div>${escapeHTML(c.explanation)}</div></article>`).join('');
  const suggestions = (data.nextSuggestions || []).map(s => `<article class="suggestion"><div><strong>${escapeHTML(s.item)}</strong><p>${escapeHTML(s.reason)}</p></div><button type="button" class="learn-next" data-word="${escapeHTML(s.item)}" aria-label="立即學習 ${escapeHTML(s.item)}">➜</button></article>`).join('');
  results.innerHTML = `
    <section class="panel"><span class="pill ${lvlClass ? 'level-'+lvlClass : ''}">JLPT ${level}</span><span class="pill">${escapeHTML(data.type || '日文')}</span><h2 class="topic">${escapeHTML(searchedWord)}</h2>
      <div class="explain-grid"><div class="explain meaning"><h3>✦ 基本意思</h3>${nl2br(data.basicMeaning || '')}</div><div class="explain deep"><h3>▤ 深入解說（語感／場合／接續）</h3>${nl2br(data.deepExplanation || '')}</div></div>
    </section>
    <section class="panel"><h2 class="section-title">📖 實用例句</h2>${examples || '<p>沒有例句資料。</p>'}</section>
    ${comparisons ? `<section class="panel"><h2 class="section-title">易混淆相似對比</h2><div class="compare-grid">${comparisons}</div></section>` : ''}
    ${suggestions ? `<section class="panel suggestions-panel"><h2 class="section-title">💡 下一步學習建議</h2><div class="suggestion-grid">${suggestions}</div></section>` : ''}`;
  results.hidden = false;
}
async function fetchWithRetry(url, options, retries=5) {
  const delays = [1000,2000,4000,8000,16000];
  let lastError;
  for (let i=0; i<retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json()).error?.message || ''; } catch {}
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          throw new Error(detail || `API 請求失敗（HTTP ${response.status}），請檢查 API Key 或配額。`);
        }
        throw new Error(detail || `HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      lastError = err;
      if (i === retries-1 || /API 請求失敗|API key|API_KEY|permission|quota|invalid/i.test(err.message)) throw err;
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }
  throw lastError;
}
form.addEventListener('submit', async e => {
  e.preventDefault();
  const word = queryInput.value.trim();
  if (!word) return;
  const apiKey = localStorage.getItem(API_KEY_STORAGE) || '';
  if (!apiKey) {
    settingsDialog.showModal();
    setStatus('請先在設定中輸入 Gemini API Key。','error');
    return;
  }
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading"></span>分析中';
  results.hidden = true;
  setStatus('正在分析日文，請稍候…');
  try {
    const payload = {
      contents: [{parts:[{text:`請詳細解釋這個日文生字或文法：「${word}」。請以繁體中文回答，並提供至少 5 個例句。`}]}],
      systemInstruction: {parts:[{text:'你是一位專業且具備母語水平的日文老師。請針對用戶輸入的日文字彙或文法，提供由淺入深的繁體中文解釋。要求結構：1. JLPT等級。2. 基本意思。3. 深入的語感、接續或使用場合解說。4. 至少5個實用例句（包含日文、平假名/羅馬音、中文翻譯）。5. 相似詞或相似文法的對比。6. 推薦下一個學習的關聯項目。必須嚴格輸出為指定的 JSON 格式。'}]},
      generationConfig: {responseMimeType:'application/json', responseSchema:{
        type:'OBJECT', properties:{
          level:{type:'STRING'}, type:{type:'STRING'}, basicMeaning:{type:'STRING'}, deepExplanation:{type:'STRING'},
          examples:{type:'ARRAY',items:{type:'OBJECT',properties:{japanese:{type:'STRING'},reading:{type:'STRING'},chinese:{type:'STRING'}},required:['japanese','reading','chinese']}},
          comparisons:{type:'ARRAY',items:{type:'OBJECT',properties:{item:{type:'STRING'},explanation:{type:'STRING'}},required:['item','explanation']}},
          nextSuggestions:{type:'ARRAY',items:{type:'OBJECT',properties:{item:{type:'STRING'},reason:{type:'STRING'}},required:['item','reason']}}
        }, required:['level','type','basicMeaning','deepExplanation','examples','comparisons','nextSuggestions']
      }}
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const data = await fetchWithRetry(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) throw new Error('無法解析 AI 回應，請稍後再試。');
    renderResult(JSON.parse(responseText),word);
    setStatus('');
  } catch(err) {
    setStatus(`分析失敗：${err.message || '請稍後再試或換一個詞彙。'}`,'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '分析 →';
  }
});
document.addEventListener('click', e => {
  const example = e.target.closest('[data-word]');
  if (example) {
    queryInput.value = example.dataset.word;
    queryInput.focus();
    if (example.classList.contains('learn-next')) {
      window.scrollTo({top:0,behavior:'smooth'});
      form.requestSubmit();
    }
  }
});
$('#settingsBtn').addEventListener('click', () => {
  $('#apiKey').value = localStorage.getItem(API_KEY_STORAGE) || '';
  settingsDialog.showModal();
});
$('#showKey').addEventListener('change', e => $('#apiKey').type = e.target.checked ? 'text' : 'password');
$('#settingsForm').addEventListener('submit', e => {
  if (e.submitter?.id === 'saveKey') {
    e.preventDefault();
    const key = $('#apiKey').value.trim();
    if (key) localStorage.setItem(API_KEY_STORAGE,key);
    else localStorage.removeItem(API_KEY_STORAGE);
    settingsDialog.close();
    setStatus(key ? 'API Key 已儲存在此裝置。' : '已清除 API Key。');
  }
});
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstallPrompt = e; $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null; $('#installBtn').hidden = true;
});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker registration failed:',err)));
}
