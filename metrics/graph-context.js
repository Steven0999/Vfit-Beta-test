// Targets are stored in canonical metric units, independent of display units.
let metricContextSession = null;

function metricWeightFactor(source) {
    const unit = (source || state).weightUnit;
    return ['lb','lbs'].includes(unit) ? 2.2046226218 : unit === 'st' ? 1 / 6.35029318 : 1;
}

function metricRollingTrend(entries, points) {
    const days = new Map();
    (entries || []).forEach(entry => {
        if (!validProgressDate(entry.date) || !Number.isFinite(entry.value)) return;
        const bucket = days.get(entry.date) || []; bucket.push(entry.value); days.set(entry.date,bucket);
    });
    const daily = [...days].map(([date,values])=>({date,value:values.reduce((a,b)=>a+b,0)/values.length}));
    return points.map(point=>{
        const start=progressDateOffset(point.date,-6);
        const logs=daily.filter(entry=>entry.date>=start&&entry.date<=point.date);
        return {date:point.date,value:logs.length?logs.reduce((sum,entry)=>sum+entry.value,0)/logs.length:null,count:logs.length};
    });
}

function metricGraphContext(metric, series, source) {
    const snapshot=source||state, prefs=snapshot.metricChartPreferences||{};
    const raw=Number(snapshot.metricTargets?.[metric]?.value);
    return {
        target:prefs.showTarget!==false && raw>0 ? raw*(metric==='weight'?metricWeightFactor(snapshot):1) : null,
        trend:metric==='weight' && series.bucket==='day' && prefs.showTrend!==false ? metricRollingTrend(metricProgressEntries(metric,snapshot),series.points) : [],
        annotations:(snapshot.metricAnnotations||[]).filter(note=>validProgressDate(note.date)&&typeof note.text==='string'&&(!note.metric||note.metric==='all'||note.metric===metric)&&note.date>=series.start&&note.date<=series.end)
    };
}

function setMetricChartPreference(key, value) {
    if (!['showTrend','showTarget'].includes(key)) return;
    state.metricChartPreferences[key]=Boolean(value); saveState(); renderMetricProgressGraphs();
}

function setMetricTarget(metric, value) {
    if (!METRIC_PROGRESS_TYPES[metric]) return;
    const number=Number(value);
    if (value!==''&&(!Number.isFinite(number)||number<=0||number>1000000)) {showToast('Enter a positive target, or clear it');return;}
    state.metricTargets[metric]={value:value===''?null:number/(metric==='weight'?metricWeightFactor():1),updatedAt:new Date().toISOString()};
    saveState();renderMetricProgressGraphs();
}

function metricContextControls(metric,scope) {
    const raw=Number(state.metricTargets?.[metric]?.value), value=raw>0?Math.round(raw*(metric==='weight'?metricWeightFactor():1)*100)/100:'';
    const calorieGoal = metric === 'weight'
        ? `<p class="text-xs mt-2">Daily calorie goal <span data-calorie-target>${getDailyCalorieTarget().toLocaleString()}</span> kcal</p>`
        : '';
    return `<div class="rounded-2xl bg-slate-50 p-3 mt-2"><div class="flex flex-wrap items-center gap-3 text-xs font-bold">${metric==='weight'?`<label><input type="checkbox" ${state.metricChartPreferences.showTrend!==false?'checked':''} onchange="setMetricChartPreference('showTrend',this.checked)"> 7-day trend</label>`:''}<label><input type="checkbox" ${state.metricChartPreferences.showTarget!==false?'checked':''} onchange="setMetricChartPreference('showTarget',this.checked)"> Target line</label><button onclick="openMetricContextEditor()" class="p-2 rounded-xl bg-white border">Date notes</button></div><label for="metric-target-${scope}" class="flex gap-2 items-center mt-2 text-xs font-bold">Target (${escapeHtml(metricProgressUnit(metric))})<input id="metric-target-${scope}" type="number" min="0.01" max="1000000" step="any" value="${value}" placeholder="Optional" class="w-28 min-w-0 p-2 bg-white rounded-xl border"><button onclick="setMetricTarget('${metric}',document.getElementById('metric-target-${scope}').value)" class="p-2 rounded-xl bg-orange-600 text-white">Save</button></label>${calorieGoal}</div>`;
}

function metricContextLegend(metric,context,series) {
    return `<div class="text-[11px] text-slate-500 mt-2 flex flex-wrap gap-3"><span>🟠 Logged ${series.bucket==='day'?'values':'averages'}</span>${context.trend.length?'<span class="text-sky-600">Blue: trailing 7-day trend of logged daily weights</span>':''}${context.target?`<span class="text-emerald-600">Dashed: target ${escapeHtml(formatMetricProgressNumber(context.target))} ${escapeHtml(metricProgressUnit(metric))}</span>`:''}</div>${metric==='weight'&&series.bucket!=='day'?'<p class="text-[10px] text-slate-400 mt-1">Zoom to Month or Week for the 7-day weight trend.</p>':''}${context.annotations.length?`<ul class="text-xs text-purple-700 mt-2 space-y-1">${context.annotations.map(note=>`<li>${escapeHtml(note.date)} · ${escapeHtml(note.text)}</li>`).join('')}</ul>`:''}`;
}

function resetMetricContextEditor() {
    metricContextSession=null;
    const modal=document.getElementById('metric-context-modal');if(modal)modal.style.display='none';
}

function openMetricContextEditor(id) {
    const note=(state.metricAnnotations||[]).find(item=>item.id===id);
    metricContextSession={uid:currentUser&&currentUser.uid||'',id:note?.id||''};
    document.getElementById('metric-note-date').value=note?.date||metricProgressAnchor||state.metricsDate||localDateKey();
    document.getElementById('metric-note-text').value=note?.text||'';
    const select=document.getElementById('metric-note-metric');
    select.innerHTML='<option value="all">All metrics</option>'+Object.entries(METRIC_PROGRESS_TYPES).map(([key,value])=>`<option value="${key}">${escapeHtml(value.label)}</option>`).join('');
    select.value=note?.metric||metricProgressSelection;
    document.getElementById('metric-notes-list').innerHTML=(state.metricAnnotations||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).map(item=>`<div class="rounded-xl bg-slate-50 p-3 mt-2"><p class="text-xs">${escapeHtml(item.date)} · ${escapeHtml(item.text)}</p><div class="flex gap-3 mt-1"><button onclick='openMetricContextEditor(${safeJsonForInline(item.id)})' class="text-xs font-bold text-orange-600 p-2">Edit</button><button onclick='deleteMetricAnnotation(${safeJsonForInline(item.id)})' class="text-xs font-bold text-red-600 p-2">Delete</button></div></div>`).join('');
    document.getElementById('metric-context-modal').style.display='flex';
}

function saveMetricAnnotation() {
    if(!metricContextSession||metricContextSession.uid!==(currentUser&&currentUser.uid||'')){resetMetricContextEditor();return;}
    const date=document.getElementById('metric-note-date').value,text=document.getElementById('metric-note-text').value.trim(),metric=document.getElementById('metric-note-metric').value;
    if(!validProgressDate(date)||!text||text.length>200||!(metric==='all'||METRIC_PROGRESS_TYPES[metric])){showToast('Choose a date, metric and a note of up to 200 characters');return;}
    if(state.deletedMetricAnnotationIds.includes(metricContextSession.id)){showToast('This note was deleted; reopen to create a new note');return;}
    const id=metricContextSession.id||'note-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const item={id,date,text,metric,updatedAt:new Date().toISOString()};
    state.metricAnnotations=state.metricAnnotations.filter(note=>note.id!==id).concat(item);
    saveState();openMetricContextEditor();renderMetricProgressGraphs();showToast('Date note saved');
}

function deleteMetricAnnotation(id) {
    if(!metricContextSession||metricContextSession.uid!==(currentUser&&currentUser.uid||'')){resetMetricContextEditor();return;}
    if(!state.metricAnnotations.some(note=>note.id===id)||!confirm('Delete this date note?'))return;
    state.metricAnnotations=state.metricAnnotations.filter(note=>note.id!==id);
    state.deletedMetricAnnotationIds=[...new Set([...state.deletedMetricAnnotationIds,id])];
    saveState();openMetricContextEditor();renderMetricProgressGraphs();
}
