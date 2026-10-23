// Media is already quiet. Keep only the control connection long enough for a
// final backup, and always disconnect even if the PC or network stops replying.
export async function disconnectAfterBackup({ backup, disconnect, timeout = 8000 }) {
  const controller = new AbortController(); let timer;
  try {
    const deadline = new Promise(resolve => { timer = setTimeout(() => resolve(false), timeout); });
    return !!await Promise.race([Promise.resolve().then(() => backup(controller.signal)), deadline]);
  } catch { return false; }
  finally { clearTimeout(timer); controller.abort(); disconnect(); }
}
