'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const preview = 'com.vaughanfitness.vfit.backuppreview';
const account = 'android-calendar-test';
const photoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHloAAAAASUVORK5CYII=';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function prepare(fixture, checkout) {
    const source = fs.readFileSync(fixture, 'utf8');
    const check = source.lastIndexOf('<script>(async()=>{try {');
    assert.ok(check >= 0, 'The offline browser fixture needs its standard setup');
    const html = source.slice(0, check)
        .replace(/<script[^>]+src="https?:\/\/[^\"]+"[^>]*>\s*<\/script>/g, '')
        + '</body></html>';
    const assets = path.join(checkout, 'android/app/src/debug/assets');
    fs.mkdirSync(assets, { recursive: true });
    fs.writeFileSync(path.join(assets, 'index.html'), html);
}

function adb(...args) {
    return execFileSync('adb', args, { encoding: 'utf8', timeout: 30000 }).trim();
}

async function waitFor(read, description) {
    const until = Date.now() + 25000;
    let error;
    while (Date.now() < until) {
        try {
            const value = await read();
            if (value) return value;
        } catch (failure) {
            error = failure;
        }
        await sleep(350);
    }
    throw new Error('Timed out waiting for ' + description, { cause: error });
}

async function connectWebView(device) {
    const pid = await waitFor(() => device('shell', 'pidof', preview), 'VFIT process');
    assert.match(pid, /^\d+$/);
    const port = device('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
    assert.match(port, /^\d+$/);
    const page = await waitFor(async () => {
        const response = await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(2000) });
        return (await response.json()).find(target => target.url === 'https://appassets.androidplatform.net/assets/index.html');
    }, 'VFIT WebView');
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    let sequence = 0;
    function evaluate(expression) {
        return new Promise((resolve, reject) => {
            const id = ++sequence;
            const timer = setTimeout(() => {
                socket.removeEventListener('message', receive);
                reject(new Error('WebView did not respond'));
            }, 10000);
            function receive(event) {
                const reply = JSON.parse(event.data);
                if (reply.id !== id) return;
                clearTimeout(timer);
                socket.removeEventListener('message', receive);
                const failure = reply.error || reply.result?.exceptionDetails;
                if (failure) reject(new Error(failure.exception?.description || failure.message || failure.text));
                else resolve(reply.result.result.value);
            }
            socket.addEventListener('message', receive);
            socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
        });
    }
    await waitFor(() => evaluate(`typeof normalizeState === 'function' && document.readyState === 'complete'`), 'offline VFIT fixture');
    return { evaluate, close() { socket.close(); device('forward', '--remove', 'tcp:' + port); } };
}

async function check(beforeApk, afterApk) {
    const emulators = adb('devices').split('\n').filter(line => /^emulator-\d+\s+device$/.test(line.trim()));
    assert.equal(emulators.length, 1, 'This check needs one disposable emulator');
    const serial = emulators[0].split(/\s+/)[0];
    const device = (...args) => adb('-s', serial, ...args);
    const openVfit = async () => {
        device('shell', 'am', 'start', '-W', '-n', preview + '/com.vaughanfitness.vfit.MainActivity');
        return connectWebView(device);
    };
    const signIn = `currentUser = { uid: ${JSON.stringify(account)}, email: 'android-fixture@example.test' };
        firebaseUserData = { name: 'Android fixture' };
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';`;
    device('install', beforeApk);
    const original = await openVfit();
    let saved;
    try {
        saved = await original.evaluate(`(async () => {
            ${signIn}
            state = normalizeState(DEFAULT_STATE);
            const today = localDateKey();
            state.privacySettings.cloudHealthData = false;
            state.shiftProfile.acknowledgedDisclaimer = true;
            state.shiftProfile.rota[offsetLocalDateKey(today, 2)] = { type: 'off' };
            state.dailyMeals = [{ id: 'fixture-meal', date: today, mealType: 'lunch', name: 'Packed lunch', calories: 440 }];
            state.savedWorkouts = [{ id: 'fixture-plan', name: 'Fixture workout', exercises: [{ name: 'Squat', sets: [{ reps: 8, weight: 45 }] }] }];
            state.metricsHistory = [{ date: today, weight: 80, photos: { front: await putProgressPhoto(today, 'front', ${JSON.stringify(photoData)}) } }];
            if (!saveState({ skipCloud: true })) throw new Error('The old app could not save sample records');
            return localStorage.getItem(stateStorageKey());
        })()`);
        assert.ok(saved, 'The old app saved account records');
        // WebView writes localStorage to disk in batches. Give that write time to finish before replacing the APK.
        await sleep(6500);
    } finally {
        original.close();
    }

    device('install', '-r', afterApk);
    device('shell', 'pm', 'grant', preview, 'android.permission.READ_CALENDAR');
    const updated = await openVfit();
    try {
        const current = await updated.evaluate(`(async () => {
            ${signIn}
            const beforeLoad = localStorage.getItem(stateStorageKey());
            if (!(await prepareAccountDataForUpdate(currentUser.uid))) throw new Error('Normal account recovery blocked the update');
            loadState(currentUser.uid);
            const photo = await getProgressPhoto(state.metricsHistory[0].photos.front);
            switchTab('nutrition');
            document.getElementById('nut-tab-shift').click();
            renderShiftCalendar();
            document.getElementById('shift-calendar-choose').click();
            return { beforeLoad, photo };
        })()`);
        assert.equal(current.beforeLoad, saved, 'The upgrade retained the entire original account save');
        assert.equal(current.photo, photoData, 'The upgrade retained the original IndexedDB photo');
        console.log('Android install -r preserved the full sample account and its photo');

        await waitFor(() => updated.evaluate(`Array.from(document.getElementById('shift-calendar-select').options).some(option => option.textContent === 'VFIT test calendar')`), 'Android calendar picker');
        await updated.evaluate(`(() => {
            const menu = document.getElementById('shift-calendar-select');
            menu.value = Array.from(menu.options).find(option => option.textContent === 'VFIT test calendar').value;
            document.getElementById('shift-calendar-filter').value = 'shift';
            document.getElementById('shift-calendar-save').click();
        })()`);
        await waitFor(() => updated.evaluate(`Boolean(getShiftForDate(offsetLocalDateKey(localDateKey(), 1)).calendarImported)`), 'imported Android calendar shift');
        const result = await updated.evaluate(`(() => {
            const today = localDateKey();
            return {
                shifts: [1, 2, 3, 4, 5].map(i => getShiftForDate(offsetLocalDateKey(today, i))),
                breakfast: mealScheduleForDate(offsetLocalDateKey(today, 1)).breakfast,
                meal: state.dailyMeals[0].name,
                workout: state.savedWorkouts[0].name
            };
        })()`);
        const [first, manual, next, unrelated, allDay] = result.shifts;
        assert.deepEqual([first.type, first.start, first.end], ['night', '20:00', '08:00']);
        assert.deepEqual([manual.type, Boolean(manual.calendarImported)], ['off', false]);
        assert.deepEqual([next.type, next.start], ['night', '20:00']);
        assert.equal(unrelated.type, 'off');
        assert.deepEqual([allDay.type, allDay.start, allDay.end], ['day', '07:00', '19:00']);
        assert.equal(result.breakfast[0], 18 * 60);
        assert.deepEqual([result.meal, result.workout], ['Packed lunch', 'Fixture workout']);
        console.log('Real Calendar Provider import expanded recurring shifts, kept the manual rest day and updated meal timing');
    } finally {
        updated.close();
    }
}

const [mode, first, second] = process.argv.slice(2);
if (mode === 'prepare') prepare(first, second);
else if (mode === 'run') check(first, second).catch(error => { console.error(error); process.exitCode = 1; });
else throw new Error('Use prepare or run');
