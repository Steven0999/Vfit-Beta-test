'use strict';

// Build isolated real-browser fixtures from the production HTML/modules.
// No Firebase SDK or startup/auth flow is loaded; all records below are test data.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.resolve(process.argv[2] || '/tmp/vfit-ui');
fs.mkdirSync(destination, { recursive: true });
for (const name of ['Styles.css','core','training','nutrition','ui','metrics','coaching','firebase','feedback']) {
  fs.cpSync(path.join(root,name),path.join(destination,name),{recursive:true});
}
let html = fs.readFileSync(path.join(root,'index.html'),'utf8');
html = html.replace(/<script[^>]+src="([^"]+)"[^>]*>\s*<\/script>/g,(tag,src)=>{
  if (src.includes('tailwindcss.com') || src.includes('lucide')) return tag;
  if (!src.startsWith('./') || src.split('?')[0]==='./App.js' || src==='./vfit-config.js') return '';
  return tag;
});
const mocks = `<script>
window.__browserErrors=[];
window.addEventListener('error',event=>{if(event.error){window.__browserErrors.push(event.message);document.body.dataset.browserCheck='failed';}});
function testAuth(){return {setPersistence:async()=>{},onAuthStateChanged(){}};}
testAuth.Auth={Persistence:{LOCAL:'local'}};
function testFirestore(){const record={get:async()=>({exists:false,data:()=>({})}),set:async()=>{},update:async()=>{}};return {collection(){return {doc(){return record;},where(){return this;},limit(){return this;},get:async()=>({empty:true,docs:[],forEach(){}})};}};}
testFirestore.FieldValue={serverTimestamp:()=>new Date().toISOString(),arrayUnion:value=>value,arrayRemove:value=>value};
window.firebase={initializeApp(){},auth:testAuth,firestore:testFirestore};
window.confirm=()=>true;window.alert=()=>{};
</script>`;
html=html.replace('</head>',mocks+'<style>.tab-content{animation:none!important}html{scroll-behavior:auto!important}</style></head>');
const setup = `
function expect(value,message){if(!value)throw new Error(message);}
state=normalizeState(DEFAULT_STATE);currentUser={uid:'browser-fixture',email:'fixture@example.test'};firebaseUserData={name:'Fixture'};
state.userProfile.yearsTraining=5;
state.savedWorkouts=[{id:'push',name:'Push · shift rotation',env:'gym',focus:'Push',includeCore:true,exercises:[
{name:'Bench Press',type:'compound',group:'Push',settings:{repMin:8,repMax:12,targetRir:2,increment:2.5,restSeconds:90,priority:'essential',estimatedMinutes:12},sets:[{reps:'8',weight:'20',rir:'4',setType:'warmup'},{reps:'12',weight:'60',rir:'2'},{reps:'12',weight:'60',rir:'2'}]},
{name:'Cable Crunch',type:'core',group:'Core',settings:{priority:'optional',estimatedMinutes:6},sets:[{reps:'12',weight:'20',rir:'2'}]}]},
{id:'pull',name:'Pull · next session',env:'gym',focus:'Pull',exercises:[{name:'Lat Pulldown',sets:[{reps:10,weight:40,rir:2}]}]}];
state.workoutRotation={planIds:['push','pull'],updatedAt:new Date().toISOString()};
state.exercisePreferences={'gym|Bench Press':{notes:'Bench position 4 · keep feet planted',updatedAt:new Date().toISOString()}};
state.weeklyTrainingPlans[trainingWeekStart(localDateKey())]={counts:{push:2,pull:1}};
state.metricsDate=localDateKey();
state.metricsHistory=Array.from({length:14},(_,i)=>({date:offsetLocalDateKey(localDateKey(),i-13),weight:82-i*0.08+(i%3)*0.15,waist:88-i*0.05}));
state.metricTargets={weight:{value:80}};state.metricAnnotations=[{id:'night-note',date:localDateKey(),text:'Night-shift block started',metric:'all'}];
state.dailyMeals=[{id:'oats',name:'Porridge oats',date:localDateKey(),mealType:'breakfast',mealTime:'17:00',amountType:'grams',amount:60,servingGrams:40,calories:228,protein:7.8,carbs:36,fat:4.2,per100g:{calories:380,protein:13,carbs:60,fat:7}},{id:'yogurt',name:'Greek yogurt',date:localDateKey(),mealType:'snack',mealTime:'02:00',mealNextDay:true,amountType:'grams',amount:150,servingGrams:150,calories:90,per100g:{calories:60,protein:10,carbs:4,fat:0}}];
state.mealWakeTimes[localDateKey()]='16:00';
document.getElementById('auth-screen').style.display='none';document.getElementById('app-screen').style.display='block';document.getElementById('status-date').textContent='Browser fixture';
applyTrainingExperienceMode();
`;
const checks={
  updates:`
    const before=JSON.stringify({...state,meta:{schemaVersion:999,appVersion:'2.1.0-beta.999'},futureSavedField:{note:'Keep the original'}});
    localStorage.setItem(stateStorageKey(currentUser.uid),before);
    protectAccountData(currentUser.uid,'Your saved data was written by a newer VFIT version. Open the latest version to continue.');
    showAccountDataProtection(currentUser.uid);
    expect(!await prepareAccountDataForUpdate(currentUser.uid),'newer save must pause the update');
    expect(localStorage.getItem(stateStorageKey(currentUser.uid))===before,'protected original changed');
    expect((await originalAccountCopies(currentUser.uid))[0].originals.primaryRaw===before,'original copy missing');
    showAccountDataProtection(currentUser.uid);
    expect(!document.getElementById('data-protection-screen').classList.contains('hidden'),'recovery screen missing');
  `,
  active:`
    switchTab('training');startSavedWorkout('push',20);
    const card=document.querySelector('#exercise-list > div'),row=card.querySelector('.set-row');
    expect(card.querySelector('[id^="session-notes-"]').value.includes('Bench position 4'),'personal note missing');
    expect(row.querySelector('.set-type').value==='warmup','warm-up target lost');
    row.querySelector('.set-complete').click();
    expect(snapshotActiveWorkout().exercises[0].sets[0].completed,'completion click failed');
    restoreActiveWorkout();
    expect(document.querySelector('.set-complete').checked,'completion lost on restore');
    expect(!document.getElementById('session-rest-timer').classList.contains('hidden'),'rest banner missing');
    expect(document.querySelector('.set-type').options.length===4,'advanced set types missing');
    document.querySelectorAll('#training > :not(#workout-active)').forEach(element=>element.style.display='none');setTimeout(()=>window.scrollTo(0,0),100);
  `,
  plans:`
    switchTab('training');openMyWorkoutPlan();
    expect(document.getElementById('workout-rotation').textContent.includes('Push · shift rotation'),'rotation missing');
    editSavedWorkout('push');
    expect(document.querySelectorAll('#workout-plan-exercises input[type="number"]').length>=15,'plan controls missing');
    expect(document.querySelectorAll('#workout-plan-exercises select').length>=5,'set labels missing');
    closeWorkoutPlanEditor();
    document.getElementById('saved-workout-time').value='20';
  `,
  metrics:`
    switchTab('metrics');renderMetricProgressGraphs();
    expect(document.querySelectorAll('#metric-progress-graph-overview svg').length===1,'SVG graph missing');
    expect(document.getElementById('metric-progress-graph-overview').textContent.includes('Night-shift block'),'date note missing');
    document.getElementById('metric-target-overview').value='79';setMetricTarget('weight','79');
    expect(state.metricTargets.weight.value===79,'target not saved');
    expect(document.querySelector('#metric-progress-graph-overview [stroke="#0284c7"]'),'trend missing');
    setTimeout(()=>{const target=document.getElementById('metric-overview-select').closest('.glass-card');window.scrollTo(0,target.getBoundingClientRect().top+window.scrollY-100);},100);
  `,
  nutrition:`
    switchTab('nutrition');openNutritionTemplates();document.getElementById('template-name').value='My night-shift day';document.getElementById('template-kind').value='night';saveNutritionDayTemplate();
    expect(state.nutritionDayTemplates.length===1,'day template not saved');
    document.getElementById('template-wake').value='18:00';applyNutritionDayTemplate(state.nutritionDayTemplates[0].id);
    expect(document.getElementById('popup-custom-weight').value==='60','template portion missing');
    expect(document.getElementById('popup-meal-time').value==='19:00','wake-relative time wrong');
    expect(state.dailyMeals.length===2,'unconfirmed template food was logged');
    cancelCopyFoodSteps();
  `,
  calories:`
    state.userProfile = { ...state.userProfile, gender:'male', age:30, heightCm:180, activityLevel:'very_active' };
    const mealsBefore = JSON.stringify(state.dailyMeals);
    const originalTdee = calculateMaintenanceCalories();
    state.nutritionHistory = [{ date:offsetLocalDateKey(localDateKey(),-1), calories:1900, meals:[] }];
    switchTab('settings', { settingsPage:'goals' });
    document.getElementById('goal-btn-lose').click();
    const rate = document.getElementById('goal-rate-input');
    rate.value = '1.5';
    rate.dispatchEvent(new Event('change', { bubbles:true }));
    const lossTarget = originalTdee - 750;
    const expectShared = (target) => {
      expect(state.goals.calories === target, 'wrong saved calorie goal');
      const values = [...document.querySelectorAll('[data-calorie-target]')];
      expect(values.length >= 6 && values.every(node=>node.textContent === target.toLocaleString()), 'calorie displays disagree');
    };
    renderDiary();
    renderMetricProgressGraphs();
    expect(document.getElementById('metric-target-overview').closest('div').querySelector('[data-calorie-target]'), 'weight target is missing the calorie goal');
    expectShared(lossTarget);
    setMetricTarget('weight','78');
    expectShared(lossTarget);
    let chartConfig;
    window.Chart = class { constructor(canvas, config) { chartConfig = config; } destroy() {} };
    openCalorieChartModal();
    expect(chartConfig.data.datasets[1].data[0] === lossTarget, 'daily chart uses a different target');
    setCalorieChartView('weekly');
    expect(chartConfig.data.datasets[1].data[0] === lossTarget * 7, 'weekly chart target does not match the daily goal');
    closeCalorieChartModal();
    document.getElementById('goal-btn-gain').click();
    expectShared(originalTdee + 250);
    document.getElementById('weight-input-value').value = '88';
    saveRecordedWeight();
    const updatedTdee = calculateMaintenanceCalories();
    expect(updatedTdee !== originalTdee, 'new weight did not change TDEE');
    expectShared(updatedTdee + 250);
    openGoalSetting();
    setGoalFocus('weight_loss');
    document.getElementById('wl-kg').value = '2';
    document.getElementById('wl-weeks').value = '4';
    document.getElementById('goal-description').value = 'Weight target';
    previewGoalRecommendation();
    const journalTarget = updatedTdee - 551;
    expect(document.getElementById('goal-rec-content').textContent.includes(journalTarget.toLocaleString()), 'weight goal preview uses a different rule');
    saveGoal();
    closeGoalProgress();
    expectShared(journalTarget);
    expect(JSON.stringify(state.dailyMeals) === mealsBefore, 'editing goals changed logged food');
    openSettingsPage('goals');
  `
};
for(const [name,check] of Object.entries(checks)){
  const script=`<script>(async()=>{try { ${setup}\n${check}\nif(window.__browserErrors.length)throw new Error(window.__browserErrors.join('; '));document.body.dataset.browserCheck='passed'; } catch(error) { document.body.dataset.browserCheck='failed';const report=document.createElement('pre');report.id='browser-check-error';report.textContent=error.stack;document.body.prepend(report);console.error(error); }})()</script>`;
  fs.writeFileSync(path.join(destination,name+'.html'),html.replace('</body>',script+'</body>'));
}
console.log('Created isolated browser fixtures in '+destination);
