const fs = require('node:fs');
const path = require('node:path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStaticPath = require('ffmpeg-static');

const MAX_INPUT_SIZE_MB = 200;
const SUPPORTED_INPUT_EXTENSIONS = new Set(['.mp3', '.wav', '.aif', '.aiff', '.m4a', '.ogg', '.flac', '.aac']);
const SUPPORTED_OUTPUT_FORMATS = new Set(['mp3', 'wav', 'aiff', 'm4a', 'ogg', 'flac']);
const BIT_DEPTH_COMPATIBLE_FORMATS = new Set(['wav', 'aiff', 'flac']);
const SUPPORTED_SAMPLE_RATES = new Set([44100, 48000, 96000]);
const ABORT_ERROR_CODE = 'ABORT_ERR';
const DITHER_METHOD_ALIASES = {
    none: null,
    tpdf: 'triangular',
    triangular: 'triangular',
    shibata: 'shibata',
    lipshitz: 'lipshitz',
};

const activeFfmpegCommands = new Set();

function resolveRuntimeFfmpegPaths() {
    const ffmpegBinaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const ffprobeBinaryName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
    const bundledFfmpegPath = process.resourcesPath
        ? path.join(process.resourcesPath, 'ffmpeg-bin', ffmpegBinaryName)
        : null;
    const normalizedStaticPath = ffmpegStaticPath && typeof ffmpegStaticPath === 'string'
        ? path.resolve(ffmpegStaticPath)
        : null;

    const ffmpegCandidates = [bundledFfmpegPath, normalizedStaticPath].filter(Boolean);
    const resolvedFfmpegPath = ffmpegCandidates.find((candidatePath) => fs.existsSync(candidatePath)) || null;

    if (!resolvedFfmpegPath) {
        return {
            ffmpegPath: null,
            ffprobePath: null,
        };
    }

    const candidateProbePath = path.join(path.dirname(resolvedFfmpegPath), ffprobeBinaryName);
    return {
        ffmpegPath: resolvedFfmpegPath,
        ffprobePath: fs.existsSync(candidateProbePath) ? candidateProbePath : null,
    };
}

const runtimeFfmpegPaths = resolveRuntimeFfmpegPaths();
const ffmpegPath = runtimeFfmpegPaths.ffmpegPath;
const ffprobePath = runtimeFfmpegPaths.ffprobePath;

if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    if (ffprobePath) {
        ffmpeg.setFfprobePath(ffprobePath);
    }
}

function normalizePath(filePath) {
    if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new Error('Path must be a non-empty string.');
    }
    return path.resolve(filePath);
}

function createAbortError(message = 'Conversion canceled.') {
    const error = new Error(message);
    error.code = ABORT_ERROR_CODE;
    return error;
}

function isAbortError(error) {
    return Boolean(error && (error.code === ABORT_ERROR_CODE || /canceled|cancelled/i.test(String(error.message || ''))));
}

function trackFfmpegCommand(command) {
    activeFfmpegCommands.add(command);
    return () => activeFfmpegCommands.delete(command);
}

function killCommand(command) {
    if (!command || typeof command.kill !== 'function') {
        return false;
    }

    try {
        command.__copilotCanceled = true;
        command.kill('SIGKILL');
        return true;
    } catch {
        return false;
    }
}

function cancelAllConversions() {
    let canceledCount = 0;
    for (const command of Array.from(activeFfmpegCommands)) {
        if (killCommand(command)) {
            canceledCount += 1;
        }
    }
    activeFfmpegCommands.clear();
    return canceledCount;
}

function validateInputPath(inputPath) {
    const normalizedInput = normalizePath(inputPath);

    const inputExt = path.extname(normalizedInput).toLowerCase();

    if (!SUPPORTED_INPUT_EXTENSIONS.has(inputExt)) {
        throw new Error(`Unsupported input format: ${inputExt}`);
    }

    const stat = fs.statSync(normalizedInput, { throwIfNoEntry: false });
    if (!stat || !stat.isFile()) {
        throw new Error('Input file not found.');
    }

    const maxBytes = MAX_INPUT_SIZE_MB * 1024 * 1024;
    if (stat.size > maxBytes) {
        throw new Error(`Input file exceeds ${MAX_INPUT_SIZE_MB}MB limit.`);
    }

    return normalizedInput;
}

function normalizeTargetFormat(targetFormat) {
    if (typeof targetFormat !== 'string' || !targetFormat.trim()) {
        throw new Error('Target format must be a non-empty string.');
    }

    const normalized = targetFormat.trim().toLowerCase().replace(/^\./, '');
    if (!SUPPORTED_OUTPUT_FORMATS.has(normalized)) {
        throw new Error(`Unsupported output format: ${targetFormat}`);
    }
    return normalized;
}

function buildOutputPath(inputPath, targetFormat, outputDirectory) {
    const dir = outputDirectory ? normalizePath(outputDirectory) : path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const extension = `.${targetFormat}`;
    const directCandidate = path.join(dir, `${baseName}${extension}`);

    if (directCandidate.toLowerCase() !== inputPath.toLowerCase()) {
        return directCandidate;
    }

    return path.join(dir, `${baseName}_converted${extension}`);
}

function getBitDepthFromSampleFormat(sampleFormat) {
    if (!sampleFormat || typeof sampleFormat !== 'string') {
        return null;
    }
    if (sampleFormat.includes('s16')) {
        return 16;
    }
    if (sampleFormat.includes('s24')) {
        return 24;
    }
    if (sampleFormat.includes('s32')) {
        return 32;
    }
    return null;
}

function probeAudioBitDepth(inputPath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(inputPath, (error, metadata) => {
            if (error || !metadata) {
                resolve(null);
                return;
            }

            const audioStream = metadata.streams?.find((stream) => stream.codec_type === 'audio') ?? metadata.streams?.[0];
            if (!audioStream) {
                resolve(null);
                return;
            }

            const bitsPerSample = Number.parseInt(audioStream.bits_per_sample, 10);
            if (Number.isFinite(bitsPerSample) && bitsPerSample > 0) {
                resolve(bitsPerSample);
                return;
            }

            const bitsPerRawSample = Number.parseInt(audioStream.bits_per_raw_sample, 10);
            if (Number.isFinite(bitsPerRawSample) && bitsPerRawSample > 0) {
                resolve(bitsPerRawSample);
                return;
            }

            resolve(getBitDepthFromSampleFormat(audioStream.sample_fmt));
        });
    });
}

function mapBitDepthOptions(targetFormat, bitDepth) {
    if (!Number.isFinite(bitDepth) || !BIT_DEPTH_COMPATIBLE_FORMATS.has(targetFormat)) {
        return [];
    }

    if (targetFormat === 'wav') {
        if (bitDepth === 16) {
            return ['-c:a', 'pcm_s16le'];
        }
        if (bitDepth === 24) {
            return ['-c:a', 'pcm_s24le'];
        }
        if (bitDepth === 32) {
            return ['-c:a', 'pcm_s32le'];
        }
        return [];
    }

    if (targetFormat === 'aiff') {
        if (bitDepth === 16) {
            return ['-c:a', 'pcm_s16be'];
        }
        if (bitDepth === 24) {
            return ['-c:a', 'pcm_s24be'];
        }
        return [];
    }

    if (targetFormat === 'flac') {
        const options = ['-c:a', 'flac'];
        if (bitDepth === 16) {
            return [...options, '-sample_fmt', 's16'];
        }
        if (bitDepth === 24) {
            return [...options, '-sample_fmt', 's32'];
        }
        return options;
    }

    return [];
}

function normalizeBitDepth(targetFormat, bitDepth) {
    if (!BIT_DEPTH_COMPATIBLE_FORMATS.has(targetFormat)) {
        return undefined;
    }

    if (bitDepth == null || bitDepth === '') {
        return 16;
    }

    const numericBitDepth = Number(bitDepth);
    if (!Number.isFinite(numericBitDepth)) {
        throw new Error('bitDepth must be a number when provided.');
    }

    if (numericBitDepth !== 16 && numericBitDepth !== 24) {
        throw new Error(`Unsupported bit depth: ${bitDepth}. Use 16 or 24.`);
    }

    return numericBitDepth;
}

function normalizeNormalizationTargetDb(normalizeTargetDb) {
    if (normalizeTargetDb == null || normalizeTargetDb === '') {
        return -16;
    }

    const numericTarget = Number(normalizeTargetDb);
    if (!Number.isFinite(numericTarget)) {
        throw new Error('normalizeTargetDb must be a number when provided.');
    }

    if (numericTarget > -5 || numericTarget < -30) {
        throw new Error('normalizeTargetDb must be between -30 and -5 LUFS.');
    }

    return numericTarget;
}

function normalizeDitherMethod(ditherMethod) {
    if (ditherMethod == null || ditherMethod === '') {
        return DITHER_METHOD_ALIASES.tpdf;
    }

    if (typeof ditherMethod !== 'string') {
        throw new Error('ditherMethod must be a string when provided.');
    }

    const normalized = ditherMethod.trim().toLowerCase();
    if (!(normalized in DITHER_METHOD_ALIASES)) {
        throw new Error(`Unsupported dither method: ${ditherMethod}`);
    }

    return DITHER_METHOD_ALIASES[normalized];
}

function normalizeSampleRate(sampleRate) {
    if (sampleRate == null || sampleRate === '') {
        return undefined;
    }

    const numericSampleRate = Number(sampleRate);
    if (!Number.isFinite(numericSampleRate)) {
        throw new Error('sampleRate must be a number when provided.');
    }

    if (!SUPPORTED_SAMPLE_RATES.has(numericSampleRate)) {
        throw new Error(`Unsupported sample rate: ${sampleRate}`);
    }

    return numericSampleRate;
}

function buildAudioFilterChain({
    sourceBitDepth,
    targetBitDepth,
    sampleRate,
    ditherMethod,
    normalizeEnabled,
    normalizeTargetDb,
}) {
    const filters = [];
    const shouldReduceBitDepth = Number(targetBitDepth) === 16 && (sourceBitDepth == null || sourceBitDepth > 16);
    const shouldKeepBitDepth = Number(targetBitDepth) === 16
        ? sourceBitDepth === 16
        : Number(targetBitDepth) === 24 && sourceBitDepth === 24;

    if (shouldReduceBitDepth) {
        const safeDitherMethod = normalizeDitherMethod(ditherMethod) || 'triangular';
        const aresampleParts = [];
        if (Number.isFinite(sampleRate)) {
            aresampleParts.push(`osr=${sampleRate}`);
        }
        aresampleParts.push('out_sample_fmt=s16');
        aresampleParts.push(`dither_method=${safeDitherMethod}`);
        filters.push(`aresample=${aresampleParts.join(':')}`);
    } else if ((shouldKeepBitDepth || Number.isFinite(targetBitDepth)) && Number.isFinite(sampleRate)) {
        filters.push(`aresample=osr=${sampleRate}:dither_method=none`);
    }

    if (normalizeEnabled) {
        filters.push(`loudnorm=I=${normalizeTargetDb}:LRA=11:TP=-1.5`);
    }

    return filters;
}

function convertSingleAudio({
    inputPath,
    targetFormat,
    bitDepth,
    sampleRate,
    ditherMethod,
    normalizeEnabled,
    normalizeTargetDb,
    outputDirectory,
    audioBitrate = '192k',
    onProgress,
    abortSignal,
}) {
    const normalizedInput = validateInputPath(inputPath);
    const normalizedTargetFormat = normalizeTargetFormat(targetFormat);
    const normalizedOutput = buildOutputPath(normalizedInput, normalizedTargetFormat, outputDirectory);
    fs.mkdirSync(path.dirname(normalizedOutput), { recursive: true });

    if (abortSignal?.aborted) {
        return Promise.reject(createAbortError('Conversion canceled before start.'));
    }

    return new Promise((resolve, reject) => {
        probeAudioBitDepth(normalizedInput)
            .then((sourceBitDepth) => {
                if (abortSignal?.aborted) {
                    reject(createAbortError('Conversion canceled before FFmpeg start.'));
                    return;
                }

                const normalizedSampleRate = normalizeSampleRate(sampleRate);
                const normalizedBitDepth = normalizeBitDepth(normalizedTargetFormat, bitDepth);
                const safeNormalizeEnabled = Boolean(normalizeEnabled);
                const safeNormalizeTargetDb = normalizeNormalizationTargetDb(normalizeTargetDb);
                const command = ffmpeg(normalizedInput)
                    .format(normalizedTargetFormat)
                    .outputOptions(['-map_metadata', '0', '-write_id3v2', '1']);
                const untrackCommand = trackFfmpegCommand(command);
                let abortListener = null;

                const finalize = () => {
                    if (abortSignal && abortListener) {
                        abortSignal.removeEventListener('abort', abortListener);
                    }
                    untrackCommand();
                };

                if (abortSignal) {
                    abortListener = () => {
                        killCommand(command);
                    };
                    abortSignal.addEventListener('abort', abortListener, { once: true });
                }

                if (typeof onProgress === 'function') {
                    command.on('progress', (progress) => {
                        const percent = Number.isFinite(progress?.percent)
                            ? Math.max(0, Math.min(100, Math.round(progress.percent)))
                            : 0;
                        onProgress(percent);
                    });
                }

                if (normalizedTargetFormat !== 'wav' && normalizedTargetFormat !== 'flac' && audioBitrate) {
                    command.audioBitrate(audioBitrate);
                }

                if (Number.isFinite(normalizedBitDepth)) {
                    const bitDepthOptions = mapBitDepthOptions(normalizedTargetFormat, normalizedBitDepth);
                    if (bitDepthOptions.length > 0) {
                        command.outputOptions(bitDepthOptions);
                    }
                }

                if (!Number.isFinite(normalizedBitDepth) && Number.isFinite(normalizedSampleRate)) {
                    command.audioFrequency(normalizedSampleRate);
                }

                const filterChain = buildAudioFilterChain({
                    sourceBitDepth,
                    targetBitDepth: normalizedBitDepth,
                    sampleRate: normalizedSampleRate,
                    ditherMethod,
                    normalizeEnabled: safeNormalizeEnabled,
                    normalizeTargetDb: safeNormalizeTargetDb,
                });
                if (filterChain.length > 0) {
                    command.audioFilters(filterChain);
                }

                command
                    .on('end', () => {
                        finalize();
                        resolve({
                            inputPath: normalizedInput,
                            outputPath: normalizedOutput,
                            sourceBitDepth,
                            targetBitDepth: normalizedBitDepth ?? null,
                            appliedSampleRate: normalizedSampleRate ?? null,
                            normalizeEnabled: safeNormalizeEnabled,
                            normalizeTargetDb: safeNormalizeEnabled ? safeNormalizeTargetDb : null,
                        });
                    })
                    .on('error', (error) => {
                        finalize();
                        if (abortSignal?.aborted || command.__copilotCanceled) {
                            reject(createAbortError('Conversion canceled.'));
                            return;
                        }
                        reject(new Error(`Conversion failed: ${error.message}`));
                    })
                    .save(normalizedOutput);
            })
            .catch((error) => {
                if (isAbortError(error) || abortSignal?.aborted) {
                    reject(createAbortError('Conversion canceled.'));
                    return;
                }
                reject(new Error(`Failed to analyze input audio: ${error.message}`));
            });
    });
}

async function convertAudioBatch({
    filePaths,
    targetFormat,
    bitDepth,
    sampleRate,
    ditherMethod,
    normalizeEnabled,
    normalizeTargetDb,
    outputDirectory,
    audioBitrate,
}, callbacks = {}) {
    if (!ffmpegPath) {
        throw new Error('FFmpeg binary was not found (ffmpeg-static).');
    }

    if (!Array.isArray(filePaths) || filePaths.length === 0) {
        throw new Error('filePaths must be a non-empty array.');
    }

    const normalizedTargetFormat = normalizeTargetFormat(targetFormat);
    const normalizedDitherMethod = normalizeDitherMethod(ditherMethod);
    const normalizedSampleRate = normalizeSampleRate(sampleRate);
    const normalizedBitDepth = normalizeBitDepth(normalizedTargetFormat, bitDepth);
    const normalizedNormalizeTargetDb = normalizeNormalizationTargetDb(normalizeTargetDb);
    const normalizedOutputDirectory = outputDirectory ? normalizePath(outputDirectory) : null;
    const total = filePaths.length;
    const filePercents = new Array(total).fill(0);
    const emitBatchProgress = () => {
        if (typeof callbacks.onBatchProgress === 'function') {
            const globalPercent = Math.round(filePercents.reduce((sum, value) => sum + value, 0) / total);
            callbacks.onBatchProgress({
                percent: globalPercent,
                completedFiles: filePercents.filter((value) => value >= 100).length,
                total,
            });
        }
    };

    const batchAbortController = new AbortController();
    const conversionPromises = filePaths.map((currentInput, index) => convertSingleAudio({
        inputPath: currentInput,
        targetFormat: normalizedTargetFormat,
        bitDepth: normalizedBitDepth,
        sampleRate: normalizedSampleRate,
        ditherMethod: normalizedDitherMethod,
        normalizeEnabled: Boolean(normalizeEnabled),
        normalizeTargetDb: normalizedNormalizeTargetDb,
        outputDirectory: normalizedOutputDirectory || undefined,
        audioBitrate,
        abortSignal: batchAbortController.signal,
        onProgress: (percent) => {
            filePercents[index] = percent;
            if (typeof callbacks.onFileProgress === 'function') {
                callbacks.onFileProgress({
                    index,
                    total,
                    filePath: path.resolve(currentInput),
                    percent,
                });
            }
            emitBatchProgress();
        },
    }).then((result) => {
        filePercents[index] = 100;
        emitBatchProgress();
        return {
            ok: true,
            ...result,
        };
    }).catch((error) => {
        filePercents[index] = 100;
        emitBatchProgress();
        return {
            ok: false,
            inputPath: path.resolve(currentInput),
            error: isAbortError(error) ? 'Conversion canceled.' : error.message,
        };
    }));

    const settled = await Promise.allSettled(conversionPromises);
    const results = settled.map((entry) => {
        if (entry.status === 'fulfilled') {
            return entry.value;
        }

        return {
            ok: false,
            inputPath: null,
            error: entry.reason?.message || 'Unknown conversion failure.',
        };
    });

    if (!batchAbortController.signal.aborted) {
        batchAbortController.abort();
    }

    const successCount = results.filter((item) => item.ok).length;
    const failureCount = results.length - successCount;
    return {
        ok: failureCount === 0,
        successCount,
        failureCount,
        outputDirectory: normalizedOutputDirectory,
        results,
    };
}

function convertAudio({ inputPath, outputPath, audioBitrate = '192k' }) {
    const normalizedInput = validateInputPath(inputPath);
    const normalizedOutput = normalizePath(outputPath);
    const outputExt = path.extname(normalizedOutput).toLowerCase().replace(/^\./, '');

    if (!SUPPORTED_OUTPUT_FORMATS.has(outputExt)) {
        throw new Error(`Unsupported output format: ${outputExt}`);
    }

    fs.mkdirSync(path.dirname(normalizedOutput), { recursive: true });

    return new Promise((resolve, reject) => {
        ffmpeg(normalizedInput)
            .format(outputExt)
            .outputOptions(['-map_metadata', '0'])
            .audioBitrate(audioBitrate)
            .on('end', () => {
                resolve({ outputPath: normalizedOutput });
            })
            .on('error', (error) => {
                reject(new Error(`Conversion failed: ${error.message}`));
            })
            .save(normalizedOutput);
    });
}

module.exports = {
    convertAudioBatch,
    convertAudio,
    cancelAllConversions,
};
