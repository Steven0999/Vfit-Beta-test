    // ==========================================================================
    // COACHING HUB — CHECK-INS, READINESS AND SHIFT ROTA
    // ==========================================================================

    function clampNumber(value, min, max, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    }

    function dateKeyDaysAgo(days) {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - days);
        return localDateKey(date);
    }

    function buildDeloadPlan(startDate, source) {
        const start = /^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '')) ? String(startDate) : localDateKey();
        const end = new Date(start + 'T12:00:00');
        end.setDate(end.getDate() + 6);
        return {
            active: true,
            startDate: start,
            endDate: localDateKey(end),
            source: String(source || 'manual').slice(0, 40),
            createdAt: new Date().toISOString()
        };
    }

    function isDeloadPlanActive(sourceState, dateKey) {
        const source = sourceState || state;
        const plan = source.deloadPlan || {};
        const date = dateKey || localDateKey();
        return plan.active === true && !!plan.startDate && !!plan.endDate && date >= plan.startDate && date <= plan.endDate;
    }

    function startDeloadWeek(source, options) {
        const config = options || {};
        state.deloadPlan = buildDeloadPlan(localDateKey(), source);
        if (config.persist !== false) {
            saveState();
            renderReadinessSummary();
            renderProgressionRecommendations();
            showToast(`Deload week active until ${state.deloadPlan.endDate}`, 5000);
        }
        return state.deloadPlan;
    }

    function endDeloadWeek() {
        state.deloadPlan = Object.assign({}, state.deloadPlan || {}, {
            active: false,
            endedAt: new Date().toISOString()
        });
        saveState();
        renderReadinessSummary();
        renderProgressionRecommendations();
        showToast('Deload week ended');
    }

    function getShiftForDate(dateKey) {
        const profile = state.shiftProfile || DEFAULT_STATE.shiftProfile;
        const rota = isPlainRecord(profile.rota) ? profile.rota : {};
        if (isPlainRecord(rota[dateKey])) return Object.assign({}, rota[dateKey], { source: 'rota' });
        if (!profile.enabled) return { type: 'off', source: 'default' };
        const date = new Date(dateKey + 'T12:00:00');
        if (!Array.isArray(profile.workDays) || !profile.workDays.includes(date.getDay())) return { type: 'off', source: 'pattern' };
        const typeMap = { nights: 'night', days: 'day', earlies: 'early', rotating: 'night' };
        return {
            type: typeMap[profile.shiftType] || 'day',
            start: profile.shiftStart || '07:00',
            end: profile.shiftEnd || '19:00',
            source: 'pattern'
        };
    }

    let aiCoachCheckInSession = null;
    let aiCoachPromptedSessionKey = '';

function aiCoachQuestionnaireSteps(answers) {
    const values = answers || {};
    const includeDietarySetup = Object.prototype.hasOwnProperty.call(values, '__dietarySetup')
        ? values.__dietarySetup === true
        : !dietaryProfile().completed;
    const dietarySteps = includeDietarySetup ? [
        {
            id: 'dietRequirementOverview',
            question: 'Before today’s readiness check, do you have dietary requirements that must be included in your plan?',
            options: [
                { value: 'none', label: 'No requirements', hint: 'Nothing specific to avoid' },
                { value: 'allergy', label: 'Allergy / intolerance', hint: 'I need to name exact foods' },
                { value: 'faith', label: 'Religious / cultural', hint: 'For example halal or kosher' },
                { value: 'other', label: 'Other or medical', hint: 'Another requirement applies' }
            ]
        },
        {
            id: 'dietRequirementDetails',
            question: 'Please type the exact foods, allergies, certification needs or other dietary instructions the plan must respect.',
            inputType: 'text',
            optional: true,
            placeholder: 'For example: severe peanut allergy, lactose intolerance, halal only…'
        },
        {
            id: 'dietPattern',
            question: 'Do you follow a specific diet?',
            options: [
                { value: 'balanced', label: 'No specific diet', hint: 'Balanced meal suggestions' },
                { value: 'vegan', label: 'Vegan', hint: 'Plant-based meals only' },
                { value: 'vegetarian', label: 'Vegetarian', hint: 'No meat or fish' },
                { value: 'ketogenic', label: 'Ketogenic', hint: 'Lower-carbohydrate meal library' }
            ]
        },
        {
            id: 'dietApproach',
            question: 'Is there an eating approach you want included as well?',
            options: [
                { value: 'none', label: 'Neither', hint: 'No fasting or deficit focus' },
                { value: 'intermittent_fasting', label: 'Intermittent fasting', hint: 'Timing changes with the shift' },
                { value: 'calorie_deficit', label: 'Calorie deficit', hint: 'Smaller planned portions' },
                { value: 'fasting_deficit', label: 'Both', hint: 'Fasting and calorie-deficit focus' }
            ]
        }
    ].filter(step => step.id !== 'dietRequirementDetails' || (values.dietRequirementOverview && values.dietRequirementOverview !== 'none')) : [];

    const dailySteps = [
        {
            id: 'mood',
            question: 'Now, how are you feeling overall today?',
            options: [
                { value: 'great', label: 'Great', hint: 'Positive and ready' },
                { value: 'okay', label: 'Okay', hint: 'Somewhere in the middle' },
                { value: 'drained', label: 'Drained', hint: 'Running on empty' }
            ]
        },
        {
            id: 'sleepHours',
            question: 'Roughly how much sleep did you get in your main sleep period?',
            options: [
                { value: '4.5', label: 'Under 5h', hint: 'Very short' },
                { value: '5.5', label: '5–6h', hint: 'Short' },
                { value: '6.5', label: '6–7h', hint: 'Nearly there' },
                { value: '7.5', label: '7–8h', hint: 'Solid' },
                { value: '8.5', label: '8h+', hint: 'Well rested' }
            ]
        },
        {
            id: 'energy',
            question: 'How is your energy right now?',
            options: [
                { value: '5', label: 'High', hint: 'Plenty in the tank' },
                { value: '3', label: 'Steady', hint: 'Enough for normal tasks' },
                { value: '1', label: 'Low', hint: 'Everything feels harder' }
            ]
        },
        {
            id: 'fatigue',
            question: 'How much whole-body fatigue are you carrying?',
            options: [
                { value: '1', label: 'Fresh', hint: 'Recovered' },
                { value: '3', label: 'Moderate', hint: 'Noticeable but manageable' },
                { value: '5', label: 'Heavy', hint: 'Very fatigued' }
            ]
        },
        {
            id: 'deloadWeek',
            question: 'You are showing signs of severe fatigue. Would you like the next seven days to be a deload week?',
            options: [
                { value: 'yes', label: 'Yes, deload', hint: 'Reduce weekly sets by about 40–50% and avoid failure' },
                { value: 'no', label: 'Not right now', hint: 'Keep today recovery-focused and reconsider if fatigue continues' }
            ]
        },
        {
            id: 'soreness',
            question: 'What is your muscle or joint soreness like?',
            options: [
                { value: '1', label: 'None', hint: 'Moving normally' },
                { value: '3', label: 'Manageable', hint: 'Normal training soreness' },
                { value: '5', label: 'Severe or sharp', hint: 'Movement is affected' }
            ]
        },
        {
            id: 'stress',
            question: 'How high is your stress today?',
            options: [
                { value: '1', label: 'Low', hint: 'Calm' },
                { value: '3', label: 'Moderate', hint: 'Manageable' },
                { value: '5', label: 'High', hint: 'Under pressure' }
            ]
        },
        {
            id: 'wellbeing',
            question: 'Last health check: which best describes you today?',
            options: [
                { value: 'well', label: 'I feel well', hint: 'No unusual symptoms' },
                { value: 'niggle', label: 'Minor niggle', hint: 'Something needs care' },
                { value: 'unwell', label: 'Unwell / unusual pain', hint: 'Training may not be appropriate' }
            ]
        }
    ];
    const steps = dietarySteps.concat(dailySteps);
    return Number(values.fatigue) >= 5
        ? steps
        : steps.filter(step => step.id !== 'deloadWeek');
}

    function aiCoachShiftLabel(shift) {
        const type = shift && shift.type ? shift.type : 'off';
        const labels = { off: 'Rest / off day', day: 'Day shift', early: 'Early shift', night: 'Night shift' };
        const hours = shift && shift.start ? ` · ${shift.start}–${shift.end || ''}` : '';
        return (labels[type] || 'Shift not set') + hours;
    }

    function aiCoachSafetySignal(value) {
        const text = String(value || '').toLowerCase();
        if (!text) return '';
        const urgent = [
            'chest pain', 'can\'t breathe', 'cannot breathe', 'severe difficulty breathing',
            'passed out', 'fainted', 'one-sided weakness', 'one sided weakness'
        ];
        if (urgent.some(term => text.includes(term))) return 'urgent';
        const concern = [
            'sharp pain', 'unusual pain', 'dizzy', 'dizziness', 'fever', 'vomiting',
            'injured', 'injury', 'unwell', 'heart racing'
        ];
        return concern.some(term => text.includes(term)) ? 'concern' : '';
    }

function aiCoachShiftAdvice(shift, label) {
    const type = shift && shift.type ? shift.type : 'off';
    const adjusted = label !== 'Ready';
    let advice;
    if (type === 'night') {
        advice = adjusted
            ? 'For this night shift, protect your main sleep first. If you train, keep it short and place it after waking and before the shift—not at the exhausted end of it.'
            : 'For this night shift, your best training window is after your main sleep and before the shift. Keep food, fluids and the session planned before work starts.';
    } else if (type === 'early') {
        advice = adjusted
            ? 'For this early shift, avoid forcing a hard pre-shift session. Choose a shorter session after work only if energy improves; otherwise make today recovery-focused.'
            : 'For this early shift, train after work if your energy stays steady, or use a short pre-shift session only when it does not cut into sleep.';
    } else if (type === 'day') {
        advice = adjusted
            ? 'Around this day shift, use the easiest realistic training window and shorten the session. Consistency matters more than completing every planned set.'
            : 'Around this day shift, use whichever pre- or post-shift window you can repeat consistently and keep the session plan ready in advance.';
    } else {
        advice = adjusted
            ? 'Because this is an off day, use the extra flexibility for recovery or a shorter session when energy is best.'
            : 'Because this is an off day, place the session at your best-energy time and leave enough room for meals and recovery.';
    }
    return `${advice} ${dietaryShiftCoachAdvice(type)}`.trim();
}

    function buildAICoachCheckInResult(answers, shift, note) {
        const values = answers || {};
        const sleepHours = clampNumber(values.sleepHours, 0, 16, 0);
        const sleepQuality = sleepHours >= 8 ? 5 : sleepHours >= 7 ? 4 : sleepHours >= 6 ? 3 : sleepHours >= 5 ? 2 : 1;
        const readinessValues = {
            sleepHours,
            sleepQuality,
            energy: clampNumber(values.energy, 1, 5, 3),
            fatigue: clampNumber(values.fatigue, 1, 5, 3),
            soreness: clampNumber(values.soreness, 1, 5, 3),
            stress: clampNumber(values.stress, 1, 5, 3)
        };
        let score = calculateReadinessScore(readinessValues);
        if (values.mood === 'great') score += 4;
        if (values.mood === 'drained') score -= 10;
        if (shift && shift.type === 'night' && sleepHours < 6) score -= 5;
        if (values.wellbeing === 'niggle') score -= 7;
        if (values.wellbeing === 'unwell') score = Math.min(score - 15, 25);

        const safetyFromText = aiCoachSafetySignal(note);
        const safetyLevel = safetyFromText || (values.wellbeing === 'unwell' ? 'concern' : '');
        const severeFatigue = readinessValues.fatigue >= 5;
        const deloadOffered = severeFatigue;
        const deloadAccepted = severeFatigue && values.deloadWeek === 'yes';
        if (safetyLevel === 'urgent') score = Math.min(score, 15);
        else if (safetyLevel === 'concern') score = Math.min(score, 25);
        score = Math.round(Math.min(100, Math.max(0, score)));

        const guide = readinessGuidance(score);
        const drivers = [];
        if (sleepHours < 6) drivers.push('short sleep');
        else if (sleepHours >= 7) drivers.push('solid sleep');
        if (readinessValues.energy <= 1) drivers.push('low energy');
        else if (readinessValues.energy >= 5) drivers.push('high energy');
        if (readinessValues.fatigue >= 5) drivers.push('heavy fatigue');
        if (readinessValues.soreness >= 5) drivers.push('severe or sharp soreness');
        if (readinessValues.stress >= 5) drivers.push('high stress');
        if (values.mood === 'drained') drivers.push('feeling drained');
        if (values.wellbeing === 'niggle') drivers.push('a reported niggle');
        if (!drivers.length) drivers.push('your overall check-in');

        let action = guide.action;
        let safetyNotice = '';
        if (safetyLevel === 'urgent') {
            action = 'Do not train. Contact local emergency services now for urgent symptoms.';
            safetyNotice = 'Your message includes symptoms that can need urgent help. VFIT cannot assess them—stop training and contact local emergency services now.';
        } else if (safetyLevel === 'concern') {
            action = 'Skip hard training today. Seek appropriate medical advice if symptoms are unusual, worsening or concerning.';
            safetyNotice = 'VFIT cannot diagnose pain or illness. Use appropriate professional care before returning to hard training.';
        } else if (deloadAccepted) {
            action = `${action} For the next seven days, reduce hard-set volume by about 40–50%, keep 3–4 reps in reserve and avoid failure.`;
        }

        return {
            score,
            label: guide.label,
            color: guide.color,
            action,
            shiftAdvice: aiCoachShiftAdvice(shift, guide.label),
            safetyLevel,
            safetyNotice,
            severeFatigue,
            deloadOffered,
            deloadAccepted,
            drivers,
            readinessValues
        };
    }

    function aiCoachAnswerAcknowledgement(stepId, value) {
        if (stepId === 'dietRequirementOverview' && value === 'none') return 'Understood. I’ll still let you update this later if anything changes.';
        if (stepId === 'dietRequirementOverview' && value !== 'none') return 'Thanks. I’ll ask for the exact detail so it can be saved with your plan.';
        if (stepId === 'dietRequirementDetails') return 'I’ve noted that for the dietary plan. Please still check every label and preparation method yourself.';
        if (stepId === 'dietPattern') return `${dietaryPatternLabel(value)} will be the meal-planner starting point.`;
        if (stepId === 'dietApproach' && value === 'intermittent_fasting') return 'I’ll adapt the fasting focus to the shift rather than using one rigid clock window.';
        if (stepId === 'dietApproach' && value === 'calorie_deficit') return 'I’ll show a smaller suggested portion while keeping protein and vegetables visible.';
        if (stepId === 'dietApproach' && value === 'fasting_deficit') return 'I’ll combine the smaller-portion and shift-aware timing guidance.';
        if (stepId === 'dietApproach') return 'Understood. I won’t add a fasting or calorie-deficit focus.';
        if (stepId === 'mood' && value === 'great') return 'Good to hear. Let’s see whether recovery matches that feeling.';
        if (stepId === 'mood' && value === 'drained') return 'Thanks for being honest. We’ll keep today realistic.';
        if (stepId === 'sleepHours' && Number(value) < 6) return 'That is a short sleep window, so I’ll factor it into today’s load.';
        if (stepId === 'energy' && Number(value) <= 1) return 'Understood. Low energy matters more than forcing the original plan.';
        if (stepId === 'fatigue' && Number(value) >= 5) return 'That sounds like severe fatigue. Let’s decide whether a deload week would help.';
        if (stepId === 'deloadWeek' && value === 'yes') return 'Good call. I’ll make the next seven days a deload and adjust your coaching.';
        if (stepId === 'deloadWeek' && value === 'no') return 'No problem. Keep today recovery-focused and we can revisit it if the fatigue continues.';
        if (stepId === 'soreness' && Number(value) >= 5) return 'Severe or sharp soreness is a reason to be cautious.';
        if (stepId === 'wellbeing' && value !== 'well') return 'Thanks for flagging that. Safety comes before the programme.';
        return 'Got it.';
    }

    function appendAICoachCheckInMessage(role, text) {
        if (!aiCoachCheckInSession) return;
        aiCoachCheckInSession.messages.push({ role: role === 'user' ? 'user' : 'coach', text: String(text || '').slice(0, 1200) });
        aiCoachCheckInSession.messages = aiCoachCheckInSession.messages.slice(-40);
    }

function openAICoachCheckIn() {
    const modal = document.getElementById('ai-coach-checkin-modal');
    if (!modal) return;
    const date = localDateKey();
    const sessionKey = `${currentUser && currentUser.uid ? currentUser.uid : 'guest'}:${date}`;
    aiCoachPromptedSessionKey = sessionKey;
    if (!aiCoachCheckInSession || aiCoachCheckInSession.date !== date || aiCoachCheckInSession.finished) {
        const shift = getShiftForDate(date);
        const firstName = String((firebaseUserData && firebaseUserData.name) || (currentUser && currentUser.displayName) || '').trim().split(/\s+/)[0];
        const needsDietarySetup = !dietaryProfile().completed;
        aiCoachCheckInSession = {
            id: 'coach_checkin_' + Date.now(),
            date,
            shift,
            stepIndex: 0,
            answers: { __dietarySetup: needsDietarySetup },
            note: '',
            messages: [],
            awaitingNote: false,
            finished: false,
            result: null
        };
        appendAICoachCheckInMessage('coach', `${firstName ? 'Hi ' + firstName + '. ' : 'Hi. '}I have today as ${aiCoachShiftLabel(shift).toLowerCase()}. ${needsDietarySetup ? 'I’ll first ask about dietary requirements and the eating approach to include in your plan, then ' : ''}I’ll check readiness and adjust today’s guidance around your shift.`);
        appendAICoachCheckInMessage('coach', aiCoachQuestionnaireSteps(aiCoachCheckInSession.answers)[0].question);
    }
    modal.style.display = 'flex';
    renderAICoachCheckInConversation();
    refreshIcons();
}

    function closeAICoachCheckIn() {
        const modal = document.getElementById('ai-coach-checkin-modal');
        if (modal) modal.style.display = 'none';
    }


    function renderAICoachCheckInConversation() {
        if (!aiCoachCheckInSession) return;
        const messages = document.getElementById('ai-coach-checkin-messages');
        const options = document.getElementById('ai-coach-checkin-options');
        const inputRow = document.getElementById('ai-coach-checkin-input-row');
        const input = document.getElementById('ai-coach-checkin-input');
        const skip = document.getElementById('ai-coach-checkin-skip');
        const shiftLabel = document.getElementById('ai-coach-checkin-shift');
        if (!messages || !options || !inputRow || !input) return;

        if (shiftLabel) shiftLabel.textContent = aiCoachShiftLabel(aiCoachCheckInSession.shift);
        messages.innerHTML = aiCoachCheckInSession.messages.map(message => {
            const user = message.role === 'user';
            return `<div class="flex ${user ? 'justify-end' : 'justify-start'}">
                <div class="max-w-[86%] px-4 py-3 rounded-2xl text-sm leading-relaxed" style="${user ? 'background:#f97316;color:#000;border-bottom-right-radius:0.35rem;' : 'background:#0a0a0a;color:#fdba74;border:1px solid #2d2d2d;border-bottom-left-radius:0.35rem;'}">${escapeHtml(message.text)}</div>
            </div>`;
        }).join('');

        const steps = aiCoachQuestionnaireSteps(aiCoachCheckInSession.answers);
        if (!aiCoachCheckInSession.awaitingNote && !aiCoachCheckInSession.finished) {
            const step = steps[aiCoachCheckInSession.stepIndex];
            if (!step) {
                aiCoachCheckInSession.awaitingNote = true;
                renderAICoachCheckInConversation();
                return;
            }
            if (step.inputType === 'text') {
                options.innerHTML = '';
                inputRow.classList.remove('hidden');
                input.placeholder = step.placeholder || 'Type your answer…';
                if (skip) { skip.style.display = ''; skip.textContent = step.optional ? 'Add later' : 'Skip'; }
            } else {
                options.innerHTML = step.options.map(option => `<button onclick="answerAICoachCheckIn('${escapeJsString(step.id)}','${escapeJsString(option.value)}','${escapeJsString(option.label)}')" class="text-left bg-slate-900 border border-orange-500 p-3 rounded-xl">
                    <span class="block font-black text-sm">${escapeHtml(option.label)}</span>
                    <span class="block text-[10px] text-slate-400 mt-0.5">${escapeHtml(option.hint)}</span>
                </button>`).join('');
                inputRow.classList.add('hidden');
            }
        } else if (aiCoachCheckInSession.awaitingNote) {
            options.innerHTML = '';
            inputRow.classList.remove('hidden');
            input.placeholder = 'Anything else I should know?';
            if (skip) { skip.style.display = ''; skip.textContent = 'Skip'; }
        } else {
            options.innerHTML = `
                <button onclick="openTrainingFromCoachCheckIn()" class="bg-slate-900 border border-orange-500 p-3 rounded-xl font-bold text-xs">Open Training</button>
                <button onclick="closeAICoachCheckIn(); openDietaryProfile();" class="bg-slate-900 border border-orange-500 p-3 rounded-xl font-bold text-xs">Dietary Plan</button>
                <button onclick="openWeeklyCheckInFromCoach()" class="bg-slate-900 border border-orange-500 p-3 rounded-xl font-bold text-xs">Weekly Check-in</button>
                <button onclick="closeAICoachCheckIn()" class="bg-slate-100 p-3 rounded-xl font-bold text-xs">Done</button>`;
            inputRow.classList.remove('hidden');
            input.placeholder = 'Ask a follow-up about today’s advice…';
            if (skip) skip.style.display = 'none';
        }
        setTimeout(() => {
            messages.scrollTop = messages.scrollHeight;
            const currentStep = steps[aiCoachCheckInSession.stepIndex];
            if (aiCoachCheckInSession && (aiCoachCheckInSession.awaitingNote || (currentStep && currentStep.inputType === 'text'))) input.focus();
        }, 0);
        refreshIcons();
    }

    function advanceAICoachQuestionnaire() {
        if (!aiCoachCheckInSession) return;
        aiCoachCheckInSession.stepIndex += 1;
        const nextSteps = aiCoachQuestionnaireSteps(aiCoachCheckInSession.answers);
        if (aiCoachCheckInSession.stepIndex < nextSteps.length) {
            appendAICoachCheckInMessage('coach', nextSteps[aiCoachCheckInSession.stepIndex].question);
        } else {
            aiCoachCheckInSession.awaitingNote = true;
            appendAICoachCheckInMessage('coach', 'Anything else I should know—such as poor recovery, pain, a stressful shift, or a change to today’s plan? You can also skip this.');
        }
        renderAICoachCheckInConversation();
    }

    function answerAICoachCheckIn(stepId, value, label) {
        if (!aiCoachCheckInSession || aiCoachCheckInSession.finished || aiCoachCheckInSession.awaitingNote) return;
        const steps = aiCoachQuestionnaireSteps(aiCoachCheckInSession.answers);
        const step = steps[aiCoachCheckInSession.stepIndex];
        if (!step || step.id !== stepId || !Array.isArray(step.options)) return;
        const selected = step.options.find(option => String(option.value) === String(value));
        if (!selected) return;
        aiCoachCheckInSession.answers[step.id] = selected.value;
        appendAICoachCheckInMessage('user', label || selected.label);
        appendAICoachCheckInMessage('coach', aiCoachAnswerAcknowledgement(step.id, selected.value));
        advanceAICoachQuestionnaire();
    }


    function handleAICoachCheckInKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendAICoachCheckInMessage();
        }
    }


    function sendAICoachCheckInMessage() {
        if (!aiCoachCheckInSession) return;
        const input = document.getElementById('ai-coach-checkin-input');
        const text = String(input && input.value || '').trim().slice(0, 500);
        if (!text) return;
        input.value = '';

        if (!aiCoachCheckInSession.awaitingNote && !aiCoachCheckInSession.finished) {
            const steps = aiCoachQuestionnaireSteps(aiCoachCheckInSession.answers);
            const step = steps[aiCoachCheckInSession.stepIndex];
            if (!step || step.inputType !== 'text') return;
            aiCoachCheckInSession.answers[step.id] = text;
            appendAICoachCheckInMessage('user', text);
            appendAICoachCheckInMessage('coach', aiCoachAnswerAcknowledgement(step.id, text));
            advanceAICoachQuestionnaire();
            return;
        }

        appendAICoachCheckInMessage('user', text);
        if (aiCoachCheckInSession.awaitingNote) {
            aiCoachCheckInSession.note = text;
            finishAICoachCheckIn();
            return;
        }
        if (aiCoachCheckInSession.finished) {
            appendAICoachCheckInMessage('coach', aiCoachFollowUpResponse(text, aiCoachCheckInSession.result));
            persistAICoachConversationMessages();
            renderAICoachCheckInConversation();
        }
    }

    function skipAICoachCheckInInput() {
        if (!aiCoachCheckInSession) return;
        if (!aiCoachCheckInSession.awaitingNote && !aiCoachCheckInSession.finished) {
            const steps = aiCoachQuestionnaireSteps(aiCoachCheckInSession.answers);
            const step = steps[aiCoachCheckInSession.stepIndex];
            if (step && step.inputType === 'text') {
                aiCoachCheckInSession.answers[step.id] = '';
                appendAICoachCheckInMessage('user', 'I’ll add those details later.');
                appendAICoachCheckInMessage('coach', 'No problem. You can add exact requirements in Dietary Plan & Meals after this check-in.');
                advanceAICoachQuestionnaire();
            }
            return;
        }
        skipAICoachCheckInNote();
    }

    function skipAICoachCheckInNote() {
        if (!aiCoachCheckInSession || !aiCoachCheckInSession.awaitingNote) return;
        appendAICoachCheckInMessage('user', 'Nothing else today.');
        finishAICoachCheckIn();
    }


    function finishAICoachCheckIn() {
        if (!aiCoachCheckInSession || aiCoachCheckInSession.finished) return;
        const session = aiCoachCheckInSession;
        session.awaitingNote = false;
        const dietaryCaptured = applyDietaryCoachAnswers(session.answers);
        session.result = buildAICoachCheckInResult(session.answers, session.shift, session.note);
        session.result.dietaryProfile = deepClone(dietaryProfile());
        session.finished = true;
        appendAICoachCheckInMessage('coach', `Thanks—that gives me a useful picture. Your training readiness is ${session.result.score}/100: ${session.result.label}.`);
        appendAICoachCheckInMessage('coach', session.result.action);
        appendAICoachCheckInMessage('coach', session.result.shiftAdvice);
        if (dietaryCaptured) appendAICoachCheckInMessage('coach', 'I’ve saved those dietary answers into your plan. Open Dietary Plan & Meals any time to add or change exact exclusions.');
        if (session.result.safetyNotice) appendAICoachCheckInMessage('coach', session.result.safetyNotice);
        session.result.deloadActivated = false;
        if (session.result.deloadAccepted && !session.result.safetyLevel) {
            const plan = startDeloadWeek('ai-coach', { persist: false });
            session.result.deloadActivated = true;
            session.result.deloadEndDate = plan.endDate;
            appendAICoachCheckInMessage('coach', `Your deload is now set through ${plan.endDate}. Keep the movement pattern, cut hard-set volume by about 40–50%, use lighter loads and avoid failure.`);
        } else if (session.result.deloadAccepted && session.result.safetyLevel) {
            appendAICoachCheckInMessage('coach', 'I have not activated a training deload because the symptoms you reported need the safety advice above to come first.');
        } else if (session.result.severeFatigue) {
            appendAICoachCheckInMessage('coach', 'You chose not to start a deload. Keep today recovery-focused and reconsider if severe fatigue continues or performance falls.');
        }
        appendAICoachCheckInMessage('coach', 'You can ask a follow-up, review the saved Dietary Plan, open today’s training, or finish here.');

        const readiness = session.result.readinessValues;
        if (!isPlainRecord(state.readinessLogs)) state.readinessLogs = {};
        state.readinessLogs[session.date] = Object.assign({}, readiness, {
            date: session.date,
            score: session.result.score,
            shift: session.shift.type,
            mood: session.answers.mood,
            wellbeing: session.answers.wellbeing,
            deloadOffered: session.result.deloadOffered,
            deloadAccepted: session.result.deloadAccepted,
            deloadActivated: session.result.deloadActivated,
            note: session.note,
            source: 'ai-coach',
            recordedAt: new Date().toISOString()
        });
        if (!Array.isArray(state.coachConversations)) state.coachConversations = [];
        const record = {
            id: session.id,
            date: session.date,
            createdAt: new Date().toISOString(),
            shiftType: session.shift.type,
            answers: deepClone(session.answers),
            note: session.note,
            result: deepClone(session.result),
            messages: deepClone(session.messages).slice(-24)
        };
        state.coachConversations.unshift(record);
        state.coachConversations = state.coachConversations.slice(0, 90);
        saveState();
        renderAICoachCheckInSummary();
        renderReadinessSummary();
        renderDietaryProfileSummary();
        renderDietaryShiftSummary();
        renderShiftWorker();
        renderAICoach();
        renderAICoachCheckInConversation();
        showToast(`AI Coach check-in saved · ${session.result.label} ${session.result.score}/100`, 5000);
    }

    function persistAICoachConversationMessages() {
        if (!aiCoachCheckInSession || !Array.isArray(state.coachConversations)) return;
        const record = state.coachConversations.find(item => item.id === aiCoachCheckInSession.id);
        if (!record) return;
        record.messages = deepClone(aiCoachCheckInSession.messages).slice(-24);
        record.updatedAt = new Date().toISOString();
        saveState();
    }

    function aiCoachFollowUpResponse(text, result) {
        const query = String(text || '').toLowerCase();
        const current = result || {};
        const safety = aiCoachSafetySignal(query);
        if (safety === 'urgent') return 'Stop training and contact local emergency services now. I cannot assess urgent symptoms in VFIT.';
        if (safety === 'concern' || /\b(pain|ill|sick|injur)/.test(query)) {
            return 'I can help you reduce or skip training, but I cannot assess pain or illness. Avoid hard training and seek appropriate professional advice if it is unusual, worsening or concerning.';
        }
        if (/\b(why|score|reason|driver)/.test(query)) {
            return `The main factors were ${(current.drivers || ['your answers']).join(', ')}. The score is a training guide from this check-in—not a medical measurement.`;
        }
        if (/\b(shift|night|early|work)/.test(query)) return current.shiftAdvice || 'Keep the session close to your best-energy window and protect sleep around work.';
        if (/\b(train|workout|session|exercise)/.test(query)) return current.action || 'Use today’s readiness to adjust the session rather than forcing the original workload.';
        if (/\b(sleep|tired|fatigue|deload)/.test(query)) return current.severeFatigue
            ? 'You reported severe fatigue. Protect the next main sleep window and use the deload option if you want seven days of reduced volume and easier training.'
            : 'Protect the next main sleep window first. Keep training away from the most exhausted end of a shift and reduce volume when fatigue stays high.';
        if (/\b(food|meal|eat|nutrition|protein|water|hydr|diet|fast|vegan|vegetarian|keto|calorie)/.test(query)) {
            return `${dietaryShiftCoachAdvice(getShiftForDate(localDateKey()).type)} Open Dietary Plan & Meals to review compatible recipes, ingredients and instructions.`;
        }
        return `For today, the clearest next step is: ${current.action || 'keep the plan realistic and respond to how you feel.'} ${current.shiftAdvice || ''}`.trim();
    }

    function openTrainingFromCoachCheckIn() {
        closeAICoachCheckIn();
        switchTab('training');
    }

    function openWeeklyCheckInFromCoach() {
        closeAICoachCheckIn();
        openCheckInModal();
    }

    function renderAICoachCheckInSummary() {
        const box = document.getElementById('ai-coach-checkin-summary');
        const card = document.getElementById('ai-coach-checkin-card');
        if (card) card.style.display = state.aiCoachEnabled === false ? 'none' : 'block';
        if (!box) return;
        if (state.aiCoachEnabled === false) return;
        const date = localDateKey();
        const latest = (state.coachConversations || []).find(item => item.date === date && item.result);
        const shift = getShiftForDate(date);
        if (!latest) {
            box.innerHTML = `<div class="bg-slate-50 p-4 rounded-2xl">
                <div class="flex items-center justify-between gap-3"><p class="font-bold text-sm">Today · ${escapeHtml(aiCoachShiftLabel(shift))}</p><span class="text-[9px] font-black uppercase text-orange-400">Not checked in</span></div>
                <p class="text-xs text-slate-400 mt-2">${dietaryProfile().completed ? 'Answer a few quick prompts to get a shift-aware train, adjust or recover recommendation.' : 'Your first conversation will also ask about dietary requirements and the diet or eating approach to include in your plan.'}</p>
            </div>`;
            return;
        }
        const result = latest.result;
        const palette = result.color === 'emerald' ? 'border-emerald-200' : result.color === 'amber' ? 'border-amber-200' : 'border-rose-200';
        box.innerHTML = `<div class="bg-slate-50 border ${palette} p-4 rounded-2xl">
            <div class="flex items-end justify-between gap-3">
                <div><p class="text-3xl font-black">${Math.round(result.score)}/100</p><p class="text-[10px] font-black uppercase">${escapeHtml(result.label)} · ${escapeHtml(aiCoachShiftLabel(shift))}</p></div>
                <button onclick="openAICoachCheckIn()" class="text-xs font-black text-orange-400">Talk again</button>
            </div>
            <p class="text-xs text-slate-500 mt-3">${escapeHtml(result.action)}</p>
        </div>`;
    }

    function maybePromptAICoachCheckIn() {
        if (state.aiCoachEnabled === false) return;
        const date = localDateKey();
        const sessionKey = `${currentUser && currentUser.uid ? currentUser.uid : 'guest'}:${date}`;
        const completedToday = (state.coachConversations || []).some(item => item.date === date && item.result);
        if (completedToday || aiCoachPromptedSessionKey === sessionKey) return;
        aiCoachPromptedSessionKey = sessionKey;
        setTimeout(() => {
            const settings = document.getElementById('settings');
            if (settings && settings.classList.contains('active')) openAICoachCheckIn();
        }, 450);
    }

    function readinessGuidance(score) {
        if (score >= 75) return { label: 'Ready', color: 'emerald', action: 'Train as planned. Progress a lift if technique and RIR are on target.' };
        if (score >= 55) return { label: 'Adjust', color: 'amber', action: 'Keep the session, but reduce total sets by around 20% or keep 2–3 RIR.' };
        return { label: 'Recover', color: 'rose', action: 'Choose recovery work or reduce normal loads by about 10%. Avoid testing maximums.' };
    }

    function calculateReadinessScore(values) {
        const sleepHours = clampNumber(values.sleepHours, 0, 16, 0);
        const sleepQuality = clampNumber(values.sleepQuality, 1, 5, 3);
        const energy = clampNumber(values.energy, 1, 5, 3);
        const fatigue = clampNumber(values.fatigue, 1, 5, 3);
        const soreness = clampNumber(values.soreness, 1, 5, 3);
        const stress = clampNumber(values.stress, 1, 5, 3);
        return Math.round(
            Math.min(30, (sleepHours / 8) * 30) +
            sleepQuality * 4 + energy * 4 +
            (6 - fatigue) * 3 + (6 - stress) * 2 + (6 - soreness)
        );
    }

    function openReadinessModal() {
        const existing = state.readinessLogs && state.readinessLogs[localDateKey()];
        if (existing) {
            document.getElementById('readiness-sleep-hours').value = existing.sleepHours;
            document.getElementById('readiness-sleep-quality').value = existing.sleepQuality;
            document.getElementById('readiness-energy').value = existing.energy;
            document.getElementById('readiness-fatigue').value = existing.fatigue;
            document.getElementById('readiness-soreness').value = existing.soreness;
            document.getElementById('readiness-stress').value = existing.stress;
        }
        document.getElementById('readiness-modal').style.display = 'flex';
        refreshIcons();
    }

    function closeReadinessModal() {
        document.getElementById('readiness-modal').style.display = 'none';
    }

    function saveReadiness() {
        const date = localDateKey();
        const values = {
            sleepHours: clampNumber(document.getElementById('readiness-sleep-hours').value, 0, 16, 7),
            sleepQuality: clampNumber(document.getElementById('readiness-sleep-quality').value, 1, 5, 3),
            energy: clampNumber(document.getElementById('readiness-energy').value, 1, 5, 3),
            fatigue: clampNumber(document.getElementById('readiness-fatigue').value, 1, 5, 3),
            soreness: clampNumber(document.getElementById('readiness-soreness').value, 1, 5, 3),
            stress: clampNumber(document.getElementById('readiness-stress').value, 1, 5, 3)
        };
        const score = calculateReadinessScore(values);
        state.readinessLogs[date] = Object.assign({}, values, {
            date,
            score,
            shift: getShiftForDate(date).type,
            recordedAt: new Date().toISOString()
        });
        saveState();
        closeReadinessModal();
        renderCoachingHub();
        showToast(`Readiness ${score}/100 · ${readinessGuidance(score).label}`);
        if (values.fatigue >= 5 && state.aiCoachEnabled !== false && !isDeloadPlanActive(state, date)) {
            setTimeout(() => openAICoachCheckIn(), 350);
        }
    }

    function renderReadinessSummary() {
        const box = document.getElementById('readiness-summary');
        if (!box) return;
        const date = localDateKey();
        const entry = state.readinessLogs && state.readinessLogs[date];
        const shift = getShiftForDate(date);
        const shiftLabels = { off: 'Rest / off', day: 'Day shift', early: 'Early shift', night: 'Night shift' };
        const deloadActive = isDeloadPlanActive(state, date);
        const deloadStatus = deloadActive
            ? `<div class="mt-3 bg-indigo-50 border border-indigo-200 p-3 rounded-xl"><div class="flex items-center justify-between gap-3"><div><p class="font-black text-xs text-indigo-700">Deload week active</p><p class="text-[10px] text-slate-500 mt-1">Through ${escapeHtml(state.deloadPlan.endDate)} · reduce hard-set volume about 40–50% and avoid failure.</p></div><button onclick="endDeloadWeek()" class="text-[10px] font-black text-rose-600">End early</button></div></div>`
            : '';
        if (!entry) {
            box.innerHTML = `<div class="bg-slate-50 p-4 rounded-2xl"><p class="font-bold text-sm">No readiness score yet</p><p class="text-xs text-slate-400 mt-1">Today: ${escapeHtml(shiftLabels[shift.type] || 'No shift set')}. Log how you feel before choosing session intensity.</p></div>${deloadStatus}`;
            return;
        }
        const guide = readinessGuidance(entry.score);
        const palette = guide.color === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : guide.color === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-rose-50 text-rose-700 border-rose-200';
        const fatigueOffer = Number(entry.fatigue) >= 5 && !deloadActive
            ? `<button onclick="openAICoachCheckIn()" class="w-full mt-3 bg-slate-900 border border-orange-500 text-white p-3 rounded-xl font-black text-xs">Severe fatigue: discuss a deload week</button>`
            : '';
        box.innerHTML = `<div class="${palette} border p-4 rounded-2xl">
            <div class="flex items-end justify-between gap-3"><div><p class="text-4xl font-black">${Math.round(entry.score)}</p><p class="text-xs font-black uppercase">${escapeHtml(guide.label)} · ${escapeHtml(shiftLabels[shift.type] || 'No shift')}</p></div><p class="text-xs font-bold text-right">${nutritionNumber(entry.sleepHours)}h sleep</p></div>
            <p class="text-xs mt-3">${escapeHtml(guide.action)}</p>
            ${fatigueOffer}
        </div>${deloadStatus}`;
    }

    function openCheckInModal() {
        const latestMetric = (state.metricsHistory || []).find(metric => Number(metric.weight) > 0);
        if (latestMetric) document.getElementById('checkin-weight').value = latestMetric.weight;
        const recentReadiness = Object.values(state.readinessLogs || {}).slice(-7);
        if (recentReadiness.length) {
            const sleepAverage = recentReadiness.reduce((sum, item) => sum + Number(item.sleepHours || 0), 0) / recentReadiness.length;
            document.getElementById('checkin-sleep').value = sleepAverage.toFixed(1);
        }
        document.getElementById('checkin-modal').style.display = 'flex';
    }

    function closeCheckInModal() {
        document.getElementById('checkin-modal').style.display = 'none';
    }

    function checkInFlags(checkIn) {
        const flags = [];
        if (checkIn.sleepHours > 0 && checkIn.sleepHours < 6) flags.push('Low sleep');
        if (checkIn.energy <= 2) flags.push('Low energy');
        if (checkIn.stress >= 4) flags.push('High stress');
        if (checkIn.hunger >= 5) flags.push('Very high hunger');
        if (checkIn.trainingAdherence < 70) flags.push('Training adherence below 70%');
        if (checkIn.nutritionAdherence < 70) flags.push('Nutrition adherence below 70%');
        return flags;
    }

    async function saveWeeklyCheckIn() {
        const checkIn = {
            id: 'ci_' + Date.now(),
            date: localDateKey(),
            createdAt: new Date().toISOString(),
            weight: clampNumber(document.getElementById('checkin-weight').value, 0, 400, 0),
            sleepHours: clampNumber(document.getElementById('checkin-sleep').value, 0, 16, 0),
            energy: clampNumber(document.getElementById('checkin-energy').value, 1, 5, 3),
            hunger: clampNumber(document.getElementById('checkin-hunger').value, 1, 5, 3),
            stress: clampNumber(document.getElementById('checkin-stress').value, 1, 5, 3),
            trainingAdherence: clampNumber(document.getElementById('checkin-training').value, 0, 100, 0),
            nutritionAdherence: clampNumber(document.getElementById('checkin-nutrition').value, 0, 100, 0),
            win: String(document.getElementById('checkin-win').value || '').trim().slice(0, 500),
            challenge: String(document.getElementById('checkin-challenge').value || '').trim().slice(0, 750)
        };
        checkIn.flags = checkInFlags(checkIn);
        checkIn.status = checkIn.flags.length ? 'review' : 'on-track';
        state.checkIns.unshift(checkIn);
        state.checkIns = state.checkIns.slice(0, 104);
        if (checkIn.weight > 0) {
            const metric = (state.metricsHistory || []).find(item => item.date === checkIn.date);
            if (metric) metric.weight = checkIn.weight;
            else state.metricsHistory.unshift({ id: 'metric_' + Date.now(), date: checkIn.date, weight: checkIn.weight });
        }
        saveState();
        closeCheckInModal();
        renderCoachingHub();
        await pushMemberDataToCloud();
        if (firebaseUserData.coachUid) {
            await pushNotification(firebaseUserData.coachUid, {
                type: 'weekly-checkin',
                title: (firebaseUserData.name || 'Your client') + ' completed a check-in',
                body: checkIn.flags.length ? checkIn.flags.join(' · ') : 'On track — open VFIT to review',
                fromName: firebaseUserData.name || 'Client'
            });
        }
        showToast(checkIn.flags.length ? 'Check-in saved · coach review flagged' : 'Check-in saved · you’re on track ✓', 5000);
    }

    function renderCheckInSummary() {
        const box = document.getElementById('checkin-summary');
        if (!box) return;
        const latest = state.checkIns && state.checkIns[0];
        if (!latest) {
            box.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Complete your first weekly check-in to establish a baseline.</p>';
            return;
        }
        const days = Math.max(0, Math.floor((Date.now() - new Date(latest.createdAt || latest.date).getTime()) / 86400000));
        const flagHtml = (latest.flags || []).length
            ? `<div class="flex flex-wrap gap-1 mt-2">${latest.flags.map(flag => `<span class="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">${escapeHtml(flag)}</span>`).join('')}</div>`
            : '<p class="text-xs text-emerald-600 font-bold mt-2">✓ No automatic concerns flagged</p>';
        box.innerHTML = `<div class="bg-slate-50 p-4 rounded-2xl">
            <div class="flex justify-between gap-3"><p class="font-bold">${escapeHtml(latest.date)}</p><span class="text-xs font-bold ${days >= 7 ? 'text-amber-600' : 'text-slate-400'}">${days >= 7 ? 'New check-in due' : days + ' day' + (days === 1 ? '' : 's') + ' ago'}</span></div>
            <p class="text-xs text-slate-500 mt-2">Training ${Math.round(latest.trainingAdherence)}% · Nutrition ${Math.round(latest.nutritionAdherence)}% · Energy ${Math.round(latest.energy)}/5</p>${flagHtml}
        </div>`;
    }

    function openRotaModal() {
        document.getElementById('rota-date').value = localDateKey();
        document.getElementById('rota-type').value = 'off';
        updateRotaTimeVisibility();
        document.getElementById('rota-modal').style.display = 'flex';
    }

    function closeRotaModal() {
        document.getElementById('rota-modal').style.display = 'none';
    }

    function updateRotaTimeVisibility() {
        const type = document.getElementById('rota-type').value;
        document.getElementById('rota-time-fields').classList.toggle('hidden', type === 'off');
        if (type === 'night') { document.getElementById('rota-start').value = '19:00'; document.getElementById('rota-end').value = '07:00'; }
        else if (type === 'early') { document.getElementById('rota-start').value = '06:00'; document.getElementById('rota-end').value = '14:00'; }
        else if (type === 'day') { document.getElementById('rota-start').value = '07:00'; document.getElementById('rota-end').value = '19:00'; }
    }

    function saveRotaDay() {
        const date = document.getElementById('rota-date').value;
        const type = document.getElementById('rota-type').value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showToast('Choose a valid date'); return; }
        if (!isPlainRecord(state.shiftProfile.rota)) state.shiftProfile.rota = {};
        state.shiftProfile.rota[date] = {
            type,
            start: type === 'off' ? null : document.getElementById('rota-start').value,
            end: type === 'off' ? null : document.getElementById('rota-end').value,
            updatedAt: new Date().toISOString()
        };
        saveState();
        closeRotaModal();
        renderCoachingHub();
        renderShiftWorker();
        if (state.notificationSettings.enabled) syncPushSchedule();
        showToast('Rota day saved');
    }

    function removeRotaDay(date) {
        if (state.shiftProfile && isPlainRecord(state.shiftProfile.rota)) delete state.shiftProfile.rota[date];
        saveState();
        renderCoachingHub();
        renderShiftWorker();
    }

    function renderRotaSummary() {
        const box = document.getElementById('rota-summary');
        if (!box) return;
        const labels = { off: 'Rest / off', day: 'Day shift', early: 'Early shift', night: 'Night shift' };
        const rows = [];
        for (let offset = 0; offset < 7; offset++) {
            const date = new Date();
            date.setHours(12, 0, 0, 0);
            date.setDate(date.getDate() + offset);
            const key = localDateKey(date);
            const shift = getShiftForDate(key);
            rows.push(`<div class="flex items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl">
                <div><p class="font-bold text-sm">${escapeHtml(date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))}</p><p class="text-xs text-slate-400">${escapeHtml(labels[shift.type] || shift.type)}${shift.start ? ' · ' + escapeHtml(shift.start) + '–' + escapeHtml(shift.end || '') : ''}</p></div>
                ${shift.source === 'rota' ? `<button onclick="removeRotaDay('${escapeJsString(key)}')" class="text-xs font-bold text-rose-500" aria-label="Remove rota override for ${escapeHtml(key)}">Remove</button>` : '<span class="text-[9px] text-slate-400 uppercase">pattern</span>'}
            </div>`);
        }
        box.innerHTML = rows.join('');
    }

    function renderCoachingHub() {
        renderAICoachCheckInSummary();
        renderAICoach();
        renderGoalVolumeSummary();
        renderReadinessSummary();
        renderCheckInSummary();
        renderProgressionRecommendations();
        renderRotaSummary();
        renderDietaryProfileSummary();
        renderDietaryShiftSummary();
        renderWeeklyReportSummary();
        renderMembership();
        renderMemberCoachSection();
        refreshIcons();
        maybePromptAICoachCheckIn();
    }

    // ==========================================================================
    // SMART PROGRESSION AND WEEKLY REPORTING
    // ==========================================================================

    function estimatedOneRepMax(weight, reps) {
        const load = Number(weight);
        const count = Number(reps);
        if (!Number.isFinite(load) || !Number.isFinite(count) || load <= 0 || count <= 0) return 0;
        return load * (1 + Math.min(count, 15) / 30);
    }

    function exercisePerformances(exerciseName, sourceState, limit) {
        const source = sourceState || state;
        const matches = [];
        const history = (source.workoutHistory || []).slice().sort((a, b) =>
            String(b.completedAt || b.date || '').localeCompare(String(a.completedAt || a.date || ''))
        );
        for (const workout of history) {
            const exercise = (workout.exercises || []).find(item => String(item.name || '').toLowerCase() === String(exerciseName || '').toLowerCase());
            if (!exercise || !Array.isArray(exercise.sets) || !exercise.sets.length) continue;
            const validSets = exercise.sets.map(set => ({
                weight: Number(set.weight),
                reps: Number(set.reps),
                rir: set.rir === '' || set.rir == null ? null : Number(set.rir)
            })).filter(set => Number.isFinite(set.weight) && set.weight >= 0 && Number.isFinite(set.reps) && set.reps > 0);
            if (!validSets.length) continue;
            const best = validSets.slice().sort((a, b) => estimatedOneRepMax(b.weight, b.reps) - estimatedOneRepMax(a.weight, a.reps))[0];
            matches.push({ date: workout.date || '', sets: validSets, best, e1rm: estimatedOneRepMax(best.weight, best.reps) });
            if (matches.length >= (limit || 6)) break;
        }
        return matches;
    }

    function smartProgressionForExercise(exerciseName, sourceState) {
        const source = sourceState || state;
        const settings = Object.assign({}, DEFAULT_STATE.progressionSettings, source.progressionSettings || {});
        const sessions = exercisePerformances(exerciseName, source, Math.max(3, Number(settings.plateauSessions) || 3));
        if (!sessions.length) return null;
        const latest = sessions[0];
        const ref = latest.best;
        const compound = isCompoundExercise(exerciseName);
        const assistance = isAssistanceExercise(exerciseName);
        const increment = compound ? 2.5 : 1;
        const todayReadiness = source.readinessLogs && source.readinessLogs[localDateKey()];
        const recent = sessions.slice(0, Math.max(3, Number(settings.plateauSessions) || 3));
        const e1rms = recent.map(item => item.e1rm).filter(Boolean);
        const plateau = e1rms.length >= 3 && ((Math.max(...e1rms) - Math.min(...e1rms)) / Math.max(...e1rms)) < 0.01;
        const targetRir = Number(settings.targetRir) || 2;
        const deloadPercent = clampNumber(settings.deloadPercent, 5, 30, 10);
        let suggested = ref.weight;
        let action = 'hold';
        let reason = `Repeat ${ref.weight}kg and aim for cleaner reps around ${targetRir} RIR.`;

        if (isDeloadPlanActive(source, localDateKey())) {
            suggested = ref.weight * (1 - deloadPercent / 100);
            action = 'deload';
            reason = `Your deload week is active through ${source.deloadPlan.endDate}. Reduce hard-set volume about 40–50%, use a lighter load and keep 3–4 RIR.`;
        } else if (todayReadiness && Number(todayReadiness.score) < 55) {
            suggested = assistance ? ref.weight * (1 + deloadPercent / 100) : ref.weight * (1 - deloadPercent / 100);
            action = 'deload';
            reason = `Readiness is ${Math.round(todayReadiness.score)}/100. Reduce difficulty and keep the session submaximal.`;
        } else if (plateau && ref.rir !== null && ref.rir <= 1) {
            suggested = assistance ? ref.weight * 1.1 : ref.weight * (1 - deloadPercent / 100);
            action = 'deload';
            reason = `${recent.length} hard sessions show no estimated-strength increase. Use a lighter deload exposure.`;
        } else if (ref.rir !== null && ref.rir >= targetRir + 1 && ref.reps >= 8) {
            suggested = assistance ? Math.max(0, ref.weight - increment) : ref.weight + increment;
            action = 'progress';
            reason = `${ref.reps} reps with ${ref.rir} RIR suggests room for a small load increase.`;
        } else if (ref.rir !== null && ref.rir <= 0 && ref.reps < 6) {
            suggested = assistance ? ref.weight + increment : Math.max(0, ref.weight - increment);
            action = 'reduce';
            reason = 'The last working set reached failure below six reps. Reduce difficulty and rebuild quality.';
        }

        suggested = Math.max(0, Math.round(suggested * 2) / 2);
        return {
            exerciseName,
            current: ref.weight,
            suggested,
            reps: ref.reps,
            rir: ref.rir,
            e1rm: Math.round(latest.e1rm * 10) / 10,
            action,
            plateau,
            reason
        };
    }

    function getProgressionRecommendations(sourceState, limit) {
        const source = sourceState || state;
        const names = [];
        const seen = new Set();
        (source.workoutHistory || []).slice(0, 12).forEach(workout => {
            (workout.exercises || []).forEach(exercise => {
                const name = String(exercise.name || '').trim();
                const key = name.toLowerCase();
                if (name && !seen.has(key)) { seen.add(key); names.push(name); }
            });
        });
        const priority = { deload: 0, reduce: 1, progress: 2, hold: 3 };
        return names.map(name => smartProgressionForExercise(name, source))
            .filter(Boolean)
            .sort((a, b) => priority[a.action] - priority[b.action])
            .slice(0, limit || 6);
    }

    function renderProgressionRecommendations() {
        const box = document.getElementById('progression-recommendations');
        if (!box) return;
        const recommendations = getProgressionRecommendations(state, 6);
        if (!recommendations.length) {
            box.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Complete a workout with weights, reps and RIR to unlock suggestions.</p>';
            return;
        }
        box.innerHTML = recommendations.map(item => {
            const style = item.action === 'progress' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : item.action === 'deload' || item.action === 'reduce' ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-slate-50 border-slate-200 text-slate-600';
            const action = item.action === 'progress' ? 'Increase' : item.action === 'deload' ? 'Deload' : item.action === 'reduce' ? 'Reduce' : 'Repeat';
            return `<div class="${style} border p-3 rounded-xl">
                <div class="flex justify-between gap-3"><p class="font-black text-sm">${escapeHtml(item.exerciseName)}</p><p class="font-black text-sm">${nutritionNumber(item.suggested)}kg</p></div>
                <p class="text-[10px] font-black uppercase mt-1">${action} · estimated 1RM ${nutritionNumber(item.e1rm)}kg</p>
                <p class="text-xs mt-1">${escapeHtml(item.reason)}</p>
            </div>`;
        }).join('');
    }

    function sevenDateKeys() {
        return Array.from({ length: 7 }, (_, index) => dateKeyDaysAgo(6 - index));
    }

    function nutritionForDate(source, date) {
        const meals = (source.dailyMeals || []).filter(meal => meal.date === date);
        if (meals.length) return meals.reduce((total, meal) => ({
            calories: total.calories + Number(meal.calories || 0),
            protein: total.protein + Number(meal.protein || 0)
        }), { calories: 0, protein: 0 });
        const history = (source.nutritionHistory || []).find(day => day.date === date);
        return history ? {
            calories: Number(history.totalCalories || history.calories || 0),
            protein: Number(history.totalProtein || history.protein || 0)
        } : { calories: 0, protein: 0 };
    }

    function weeklyReportFor(sourceState) {
        const source = normalizeState(sourceState || state);
        const dates = sevenDateKeys();
        const dateSet = new Set(dates);
        const workouts = (source.workoutHistory || []).filter(workout => dateSet.has(workout.date));
        const targetWorkouts = Math.max(1, Number(source.coachingTargets.workoutsPerWeek) || 3);
        const dailyNutrition = dates.map(date => nutritionForDate(source, date));
        const calorieGoal = Number(source.goals.calories || 2500);
        const proteinGoal = Number(source.proteinGoal || source.goals.protein || 150);
        const calorieTolerance = clampNumber(source.coachingTargets.calorieTolerancePercent, 5, 30, 10) / 100;
        const loggedNutrition = dailyNutrition.filter(day => day.calories > 0);
        const calorieTargetDays = loggedNutrition.filter(day => Math.abs(day.calories - calorieGoal) <= calorieGoal * calorieTolerance).length;
        const proteinTargetDays = loggedNutrition.filter(day => day.protein >= proteinGoal * 0.9).length;
        const stepGoal = Number(source.goals.steps || 10000);
        const stepDays = dates.filter(date => Number(source.stepsLogs[date] || 0) >= stepGoal).length;
        const readiness = dates.map(date => source.readinessLogs[date]).filter(Boolean);
        const readinessAverage = readiness.length ? Math.round(readiness.reduce((sum, item) => sum + Number(item.score || 0), 0) / readiness.length) : null;
        const weights = (source.metricsHistory || []).filter(item => dateSet.has(item.date) && Number(item.weight) > 0)
            .sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const weightAverage = weights.length ? weights.reduce((sum, item) => sum + Number(item.weight), 0) / weights.length : null;
        const weightChange = weights.length > 1 ? Number(weights[weights.length - 1].weight) - Number(weights[0].weight) : null;
        const habitIds = (source.habits || []).map(habit => String(habit.id));
        let habitDone = 0;
        dates.forEach(date => habitIds.forEach(id => { if (source.habitCompletions[date] && source.habitCompletions[date][id]) habitDone++; }));
        const habitPossible = habitIds.length * 7;
        const workoutAdherence = Math.min(100, Math.round((workouts.length / targetWorkouts) * 100));
        return {
            dates,
            workouts: workouts.length,
            targetWorkouts,
            workoutAdherence,
            nutritionDays: loggedNutrition.length,
            calorieTargetDays,
            proteinTargetDays,
            stepDays,
            readinessAverage,
            weightAverage,
            weightChange,
            habitAdherence: habitPossible ? Math.round((habitDone / habitPossible) * 100) : null,
            latestCheckIn: (source.checkIns || []).slice().sort((a, b) =>
                String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || ''))
            )[0] || null
        };
    }

    function renderWeeklyReportSummary() {
        const box = document.getElementById('weekly-report-summary');
        if (!box) return;
        const report = weeklyReportFor(state);
        const weight = report.weightAverage == null ? '—' : nutritionNumber(report.weightAverage) + 'kg avg';
        const readiness = report.readinessAverage == null ? '—' : report.readinessAverage + '/100';
        box.innerHTML = `<div class="grid grid-cols-2 gap-2">
            <div class="bg-slate-50 p-3 rounded-xl"><p class="text-[10px] uppercase text-slate-400 font-bold">Training</p><p class="text-lg font-black">${report.workouts}/${report.targetWorkouts}</p><p class="text-[10px] text-slate-400">${report.workoutAdherence}% target</p></div>
            <div class="bg-slate-50 p-3 rounded-xl"><p class="text-[10px] uppercase text-slate-400 font-bold">Nutrition logged</p><p class="text-lg font-black">${report.nutritionDays}/7</p><p class="text-[10px] text-slate-400">Calories ${report.calorieTargetDays} · protein ${report.proteinTargetDays} days</p></div>
            <div class="bg-slate-50 p-3 rounded-xl"><p class="text-[10px] uppercase text-slate-400 font-bold">Weight</p><p class="text-lg font-black">${escapeHtml(weight)}</p></div>
            <div class="bg-slate-50 p-3 rounded-xl"><p class="text-[10px] uppercase text-slate-400 font-bold">Readiness</p><p class="text-lg font-black">${escapeHtml(readiness)}</p></div>
        </div>`;
    }

    function weeklyReportDocument(sourceState, clientName) {
        const report = weeklyReportFor(sourceState);
        const name = clientName || (currentUser && currentUser.displayName) || 'VFIT Member';
        const latest = report.latestCheckIn;
        const checkInHtml = latest ? `<h2>Latest check-in</h2><p>Training adherence: ${Math.round(latest.trainingAdherence)}% · Nutrition adherence: ${Math.round(latest.nutritionAdherence)}% · Energy: ${Math.round(latest.energy)}/5</p><p><b>Win:</b> ${escapeHtml(latest.win || '—')}</p><p><b>Challenge:</b> ${escapeHtml(latest.challenge || '—')}</p>` : '<h2>Latest check-in</h2><p>No check-in recorded.</p>';
        return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VFIT weekly report</title><style>body{font-family:Arial,sans-serif;background:#1f2937;color:#fb923c;margin:0;padding:28px}.page{max-width:760px;margin:auto;background:#000;border:2px solid #f97316;border-radius:24px;padding:28px}h1,h2{color:#fb923c}p{color:#e5e7eb;line-height:1.55}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.card{background:#20242b;border:1px solid #f97316;border-radius:14px;padding:16px}.big{font-size:28px;font-weight:800;color:#fb923c}.small{font-size:12px;color:#9ca3af}@media print{body{background:#fff}.page{border:0}}</style></head><body><main class="page"><p class="small">VFIT · ${escapeHtml(report.dates[0])} to ${escapeHtml(report.dates[6])}</p><h1>${escapeHtml(name)} — Weekly Progress</h1><div class="grid"><div class="card"><div class="small">Workouts</div><div class="big">${report.workouts}/${report.targetWorkouts}</div><p>${report.workoutAdherence}% adherence</p></div><div class="card"><div class="small">Nutrition</div><div class="big">${report.nutritionDays}/7</div><p>Calories in target: ${report.calorieTargetDays} days · protein target: ${report.proteinTargetDays} days</p></div><div class="card"><div class="small">Average weight</div><div class="big">${report.weightAverage == null ? '—' : nutritionNumber(report.weightAverage) + 'kg'}</div><p>Weekly change: ${report.weightChange == null ? '—' : (report.weightChange > 0 ? '+' : '') + nutritionNumber(report.weightChange) + 'kg'}</p></div><div class="card"><div class="small">Readiness</div><div class="big">${report.readinessAverage == null ? '—' : report.readinessAverage + '/100'}</div><p>Step goal: ${report.stepDays} days · Habits: ${report.habitAdherence == null ? '—' : report.habitAdherence + '%'}</p></div></div>${checkInHtml}<p class="small">This report summarises logged data and is not medical advice.</p></main></body></html>`;
    }

    function exportWeeklyReport(sourceState, clientName) {
        const html = weeklyReportDocument(sourceState || state, clientName);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `vfit-weekly-report-${localDateKey()}.html`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Weekly report downloaded');
    }

    function exportViewedClientReport() {
        if (!viewingClientData) return;
        exportWeeklyReport(viewingClientData.data || {}, viewingClientData.name || 'Client');
    }
