// Reusable diary layouts remain separate from logged food until each portion is confirmed.
let nutritionTemplateSession = null;

function resetNutritionTemplateUI() {
    nutritionTemplateSession=null;
    const modal=document.getElementById('nutrition-templates-modal');if(modal)modal.style.display='none';
}

function nutritionTemplateAccountMatches() {
    if(nutritionTemplateSession?.uid===(currentUser&&currentUser.uid||''))return true;
    resetNutritionTemplateUI();showToast('Reopen day templates for this account');return false;
}

function nutritionTemplateEntries(date) {
    const seen=new Set(),wake=mealScheduleForDate(date).wake;
    return copyMealsForDate(date).filter(meal=>{
        const key=meal.id!=null?'id:'+meal.id:JSON.stringify([meal.name,meal.amount,meal.amountType,meal.mealType||meal.type,meal.mealTime,meal.calories]);
        if(seen.has(key))return false;seen.add(key);return true;
    }).map(meal=>{
        const food={};
        for(const key of ['name','brand','barcode','basisUnit','amount','amountType','servingGrams','servingLabel','serving','calories','protein','carbs','fat','fiber','sugar','saturatedFat','salt','sodium','sodiumMg','date','mealType','type','mealTime','mealNextDay','per100g','base']){
            if(meal[key]!==undefined)food[key]=JSON.parse(JSON.stringify(meal[key]));
        }
        if(typeof meal.image==='string'&&!meal.image.startsWith('data:'))food.image=meal.image;
        const type=meal.mealType||meal.type||'snack';
        const minute=mealDiaryMinute(meal.mealTime,meal.mealNextDay,date);
        const offset=minute===null?({breakfast:0,lunch:300,dinner:600,snack:150}[type]??150):minute-wake;
        return {food,offsetMinutes:Math.max(0,Math.min(1439,offset)),mealType:type};
    }).sort((a,b)=>a.offsetMinutes-b.offsetMinutes);
}

function openNutritionTemplates() {
    nutritionTemplateSession={uid:currentUser&&currentUser.uid||''};
    document.getElementById('template-source-date').value=state.viewDate||localDateKey();
    document.getElementById('template-target-date').value=state.viewDate||localDateKey();
    document.getElementById('template-name').value='';
    updateNutritionTemplateWake();renderNutritionTemplates();
    document.getElementById('nutrition-templates-modal').style.display='flex';
}

function updateNutritionTemplateWake() {
    const date=document.getElementById('template-target-date').value;
    if(!validProgressDate(date))return;
    const wake=mealScheduleForDate(date).wake;
    document.getElementById('template-wake').value=String(Math.floor(wake/60)).padStart(2,'0')+':'+String(wake%60).padStart(2,'0');
}

function saveNutritionDayTemplate() {
    if(!nutritionTemplateAccountMatches())return;
    const name=document.getElementById('template-name').value.trim(),date=document.getElementById('template-source-date').value;
    if(!name||name.length>80||!validProgressDate(date)){showToast('Add a name and a valid source diary date');return;}
    const entries=nutritionTemplateEntries(date);
    if(!entries.length){showToast('Log foods on that date before saving a template');return;}
    const kind=document.getElementById('template-kind').value;
    const now=new Date().toISOString();
    state.nutritionDayTemplates.push({id:'nutrition-template-'+Date.now()+'-'+Math.random().toString(36).slice(2),name,kind:['day','night','rest'].includes(kind)?kind:'custom',entries,sourceDate:date,createdAt:now,updatedAt:now});
    if(!saveState()){state.nutritionDayTemplates.pop();showToast('Could not save this template');return;}
    renderNutritionTemplates();showToast('Day template saved');
}

function renameNutritionDayTemplate(id) {
    if(!nutritionTemplateAccountMatches())return;
    const template=state.nutritionDayTemplates.find(item=>item.id===id),name=document.getElementById('template-rename-'+id)?.value.trim();
    if(!template||!name||name.length>80){showToast('Use a name of 1–80 characters');return;}
    template.name=name;template.updatedAt=new Date().toISOString();saveState();renderNutritionTemplates();
}

function updateNutritionDayTemplate(id) {
    if(!nutritionTemplateAccountMatches())return;
    const template=state.nutritionDayTemplates.find(item=>item.id===id),date=document.getElementById('template-source-date').value;
    if(!template||!validProgressDate(date))return;
    const entries=nutritionTemplateEntries(date);
    if(!entries.length){showToast('That diary date has no foods to save');return;}
    if(!confirm(`Replace the foods in "${template.name}" with the diary for ${date}?`))return;
    Object.assign(template,{entries,sourceDate:date,updatedAt:new Date().toISOString()});saveState();renderNutritionTemplates();showToast('Template updated');
}

function deleteNutritionDayTemplate(id) {
    if(!nutritionTemplateAccountMatches())return;
    const template=state.nutritionDayTemplates.find(item=>item.id===id);
    if(!template||!confirm(`Delete "${template.name}"? Logged foods stay in your diary.`))return;
    state.nutritionDayTemplates=state.nutritionDayTemplates.filter(item=>item.id!==id);
    state.deletedNutritionTemplateIds=[...new Set([...state.deletedNutritionTemplateIds,id])];saveState();renderNutritionTemplates();
}

function renderNutritionTemplates() {
    document.getElementById('nutrition-templates-list').innerHTML=(state.nutritionDayTemplates||[]).map(template=>`<article class="rounded-2xl border bg-slate-50 p-4"><label class="text-xs font-bold text-slate-500">Template name<input id="template-rename-${escapeHtml(template.id)}" value="${escapeHtml(template.name)}" maxlength="80" class="block w-full rounded-xl bg-white p-2 mt-1 font-bold"></label><p class="text-xs text-slate-500 mt-2">${escapeHtml(template.kind||'custom')} · ${(template.entries||[]).length} foods · times relative to waking</p><div class="flex flex-wrap gap-2 mt-3"><button onclick='applyNutritionDayTemplate(${safeJsonForInline(template.id)})' class="p-3 rounded-xl bg-orange-600 text-white font-bold text-sm">Review & apply</button><button onclick='renameNutritionDayTemplate(${safeJsonForInline(template.id)})' class="p-2 rounded-xl bg-white border text-xs font-bold">Rename</button><button onclick='updateNutritionDayTemplate(${safeJsonForInline(template.id)})' class="p-2 rounded-xl bg-white border text-xs font-bold">Update from source date</button><button onclick='deleteNutritionDayTemplate(${safeJsonForInline(template.id)})' class="p-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold">Delete</button></div></article>`).join('')||'<p class="text-sm text-slate-400 text-center">Save a logged diary day as your first template.</p>';
}

function nutritionTemplatePortion(entry,wake) {
    const food=entry.food||{},known=copiedProductHasWeightBasis(food);
    const minute=wake+Math.max(0,Math.min(1439,Number(entry.offsetMinutes)||0));
    return {amountType:known?(food.amountType==='grams'?'grams':'portion'):'grams',amount:known?Number(food.amount)||'':'',
        mealType:['breakfast','lunch','dinner','snack'].includes(entry.mealType)?entry.mealType:'snack',
        time:String(Math.floor(minute%1440/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),nextDay:minute>=1440};
}

function applyNutritionDayTemplate(id) {
    if(!nutritionTemplateAccountMatches())return;
    const template=state.nutritionDayTemplates.find(item=>item.id===id),targetDate=document.getElementById('template-target-date').value,wake=mealClockMinutes(document.getElementById('template-wake').value);
    if(!template?.entries?.length||!validProgressDate(targetDate)||wake===null){showToast('Choose a diary date and wake time');return;}
    const entries=template.entries.filter(entry=>entry&&entry.food&&typeof entry.food.name==='string');
    if(!entries.length){showToast('This template has no valid foods');return;}
    if(copyFoodSteps){showToast('Finish or cancel your current food review first');return;}
    state.mealWakeTimes[targetDate]=document.getElementById('template-wake').value;saveState();
    copyFoodSteps={products:entries.map(entry=>JSON.parse(JSON.stringify(entry.food))),targetDate,index:0,added:0,ownerUid:currentUser&&currentUser.uid||'',templateId:id,defaults:entries.map(entry=>nutritionTemplatePortion(entry,wake))};
    document.getElementById('nutrition-templates-modal').style.display='none';renderCopyFoodStep();
}

function prefillNutritionTemplateStep(flow) {
    const defaults=flow.templateId&&flow.defaults?.[flow.index];if(!defaults)return;
    setAmountType(defaults.amountType);
    document.getElementById(defaults.amountType==='grams'?'popup-custom-weight':'popup-amount').value=String(defaults.amount);
    document.getElementById('popup-meal-type').value=defaults.mealType;
    document.getElementById('popup-meal-time').value=defaults.time;
    document.getElementById('popup-meal-next-day').checked=defaults.nextDay;
    document.getElementById('popup-copy-progress').textContent+= ' · Template portion — check before adding';
}
