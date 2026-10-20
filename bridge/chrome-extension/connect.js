const status = document.getElementById('status');
async function refresh() {
  const result = await chrome.runtime.sendMessage({ type: 'status' });
  status.textContent = result.message;
}
document.getElementById('connect').onclick = async () => {
  try {
    const file = document.getElementById('file').files[0];
    const saved = await chrome.storage.local.get(['token', 'port']);
    const token = file ? (await file.text()).trim() : saved.token;
    if (!token || !/^[A-Za-z0-9_-]{32}$/.test(token)) throw Error('Choose F:\\QuestStudySpace\\bridge\\private\\pairing.txt first.');
    const port = Number(document.getElementById('port').value);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Enter a valid local port.');
    await chrome.storage.local.set({ token, port, enabled: true });
    await chrome.runtime.sendMessage({ type: 'connect' });
    await refresh();
  } catch (error) { status.textContent = error.message; }
};
document.getElementById('disconnect').onclick = async () => {
  await chrome.storage.local.set({ enabled: false });
  await chrome.runtime.sendMessage({ type: 'disconnect' }); await refresh();
};
chrome.storage.local.get('port').then(s => { document.getElementById('port').value = s.port || 8130; });
refresh(); setInterval(refresh, 1000);
