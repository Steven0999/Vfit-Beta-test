    // ==========================================================================
    // BARCODE SCANNER
    // ==========================================================================

    let barcodeScanMode = 'food'; // 'food' → diary popup; 'meal' → meal ingredient; 'shopping' → planner list
    let barcodeScannerEmbedded = false;
    let barcodeScanLocked = false;
    let barcodeLookupInProgress = false;
    let barcodeScannerEngine = null; // 'native', 'html5' or 'quagga'
    let barcodeScannerSession = 0;
    let barcodeScannerFallbackTimer = null;
    let barcodeTriedEngines = new Set();
    let barcodeTorchOn = false;
    let quaggaDetectedHandler = null;
    let barcodeCandidateCode = '';
    let barcodeCandidateHits = 0;
    let barcodeCandidateAt = 0;
    let activeBarcodeOnScan = null;
    let nativeBarcodeStream = null;
    let nativeBarcodeVideo = null;
    let nativeBarcodeDetector = null;
    let nativeBarcodeLoopTimer = null;
    let nativeBarcodeFrameBusy = false;
    let barcodeImageDecodeInProgress = false;
    let barcodeImagePickerOpen = false;
    let barcodeImagePickerStopPromise = null;

    const OPEN_FOOD_FACTS_PRODUCT_FIELDS = [
        'code',
        'product_name',
        'product_name_en',
        'generic_name',
        'brands',
        'serving_size',
        'serving_quantity',
        'serving_quantity_unit',
        'image_front_url',
        'image_front_small_url',
        'image_url',
        'nutriments'
    ].join(',');

    function normaliseBarcode(value) {
        // A barcode is always kept as text. This preserves every digit and leading
        // zero, while removing spaces/hyphens from printed or manually entered codes.
        const withoutAimPrefix = String(value ?? '').trim().replace(/^\][A-Za-z0-9]{2}/, '');
        return withoutAimPrefix.replace(/[^0-9]/g, '');
    }

    function isPlausibleFoodBarcode(code) {
        // Common consumer codes: UPC-E (7), EAN-8, UPC-A (12), EAN-13 and GTIN-14.
        return /^\d{7,14}$/.test(code);
    }

    /**
     * Match the key normalization used by Open Food Facts without changing the
     * exact scanned value sent to the API or shown to the user.
     */
    function openFoodFactsBarcodeKey(value) {
        const code = normaliseBarcode(value);
        if (!code) return '';
        // GTIN-8, UPC-A, EAN-13 and GTIN-14 share a canonical 14-digit form.
        // Keeping it as a padded string preserves leading zeroes and lets cache
        // entries match whichever equivalent form a scanner or API returns.
        return code.length <= 14 ? code.padStart(14, '0') : code;
    }

    function barcodeFoodIdentityKeys(...values) {
        const keys = new Set();
        values.forEach(value => {
            const code = normaliseBarcode(value);
            if (!code) return;
            const variants = typeof barcodeLookupCandidates === 'function'
                ? barcodeLookupCandidates(code)
                : [code];
            variants.forEach(variant => {
                const key = openFoodFactsBarcodeKey(variant);
                if (key) keys.add(key);
            });
        });
        return keys;
    }

    function setBarcodeScanStatus(message, tone) {
        const status = document.getElementById('barcode-scan-status');
        if (!status) return;
        status.textContent = message;
        status.classList.remove('text-indigo-600', 'text-emerald-600', 'text-rose-600', 'text-amber-600');
        status.classList.add(
            tone === 'success' ? 'text-emerald-600' :
            tone === 'error' ? 'text-rose-600' :
            tone === 'warning' ? 'text-amber-600' :
            'text-indigo-600'
        );
    }

    function setBarcodeDetectedCode(code) {
        const clean = normaliseBarcode(code);
        const wrap = document.getElementById('barcode-detected-wrap');
        const value = document.getElementById('barcode-detected-number');
        if (value) value.textContent = clean;
        if (wrap) wrap.classList.toggle('hidden', !clean);
    }

    function setBarcodeLookupBusy(busy) {
        const button = document.getElementById('barcode-search-button');
        const input = document.getElementById('manual-barcode');
        if (button) {
            button.disabled = busy;
            button.textContent = busy ? 'Finding…' : 'Search';
            button.classList.toggle('opacity-60', busy);
        }
        if (input) input.readOnly = busy;
    }

    function getFoodBarcodeFormats() {
        if (typeof Html5QrcodeSupportedFormats === 'undefined') return null;
        return [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODE_128
        ].filter(format => format !== undefined && format !== null);
    }

    function createFoodBarcodeScanner() {
        const fullConfig = {
            verbose: false,
            // The native BarcodeDetector runs as its own first engine below.
            // Force this second engine to use html5-qrcode's bundled ZXing decoder,
            // so a fallback genuinely changes decoding technology.
            useBarCodeDetectorIfSupported: false
        };
        const formats = getFoodBarcodeFormats();
        if (formats && formats.length) fullConfig.formatsToSupport = formats;
        try {
            return new Html5Qrcode('barcode-reader', fullConfig);
        } catch (error) {
            // Constructor compatibility fallback for older Android WebViews.
            return new Html5Qrcode('barcode-reader');
        }
    }

    function hasValidGtinCheckDigit(code) {
        // Eight digits can be EAN-8 or UPC-E, whose check digit is derived differently.
        // Both scanner engines already validate those formats internally.
        if (!/^\d+$/.test(code) || ![12, 13, 14].includes(code.length)) return true;
        const digits = code.split('').map(Number);
        const supplied = digits.pop();
        let total = 0;
        let multiplyByThree = true;
        for (let i = digits.length - 1; i >= 0; i--) {
            total += digits[i] * (multiplyByThree ? 3 : 1);
            multiplyByThree = !multiplyByThree;
        }
        return ((10 - (total % 10)) % 10) === supplied;
    }

    function clearBarcodeScannerFallback() {
        if (barcodeScannerFallbackTimer) {
            clearTimeout(barcodeScannerFallbackTimer);
            barcodeScannerFallbackTimer = null;
        }
    }

    function resetBarcodeCandidate() {
        barcodeCandidateCode = '';
        barcodeCandidateHits = 0;
        barcodeCandidateAt = 0;
    }

    function setBarcodeTorchAvailable(available) {
        const button = document.getElementById('barcode-light-button');
        if (!button) return;
        button.disabled = !available;
        button.classList.toggle('opacity-50', !available);
        if (!available) {
            barcodeTorchOn = false;
            button.textContent = '🔦 Light';
        }
    }


    function updateBarcodeScannerButton() {
        const button = document.getElementById('barcode-switch-button');
        if (!button) return;
        button.textContent = 'Other decoder';
        const engineNames = {
            native: 'Android native scanner',
            html5: 'ZXing scanner',
            quagga: 'Quagga scanner'
        };
        button.title = barcodeScannerEngine
            ? `Currently using ${engineNames[barcodeScannerEngine] || barcodeScannerEngine}`
            : 'Try another barcode decoder';
    }

    function getActiveBarcodeTrack() {
        try {
            if (barcodeScannerEngine === 'native' && nativeBarcodeStream) {
                return nativeBarcodeStream.getVideoTracks()[0] || null;
            }
            if (
                barcodeScannerEngine === 'quagga' &&
                typeof Quagga !== 'undefined' &&
                Quagga.CameraAccess &&
                Quagga.CameraAccess.getActiveTrack
            ) {
                return Quagga.CameraAccess.getActiveTrack();
            }
        } catch (error) {}
        return null;
    }

    async function optimiseBarcodeCamera() {
        try {
            const track = getActiveBarcodeTrack();
            const capabilities = track && track.getCapabilities
                ? track.getCapabilities()
                : (
                    html5QrCode &&
                    html5QrCode.isScanning &&
                    html5QrCode.getRunningTrackCapabilities
                        ? html5QrCode.getRunningTrackCapabilities()
                        : {}
                );
            const advanced = {};

            if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
                advanced.focusMode = 'continuous';
            }
            if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
                advanced.exposureMode = 'continuous';
            }

            if (Object.keys(advanced).length) {
                if (track && track.applyConstraints) {
                    await track.applyConstraints({ advanced: [advanced] });
                } else if (html5QrCode && html5QrCode.applyVideoConstraints) {
                    await html5QrCode.applyVideoConstraints({ advanced: [advanced] });
                }
            }

            setBarcodeTorchAvailable(Boolean(capabilities && capabilities.torch));
        } catch (error) {
            setBarcodeTorchAvailable(false);
            console.debug('Barcode camera controls unavailable:', error);
        }
    }

    async function toggleBarcodeTorch() {
        const nextState = !barcodeTorchOn;
        try {
            const track = getActiveBarcodeTrack();
            if (track && track.applyConstraints) {
                await track.applyConstraints({ advanced: [{ torch: nextState }] });
            } else if (html5QrCode && html5QrCode.isScanning && html5QrCode.applyVideoConstraints) {
                await html5QrCode.applyVideoConstraints({ advanced: [{ torch: nextState }] });
            } else {
                throw new Error('torch-unavailable');
            }

            barcodeTorchOn = nextState;
            const button = document.getElementById('barcode-light-button');
            if (button) button.textContent = nextState ? '🔦 Light on' : '🔦 Light';
        } catch (error) {
            setBarcodeTorchAvailable(false);
            showToast('Camera light is not available on this device');
        }
    }

    async function startNativeBarcodeScanner(onScan, session) {
        if (
            typeof BarcodeDetector === 'undefined' ||
            typeof BarcodeDetector.getSupportedFormats !== 'function' ||
            !navigator.mediaDevices ||
            typeof navigator.mediaDevices.getUserMedia !== 'function'
        ) {
            throw new Error('native-scanner-unavailable');
        }

        const supported = await BarcodeDetector.getSupportedFormats();
        const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'];
        const formats = wanted.filter(format => supported.includes(format));
        if (!formats.length) throw new Error('native-food-formats-unavailable');

        const target = document.getElementById('barcode-reader');
        if (!target) throw new Error('scanner-target-missing');
        target.innerHTML = '';
        resetBarcodeCandidate();

        let stream = null;
        let video = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30, max: 30 }
                }
            });
            if (session !== barcodeScannerSession) throw new Error('scanner-session-ended');

            video = document.createElement('video');
            video.autoplay = true;
            video.muted = true;
            video.playsInline = true;
            video.setAttribute('autoplay', '');
            video.setAttribute('muted', '');
            video.setAttribute('playsinline', '');
            video.setAttribute('aria-label', 'Live rear camera barcode scanner');
            video.srcObject = stream;
            target.appendChild(video);

            if (video.readyState < 1) {
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(resolve, 1800);
                    video.onloadedmetadata = () => {
                        clearTimeout(timer);
                        resolve();
                    };
                    video.onerror = event => {
                        clearTimeout(timer);
                        reject(event);
                    };
                });
            }
            await video.play();
            if (session !== barcodeScannerSession) throw new Error('scanner-session-ended');

            nativeBarcodeStream = stream;
            nativeBarcodeVideo = video;
            nativeBarcodeDetector = new BarcodeDetector({ formats });
            nativeBarcodeFrameBusy = false;
            barcodeScannerEngine = 'native';
            updateBarcodeScannerButton();
            await optimiseBarcodeCamera();

            const scanFrame = async () => {
                if (
                    session !== barcodeScannerSession ||
                    barcodeScannerEngine !== 'native' ||
                    !nativeBarcodeDetector ||
                    !nativeBarcodeVideo ||
                    barcodeScanLocked ||
                    barcodeLookupInProgress
                ) return;

                if (!nativeBarcodeFrameBusy && nativeBarcodeVideo.readyState >= 2) {
                    nativeBarcodeFrameBusy = true;
                    try {
                        const matches = await nativeBarcodeDetector.detect(nativeBarcodeVideo);
                        for (const match of matches || []) {
                            if (match && match.rawValue) {
                                handleDecodedBarcode(match.rawValue, onScan, false);
                                if (barcodeScanLocked) break;
                            }
                        }
                    } catch (error) {
                        // A frame can fail while the camera is focusing. Keep scanning.
                    } finally {
                        nativeBarcodeFrameBusy = false;
                    }
                }

                if (
                    session === barcodeScannerSession &&
                    barcodeScannerEngine === 'native' &&
                    !barcodeScanLocked &&
                    !barcodeLookupInProgress
                ) {
                    nativeBarcodeLoopTimer = setTimeout(scanFrame, 100);
                }
            };
            nativeBarcodeLoopTimer = setTimeout(scanFrame, 80);
        } catch (error) {
            if (stream) stream.getTracks().forEach(track => track.stop());
            if (video) {
                try { video.pause(); } catch (pauseError) {}
                video.srcObject = null;
                video.remove();
            }
            throw error;
        }
    }


    async function stopActiveBarcodeScanner() {
        clearBarcodeScannerFallback();
        const hadActiveScanner = Boolean(
            barcodeScannerEngine ||
            nativeBarcodeStream ||
            html5QrCode ||
            quaggaDetectedHandler
        );

        if (nativeBarcodeLoopTimer) {
            clearTimeout(nativeBarcodeLoopTimer);
            nativeBarcodeLoopTimer = null;
        }
        nativeBarcodeFrameBusy = false;
        nativeBarcodeDetector = null;
        if (nativeBarcodeVideo) {
            try { nativeBarcodeVideo.pause(); } catch (error) {}
            nativeBarcodeVideo.srcObject = null;
            try { nativeBarcodeVideo.remove(); } catch (error) {}
            nativeBarcodeVideo = null;
        }
        if (nativeBarcodeStream) {
            try {
                nativeBarcodeStream.getTracks().forEach(track => track.stop());
            } catch (error) {}
            nativeBarcodeStream = null;
        }

        if (
            (barcodeScannerEngine === 'quagga' || quaggaDetectedHandler) &&
            typeof Quagga !== 'undefined'
        ) {
            try {
                if (quaggaDetectedHandler && Quagga.offDetected) {
                    Quagga.offDetected(quaggaDetectedHandler);
                }
            } catch (error) {}
            try { Quagga.stop(); } catch (error) {}
        }

        if (html5QrCode) {
            try {
                if (html5QrCode.isScanning) await html5QrCode.stop();
            } catch (error) {}
            try { html5QrCode.clear(); } catch (error) {}
        }

        html5QrCode = null;
        quaggaDetectedHandler = null;
        barcodeScannerEngine = null;
        barcodeTorchOn = false;
        setBarcodeTorchAvailable(false);
        updateBarcodeScannerButton();

        const reader = document.getElementById('barcode-reader');
        if (reader) reader.innerHTML = '';

        // Some Android cameras need a moment to release before another decoder
        // opens the same rear lens.
        if (hadActiveScanner) {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }


    function handleDecodedBarcode(rawValue, onScan, requireConfirmation) {
        if (barcodeScanLocked || barcodeLookupInProgress) return;
        const code = normaliseBarcode(rawValue);
        if (!isPlausibleFoodBarcode(code)) return;

        if (!hasValidGtinCheckDigit(code)) {
            setBarcodeScanStatus('Barcode found but not yet clear — hold steady', 'warning');
            resetBarcodeCandidate();
            return;
        }

        if (requireConfirmation) {
            const now = Date.now();
            if (code === barcodeCandidateCode && now - barcodeCandidateAt < 2500) {
                barcodeCandidateHits += 1;
            } else {
                barcodeCandidateCode = code;
                barcodeCandidateHits = 1;
            }
            barcodeCandidateAt = now;
            if (barcodeCandidateHits < 2) {
                setBarcodeScanStatus('Reading ' + code + ' — hold steady…');
                return;
            }
        }

        setBarcodeDetectedCode(code);
        clearBarcodeScannerFallback();
        onScan(code);
    }

    async function startQuaggaBarcodeScanner(onScan, session) {
        if (typeof Quagga === 'undefined') throw new Error('quagga-scanner-unavailable');
        const target = document.getElementById('barcode-reader');
        if (!target) throw new Error('scanner-target-missing');
        target.innerHTML = '';
        resetBarcodeCandidate();

        await new Promise((resolve, reject) => {
            Quagga.init({
                inputStream: {
                    name: 'VFit food barcode',
                    type: 'LiveStream',
                    target,
                    constraints: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        aspectRatio: { ideal: 1.777778 }
                    }
                },
                locate: true,
                frequency: 12,
                // A zero-worker fallback avoids Android WebView/Blob-worker failures.
                numOfWorkers: 0,
                locator: {
                    // Preserve full bar detail instead of halving already-small frames.
                    halfSample: false,
                    patchSize: 'large'
                },
                decoder: {
                    readers: [
                        'ean_reader',
                        'ean_8_reader',
                        'upc_reader',
                        'upc_e_reader',
                        'i2of5_reader',
                        'code_128_reader'
                    ],
                    multiple: false
                }
            }, error => {
                if (error) {
                    reject(error);
                    return;
                }
                if (session !== barcodeScannerSession) {
                    try { Quagga.stop(); } catch (stopError) {}
                    reject(new Error('scanner-session-ended'));
                    return;
                }

                quaggaDetectedHandler = result => {
                    const value = result && result.codeResult && result.codeResult.code;
                    // Quagga already scores and validates its own decoded result.
                    if (value) handleDecodedBarcode(value, onScan, false);
                };
                Quagga.onDetected(quaggaDetectedHandler);

                try {
                    Quagga.start();
                    barcodeScannerEngine = 'quagga';
                    updateBarcodeScannerButton();
                    Promise.resolve(optimiseBarcodeCamera()).finally(resolve);
                } catch (startError) {
                    reject(startError);
                }
            });
        });
    }

    async function startHtml5BarcodeScanner(onScan, session) {
        if (typeof Html5Qrcode === 'undefined') throw new Error('zxing-scanner-unavailable');
        const target = document.getElementById('barcode-reader');
        if (!target) throw new Error('scanner-target-missing');
        target.innerHTML = '';

        const config = {
            fps: 10,
            aspectRatio: 1.6,
            // A wide, shallow region gives the ZXing decoder many more pixels per
            // EAN/UPC bar than scanning the whole tall portrait frame.
            qrbox: (viewfinderWidth, viewfinderHeight) => {
                const width = Math.max(50, Math.floor(viewfinderWidth * 0.92));
                const height = Math.max(
                    50,
                    Math.floor(Math.min(viewfinderHeight * 0.42, width * 0.38))
                );
                return {
                    width: Math.min(width, Math.max(50, viewfinderWidth - 8)),
                    height: Math.min(height, Math.max(50, viewfinderHeight - 8))
                };
            },
            // The rear camera is not mirrored; disabling the mirrored retry halves
            // unnecessary work and improves scan cadence on lower-power phones.
            disableFlip: true
        };
        const success = decodedText => handleDecodedBarcode(decodedText, onScan, false);
        const failure = () => {};

        const releaseHtml5Instance = async () => {
            try {
                if (html5QrCode && html5QrCode.isScanning) await html5QrCode.stop();
            } catch (error) {}
            try {
                if (html5QrCode) html5QrCode.clear();
            } catch (error) {}
            html5QrCode = null;
            target.innerHTML = '';
        };

        const startWith = async camera => {
            const highResolutionConfig = Object.assign({}, config, {
                videoConstraints: typeof camera === 'string'
                    ? {
                        deviceId: { exact: camera },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                    : {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
            });
            html5QrCode = createFoodBarcodeScanner();
            await html5QrCode.start(camera, highResolutionConfig, success, failure);
            if (session !== barcodeScannerSession) {
                await releaseHtml5Instance();
                throw new Error('scanner-session-ended');
            }
            barcodeScannerEngine = 'html5';
            updateBarcodeScannerButton();
            await optimiseBarcodeCamera();
        };

        let firstError = null;
        try {
            const cameras = await Html5Qrcode.getCameras();
            if (cameras && cameras.length) {
                const labelledRear = cameras.filter(camera =>
                    /back|rear|environment/i.test(camera.label || '')
                );
                const preferredRear = labelledRear.find(camera =>
                    !/ultra|wide|tele|macro/i.test(camera.label || '')
                ) || labelledRear[0] || cameras[cameras.length - 1];
                try {
                    await startWith(preferredRear.id);
                    return;
                } catch (error) {
                    firstError = error;
                    await releaseHtml5Instance();
                }
            }
        } catch (error) {
            firstError = error;
        }

        try {
            await startWith({ facingMode: { ideal: 'environment' } });
        } catch (error) {
            await releaseHtml5Instance();
            throw error || firstError || new Error('back-camera-unavailable');
        }
    }


    function getBarcodeEngineOrder() {
        const engines = [];
        if (
            typeof BarcodeDetector !== 'undefined' &&
            navigator.mediaDevices &&
            typeof navigator.mediaDevices.getUserMedia === 'function'
        ) engines.push('native');
        if (typeof Html5Qrcode !== 'undefined') engines.push('html5');
        if (typeof Quagga !== 'undefined') engines.push('quagga');
        return engines;
    }

    function barcodeEngineReadyMessage(engine) {
        if (engine === 'native') {
            return 'Android scanner ready — fill the orange box with the barcode';
        }
        if (engine === 'html5') {
            return 'Wide barcode scanner ready — hold every bar inside the box';
        }
        return 'Detail scanner ready — hold still while the camera focuses';
    }

    async function startBarcodeEngine(engine, onScan, session) {
        if (engine === 'native') return startNativeBarcodeScanner(onScan, session);
        if (engine === 'html5') return startHtml5BarcodeScanner(onScan, session);
        if (engine === 'quagga') return startQuaggaBarcodeScanner(onScan, session);
        throw new Error('unknown-barcode-engine');
    }


    async function startBestBarcodeScanner(onScan, session, preferredOrder) {
        const available = getBarcodeEngineOrder();
        const order = (preferredOrder || available).filter((engine, index, list) =>
            available.includes(engine) && list.indexOf(engine) === index
        );
        let lastError = null;

        for (const engine of order) {
            barcodeTriedEngines.add(engine);
            try {
                await startBarcodeEngine(engine, onScan, session);
                if (session !== barcodeScannerSession) return null;
                setBarcodeScanStatus(barcodeEngineReadyMessage(engine));
                scheduleBarcodeScannerFallback(onScan, session);
                return engine;
            } catch (error) {
                lastError = error;
                console.warn(`${engine} barcode scanner unavailable:`, error);
                await stopActiveBarcodeScanner();
                if (session !== barcodeScannerSession) return null;
            }
        }
        throw lastError || new Error('no-barcode-scanner-loaded');
    }

    function scheduleBarcodeScannerFallback(onScan, session) {
        clearBarcodeScannerFallback();
        const engineWhenScheduled = barcodeScannerEngine;
        const untried = getBarcodeEngineOrder().filter(engine => !barcodeTriedEngines.has(engine));
        if (!engineWhenScheduled || untried.length === 0) return;

        const delay = engineWhenScheduled === 'native' ? 5000 : 8000;
        barcodeScannerFallbackTimer = setTimeout(async () => {
            if (
                session !== barcodeScannerSession ||
                barcodeScanLocked ||
                barcodeLookupInProgress ||
                barcodeImageDecodeInProgress ||
                barcodeScannerEngine !== engineWhenScheduled
            ) return;

            setBarcodeScanStatus('Still looking — changing decoder automatically…', 'warning');
            await switchBarcodeScannerEngine(true);
        }, delay);
    }

    async function switchBarcodeScannerEngine(triggeredAutomatically) {
        if (barcodeScanLocked || barcodeLookupInProgress || barcodeImageDecodeInProgress) return;
        if (!activeBarcodeOnScan) {
            await openBarcodeScanner();
            return;
        }

        const session = barcodeScannerSession;
        const onScan = activeBarcodeOnScan;
        const currentEngine = barcodeScannerEngine;
        const allEngines = getBarcodeEngineOrder();
        let nextEngines = allEngines.filter(engine =>
            engine !== currentEngine && !barcodeTriedEngines.has(engine)
        );

        // A manual tap can cycle through the decoders again after all have run.
        if (!triggeredAutomatically && nextEngines.length === 0) {
            barcodeTriedEngines = new Set(currentEngine ? [currentEngine] : []);
            nextEngines = allEngines.filter(engine => engine !== currentEngine);
        }
        if (nextEngines.length === 0) {
            setBarcodeScanStatus('Use Photo or enter the printed number below', 'warning');
            return;
        }

        setBarcodeScanStatus(triggeredAutomatically ? 'Changing decoder…' : 'Switching scanner…');
        try {
            await stopActiveBarcodeScanner();
            if (session !== barcodeScannerSession) return;
            activeBarcodeOnScan = onScan;
            const started = await startBestBarcodeScanner(onScan, session, nextEngines);
            if (!started) return;
            setBarcodeScanStatus(barcodeEngineReadyMessage(started));
        } catch (error) {
            console.warn('Could not switch barcode scanner:', error);
            setBarcodeScanStatus('Live scan could not read it — use Photo or enter the number below', 'error');
        }
    }

    function decodeBarcodeImageWithQuagga(file) {
        if (typeof Quagga === 'undefined') return Promise.reject(new Error('quagga-unavailable'));
        const objectUrl = URL.createObjectURL(file);
        return new Promise((resolve, reject) => {
            Quagga.decodeSingle({
                src: objectUrl,
                numOfWorkers: 0,
                locate: true,
                inputStream: { size: 1600 },
                locator: { halfSample: false, patchSize: 'large' },
                decoder: {
                    readers: [
                        'ean_reader',
                        'ean_8_reader',
                        'upc_reader',
                        'upc_e_reader',
                        'i2of5_reader',
                        'code_128_reader'
                    ]
                }
            }, result => {
                URL.revokeObjectURL(objectUrl);
                const code = result && result.codeResult && result.codeResult.code;
                if (code) resolve(code);
                else reject(new Error('barcode-not-found-in-image'));
            });
        });
    }

    function openBarcodeImagePicker() {
        if (barcodeLookupInProgress || barcodeImageDecodeInProgress || barcodeImagePickerOpen) return;
        const input = document.getElementById('barcode-image-input');
        if (!input || !activeBarcodeOnScan) {
            setBarcodeScanStatus('Open the scanner before choosing a barcode photo', 'warning');
            return;
        }

        // Android may background the page while its camera/file picker is open.
        // Mark that transition first and release the live camera, but keep this
        // scanner session and callback alive for the selected photo.
        barcodeImagePickerOpen = true;
        input.value = '';
        setBarcodeScanStatus('Opening camera for barcode photo…');
        barcodeImagePickerStopPromise = stopActiveBarcodeScanner().catch(error => {
            console.warn('Live scanner could not be released before photo capture:', error);
        });
        input.click();
    }

    async function cancelBarcodeImagePicker() {
        if (!barcodeImagePickerOpen) return;
        const session = barcodeScannerSession;
        barcodeImagePickerOpen = false;
        const stopPromise = barcodeImagePickerStopPromise;
        barcodeImagePickerStopPromise = null;
        if (stopPromise) await stopPromise;
        if (session !== barcodeScannerSession || barcodeScanLocked || barcodeLookupInProgress) return;
        setBarcodeScanStatus('Photo cancelled — restarting live scanner…');
        await restartBarcodeScannerAfterLookup();
    }

    async function scanBarcodeImage(input) {
        const file = input && input.files && input.files[0];
        const session = barcodeScannerSession;
        const onScan = activeBarcodeOnScan;
        barcodeImagePickerOpen = false;
        const stopPromise = barcodeImagePickerStopPromise;
        barcodeImagePickerStopPromise = null;
        if (input) input.value = '';
        if (stopPromise) await stopPromise;

        if (!file) {
            if (session === barcodeScannerSession && onScan && !barcodeScanLocked && !barcodeLookupInProgress) {
                await restartBarcodeScannerAfterLookup();
            }
            return;
        }
        if (barcodeLookupInProgress || barcodeImageDecodeInProgress) return;
        if (!onScan) {
            setBarcodeScanStatus('Open the scanner again, then choose Photo', 'warning');
            return;
        }

        barcodeImageDecodeInProgress = true;
        setBarcodeScanStatus('Reading barcode from photo…');
        let decoded = '';
        let lastError = null;

        try {
            if (!stopPromise) await stopActiveBarcodeScanner();
            if (session !== barcodeScannerSession) return;
            activeBarcodeOnScan = onScan;

            if (typeof Html5Qrcode !== 'undefined') {
                try {
                    html5QrCode = createFoodBarcodeScanner();
                    decoded = await html5QrCode.scanFile(file, true);
                } catch (error) {
                    lastError = error;
                } finally {
                    try {
                        if (html5QrCode) html5QrCode.clear();
                    } catch (error) {}
                    html5QrCode = null;
                }
            }

            if (!decoded && typeof Quagga !== 'undefined') {
                try {
                    decoded = await decodeBarcodeImageWithQuagga(file);
                } catch (error) {
                    lastError = error;
                }
            }

            if (session !== barcodeScannerSession) return;
            const clean = normaliseBarcode(decoded);
            if (!isPlausibleFoodBarcode(clean) || !hasValidGtinCheckDigit(clean)) {
                throw lastError || new Error('barcode-not-found-in-image');
            }

            setBarcodeDetectedCode(clean);
            setBarcodeScanStatus('Barcode read: ' + clean + ' — finding product…', 'success');
            handleDecodedBarcode(clean, onScan, false);
        } catch (error) {
            console.warn('Barcode photo could not be decoded:', error);
            setBarcodeScanStatus('No barcode found in that photo — retake it closer or enter the number', 'error');
            barcodeImageDecodeInProgress = false;
            if (session === barcodeScannerSession && !barcodeScanLocked) {
                try {
                    await startBestBarcodeScanner(onScan, session);
                } catch (restartError) {
                    console.warn('Could not restart live barcode scanner:', restartError);
                }
            }
            return;
        } finally {
            barcodeImageDecodeInProgress = false;
        }
    }


    function mergeBarcodeFoodsFromCloud(cloudFoods) {
        if (!Array.isArray(cloudFoods) || cloudFoods.length === 0) return;
        const parsedTime = value => value ? (Date.parse(value) || 0) : 0;
        const combined = [...(Array.isArray(state.barcodeFoods) ? state.barcodeFoods : []), ...cloudFoods]
            .filter(item => item && (item.barcode || item.scannedBarcode))
            .sort((a, b) => parsedTime(b.cachedAt) - parsedTime(a.cachedAt));
        const seen = new Set();
        state.barcodeFoods = combined.filter(item => {
            const keys = barcodeFoodIdentityKeys(item.barcode, item.scannedBarcode);
            if (!keys.size || [...keys].some(key => seen.has(key))) return false;
            keys.forEach(key => seen.add(key));
            return true;
        }).slice(0, 100);
        saveState();
    }

    function findCachedBarcodeFood(code) {
        const wanted = barcodeFoodIdentityKeys(code);
        return (Array.isArray(state.barcodeFoods) ? state.barcodeFoods : []).find(item => {
            const itemKeys = barcodeFoodIdentityKeys(item.barcode, item.scannedBarcode);
            return [...itemKeys].some(key => wanted.has(key));
        }) || null;
    }

    async function cacheBarcodeFood(food) {
        if (!food || !(food.barcode || food.scannedBarcode)) return;
        const clean = {
            name: String(food.name || 'Scanned item').slice(0, 160),
            brand: String(food.brand || '').slice(0, 160),
            image: safeImageUrl(food.image || ''),
            calories: food.calories || 0,
            protein: food.protein || 0,
            carbs: food.carbs || 0,
            fat: food.fat || 0,
            fiber: food.fiber || 0,
            sugar: food.sugar || 0,
            satFat: food.satFat || 0,
            sodium: food.sodium || 0,
            cholesterol: food.cholesterol || 0,
            serving: food.serving || '100g',
            servingGrams: food.servingGrams || 100,
            barcode: food.barcode || food.scannedBarcode,
            scannedBarcode: food.scannedBarcode || food.barcode,
            source: 'openfoodfacts',
            isCustom: false,
            cachedAt: new Date().toISOString()
        };

        const cleanKeys = barcodeFoodIdentityKeys(clean.barcode, clean.scannedBarcode);
        const existing = Array.isArray(state.barcodeFoods) ? state.barcodeFoods : [];
        state.barcodeFoods = [clean, ...existing.filter(item => {
            const itemKeys = barcodeFoodIdentityKeys(item.barcode, item.scannedBarcode);
            return ![...itemKeys].some(key => cleanKeys.has(key));
        })].slice(0, 100);
        saveState();

        // hardening's saveState() above schedules the complete account snapshot,
        // including barcodeFoods, and honours the user's cloud-sync privacy choice.
    }


    function expandUpceToUpca(value) {
        let code = normaliseBarcode(value);
        // Some decoders omit the UPC-E number-system digit (normally zero).
        if (code.length === 7) code = '0' + code;
        if (code.length !== 8 || !/^[01]/.test(code)) return '';

        const numberSystem = code[0];
        const body = code.slice(1, 7);
        const checkDigit = code[7];
        const last = body[5];
        let manufacturer = '';
        let product = '';

        if (last === '0' || last === '1' || last === '2') {
            manufacturer = body.slice(0, 2) + last + '00';
            product = '00' + body.slice(2, 5);
        } else if (last === '3') {
            manufacturer = body.slice(0, 3) + '00';
            product = '000' + body.slice(3, 5);
        } else if (last === '4') {
            manufacturer = body.slice(0, 4) + '0';
            product = '0000' + body[4];
        } else {
            manufacturer = body.slice(0, 5);
            product = '0000' + last;
        }
        return numberSystem + manufacturer + product + checkDigit;
    }

    function barcodeLookupCandidates(value) {
        const code = normaliseBarcode(value);
        const candidates = [code];
        if (code.length === 7) candidates.push(code.padStart(8, '0'));
        if (code.length === 7 || code.length === 8) {
            candidates.push(expandUpceToUpca(code));
        }
        if (code.length === 12) candidates.push('0' + code);
        if (code.length === 13 && code.startsWith('0')) candidates.push(code.slice(1));
        if (code.length === 14 && code.startsWith('0')) candidates.push(code.slice(1));
        candidates.push(openFoodFactsBarcodeKey(code));

        return candidates
            .map(normaliseBarcode)
            .filter((candidate, index, list) =>
                isPlausibleFoodBarcode(candidate) && list.indexOf(candidate) === index
            );
    }

    async function fetchOpenFoodFactsProduct(code) {
        const requestedCode = normaliseBarcode(code);
        const fields = encodeURIComponent(OPEN_FOOD_FACTS_PRODUCT_FIELDS);
        const candidates = barcodeLookupCandidates(requestedCode);
        let lastError = null;
        let receivedValidResponse = false;

        for (const candidate of candidates) {
            const encodedCode = encodeURIComponent(candidate);
            // V2 is Open Food Facts' documented read endpoint. V3 is retained as
            // an independent compatibility fallback.
            const endpoints = [
                `https://world.openfoodfacts.org/api/v2/product/${encodedCode}?fields=${fields}&lc=en&cc=gb`,
                `https://world.openfoodfacts.org/api/v3/product/${encodedCode}?fields=${fields}&lc=en&cc=gb`
            ];

            for (const endpoint of endpoints) {
                try {
                    const response = await fetchWithTimeout(endpoint, 10000);
                    if (response.status === 404) {
                        receivedValidResponse = true;
                        continue;
                    }
                    if (!response.ok) {
                        throw new Error('Open Food Facts HTTP ' + response.status);
                    }

                    receivedValidResponse = true;
                    const data = await response.json();
                    if (data && data.product) {
                        return {
                            found: true,
                            requestedCode,
                            code: normaliseBarcode(data.code || data.product.code || candidate),
                            product: data.product
                        };
                    }
                    if (data && (data.status === 0 || data.status === 'failure' || data.result?.id === 'product_not_found')) {
                        continue;
                    }
                    lastError = new Error('Open Food Facts returned no product');
                } catch (error) {
                    lastError = error;
                }
            }
        }

        if (receivedValidResponse) return { found: false, code: requestedCode };
        throw lastError || new Error('Open Food Facts lookup failed');
    }

    function mountBarcodeScannerSurface() {
        const modal = document.getElementById('barcode-scanner-modal');
        const card = document.getElementById('barcode-scanner-card');
        const mealSlot = document.getElementById('meal-barcode-inline-slot');
        const shoppingSlot = document.getElementById('weekly-shopping-barcode-slot');
        const embeddedSlot = barcodeScanMode === 'shopping' ? shoppingSlot : mealSlot;
        if (!modal || !card) return false;

        if (barcodeScannerEmbedded && embeddedSlot) {
            modal.style.display = 'none';
            embeddedSlot.classList.remove('hidden');
            if (card.parentElement !== embeddedSlot) embeddedSlot.appendChild(card);
            requestAnimationFrame(() => {
                try { embeddedSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (error) {}
            });
            return true;
        }

        if (card.parentElement !== modal) modal.appendChild(card);
        [mealSlot, shoppingSlot].filter(Boolean).forEach(slot => slot.classList.add('hidden'));
        modal.style.display = 'flex';
        return true;
    }

    function restoreBarcodeScannerSurface() {
        const modal = document.getElementById('barcode-scanner-modal');
        const card = document.getElementById('barcode-scanner-card');
        const slots = [
            document.getElementById('meal-barcode-inline-slot'),
            document.getElementById('weekly-shopping-barcode-slot')
        ].filter(Boolean);
        if (modal && card && card.parentElement !== modal) modal.appendChild(card);
        if (modal) modal.style.display = 'none';
        slots.forEach(slot => {
            slot.classList.add('hidden');
            slot.innerHTML = '';
        });
    }

    function showMealBarcodeResult(food) {
        const result = document.getElementById('meal-barcode-result');
        const product = document.getElementById('meal-barcode-product');
        const number = document.getElementById('meal-barcode-number');
        const code = normaliseBarcode(food && (food.scannedBarcode || food.barcode));
        if (product) product.textContent = String((food && food.name) || 'Scanned ingredient');
        if (number) number.textContent = code;
        if (result) result.classList.remove('hidden');
    }

    function openMealBarcodeScanner() {
        barcodeScanMode = 'meal';
        barcodeScannerEmbedded = true;
        openBarcodeScanner();
    }


    async function openBarcodeScanner() {
        const modal = document.getElementById('barcode-scanner-modal');
        const input = document.getElementById('manual-barcode');
        const imageInput = document.getElementById('barcode-image-input');
        if (!modal || !mountBarcodeScannerSurface()) return;
        const title = document.getElementById('barcode-scanner-title');
        if (title) title.textContent = barcodeScanMode === 'meal'
            ? 'Scan Ingredient Barcode'
            : (barcodeScanMode === 'shopping' ? 'Scan Shopping Product' : 'Scan Barcode');
        if (input) input.value = '';
        if (imageInput) imageInput.value = '';
        setBarcodeDetectedCode('');

        const session = ++barcodeScannerSession;
        barcodeScanLocked = false;
        barcodeLookupInProgress = false;
        barcodeImageDecodeInProgress = false;
        barcodeImagePickerOpen = false;
        barcodeImagePickerStopPromise = null;
        barcodeTriedEngines = new Set();
        activeBarcodeOnScan = null;
        resetBarcodeCandidate();
        setBarcodeLookupBusy(false);
        setBarcodeTorchAvailable(false);
        setBarcodeScanStatus('Starting back camera…');

        await stopActiveBarcodeScanner();
        if (session !== barcodeScannerSession) return;

        const onScan = async decodedText => {
            if (
                session !== barcodeScannerSession ||
                barcodeScanLocked ||
                barcodeLookupInProgress
            ) return;

            const fullBarcode = normaliseBarcode(decodedText);
            if (!isPlausibleFoodBarcode(fullBarcode)) {
                setBarcodeScanStatus('Keep the whole barcode inside the frame', 'warning');
                return;
            }

            barcodeScanLocked = true;
            clearBarcodeScannerFallback();
            if (input) input.value = fullBarcode;
            setBarcodeDetectedCode(fullBarcode);
            setBarcodeScanStatus('Barcode read: ' + fullBarcode + ' — finding product…', 'success');
            try {
                if (navigator.vibrate) navigator.vibrate(90);
            } catch (error) {}

            await stopActiveBarcodeScanner();
            if (session !== barcodeScannerSession) return;
            await lookupBarcode(fullBarcode);
        };
        activeBarcodeOnScan = onScan;

        if (getBarcodeEngineOrder().length === 0) {
            setBarcodeScanStatus('Scanner libraries failed to load — enter the printed number', 'error');
            showToast('Scanner failed to load — enter barcode manually', 5000);
            return;
        }

        try {
            await startBestBarcodeScanner(onScan, session);
        } catch (error) {
            console.warn('Barcode camera unavailable:', error);
            setBarcodeScanStatus('Camera unavailable — use Photo or enter the printed number', 'error');
            showToast('Camera unavailable — use Photo or enter barcode manually', 5000);
        }
    }

    async function closeBarcodeScanner() {
        const wasEmbedded = barcodeScannerEmbedded;
        barcodeScannerSession += 1;
        barcodeScanLocked = false;
        barcodeImageDecodeInProgress = false;
        barcodeImagePickerOpen = false;
        barcodeImagePickerStopPromise = null;
        activeBarcodeOnScan = null;
        setBarcodeLookupBusy(false);
        await stopActiveBarcodeScanner();
        setBarcodeDetectedCode('');
        if (wasEmbedded) restoreBarcodeScannerSurface();
        else {
            const modal = document.getElementById('barcode-scanner-modal');
            if (modal) modal.style.display = 'none';
        }
        barcodeScannerEmbedded = false;
        barcodeScanMode = 'food';
    }

    async function useResolvedBarcodeFood(food) {
        const requestedMode = barcodeScanMode;
        barcodeScanMode = 'food';
        await closeBarcodeScanner();

        if (requestedMode === 'meal') {
            const previousCount = mealIngredients.length;
            addIngredient({
                name: food.name || 'Scanned item',
                cal: food.calories || 0,
                protein: food.protein || 0,
                carbs: food.carbs || 0,
                fat: food.fat || 0,
                fiber: food.fiber || 0,
                sugar: food.sugar || 0,
                brand: food.brand || '',
                image: food.image || '',
                barcode: food.scannedBarcode || food.barcode || ''
            });
            if (mealIngredients.length > previousCount) showMealBarcodeResult(food);
        } else if (requestedMode === 'shopping' && typeof addShoppingProductFromBarcode === 'function') {
            addShoppingProductFromBarcode(food);
        } else {
            openFoodPopupModel(food);
        }
    }


    async function restartBarcodeScannerAfterLookup() {
        const modal = document.getElementById('barcode-scanner-modal');
        if (
            !modal ||
            modal.style.display === 'none' ||
            barcodeScannerEngine ||
            !activeBarcodeOnScan ||
            barcodeLookupInProgress ||
            barcodeScanLocked
        ) return;

        const session = barcodeScannerSession;
        barcodeTriedEngines = new Set();
        try {
            await startBestBarcodeScanner(activeBarcodeOnScan, session);
        } catch (error) {
            console.warn('Barcode scanner could not restart:', error);
            setBarcodeScanStatus('Use Photo or enter another barcode number', 'warning');
        }
    }

    async function lookupBarcode(scannedCode) {
        const barcodeInput = document.getElementById('manual-barcode');
        const code = normaliseBarcode(scannedCode ?? (barcodeInput && barcodeInput.value));
        if (barcodeInput) barcodeInput.value = code;
        setBarcodeDetectedCode(code);

        if (!isPlausibleFoodBarcode(code)) {
            barcodeScanLocked = false;
            setBarcodeScanStatus('Enter the complete 7–14 digit barcode', 'error');
            showToast('Enter the complete barcode number');
            return;
        }
        if (barcodeLookupInProgress) return;

        barcodeLookupInProgress = true;
        barcodeScanLocked = true;
        setBarcodeLookupBusy(true);
        setBarcodeScanStatus('Finding ' + code + ' in Open Food Facts…');

        const cached = findCachedBarcodeFood(code);
        let restartAfterFailure = false;
        try {
            const result = await fetchOpenFoodFactsProduct(code);
            if (!result.found || !result.product) {
                barcodeScanLocked = false;
                restartAfterFailure = true;
                setBarcodeScanStatus('Barcode ' + code + ' was read, but it is not in Open Food Facts', 'warning');
                showToast('Barcode read — product not found in Open Food Facts');
                return;
            }

            const food = normaliseOpenFoodFactsProduct(result.product, code);
            food.barcode = result.code || food.barcode || code;
            food.scannedBarcode = code;
            await cacheBarcodeFood(food);
            await useResolvedBarcodeFood(food);
        } catch (error) {
            console.warn('Open Food Facts barcode lookup failed:', error);
            if (cached) {
                await useResolvedBarcodeFood(cached);
                showToast('Loaded saved product — Open Food Facts is unavailable');
            } else {
                barcodeScanLocked = false;
                restartAfterFailure = true;
                setBarcodeScanStatus('Barcode read, but Open Food Facts could not be reached — try again', 'error');
                showToast('Could not reach Open Food Facts');
            }
        } finally {
            barcodeLookupInProgress = false;
            setBarcodeLookupBusy(false);
            if (restartAfterFailure) await restartBarcodeScannerAfterLookup();
        }
    }

    // ==========================================================================
    // CREATED MEALS
    // ==========================================================================

    function renderCreatedMeals() {
        const container = document.getElementById('created-meals-list');
        if (!container) return;
        const list = state.createdMeals || [];
        const customs = state.customFoods || [];

        let html = '';
        if (customs.length > 0) {
            html += '<h4 class="text-xs font-black text-slate-400 uppercase mb-2 mt-4">My Foods</h4>';
            html += customs.slice(0, 10).map(f => {
                const id = escapeJsString(f.id);
                const image = safeImageUrl(f.image);
                return `
                <div onclick='openFoodPopupCustom(${safeJsonForInline(f)})' class="glass-card p-3 rounded-2xl cursor-pointer hover:shadow-md mb-2 flex items-center gap-3">
                    <div class="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                        ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" class="w-full h-full object-contain">` : '<i data-lucide="utensils" class="w-6 h-6 text-slate-300"></i>'}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm truncate">${escapeHtml(f.name)}</p>
                        <p class="text-xs text-slate-400">${Math.round(Number(f.calories) || 0)} kcal • ${(Number(f.protein) || 0).toFixed(1)}g protein</p>
                    </div>
                    <button onclick="event.stopPropagation(); deleteCustomFood('${id}')" class="w-7 h-7 bg-red-50 text-red-500 rounded-lg text-sm" aria-label="Remove ${escapeHtml(f.name || 'food')}">×</button>
                </div>
            `;
            }).join('');
        }

        if (list.length > 0) {
            html += '<h4 class="text-xs font-black text-slate-400 uppercase mb-2 mt-4">My Meals</h4>';
            html += list.map(m => {
                const badges = [];
                if (/^\d{4}-\d{2}-\d{2}$/.test(String(m.plannedDate || ''))) {
                    const plannedSlot = ['breakfast', 'lunch', 'dinner', 'snack'].includes(m.plannedMealType) ? m.plannedMealType : 'meal';
                    badges.push(`Plan: ${m.plannedDate} · ${plannedSlot}`);
                }
                if (m.showInShiftFoodIdeas === true || m.addToShiftFoodIdeas === true) badges.push('Shift Food Ideas');
                return `
                <div class="glass-card p-3 rounded-2xl mb-2 flex items-center gap-3">
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm truncate">${escapeHtml(m.name)}</p>
                        <p class="text-xs text-slate-400">${Math.round(Number(m.calories) || 0)} kcal · ${(Number(m.protein) || 0).toFixed(1)}g protein</p>
                        ${badges.length ? `<div class="flex flex-wrap gap-1 mt-1">${badges.map(badge => `<span class="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">${escapeHtml(badge)}</span>`).join('')}</div>` : ''}
                    </div>
                    <button onclick="deleteCreatedMeal('${escapeJsString(m.id)}')" class="w-7 h-7 bg-red-50 text-red-500 rounded-lg text-sm flex-shrink-0" aria-label="Remove ${escapeHtml(m.name || 'meal')}">×</button>
                </div>
            `;
            }).join('');
        }

        container.innerHTML = html;
        refreshIcons();
    }

    function deleteCustomFood(id) {
        state.customFoods = (state.customFoods || []).filter(f => String(f.id) !== String(id));
        saveState();
        renderCreatedMeals();
        showToast('Removed');
    }

    function deleteCreatedMeal(id) {
        state.createdMeals = (state.createdMeals || []).filter(m => String(m.id) !== String(id));
        saveState();
        renderCreatedMeals();
    }

    function openCreateMeal() {
        document.getElementById('create-meal-modal').style.display = 'flex';
        mealIngredients = [];
        document.getElementById('meal-name-input').value = '';
        const barcodeResult = document.getElementById('meal-barcode-result');
        if (barcodeResult) barcodeResult.classList.add('hidden');
        const barcodeProduct = document.getElementById('meal-barcode-product');
        const barcodeNumber = document.getElementById('meal-barcode-number');
        if (barcodeProduct) barcodeProduct.textContent = '';
        if (barcodeNumber) barcodeNumber.textContent = '';
        setupMealIngredientSearch();
        clearMealIngredientSearch();
        const planDate = document.getElementById('create-meal-plan-date');
        if (planDate) planDate.value = /^\d{4}-\d{2}-\d{2}$/.test(String(state.viewDate || '')) ? state.viewDate : localDateKey();
        const planSlot = document.getElementById('create-meal-plan-slot');
        if (planSlot) planSlot.value = 'lunch';
        const addToPlan = document.getElementById('create-meal-add-to-plan');
        if (addToPlan) addToPlan.checked = false;
        const addToShift = document.getElementById('create-meal-add-to-shift');
        if (addToShift) addToShift.checked = false;
        renderMealIngredients();  // shows placeholder + hides totals
    }

    function closeCreateMeal() {
        if (barcodeScannerEmbedded) closeBarcodeScanner();
        document.getElementById('create-meal-modal').style.display = 'none';
    }

    let mealIngredientSearchToken = 0;
    let mealIngredientSearchTimer = null;

    function setupMealIngredientSearch() {
        const input = document.getElementById('meal-ingredient-search');
        if (!input) return;
        if (input.dataset.searchWired === 'true') return;
        input.dataset.searchWired = 'true';
        input.addEventListener('input', (e) => {
            clearTimeout(mealIngredientSearchTimer);
            const q = e.target.value.trim();
            const clearButton = document.getElementById('meal-search-clear');
            if (clearButton) clearButton.classList.toggle('hidden', q.length === 0);
            if (q.length < 2) {
                mealIngredientSearchToken += 1;
                const results = document.getElementById('meal-search-results');
                const loading = document.getElementById('meal-search-loading');
                const hint = document.getElementById('meal-search-hint');
                if (results) results.innerHTML = '';
                if (loading) loading.classList.add('hidden');
                if (hint) hint.textContent = q.length ? 'Type at least 2 characters' : 'Try "chicken breast" or "Hobnobs"';
                return;
            }
            mealIngredientSearchTimer = setTimeout(() => searchIngredient(q), 350);
        });
    }

    function clearMealIngredientSearch() {
        mealIngredientSearchToken += 1;
        clearTimeout(mealIngredientSearchTimer);
        const input = document.getElementById('meal-ingredient-search');
        const clearButton = document.getElementById('meal-search-clear');
        const results = document.getElementById('meal-search-results');
        const loading = document.getElementById('meal-search-loading');
        const hint = document.getElementById('meal-search-hint');
        if (input) input.value = '';
        if (clearButton) clearButton.classList.add('hidden');
        if (results) results.innerHTML = '';
        if (loading) loading.classList.add('hidden');
        if (hint) hint.textContent = 'Try "chicken breast" or "Hobnobs"';
    }

    function renderMealIngredientSearchResults(products) {
        const results = document.getElementById('meal-search-results');
        if (!results) return;
        results.innerHTML = products.map(product => {
            const food = normaliseOpenFoodFactsProduct(product, product && product.code);
            const ingredient = {
                name: food.name,
                cal: food.calories,
                protein: food.protein,
                carbs: food.carbs,
                fat: food.fat,
                fiber: food.fiber,
                sugar: food.sugar,
                brand: food.brand,
                image: food.image,
                barcode: food.barcode
            };
            return cardHtml({
                name: food.name,
                brand: food.brand || 'Open Food Facts',
                image: food.image,
                cals: food.calories,
                protein: food.protein,
                carbs: food.carbs,
                fat: food.fat,
                perLabel: 'per 100g',
                sourceBadge: sourceTag('off'),
                onClick: `addIngredient(${safeJsonForInline(ingredient)})`
            });
        }).join('');
        refreshIcons();
    }

    async function searchIngredient(query) {
        const cleanedQuery = String(query || '').trim();
        if (cleanedQuery.length < 2) return;
        const requestToken = ++mealIngredientSearchToken;
        const results = document.getElementById('meal-search-results');
        const loading = document.getElementById('meal-search-loading');
        const hint = document.getElementById('meal-search-hint');
        if (loading) loading.classList.remove('hidden');
        if (results) results.innerHTML = '';
        if (hint) hint.textContent = 'Searching Open Food Facts…';
        try {
            // Reuse the main food search route: Search-a-licious first, with the
            // UK legacy endpoint as its fallback, then apply the same ranking.
            const response = await searchOpenFoodFacts(cleanedQuery, 'all', 1);
            if (requestToken !== mealIngredientSearchToken) return;

            const ranked = (response.products || []).map(product => {
                let score = scoreRelevance(product.product_name, cleanedQuery);
                if (score <= 0) {
                    const haystack = ((product.product_name || '') + ' ' + (product.brands || '')).toLowerCase();
                    const words = cleanedQuery.toLowerCase().split(/\s+/).filter(Boolean);
                    if (words.length && words.every(word => haystack.includes(word))) score = 150;
                }
                const nutrients = product.nutriments || {};
                if (!nutrients['energy-kcal_100g'] && !nutrients['energy-kcal_serving']) score -= 300;
                if (!nutrients.proteins_100g && !nutrients.proteins_serving) score -= 100;
                return Object.assign({}, product, { _score: score });
            });

            const byName = new Map();
            ranked.forEach(product => {
                const key = String(product.product_name || '').toLowerCase().trim();
                if (!key) return;
                const previous = byName.get(key);
                if (!previous || (product._score || 0) > (previous._score || 0)) byName.set(key, product);
            });
            const matches = Array.from(byName.values())
                .filter(product => (product._score || 0) > 0)
                .sort((a, b) => (b._score || 0) - (a._score || 0))
                .slice(0, 20);

            if (matches.length) {
                renderMealIngredientSearchResults(matches);
                if (hint) hint.textContent = 'Tap a food, enter the grams, then keep building your meal';
            } else {
                if (results) results.innerHTML = emptyState('search-x', 'No ingredients found', 'Try a different food or scan its barcode.');
                if (hint) hint.textContent = 'Try another name or use the barcode scanner';
            }
        } catch (error) {
            if (requestToken !== mealIngredientSearchToken) return;
            console.warn('Ingredient search failed:', error);
            if (results) results.innerHTML = `<div class="text-center py-6"><p class="font-bold text-slate-600 mb-1">Couldn't reach Open Food Facts</p><p class="text-xs text-slate-400 mb-3">Check your connection, try again, or scan the barcode.</p><button type="button" onclick="retryMealIngredientSearch()" class="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs">Try Again</button></div>`;
            if (hint) hint.textContent = 'Ingredient search is temporarily unavailable';
        } finally {
            if (requestToken === mealIngredientSearchToken && loading) loading.classList.add('hidden');
            refreshIcons();
        }
    }

    function retryMealIngredientSearch() {
        const input = document.getElementById('meal-ingredient-search');
        const query = input ? input.value.trim() : '';
        if (query.length >= 2) searchIngredient(query);
    }

    function addIngredient(item) {
        if (!item || typeof item !== 'object') return;
        const itemName = String(item.name || 'Ingredient').slice(0, 160);
        const grams = parseFloat(prompt(`How many grams of "${itemName}"?`, '100'));
        if (!grams || grams <= 0) return;
        const safeGrams = Math.min(grams, 100000);
        const per100 = {
            calories: nutritionNumber(item.cal != null ? item.cal : item.calories),
            protein: nutritionNumber(item.protein),
            carbs: nutritionNumber(item.carbs),
            fat: nutritionNumber(item.fat),
            fiber: nutritionNumber(item.fiber),
            sugar: nutritionNumber(item.sugar)
        };
        mealIngredients.push({
            name: itemName,
            brand: String(item.brand || '').slice(0, 160),
            image: safeImageUrl(item.image || ''),
            barcode: normaliseBarcode(item.barcode),
            grams: safeGrams,
            // Keep per-100g base so the weight can be edited later
            calPer100: per100.calories,
            proteinPer100: per100.protein,
            carbsPer100: per100.carbs,
            fatPer100: per100.fat,
            fiberPer100: per100.fiber,
            sugarPer100: per100.sugar,
            calories: per100.calories * (safeGrams / 100),
            protein: per100.protein * (safeGrams / 100),
            carbs: per100.carbs * (safeGrams / 100),
            fat: per100.fat * (safeGrams / 100),
            fiber: per100.fiber * (safeGrams / 100),
            sugar: per100.sugar * (safeGrams / 100)
        });
        renderMealIngredients();
        clearMealIngredientSearch();
    }

    // Change an ingredient's weight inline → recalculate nutrition + totals.
    function updateIngredientGrams(idx, value) {
        const ing = mealIngredients[idx];
        if (!ing) return;
        const previousGrams = Number(ing.grams) || 100;
        const parsedGrams = parseFloat(value);
        const nextGrams = Number.isFinite(parsedGrams) && parsedGrams >= 0 ? Math.min(parsedGrams, 100000) : 0;
        const nutrients = [
            ['calories', 'calPer100'], ['protein', 'proteinPer100'],
            ['carbs', 'carbsPer100'], ['fat', 'fatPer100'],
            ['fiber', 'fiberPer100'], ['sugar', 'sugarPer100']
        ];
        nutrients.forEach(([field, baseField]) => {
            const storedBase = toFiniteNumber(ing[baseField]);
            const per100 = storedBase !== null
                ? nutritionNumber(storedBase)
                : nutritionNumber((Number(ing[field]) || 0) / (previousGrams / 100));
            ing[baseField] = per100;
            ing[field] = per100 * (nextGrams / 100);
        });
        ing.grams = nextGrams;
        // Update just this row's readout + the totals (no full re-render, so the
        // input keeps focus while typing)
        const rowInfo = document.getElementById('ing-info-' + idx);
        if (rowInfo) rowInfo.textContent = `${Math.round(ing.calories)} kcal • ${ing.protein.toFixed(1)}g protein`;
        updateMealTotals();
    }

    function renderMealIngredients() {
        const list = document.getElementById('meal-ingredients-list');
        if (!list) return;
        if (mealIngredients.length === 0) {
            list.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-2">No ingredients added yet</p>';
            updateMealTotals();
            return;
        }
        list.innerHTML = mealIngredients.map((ing, i) => `
            <div class="bg-slate-50 p-3 rounded-xl">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold truncate">${escapeHtml(ing.name)}</p>
                        ${ing.barcode ? `<p class="text-[10px] text-emerald-700 mt-0.5">Barcode <span class="font-mono font-black">${escapeHtml(ing.barcode)}</span></p>` : ''}
                    </div>
                    <button onclick="removeIngredient(${i})" class="w-7 h-7 bg-red-50 text-red-500 rounded-lg text-sm flex-shrink-0 ml-2" aria-label="Remove ${escapeHtml(ing.name || 'ingredient')}">×</button>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex items-center bg-white rounded-lg border border-slate-200 px-2">
                        <input type="number" min="0" max="100000" step="1" value="${Number(ing.grams) || 0}" oninput="updateIngredientGrams(${i}, this.value)" class="w-16 py-1.5 text-sm font-bold outline-none text-center" aria-label="Grams of ${escapeHtml(ing.name || 'ingredient')}">
                        <span class="text-xs text-slate-400 font-bold">g</span>
                    </div>
                    <p id="ing-info-${i}" class="text-[11px] text-slate-500">${Math.round(Number(ing.calories) || 0)} kcal • ${(Number(ing.protein) || 0).toFixed(1)}g protein</p>
                </div>
            </div>
        `).join('');
        updateMealTotals();
    }

    // Recalculate and display the live meal totals
    function updateMealTotals() {
        const totalsBox = document.getElementById('meal-totals');
        if (!totalsBox) return;
        if (mealIngredients.length === 0) {
            totalsBox.classList.add('hidden');
            return;
        }
        totalsBox.classList.remove('hidden');
        const totalCal = mealIngredients.reduce((s, i) => s + (i.calories || 0), 0);
        const totalProt = mealIngredients.reduce((s, i) => s + (i.protein || 0), 0);
        const totalWeight = mealIngredients.reduce((s, i) => s + (i.grams || 0), 0);
        document.getElementById('meal-total-cals').textContent = Math.round(totalCal);
        document.getElementById('meal-total-protein').textContent = totalProt.toFixed(1);
        document.getElementById('meal-total-weight').textContent =
            `${mealIngredients.length} ingredient${mealIngredients.length === 1 ? '' : 's'} • ${Math.round(totalWeight)}g total`;
    }

    function removeIngredient(idx) {
        mealIngredients.splice(idx, 1);
        renderMealIngredients();
    }

    function addCreatedMealToDiary(mealId, dateKey, mealType, options) {
        const meal = (state.createdMeals || []).find(item => String(item.id) === String(mealId));
        const validSlots = ['breakfast', 'lunch', 'dinner', 'snack'];
        const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))
            ? String(dateKey)
            : (/^\d{4}-\d{2}-\d{2}$/.test(String(state.viewDate || '')) ? String(state.viewDate) : '');
        const targetSlot = validSlots.includes(mealType) ? mealType : (validSlots.includes(meal && meal.defaultMealType) ? meal.defaultMealType : 'snack');
        if (!meal || !targetDate) {
            showToast('Created meal unavailable');
            return false;
        }

        // The chosen plan date becomes the active diary date, so the nutrition
        // history and the visible diary stay aligned with the serving just added.
        state.viewDate = targetDate;
        ['nutrition-date-picker', 'shift-nutrition-date-picker'].forEach(id => {
            const picker = document.getElementById(id);
            if (picker) picker.value = targetDate;
        });
        const dateWarning = document.getElementById('nutrition-date-warning');
        if (dateWarning) dateWarning.classList.toggle('hidden', targetDate === localDateKey());

        const calories = Number(meal.calories) || 0;
        const protein = Number(meal.protein) || 0;
        const carbs = Number(meal.carbs) || 0;
        const fat = Number(meal.fat) || 0;
        const fiber = Number(meal.fiber) || 0;
        const sugar = Number(meal.sugar) || 0;
        const base = { calories, protein, carbs, fat, fiber, sugar, isCustom: true, serving: '1 portion' };
        const entry = {
            id: Date.now() + Math.random(), date: targetDate, type: targetSlot, mealType: targetSlot,
            name: meal.name || 'Created meal', image: null, calories, protein, carbs, fat, fiber, sugar,
            amount: 1, amountType: 'portion', base, source: 'created-meal', createdMealId: meal.id,
            createdAt: new Date().toISOString()
        };
        if (!Array.isArray(state.dailyMeals)) state.dailyMeals = [];
        state.dailyMeals.push(entry);
        saveState();
        autoSaveNutrition();
        renderDiary();
        renderDashboard();
        if (!(options && options.silent)) {
            const label = new Date(targetDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            showToast(`${meal.name || 'Created meal'} added to ${label} · ${targetSlot}`);
        }
        return true;
    }

    function saveMeal() {
        const name = document.getElementById('meal-name-input').value.trim();
        if (!name) { showToast('Enter a meal name'); return; }
        if (mealIngredients.length === 0) { showToast('Add at least one ingredient'); return; }

        const totalCal = mealIngredients.reduce((s, i) => s + i.calories, 0);
        const totalProt = mealIngredients.reduce((s, i) => s + i.protein, 0);
        const totalCarbs = mealIngredients.reduce((s, i) => s + (i.carbs || 0), 0);
        const totalFat = mealIngredients.reduce((s, i) => s + (i.fat || 0), 0);
        const totalFiber = mealIngredients.reduce((s, i) => s + (i.fiber || 0), 0);
        const totalSugar = mealIngredients.reduce((s, i) => s + (i.sugar || 0), 0);
        const addToPlan = !!(document.getElementById('create-meal-add-to-plan') || {}).checked;
        const addToShiftIdeas = !!(document.getElementById('create-meal-add-to-shift') || {}).checked;
        const planDate = (document.getElementById('create-meal-plan-date') || {}).value || state.viewDate;
        const validSlots = ['breakfast', 'lunch', 'dinner', 'snack'];
        const planSlot = validSlots.includes((document.getElementById('create-meal-plan-slot') || {}).value)
            ? document.getElementById('create-meal-plan-slot').value
            : 'lunch';
        if (addToPlan && !/^\d{4}-\d{2}-\d{2}$/.test(String(planDate || ''))) {
            showToast('Choose a valid plan date');
            return;
        }

        const createdMeal = {
            id: Date.now() + Math.random(),
            name,
            calories: totalCal,
            protein: totalProt,
            carbs: totalCarbs,
            fat: totalFat,
            fiber: totalFiber,
            sugar: totalSugar,
            ingredients: mealIngredients.map(item => Object.assign({}, item)),
            defaultMealType: planSlot,
            plannedDate: addToPlan ? String(planDate) : null,
            plannedMealType: addToPlan ? planSlot : null,
            showInShiftFoodIdeas: addToShiftIdeas,
            createdAt: new Date().toISOString()
        };
        if (!Array.isArray(state.createdMeals)) state.createdMeals = [];
        state.createdMeals.unshift(createdMeal);
        if (addToPlan) addCreatedMealToDiary(createdMeal.id, planDate, planSlot, { silent: true });
        else saveState();
        closeCreateMeal();
        renderCreatedMeals();
        const planCopy = addToPlan ? ` and added to ${planDate} ${planSlot}` : '';
        const shiftCopy = addToShiftIdeas ? ' · Shift Food Ideas enabled' : '';
        showToast(`Meal saved! 🍽️${planCopy}${shiftCopy}`);
    }

    // ==========================================================================
    // NUTRITION HISTORY DISPLAY
    // ==========================================================================

    function renderNutritionHistory() {
        const container = document.getElementById('nutrition-history-display');
        if (!container) return;

        if (!state.nutritionHistory || state.nutritionHistory.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-4">No nutrition history yet</p>';
            return;
        }

        const recent = state.nutritionHistory.slice(0, 7);
        container.innerHTML = recent.map(entry => {
            const date = new Date(entry.date);
            const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            return `
                <div class="bg-slate-50 p-4 rounded-2xl">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <p class="font-bold text-sm">${dateLabel}</p>
                            <p class="text-xs text-slate-400">${(entry.meals || []).length} meals</p>
                        </div>
                        <div class="text-right">
                            <p class="font-black text-indigo-600">${Math.round(entry.calories)} kcal</p>
                            <p class="text-[10px] text-slate-500">${Math.round(entry.protein)}g protein</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ==========================================================================
    // SAVE NUTRITION MODAL
    // ==========================================================================

    function openSaveNutritionModal() {
        const today = state.viewDate || localDateKey();
        document.getElementById('save-nutrition-date').value = today;

        const meals = state.dailyMeals.filter(m => m.date === today);
        const cals = meals.reduce((s, m) => s + (m.calories || 0), 0);
        const prot = meals.reduce((s, m) => s + (m.protein || 0), 0);

        document.getElementById('save-cal-preview').textContent = Math.round(cals);
        document.getElementById('save-protein-preview').textContent = Math.round(prot);
        document.getElementById('save-meals-preview').textContent = meals.length;

        document.getElementById('save-nutrition-modal').style.display = 'flex';
    }

    function closeSaveNutritionModal() {
        document.getElementById('save-nutrition-modal').style.display = 'none';
    }

    function confirmSaveNutrition() {
        const dateToSave = document.getElementById('save-nutrition-date').value;
        if (!dateToSave) { showToast('Pick a date'); return; }

        const meals = state.dailyMeals.filter(m => m.date === state.viewDate);
        if (meals.length === 0) { showToast('No meals to save'); closeSaveNutritionModal(); return; }

        if (dateToSave !== state.viewDate) {
            meals.forEach(m => m.date = dateToSave);
        }

        const totalCals = meals.reduce((s, m) => s + (m.calories || 0), 0);
        const totalProtein = meals.reduce((s, m) => s + (m.protein || 0), 0);
        const totalCarbs = meals.reduce((s, m) => s + (m.carbs || 0), 0);
        const totalFat = meals.reduce((s, m) => s + (m.fat || 0), 0);
        const totalFiber = meals.reduce((s, m) => s + (m.fiber || 0), 0);

        state.nutritionHistory = state.nutritionHistory.filter(h => h.date !== dateToSave);
        state.nutritionHistory.unshift({
            date: dateToSave,
            calories: totalCals,
            protein: totalProtein,
            carbs: totalCarbs,
            fat: totalFat,
            fiber: totalFiber,
            meals,
            savedAt: new Date().toISOString()
        });

        saveState();
        closeSaveNutritionModal();
        renderNutritionHistory();
        showToast('Saved to history! ✓');
    }

    // ==========================================================================
    // COPY FROM PREVIOUS DAY
    // ==========================================================================

    function openCopyPreviousDay() {
        const sel = document.getElementById('copy-date-select');
        if (!sel) return;

        const datesWithMeals = [...new Set((state.nutritionHistory || []).map(h => h.date))].sort().reverse();

        if (datesWithMeals.length === 0) {
            showToast('No previous nutrition history found');
            return;
        }

        sel.innerHTML = '<option value="">Choose a date...</option>' + datesWithMeals.map(d => {
            const date = new Date(d);
            const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            return `<option value="${d}">${label}</option>`;
        }).join('');

        document.getElementById('previous-meals-list').innerHTML = '';
        selectedPreviousMeals = [];
        document.getElementById('copy-previous-day-modal').style.display = 'flex';
    }

    function closeCopyPreviousDay() {
        document.getElementById('copy-previous-day-modal').style.display = 'none';
        selectedPreviousMeals = [];
        // Reset the search box
        const input = document.getElementById('copy-search-input');
        if (input) input.value = '';
        const results = document.getElementById('past-food-results');
        if (results) results.innerHTML = '';
        const clearBtn = document.getElementById('copy-search-clear');
        if (clearBtn) clearBtn.classList.add('hidden');
    }

    /**
     * Build a deduplicated list of every food ever logged, newest first.
     * Pulls from nutritionHistory (past days) + today's dailyMeals.
     * Deduped by name (case-insensitive) so repeated foods appear once.
     */
    function getAllLoggedFoods() {
        const all = [];
        (state.dailyMeals || []).forEach(m => all.push({ meal: m, when: m.id || Date.now() }));
        (state.nutritionHistory || []).forEach(day => {
            (day.meals || []).forEach(m => all.push({ meal: m, when: day.date }));
        });
        all.sort((a, b) => String(b.when).localeCompare(String(a.when)));

        const seen = new Set();
        const out = [];
        for (const item of all) {
            const m = item.meal;
            if (!m || !m.name) continue;
            const key = m.name.toLowerCase().trim();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(m);
        }
        return out;
    }

    /**
     * Search the user's previously-logged foods by name and show matches with
     * checkboxes. Selecting one adds it to the same selectedPreviousMeals list
     * that "Copy to Today" reads from.
     */
    function searchPastFoods(query) {
        const results = document.getElementById('past-food-results');
        const clearBtn = document.getElementById('copy-search-clear');
        if (!results) return;

        const q = query.trim().toLowerCase();
        if (clearBtn) clearBtn.classList.toggle('hidden', q.length === 0);

        if (q.length === 0) {
            results.innerHTML = '';
            return;
        }

        const matches = getAllLoggedFoods().filter(m => m.name.toLowerCase().includes(q)).slice(0, 25);

        if (matches.length === 0) {
            results.innerHTML = '<p class="text-center text-slate-400 italic py-3 text-sm">No matching foods in your history</p>';
            return;
        }

        results.innerHTML = matches.map((m, i) => {
            // Is this food already selected? (match by name since these are deduped)
            const isSel = selectedPreviousMeals.some(s => (s.name || '').toLowerCase() === m.name.toLowerCase());
            const safe = safeJsonForInline(m);
            const image = safeImageUrl(m.image);
            return `
                <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                    <input type="checkbox" ${isSel ? 'checked' : ''} onchange='togglePastFood(this, ${safe})' class="w-5 h-5 accent-indigo-600 flex-shrink-0">
                    <div class="w-10 h-10 bg-white rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                        ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" class="w-full h-full object-contain" onerror="this.style.display='none'">` : '<i data-lucide="utensils" class="w-5 h-5 text-slate-300"></i>'}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm truncate">${escapeHtml(m.name)}</p>
                        <p class="text-xs text-slate-400">${Math.round(Number(m.calories) || 0)} kcal · ${(Number(m.protein) || 0).toFixed(0)}g protein</p>
                    </div>
                </label>`;
        }).join('');
        refreshIcons();
    }

    function togglePastFood(checkbox, meal) {
        if (checkbox.checked) {
            // Avoid duplicate entries by name
            if (!selectedPreviousMeals.some(s => (s.name || '').toLowerCase() === (meal.name || '').toLowerCase())) {
                // Give it a fresh id so it doesn't collide with an existing logged meal
                selectedPreviousMeals.push({ ...meal, id: Date.now() + Math.floor(Math.random() * 1000) });
            }
            showToast('Added — tap "Copy to Today" to confirm');
        } else {
            selectedPreviousMeals = selectedPreviousMeals.filter(s => (s.name || '').toLowerCase() !== (meal.name || '').toLowerCase());
        }
    }

    function clearPastFoodSearch() {
        const input = document.getElementById('copy-search-input');
        if (input) input.value = '';
        const clearBtn = document.getElementById('copy-search-clear');
        if (clearBtn) clearBtn.classList.add('hidden');
        const results = document.getElementById('past-food-results');
        if (results) results.innerHTML = '';
    }

    function loadPreviousDayMeals() {
        const date = document.getElementById('copy-date-select').value;
        if (!date) return;

        const entry = (state.nutritionHistory || []).find(h => h.date === date);
        const meals = entry ? entry.meals : [];

        const container = document.getElementById('previous-meals-list');
        if (meals.length === 0) {
            container.innerHTML = '<p class="text-center text-slate-400 italic py-4">No meals logged on this date</p>';
            return;
        }

        container.innerHTML = meals.map((m, i) => `
            <label class="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                <input type="checkbox" data-idx="${i}" data-meal-id="${escapeHtml(m.id)}" onchange="togglePreviousMeal(this, ${i}, '${escapeJsString(date)}')" class="w-5 h-5 accent-indigo-600">
                <div class="flex-1">
                    <p class="font-bold text-sm">${escapeHtml(m.name)}</p>
                    <p class="text-xs text-slate-400">${escapeHtml(m.mealType)} • ${Math.round(Number(m.calories) || 0)} kcal</p>
                </div>
                <button onclick="editPreviousMealItem(${i}, '${escapeJsString(date)}'); event.preventDefault();" class="text-xs text-indigo-600 font-bold">Edit</button>
            </label>
        `).join('');
    }

    function togglePreviousMeal(checkbox, idx, date) {
        const entry = (state.nutritionHistory || []).find(h => h.date === date);
        if (!entry) return;
        const meal = entry.meals[idx];
        if (checkbox.checked) {
            selectedPreviousMeals.push({ ...meal });
        } else {
            selectedPreviousMeals = selectedPreviousMeals.filter(m => m.id !== meal.id);
        }
    }

    const COPIED_MEAL_NUTRIENT_KEYS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodiumMg', 'cholesterol'];

    function copiedMealNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? number : 0;
    }

    function copiedMealServingLabel(value) {
        const label = String(value || '').trim();
        return !label || /^(?:1\s*)?portion$/i.test(label) ? '1 serving' : label;
    }

    function copiedMealServingGrams(meal) {
        return copiedMealNumber(meal && meal.servingGrams) || 100;
    }

    function copiedMealBaseValue(source, key) {
        if (key === 'sodiumMg') {
            if (source && source.sodiumMg !== undefined) return copiedMealNumber(source.sodiumMg);
            return copiedMealNumber(source && source.sodium) * 1000;
        }
        return copiedMealNumber(source && source[key]);
    }

    function copiedMealNutritionBases(meal) {
        meal = meal || {};
        const servingGrams = copiedMealServingGrams(meal);
        const originalAmount = copiedMealNumber(meal.amount) || (meal.amountType === 'grams' ? servingGrams : 1);
        const originalType = meal.amountType === 'grams' ? 'grams' : 'portion';
        const savedBase = meal.base && typeof meal.base === 'object' ? meal.base : null;
        const baseIsServing = savedBase ? savedBase.isCustom !== false : originalType !== 'grams';
        const perServing = {};
        const per100g = {};

        COPIED_MEAL_NUTRIENT_KEYS.forEach(key => {
            if (savedBase) {
                const value = copiedMealBaseValue(savedBase, key);
                if (baseIsServing) {
                    perServing[key] = value;
                    per100g[key] = value * 100 / servingGrams;
                } else {
                    per100g[key] = value;
                    perServing[key] = value * servingGrams / 100;
                }
                return;
            }

            const total = copiedMealBaseValue(meal, key);
            if (originalType === 'grams') {
                per100g[key] = total * 100 / originalAmount;
                perServing[key] = per100g[key] * servingGrams / 100;
            } else {
                perServing[key] = total / originalAmount;
                per100g[key] = perServing[key] * 100 / servingGrams;
            }
        });

        return { servingGrams, perServing, per100g };
    }

    function copiedMealNutritionForAmount(meal, amountType, amount) {
        const bases = copiedMealNutritionBases(meal);
        const source = amountType === 'grams' ? bases.per100g : bases.perServing;
        const multiplier = amountType === 'grams' ? amount / 100 : amount;
        const totals = {};
        COPIED_MEAL_NUTRIENT_KEYS.forEach(key => {
            totals[key] = copiedMealNumber(source[key]) * multiplier;
        });
        return { bases, source, totals };
    }

    function copiedMealEditAmount() {
        const inputId = editAmountType === 'grams' ? 'edit-meal-custom-weight' : 'edit-meal-amount';
        const input = document.getElementById(inputId);
        const amount = Number(input && input.value);
        return Number.isFinite(amount) && amount > 0 ? amount : 1;
    }

    function editPreviousMealItem(idx, date) {
        const entry = (state.nutritionHistory || []).find(h => h.date === date);
        if (!entry) return;
        currentEditingMeal = { ...entry.meals[idx] };

        const originalType = currentEditingMeal.amountType === 'grams' ? 'grams' : 'portion';
        const bases = copiedMealNutritionBases(currentEditingMeal);
        const originalAmount = copiedMealNumber(currentEditingMeal.amount) || (originalType === 'grams' ? bases.servingGrams : 1);
        const servingAmount = originalType === 'grams' ? originalAmount / bases.servingGrams : originalAmount;
        const customWeight = originalType === 'grams' ? originalAmount : originalAmount * bases.servingGrams;
        const servingLabel = copiedMealServingLabel(currentEditingMeal.servingLabel || (currentEditingMeal.base && currentEditingMeal.base.serving));

        document.getElementById('edit-meal-name').textContent = currentEditingMeal.name;
        document.getElementById('edit-meal-image').src = currentEditingMeal.image || 'https://via.placeholder.com/100';
        document.getElementById('edit-meal-original').textContent = `Was: ${Math.round(originalAmount * 100) / 100} ${originalType === 'grams' ? 'g' : (originalAmount === 1 ? 'serving' : 'servings')} (${Math.round(currentEditingMeal.calories)} kcal)`;
        document.getElementById('edit-meal-amount').value = Math.round(servingAmount * 100) / 100;
        document.getElementById('edit-meal-custom-weight').value = Math.round(customWeight * 10) / 10;
        const servingHelp = document.getElementById('edit-meal-serving-help');
        if (servingHelp) servingHelp.textContent = `1 serving = ${servingLabel} (${Math.round(bases.servingGrams * 10) / 10}g).`;
        editAmountType = originalType;
        setEditAmountType(originalType);
        document.getElementById('edit-meal-type').value = currentEditingMeal.mealType || currentEditingMeal.type || 'lunch';
        updateEditPreview();
        document.getElementById('edit-copied-meal-modal').style.display = 'flex';
    }

    function closeEditCopiedMeal() {
        document.getElementById('edit-copied-meal-modal').style.display = 'none';
        currentEditingMeal = null;
    }

    function setEditAmountType(type) {
        const nextType = type === 'grams' ? 'grams' : 'portion';
        const previousType = editAmountType;
        const p = document.getElementById('edit-amount-type-portion');
        const g = document.getElementById('edit-amount-type-grams');
        const servingField = document.getElementById('edit-meal-serving-field');
        const customWeightField = document.getElementById('edit-meal-custom-weight-field');
        const servingInput = document.getElementById('edit-meal-amount');
        const weightInput = document.getElementById('edit-meal-custom-weight');
        const servingGrams = copiedMealServingGrams(currentEditingMeal);

        if (previousType !== nextType) {
            if (nextType === 'grams' && servingInput && weightInput) {
                const servings = Number(servingInput.value);
                if (Number.isFinite(servings) && servings > 0) weightInput.value = Math.round(servings * servingGrams * 10) / 10;
            } else if (nextType === 'portion' && servingInput && weightInput) {
                const grams = Number(weightInput.value);
                if (Number.isFinite(grams) && grams > 0) servingInput.value = Math.round((grams / servingGrams) * 100) / 100;
            }
        }

        editAmountType = nextType;
        if (nextType === 'portion') {
            p.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase bg-white shadow text-emerald-600';
            g.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase text-slate-400';
            if (servingField) servingField.classList.remove('hidden');
            if (customWeightField) customWeightField.classList.add('hidden');
        } else {
            g.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase bg-white shadow text-emerald-600';
            p.className = 'flex-1 py-3 rounded-xl text-xs font-black uppercase text-slate-400';
            if (customWeightField) customWeightField.classList.remove('hidden');
            if (servingField) servingField.classList.add('hidden');
        }
        updateEditPreview();
    }

    function updateEditPreview() {
        if (!currentEditingMeal) return;
        const amount = copiedMealEditAmount();
        const calculated = copiedMealNutritionForAmount(currentEditingMeal, editAmountType, amount);
        document.getElementById('edit-total-cals').textContent = Math.round(calculated.totals.calories);
        document.getElementById('edit-total-protein').textContent = calculated.totals.protein.toFixed(1) + 'g';
    }

    function saveEditedMeal() {
        if (!currentEditingMeal) return;
        const amount = copiedMealEditAmount();
        const calculated = copiedMealNutritionForAmount(currentEditingMeal, editAmountType, amount);
        const servingLabel = copiedMealServingLabel(currentEditingMeal.servingLabel || (currentEditingMeal.base && currentEditingMeal.base.serving));
        const base = {
            calories: calculated.source.calories,
            protein: calculated.source.protein,
            carbs: calculated.source.carbs,
            fat: calculated.source.fat,
            fiber: calculated.source.fiber,
            sugar: calculated.source.sugar,
            satFat: calculated.source.satFat,
            sodiumMg: calculated.source.sodiumMg,
            cholesterol: calculated.source.cholesterol,
            isCustom: editAmountType !== 'grams',
            serving: editAmountType === 'grams' ? '100g' : servingLabel
        };
        const mealType = document.getElementById('edit-meal-type').value;

        const newMeal = {
            ...currentEditingMeal,
            id: Date.now() + Math.random(),
            date: state.viewDate,
            type: mealType,
            mealType,
            amount,
            amountType: editAmountType,
            servingGrams: calculated.bases.servingGrams,
            servingLabel,
            base,
            calories: calculated.totals.calories,
            protein: calculated.totals.protein,
            carbs: calculated.totals.carbs,
            fat: calculated.totals.fat,
            fiber: calculated.totals.fiber,
            sugar: calculated.totals.sugar,
            satFat: calculated.totals.satFat,
            sodiumMg: calculated.totals.sodiumMg,
            sodium: calculated.totals.sodiumMg / 1000,
            cholesterol: calculated.totals.cholesterol
        };

        state.dailyMeals.push(newMeal);
        saveState();
        autoSaveNutrition();
        closeEditCopiedMeal();
        renderDiary();
        renderDashboard();
        showToast('Added to today!');
    }

    function copySelectedMeals() {
        if (selectedPreviousMeals.length === 0) { showToast('Pick at least one meal'); return; }
        selectedPreviousMeals.forEach(m => {
            state.dailyMeals.push({
                ...m,
                id: Date.now() + Math.random(),
                date: state.viewDate
            });
        });
        saveState();
        autoSaveNutrition();
        closeCopyPreviousDay();
        renderDiary();
        renderDashboard();
        showToast(`Copied ${selectedPreviousMeals.length} meals to today!`);
    }

    // ==========================================================================
    // MIDNIGHT AUTO-SAVE WATCHDOG
    // ==========================================================================

    function rollVfitToCurrentDayIfNeeded() {
        const currentDate = localDateKey();
        if (!lastCheckDate) {
            lastCheckDate = currentDate;
            return false;
        }
        if (currentDate === lastCheckDate) return false;

        // Save whichever nutrition date was being edited before moving every
        // active page to the new device-local day. Historical records and an
        // unfinished workout's original date remain intact.
        saveDailyNutrition();
        lastCheckDate = currentDate;
        resetActiveDatesToToday({ preserveActiveWorkout: true });
        saveState();
        renderDiary();
        renderShiftWorker();
        renderDashboard();
        renderMetricsStatusLines();
        renderMetricsHistory();
        return true;
    }

    function setupMidnightCheck() {
        if (midnightCheckInterval) clearInterval(midnightCheckInterval);
        lastCheckDate = localDateKey();
        midnightCheckInterval = setInterval(() => {
            rollVfitToCurrentDayIfNeeded();
        }, 60000);
    }
