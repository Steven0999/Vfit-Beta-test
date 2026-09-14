    // ========================================================================
    // STRUCTURED MEAL SAFETY
    // ========================================================================
    // Every built-in recipe receives an explicit safety record. The original
    // shift recipes pre-date ingredient arrays, so their possible allergens are
    // curated here rather than guessed each time a member opens a recipe.
    const BASE_MEAL_ALLERGENS = Object.freeze({
        'night-breakfast-oats': ['dairy', 'gluten'],
        'night-breakfast-yogurt-bowl': ['dairy', 'gluten'],
        'night-breakfast-eggs-beans': ['egg', 'gluten'],
        'night-breakfast-smoothie': ['dairy', 'gluten', 'nuts'],
        'night-lunch-chicken-rice': [],
        'night-lunch-salmon-potato': ['fish'],
        'night-lunch-turkey-chilli': [],
        'night-lunch-tofu-noodles': ['soy', 'gluten'],
        'night-dinner-turkey-wrap': ['gluten', 'sesame'],
        'night-dinner-tuna-couscous': ['fish', 'gluten'],
        'night-dinner-chicken-soup': ['gluten'],
        'night-dinner-jacket-potato': ['dairy'],
        'night-snack-yogurt': ['dairy', 'nuts'],
        'night-snack-shake-banana': ['dairy'],
        'night-snack-cottage-oatcakes': ['dairy', 'gluten'],
        'night-snack-eggs-fruit': ['egg'],
        'early-breakfast-wrap': ['egg', 'gluten'],
        'early-breakfast-porridge': ['dairy', 'gluten'],
        'early-breakfast-yogurt-pot': ['dairy', 'gluten'],
        'early-breakfast-sandwich': ['egg', 'gluten'],
        'early-lunch-pasta': ['dairy', 'gluten', 'nuts'],
        'early-lunch-tuna-rice': ['fish'],
        'early-lunch-turkey-wrap': ['gluten'],
        'early-lunch-chicken-soup': ['gluten'],
        'early-dinner-stirfry': [],
        'early-dinner-salmon': ['fish'],
        'early-dinner-fajita': [],
        'early-dinner-turkey-pasta': ['gluten'],
        'early-snack-banana-yogurt': ['dairy'],
        'early-snack-eggs-oatcakes': ['egg', 'gluten'],
        'early-snack-cottage-fruit': ['dairy'],
        'early-snack-shake-apple': ['dairy'],
        'day-breakfast-porridge': ['dairy', 'gluten'],
        'day-breakfast-eggs-toast': ['egg', 'gluten'],
        'day-breakfast-yogurt-muesli': ['dairy', 'gluten'],
        'day-breakfast-bagel': ['egg', 'fish', 'gluten'],
        'day-lunch-tuna-potato': ['fish'],
        'day-lunch-chicken-quinoa': [],
        'day-lunch-burrito-bowl': [],
        'day-lunch-falafel-chicken': ['dairy', 'gluten'],
        'day-dinner-chilli': [],
        'day-dinner-cod': ['fish'],
        'day-dinner-curry': [],
        'day-dinner-bolognese': ['gluten'],
        'day-snack-cottage-cheese': ['dairy', 'gluten'],
        'day-snack-yogurt': ['dairy'],
        'day-snack-hummus': ['sesame'],
        'day-snack-shake': ['dairy'],
        'off-breakfast-eggs': ['egg', 'gluten'],
        'off-breakfast-pancakes': ['dairy', 'egg', 'gluten'],
        'off-breakfast-oats': ['dairy', 'gluten'],
        'off-breakfast-shakshuka': ['egg', 'gluten'],
        'off-lunch-quinoa': [],
        'off-lunch-omelette': ['egg'],
        'off-lunch-salmon-pitta': ['fish', 'gluten'],
        'off-lunch-lentil-bowl': [],
        'off-dinner-cod': ['fish'],
        'off-dinner-roast-chicken': [],
        'off-dinner-beef-stew': [],
        'off-dinner-tofu-curry': ['soy'],
        'off-snack-smoothie': ['dairy', 'gluten', 'soy'],
        'off-snack-yogurt-nuts': ['dairy', 'nuts'],
        'off-snack-tuna-oatcakes': ['fish', 'gluten'],
        'off-snack-chocolate-yogurt': ['dairy', 'gluten']
    });

    const MEAL_ALLERGEN_LABELS = Object.freeze({
        dairy: 'milk / dairy', gluten: 'gluten / wheat', nuts: 'nuts / peanuts',
        egg: 'egg', fish: 'fish / seafood', soy: 'soy', sesame: 'sesame'
    });

    const MEAL_ALLERGEN_SUBSTITUTIONS = Object.freeze({
        dairy: 'Use a clearly labelled dairy-free milk, yogurt, cheese or protein powder.',
        gluten: 'Use certified gluten-free oats, bread, wraps, pasta, noodles and sauces.',
        nuts: 'Omit nuts and pesto; use an allergy-safe seed option only if suitable.',
        egg: 'Use an egg-free protein option such as tofu only if soy is suitable.',
        fish: 'Replace fish with chicken, beans or tofu that matches the rest of your requirements.',
        soy: 'Use a soy-free protein and check sauces, marinades and plant milks carefully.',
        sesame: 'Avoid hummus/tahini and use a certified sesame-free dip or dressing.'
    });

    function allBuiltInMealIdeas() {
        const recipes = [];
        Object.values(SHIFT_MEAL_IDEAS).forEach(byMeal => {
            Object.values(byMeal).forEach(items => recipes.push(...items));
        });
        Object.values(DIETARY_MEAL_IDEAS).forEach(byMeal => {
            Object.values(byMeal).forEach(items => recipes.push(...items));
        });
        return recipes;
    }

    function createBuiltInMealSafetyRegistry() {
        const registry = {};
        allBuiltInMealIdeas().forEach(idea => {
            const declared = Object.prototype.hasOwnProperty.call(BASE_MEAL_ALLERGENS, idea.id)
                ? BASE_MEAL_ALLERGENS[idea.id]
                : (Array.isArray(idea.allergens) ? idea.allergens : []);
            const allergens = Array.from(new Set(declared.filter(value => MEAL_ALLERGEN_LABELS[value])));
            registry[idea.id] = Object.freeze({
                recipeId: idea.id,
                allergens: Object.freeze(allergens),
                substitutions: Object.freeze(allergens.map(value => MEAL_ALLERGEN_SUBSTITUTIONS[value])),
                crossContact: 'Check every pack label and prevent cross-contamination during storage, preparation and serving.',
                certification: 'Halal and kosher suitability depends on the exact products, preparation and certification used.',
                source: 'curated-built-in-recipe-record'
            });
        });
        return Object.freeze(registry);
    }

    const CURATED_MEAL_SAFETY = createBuiltInMealSafetyRegistry();

    function inferCustomMealAllergens(idea) {
        const allergens = new Set(Array.isArray(idea && idea.allergens) ? idea.allergens : []);
        const text = `${idea && idea.name || ''} ${idea && idea.note || ''} ${(idea && idea.ingredients || []).join(' ')}`.toLowerCase();
        const rules = [
            ['dairy', /\b(yogurts?|yoghurts?|cheeses?|milk|whey|paneer|halloumi|butter|mozzarella|pesto)\b/],
            ['gluten', /\b(oats?|oatcakes?|bread|toast|wraps?|pittas?|pastas?|noodles?|couscous|bagels?|muesli|granola|seitan|wheat|rolls?|pancakes?)\b/],
            ['nuts', /\b(nuts?|almonds?|walnuts?|peanuts?|cashews?|hazelnuts?|pesto)\b/],
            ['egg', /\b(eggs?|omelettes?|shakshuka)\b/],
            ['fish', /\b(fish|salmon|tuna|cod|seafood|shellfish|prawn|shrimp)\b/],
            ['soy', /\b(soy|soya|tofu|tempeh|edamame)\b/],
            ['sesame', /\b(sesame|tahini|hummus)\b/]
        ];
        rules.forEach(([key, pattern]) => { if (pattern.test(text)) allergens.add(key); });
        return Array.from(allergens).filter(value => MEAL_ALLERGEN_LABELS[value]);
    }

    function structuredMealSafety(idea) {
        const known = idea && idea.id && CURATED_MEAL_SAFETY[idea.id];
        if (known) return known;
        const allergens = inferCustomMealAllergens(idea);
        return {
            recipeId: idea && idea.id || 'custom-meal',
            allergens,
            substitutions: allergens.map(value => MEAL_ALLERGEN_SUBSTITUTIONS[value]),
            crossContact: 'This custom meal has not been reviewed. Check every ingredient label and prevent cross-contamination.',
            certification: 'Verify halal or kosher certification on the exact products and preparation method.',
            source: 'custom-meal-screening'
        };
    }

    function curatedMealSafetyCoverage() {
        const recipes = allBuiltInMealIdeas();
        return {
            recipes: recipes.length,
            records: Object.keys(CURATED_MEAL_SAFETY).length,
            missing: recipes.filter(idea => !CURATED_MEAL_SAFETY[idea.id]).map(idea => idea.id)
        };
    }

    function mealSafetyHTML(idea, profileInput) {
        const profile = profileInput || dietaryProfile();
        const safety = structuredMealSafety(idea);
        const requirementToAllergen = {
            dairy_free: 'dairy', gluten_free: 'gluten', nut_free: 'nuts', egg_free: 'egg',
            fish_free: 'fish', soy_free: 'soy', sesame_free: 'sesame'
        };
        const selected = Array.isArray(profile.requirements) ? profile.requirements : [];
        const conflicts = selected
            .map(requirement => requirementToAllergen[requirement])
            .filter(allergen => allergen && safety.allergens.includes(allergen));
        const certificationNeeded = selected.filter(value => value === 'halal' || value === 'kosher');
        const tone = conflicts.length ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-200';
        const heading = conflicts.length ? 'Does not match your saved exclusions' : 'Allergy and dietary safety check';
        const listed = safety.allergens.length
            ? safety.allergens.map(value => MEAL_ALLERGEN_LABELS[value]).join(', ')
            : 'No listed allergens in the recipe record — labels still need checking';
        const substitutions = conflicts
            .map(value => MEAL_ALLERGEN_SUBSTITUTIONS[value])
            .filter(Boolean);
        return `
            <div class="mt-6 ${tone} border p-4 rounded-xl" data-meal-safety-record="${escapeHtml(safety.recipeId)}">
                <p class="font-black text-xs ${conflicts.length ? 'text-rose-900' : 'text-amber-900'}">${escapeHtml(heading)}</p>
                <p class="text-[11px] mt-1 ${conflicts.length ? 'text-rose-800' : 'text-amber-800'}"><b>Recipe record:</b> ${escapeHtml(listed)}.</p>
                ${substitutions.length ? `<ul class="text-[11px] mt-2 space-y-1 text-rose-800">${substitutions.map(item => `<li>• ${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
                ${certificationNeeded.length ? `<p class="text-[11px] mt-2 text-amber-900"><b>${escapeHtml(certificationNeeded.map(value => DIETARY_REQUIREMENT_LABELS[value]).join(' / '))}:</b> ${escapeHtml(safety.certification)}</p>` : ''}
                <p class="text-[10px] mt-2 text-slate-600">${escapeHtml(safety.crossContact)} VFIT cannot guarantee a meal is allergen-free.</p>
            </div>`;
    }
