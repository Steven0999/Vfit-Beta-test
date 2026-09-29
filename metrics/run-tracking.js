    // Outdoor runs use the Android location foreground service when available.
    // Browser installs use geolocation while the page remains open.
    let outdoorRunSession = null;
    let outdoorRunWatch = null;
    let outdoorRunPoll = null;
    let outdoorRunTick = null;
    let outdoorRunStarting = false;
    let outdoorRunListenerInstalled = false;
    let outdoorRunServiceRunning = false;

    function nativeRunTrackingAvailable() {
        return !!(window.vfitRunTracker && typeof window.vfitRunTracker.postMessage === 'function');
    }

    function webRunStorageKey() {
        return currentUser ? `vfit_outdoor_run_${currentUser.uid}` : '';
    }

    function persistWebRun() {
        const key = webRunStorageKey();
        if (!key) return;
        try {
            if (outdoorRunSession) localStorage.setItem(key, JSON.stringify(outdoorRunSession));
            else localStorage.removeItem(key);
        } catch (error) {
            console.warn('Outdoor run draft could not be saved', error);
        }
    }

    function sendRunCommand(command, extra) {
        if (!currentUser || !nativeRunTrackingAvailable()) return false;
        try {
            window.vfitRunTracker.postMessage(JSON.stringify(Object.assign({ command, ownerUid: currentUser.uid }, extra || {})));
            return true;
        } catch (error) {
            console.warn('Outdoor run bridge unavailable', error);
            return false;
        }
    }

    function handleNativeRunMessage(event) {
        let payload;
        try { payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
        catch (error) { return; }
        if (!payload || payload.type !== 'vfit-run-status' || !currentUser) return;
        outdoorRunStarting = false;
        outdoorRunServiceRunning = payload.serviceRunning === true;
        const session = payload.session;
        outdoorRunSession = session && session.ownerUid === currentUser.uid ? session : null;
        if (outdoorRunSession) document.getElementById('cardio-type').value = 'outdoor-running';
        updateCardioMode();
        if (payload.error) showToast(payload.error, 6000);
    }

    function initialiseRunTracking() {
        clearInterval(outdoorRunPoll);
        clearInterval(outdoorRunTick);
        if (!currentUser) return;
        if (nativeRunTrackingAvailable()) {
            if (!outdoorRunListenerInstalled && typeof window.vfitRunTracker.addEventListener === 'function') {
                window.vfitRunTracker.addEventListener('message', handleNativeRunMessage);
                outdoorRunListenerInstalled = true;
            }
            sendRunCommand('status');
            outdoorRunPoll = setInterval(() => sendRunCommand('status'), 5000);
        } else {
            try {
                const saved = JSON.parse(localStorage.getItem(webRunStorageKey()) || 'null');
                outdoorRunSession = saved && saved.ownerUid === currentUser.uid ? saved : null;
                if (outdoorRunSession && outdoorRunSession.status === 'recording') {
                    outdoorRunSession.status = 'interrupted';
                    outdoorRunSession.endedAt = outdoorRunSession.lastFixAt || Date.now();
                    persistWebRun();
                }
            } catch (error) { outdoorRunSession = null; }
        }
        outdoorRunTick = setInterval(renderOutdoorRunUI, 1000);
        if (outdoorRunSession) document.getElementById('cardio-type').value = 'outdoor-running';
        updateCardioMode();
    }

    function teardownRunTracking() {
        clearInterval(outdoorRunPoll);
        clearInterval(outdoorRunTick);
        if (outdoorRunWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(outdoorRunWatch);
        outdoorRunWatch = null;
        outdoorRunSession = null;
        outdoorRunStarting = false;
    }

    function finishRunOnSignOut() {
        if (!outdoorRunSession || outdoorRunSession.status !== 'recording') return;
        if (nativeRunTrackingAvailable()) sendRunCommand('finish');
        else {
            if (outdoorRunWatch != null) navigator.geolocation.clearWatch(outdoorRunWatch);
            outdoorRunWatch = null;
            outdoorRunSession.status = 'interrupted';
            outdoorRunSession.endedAt = Date.now();
            persistWebRun();
        }
    }

    function updateCardioMode() {
        const type = document.getElementById('cardio-type');
        if (!type) return;
        if (outdoorRunSession) type.value = 'outdoor-running';
        const isOutdoor = type.value === 'outdoor-running';
        document.getElementById('outdoor-run-panel').classList.toggle('hidden', !isOutdoor);
        if (!isOutdoor) document.getElementById('save-cardio-button').disabled = false;
        const locked = isOutdoor && !!outdoorRunSession;
        type.disabled = locked;
        ['cardio-duration', 'cardio-distance'].forEach(id => {
            const input = document.getElementById(id);
            input.readOnly = isOutdoor;
            input.classList.toggle('opacity-60', isOutdoor);
            if (isOutdoor && !outdoorRunSession) input.value = '';
        });
        renderOutdoorRunUI();
    }

    function runElapsedMs(session, now) {
        if (!session) return 0;
        return Math.max(0, (session.endedAt || now || Date.now()) - session.startedAt);
    }

    function runRouteSvg(points) {
        const route = (Array.isArray(points) ? points : []).filter(point =>
            Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)) &&
            Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lon)) <= 180);
        if (route.length < 2) return '<p class="py-12 text-xs text-slate-400">Waiting for GPS route points…</p>';
        const midLat = route.reduce((sum, p) => sum + Number(p.lat), 0) / route.length;
        const factor = Math.max(0.1, Math.cos(midLat * Math.PI / 180));
        const coords = route.map(p => ({ x: Number(p.lon) * factor, y: Number(p.lat), breakBefore: p.breakBefore === true }));
        const xs = coords.map(p => p.x), ys = coords.map(p => p.y);
        const minX = Math.min(...xs), minY = Math.min(...ys);
        const spanX = Math.max(Math.max(...xs) - minX, 0.00005), spanY = Math.max(Math.max(...ys) - minY, 0.00005);
        const scale = Math.min(340 / spanX, 150 / spanY);
        const width = spanX * scale, height = spanY * scale;
        const pos = p => ({ x: 200 - width / 2 + (p.x - minX) * scale,
            y: 100 + height / 2 - (p.y - minY) * scale });
        const path = coords.map((p, i) => {
            const point = pos(p);
            return `${i === 0 || p.breakBefore ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
        }).join(' ');
        const start = pos(coords[0]), end = pos(coords[coords.length - 1]);
        return `<svg viewBox="0 0 400 200" role="img" aria-label="Recorded GPS route from green start to orange finish" class="w-full rounded-xl bg-slate-50">
            <path d="${path}" fill="none" stroke="#f97316" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="6" fill="#10b981"/>
            <circle cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="6" fill="#f97316"/>
            <text x="370" y="24" fill="#64748b" font-size="13" font-weight="bold">N ↑</text>
        </svg><p class="mt-1 text-[10px] text-slate-500">Route outline · green start, orange finish</p>`;
    }

    function runPointDistanceMetres(a, b) {
        const radians = Math.PI / 180;
        const dLat = (b.lat - a.lat) * radians;
        const dLon = (b.lon - a.lon) * radians;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
        return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    function compactSavedRoute(points) {
        const route = (Array.isArray(points) ? points : []).filter(p =>
            Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && Number.isFinite(Number(p.t)));
        const stride = Math.max(1, Math.ceil((route.length - 1) / 299));
        const saved = [];
        let breakBefore = false;
        route.forEach((p, i) => {
            breakBefore = breakBefore || p.breakBefore === true;
            if (i === 0 || i % stride === 0 || i === route.length - 1) {
                saved.push({ lat: Number(p.lat), lon: Number(p.lon), t: Number(p.t),
                    breakBefore: saved.length > 0 && breakBefore });
                breakBefore = false;
            }
        });
        return saved;
    }

    function acceptWebRunPosition(position) {
        const session = outdoorRunSession;
        if (!session || session.status !== 'recording') return;
        const { latitude: lat, longitude: lon, accuracy } = position.coords;
        const t = position.timestamp || Date.now();
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(accuracy) ||
            accuracy > 40 || t < session.startedAt - 3000) return;
        const points = session.points;
        const last = points[points.length - 1];
        const elapsed = last ? t - last.t : 0;
        if (last && elapsed <= 0) return;
        const metres = last ? runPointDistanceMetres(last, { lat, lon }) : 0;
        if (last && metres < Math.max(6, ((Number(last.accuracy) || 0) + accuracy) / 2)) return;
        if (last && elapsed <= 120000 && metres > Math.max(30, 14 * elapsed / 1000)) return;
        const gap = !!last && elapsed > 120000;
        if (last && !gap) {
            session.distanceMeters += metres;
            session.maxSpeedKmh = Math.max(session.maxSpeedKmh || 0, metres / (elapsed / 1000) * 3.6);
        }
        points.push({ lat, lon, t, accuracy, breakBefore: gap });
        if (points.length > 1800) session.points = points.filter((_, i) => i === 0 || i % 2 === 0 || i === points.length - 1);
        session.lastFixAt = t;
        persistWebRun();
        renderOutdoorRunUI();
    }

    function startOutdoorRun() {
        if (!currentUser || outdoorRunSession || outdoorRunStarting) return;
        outdoorRunStarting = true;
        renderOutdoorRunUI();
        if (nativeRunTrackingAvailable()) {
            if (!sendRunCommand('start')) {
                outdoorRunStarting = false;
                showToast('Could not request location tracking', 5000);
            }
            return;
        }
        if (!navigator.geolocation) {
            outdoorRunStarting = false;
            showToast('Location tracking is unavailable on this device', 5000);
            return;
        }
        outdoorRunSession = {
            id: String(Date.now()), ownerUid: currentUser.uid, startedAt: Date.now(),
            status: 'recording', distanceMeters: 0, maxSpeedKmh: 0,
            points: [], trackingSource: 'web-gps'
        };
        persistWebRun();
        try {
            outdoorRunWatch = navigator.geolocation.watchPosition(position => {
                outdoorRunStarting = false;
                acceptWebRunPosition(position);
            }, error => {
                outdoorRunStarting = false;
                if (outdoorRunWatch != null) navigator.geolocation.clearWatch(outdoorRunWatch);
                outdoorRunWatch = null;
                if (outdoorRunSession) {
                    outdoorRunSession.status = 'interrupted';
                    outdoorRunSession.endedAt = Date.now();
                    persistWebRun();
                }
                showToast(error.code === 1 ? 'Allow precise location for outdoor running' : 'GPS lost. You can finish and save the recorded route.', 6000);
                renderOutdoorRunUI();
            }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
        } catch (error) {
            outdoorRunStarting = false;
            outdoorRunSession = null;
            persistWebRun();
            showToast('Could not start GPS tracking', 5000);
        }
        updateCardioMode();
    }

    function finishOutdoorRun() {
        if (!outdoorRunSession) return;
        if (nativeRunTrackingAvailable()) sendRunCommand('finish');
        else {
            if (outdoorRunWatch != null) navigator.geolocation.clearWatch(outdoorRunWatch);
            outdoorRunWatch = null;
            outdoorRunSession.status = 'completed';
            outdoorRunSession.endedAt = outdoorRunSession.endedAt || Date.now();
            persistWebRun();
            updateCardioMode();
        }
    }

    function discardOutdoorRun() {
        if (!outdoorRunSession || !confirm('Discard this GPS route and run?')) return;
        if (nativeRunTrackingAvailable()) sendRunCommand('discard');
        else {
            if (outdoorRunWatch != null) navigator.geolocation.clearWatch(outdoorRunWatch);
            outdoorRunWatch = null;
            outdoorRunSession = null;
            persistWebRun();
            updateCardioMode();
        }
    }

    function completedOutdoorRun() {
        const session = outdoorRunSession;
        if (!session || session.status !== 'completed') return null;
        const points = Array.isArray(session.points) ? session.points : [];
        const duration = runElapsedMs(session) / 60000;
        const distance = Math.max(0, Number(session.distanceMeters) || 0) / 1000;
        return {
            runId: session.id,
            date: localDateKey(new Date(session.startedAt)),
            startedAt: new Date(session.startedAt).toISOString(),
            endedAt: new Date(session.endedAt).toISOString(),
            duration: Math.round(duration * 10) / 10,
            distance: Math.round(distance * 100) / 100,
            avgSpeedKmh: duration > 0 ? Math.round(distance / (duration / 60) * 10) / 10 : 0,
            maxSpeedKmh: Math.round((Number(session.maxSpeedKmh) || 0) * 10) / 10,
            route: compactSavedRoute(points),
            trackingSource: nativeRunTrackingAvailable() ? 'android-gps' : 'web-gps'
        };
    }

    function acknowledgeSavedOutdoorRun() {
        if (!outdoorRunSession) return;
        if (nativeRunTrackingAvailable()) sendRunCommand('ack_saved', { id: outdoorRunSession.id });
        else {
            outdoorRunSession = null;
            persistWebRun();
        }
    }

    function renderOutdoorRunUI() {
        const panel = document.getElementById('outdoor-run-panel');
        if (!panel || panel.classList.contains('hidden')) return;
        const session = outdoorRunSession;
        const points = session && Array.isArray(session.points) ? session.points : [];
        const elapsedMs = runElapsedMs(session);
        const distance = session ? Math.max(0, Number(session.distanceMeters) || 0) / 1000 : 0;
        const avg = elapsedMs > 0 ? distance / (elapsedMs / 3600000) : 0;
        const last = points[points.length - 1], before = points[points.length - 2];
        const current = before && last && !last.breakBefore && last.t > before.t && Date.now() - last.t < 15000
            ? Math.min(50, runPointDistanceMetres(before, last) / ((last.t - before.t) / 3600000) / 1000) : 0;
        const minutes = Math.floor(elapsedMs / 60000), seconds = Math.floor(elapsedMs / 1000) % 60;
        document.getElementById('outdoor-run-distance').textContent = distance.toFixed(2) + ' km';
        document.getElementById('outdoor-run-time').textContent = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
        document.getElementById('outdoor-run-speed').textContent = current.toFixed(1) + ' km/h';
        document.getElementById('outdoor-run-avg-speed').textContent = avg.toFixed(1) + ' km/h';
        document.getElementById('outdoor-run-route').innerHTML = runRouteSvg(points);
        let status = 'Start when you are ready to run.';
        if (outdoorRunStarting) status = 'Requesting precise location…';
        else if (session?.status === 'completed') status = 'Run finished. Add notes if you want, then save it to Workout Logs.';
        else if (session?.status === 'interrupted') status = 'Tracking stopped. Finish and save the route recorded so far.';
        else if (session?.status === 'recording') status = points.length
            ? (nativeRunTrackingAvailable() && !outdoorRunServiceRunning ? 'GPS service is starting or stopped. Check the run notification.' : 'Recording your route. Tap Finish when done.')
            : 'Waiting for a precise GPS fix. Move outdoors with Location enabled.';
        document.getElementById('outdoor-run-status').textContent = status;
        document.getElementById('outdoor-run-start').classList.toggle('hidden', !!session);
        document.getElementById('outdoor-run-start').disabled = outdoorRunStarting;
        document.getElementById('outdoor-run-finish').classList.toggle('hidden', !session || session.status === 'completed');
        document.getElementById('outdoor-run-discard').classList.toggle('hidden', !session);
        document.getElementById('save-cardio-button').disabled = !!(outdoorRunStarting || !session || session.status !== 'completed' || points.length < 2 || distance <= 0);
        if (session) {
            document.getElementById('cardio-duration').value = (elapsedMs / 60000).toFixed(1);
            document.getElementById('cardio-distance').value = distance.toFixed(2);
        }
    }

    function closeCardioDetails() {
        document.getElementById('cardio-details-modal').style.display = 'none';
    }

    function openCardioDetails(workout) {
        const name = workout.type === 'outdoor-running' ? 'Normal Running' :
            workout.type === 'treadmill' ? 'Treadmill' : String(workout.type || 'Cardio');
        document.getElementById('cardio-details-title').textContent = name;
        const content = document.getElementById('cardio-details-content');
        const stat = (label, value) => `<div class="rounded-xl bg-slate-50 p-3"><p class="text-[10px] font-black uppercase text-slate-500">${label}</p><p class="font-black">${value}</p></div>`;
        const distance = Number(workout.distance) || 0;
        const duration = Number(workout.duration) || 0;
        const speed = Number(workout.avgSpeedKmh) || (duration > 0 ? distance / (duration / 60) : 0);
        const route = Array.isArray(workout.route) ? workout.route : [];
        content.innerHTML = `<p class="mb-4 text-xs text-slate-500">${escapeHtml(new Date(workout.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
            <div class="grid grid-cols-2 gap-3 mb-4">${stat('Distance', distance.toFixed(2) + ' km')}${stat('Duration', duration + ' min')}${stat('Average speed', speed.toFixed(1) + ' km/h')}${stat('Top speed', (Number(workout.maxSpeedKmh) || 0).toFixed(1) + ' km/h')}</div>
            ${route.length ? `<h4 class="font-black mb-2">GPS route</h4><div class="mb-3">${runRouteSvg(route)}</div><button onclick="exportRunGpx('${escapeJsString(workout.id)}')" class="mb-4 rounded-xl bg-amber-500 px-4 py-3 text-xs font-black text-white">Export route (GPX)</button>` : ''}
            ${workout.notes ? `<p class="text-sm text-slate-600">${escapeHtml(workout.notes)}</p>` : ''}`;
        document.getElementById('cardio-details-modal').style.display = 'flex';
    }

    function exportRunGpx(id) {
        const workout = (state.cardioLogs || []).find(item => String(item.id) === String(id));
        if (!workout || !Array.isArray(workout.route)) return;
        const route = workout.route.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.t));
        const segments = [];
        let segment = [];
        route.forEach(p => {
            if (p.breakBefore && segment.length) { segments.push(segment); segment = []; }
            segment.push(`<trkpt lat="${p.lat}" lon="${p.lon}"><time>${new Date(p.t).toISOString()}</time></trkpt>`);
        });
        if (segment.length) segments.push(segment);
        const xml = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="VFIT" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>VFIT outdoor run</name>${segments.map(items => `<trkseg>${items.join('')}</trkseg>`).join('')}</trk></gpx>`;
        const url = URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `vfit-run-${workout.date}.gpx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
