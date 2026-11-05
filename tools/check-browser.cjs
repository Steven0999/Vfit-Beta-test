'use strict';

// Wait for actual browser/IndexedDB completion before capturing the result.
// Uses Chrome's local DevTools pipe; no npm packages or debugging port needed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const directory = path.resolve(process.argv[2]);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vfit-browser-'));
const browser = spawn(process.env.CHROME_BIN || 'google-chrome', [
  '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--no-first-run', '--allow-file-access-from-files', '--remote-debugging-pipe',
  '--window-size=390,920', '--user-data-dir=' + profile
], {stdio:['ignore','ignore','pipe','pipe','pipe']});
let nextId = 0, buffer = '', stderr = '';
const pending = new Map();
browser.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2500); });
function rejectPending(error) {
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
  pending.clear();
}
browser.on('error', rejectPending);
browser.on('exit', code => rejectPending(new Error('Chrome exited (' + code + '): ' + stderr)));
browser.stdio[3].on('error', rejectPending);
browser.stdio[4].setEncoding('utf8');
browser.stdio[4].on('data', chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const raw = buffer.slice(0,end); buffer = buffer.slice(end + 1);
    if (!raw) continue;
    let message;
    try { message = JSON.parse(raw); } catch (error) { rejectPending(error); continue; }
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  }
});
function command(method, params = {}, sessionId) {
  return new Promise((resolve,reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome timed out: ' + method)); }, 30000);
    pending.set(id,{resolve,reject,timer});
    browser.stdio[3].write(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})}) + '\0');
  });
}
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
async function evaluate(expression, sessionId) {
  const result = await command('Runtime.evaluate',{expression,returnByValue:true},sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
const pageStatus = `({url:location.href,status:document.body?.dataset.browserCheck,error:document.getElementById('browser-check-error')?.textContent})`;

(async () => {
  try {
    for (const name of ['active','plans','metrics','nutrition','updates']) {
      const {browserContextId} = await command('Target.createBrowserContext');
      try {
        const {targetId} = await command('Target.createTarget',{url:'about:blank',browserContextId});
        const {sessionId} = await command('Target.attachToTarget',{targetId,flatten:true});
        await command('Page.enable',{},sessionId);
        await command('Emulation.setDeviceMetricsOverride',{width:390,height:920,deviceScaleFactor:1,mobile:false},sessionId);
        const url = pathToFileURL(path.join(directory,name + '.html')).href;
        await command('Page.navigate',{url},sessionId);
        const deadline = Date.now() + 45000;
        let status;
        while (Date.now() < deadline) {
          try { status = await evaluate(pageStatus,sessionId); }
          catch (error) {
            if (!/context.*destroyed|Cannot find context/i.test(error.message)) throw error;
          }
          if (status?.url === url && status.status) break;
          await pause(100);
        }
        await pause(350); // Allow layout/scroll updates scheduled by the fixture.
        status = await evaluate(pageStatus,sessionId);
        const dom = await evaluate('document.documentElement.outerHTML',sessionId);
        fs.writeFileSync(path.join(directory,name + '.dom.html'),dom);
        const screenshot = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
        fs.writeFileSync(path.join(directory,name + '.png'),Buffer.from(screenshot.data,'base64'));
        if (status?.url !== url || status.status !== 'passed')
          throw new Error(name + ': ' + (status?.error || 'browser check did not finish within 45 seconds'));
        console.log(name + ': PASS');
      } finally {
        await command('Target.disposeBrowserContext',{browserContextId});
      }
    }
  } finally {
    if (browser.exitCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => { browser.kill('SIGKILL'); resolve(); },3000);
      browser.once('close',() => { clearTimeout(timer); resolve(); });
      browser.kill('SIGTERM');
    });
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
