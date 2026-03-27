const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const archiver = require('archiver');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStaticPath = require('ffmpeg-static');

const APP_PORT = Number(process.env.PORT || 3001);
const MAX_INPUT_SIZE_MB = 200;
const SUPPORTED_INPUT_EXTENSIONS = new Set(['.mp3', '.wav', '.aif', '.aiff', '.m4a', '.ogg', '.flac', '.aac']);
const SUPPORTED_OUTPUT_FORMATS = new Set(['mp3', 'wav', 'aiff', 'm4a', 'ogg', 'flac']);
const BIT_DEPTH_COMPATIBLE_FORMATS = new Set(['wav', 'aiff', 'flac']);
const SUPPORTED_SAMPLE_RATES = new Set([44100, 48000, 96000]);

const DITHER_METHOD_ALIASES = {
    none: null,
    tpdf: 'triangular',
    triangular: 'triangular',
    shibata: 'shibata',
    lipshitz: 'lipshitz',
};

if (ffmpegStaticPath && typeof ffmpegStaticPath === 'string') {
    ffmpeg.setFfmpegPath(path.resolve(ffmpegStaticPath));
}

const tempRoot = path.join(os.tmpdir(), 'conversor-audio-web');
const uploadRoot = path.join(tempRoot, 'uploads');
const outputRoot = path.join(tempRoot, 'outputs');

fs.mkdirSync(uploadRoot, { recursive: true });
fs.mkdirSync(outputRoot, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, uploadRoot);
    },
    filename: (_req, file, callback) => {
        const safeOriginal = path.basename(file.originalname || 'input');
        const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeOriginal}`;
        callback(null, uniqueName);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_INPUT_SIZE_MB * 1024 * 1024,
        files: 30,
    },
});

function parseBoolean(value, defaultValue = false) {
    if (value == null || value === '') {
        return defaultValue;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeTargetFormat(targetFormat) {
    if (typeof targetFormat !== 'string' || !targetFormat.trim()) {
        throw new Error('targetFormat deve ser informado.');
    }

    const normalized = targetFormat.trim().toLowerCase().replace(/^\./, '');
    if (!SUPPORTED_OUTPUT_FORMATS.has(normalized)) {
        throw new Error(`Formato de saida nao suportado: ${targetFormat}`);
    }

    return normalized;
}

function normalizeBitDepth(targetFormat, bitDepth) {
    if (!BIT_DEPTH_COMPATIBLE_FORMATS.has(targetFormat)) {
        return undefined;
    }

    if (bitDepth == null || bitDepth === '') {
        return 16;
    }

    const numericBitDepth = Number(bitDepth);
    if (!Number.isFinite(numericBitDepth) || (numericBitDepth !== 16 && numericBitDepth !== 24)) {
        throw new Error('bitDepth deve ser 16 ou 24 para formatos lossless.');
    }

    return numericBitDepth;
}

function normalizeSampleRate(sampleRate) {
    if (sampleRate == null || sampleRate === '') {
        return undefined;
    }

    const numericSampleRate = Number(sampleRate);
    if (!Number.isFinite(numericSampleRate) || !SUPPORTED_SAMPLE_RATES.has(numericSampleRate)) {
        throw new Error(`sampleRate nao suportado: ${sampleRate}`);
    }

    return numericSampleRate;
}

function normalizeNormalizationTargetDb(normalizeTargetDb) {
    if (normalizeTargetDb == null || normalizeTargetDb === '') {
        return -16;
    }

    const numericTarget = Number(normalizeTargetDb);
    if (!Number.isFinite(numericTarget) || numericTarget > -5 || numericTarget < -30) {
        throw new Error('normalizeTargetDb deve ficar entre -30 e -5.');
    }

    return numericTarget;
}

function normalizeDitherMethod(ditherMethod) {
    if (ditherMethod == null || ditherMethod === '') {
        return DITHER_METHOD_ALIASES.tpdf;
    }

    const normalized = String(ditherMethod).trim().toLowerCase();
    if (!(normalized in DITHER_METHOD_ALIASES)) {
        throw new Error(`ditherMethod nao suportado: ${ditherMethod}`);
    }

    return DITHER_METHOD_ALIASES[normalized];
}

function detectInputFormat(filePath) {
    return path.extname(filePath || '').toLowerCase();
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
    }

    if (targetFormat === 'aiff') {
        if (bitDepth === 16) {
            return ['-c:a', 'pcm_s16be'];
        }
        if (bitDepth === 24) {
            return ['-c:a', 'pcm_s24be'];
        }
    }

    if (targetFormat === 'flac') {
        if (bitDepth === 16) {
            return ['-c:a', 'flac', '-sample_fmt', 's16'];
        }
        if (bitDepth === 24) {
            return ['-c:a', 'flac', '-sample_fmt', 's32'];
        }
        return ['-c:a', 'flac'];
    }

    return [];
}

function buildAudioFilterChain({ targetBitDepth, sampleRate, ditherMethod, normalizeEnabled, normalizeTargetDb }) {
    const filters = [];

    if (Number(targetBitDepth) === 16) {
        const safeDither = normalizeDitherMethod(ditherMethod) || 'triangular';
        const aresampleParts = [];
        if (Number.isFinite(sampleRate)) {
            aresampleParts.push(`osr=${sampleRate}`);
        }
        aresampleParts.push('out_sample_fmt=s16');
        aresampleParts.push(`dither_method=${safeDither}`);
        filters.push(`aresample=${aresampleParts.join(':')}`);
    } else if (Number.isFinite(sampleRate)) {
        filters.push(`aresample=osr=${sampleRate}:dither_method=none`);
    }

    if (normalizeEnabled) {
        filters.push(`loudnorm=I=${normalizeTargetDb}:LRA=11:TP=-1.5`);
    }

    return filters;
}

function convertSingleAudio({ inputPath, outputPath, targetFormat, bitDepth, sampleRate, ditherMethod, normalizeEnabled, normalizeTargetDb }) {
    return new Promise((resolve, reject) => {
        const command = ffmpeg(inputPath)
            .format(targetFormat)
            .outputOptions(['-map_metadata', '0']);

        if (targetFormat !== 'wav' && targetFormat !== 'flac') {
            command.audioBitrate('192k');
        }

        const bitDepthOptions = mapBitDepthOptions(targetFormat, bitDepth);
        if (bitDepthOptions.length > 0) {
            command.outputOptions(bitDepthOptions);
        }

        const filterChain = buildAudioFilterChain({
            targetBitDepth: bitDepth,
            sampleRate,
            ditherMethod,
            normalizeEnabled,
            normalizeTargetDb,
        });

        if (filterChain.length > 0) {
            command.audioFilters(filterChain);
        }

        command
            .on('end', () => {
                resolve(outputPath);
            })
            .on('error', (error) => {
                reject(new Error(`Falha na conversão de ${path.basename(inputPath)}: ${error.message}`));
            })
            .save(outputPath);
    });
}

async function safeUnlink(filePath) {
    if (!filePath) {
        return;
    }

    try {
        await fsp.unlink(filePath);
    } catch {
        // Ignore cleanup failures.
    }
}

async function safeRmDirectory(dirPath) {
    if (!dirPath) {
        return;
    }

    try {
        await fsp.rm(dirPath, { recursive: true, force: true });
    } catch {
        // Ignore cleanup failures.
    }
}

async function buildZip(zipPath, fileEntries) {
    await fsp.mkdir(path.dirname(zipPath), { recursive: true });

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        output.on('error', reject);
        archive.on('error', reject);

        archive.pipe(output);

        fileEntries.forEach((item) => {
            archive.file(item.path, { name: item.name });
        });

        archive.finalize();
    });
}

function parseContentDispositionFilename(value) {
    if (!value) {
        return 'converted-audio.zip';
    }

    const match = /filename="?([^";]+)"?/i.exec(value);
    return match?.[1] || 'converted-audio.zip';
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
});

app.post('/api/convert', upload.array('files', 30), async (req, res) => {
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];

    if (uploadedFiles.length === 0) {
        res.status(400).json({ ok: false, error: 'Nenhum arquivo enviado.' });
        return;
    }

    let sessionDir = null;
    const generatedFiles = [];

    try {
        const targetFormat = normalizeTargetFormat(req.body.targetFormat || 'wav');
        const bitDepth = normalizeBitDepth(targetFormat, req.body.bitDepth);
        const sampleRate = normalizeSampleRate(req.body.sampleRate);
        const ditherMethod = normalizeDitherMethod(req.body.ditherMethod);
        const normalizeEnabled = parseBoolean(req.body.normalizeEnabled, false);
        const normalizeTargetDb = normalizeNormalizationTargetDb(req.body.normalizeTargetDb);

        sessionDir = path.join(outputRoot, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await fsp.mkdir(sessionDir, { recursive: true });

        const results = [];

        for (const file of uploadedFiles) {
            const ext = detectInputFormat(file.originalname);
            if (!SUPPORTED_INPUT_EXTENSIONS.has(ext)) {
                results.push({
                    ok: false,
                    inputName: file.originalname,
                    error: `Formato de entrada nao suportado: ${ext || '(sem extensao)'}`,
                });
                continue;
            }

            const inputBaseName = path.basename(file.originalname, path.extname(file.originalname));
            const outputName = `${inputBaseName}.${targetFormat}`;
            const outputPath = path.join(sessionDir, outputName);

            try {
                await convertSingleAudio({
                    inputPath: file.path,
                    outputPath,
                    targetFormat,
                    bitDepth,
                    sampleRate,
                    ditherMethod,
                    normalizeEnabled,
                    normalizeTargetDb,
                });

                generatedFiles.push(outputPath);
                results.push({
                    ok: true,
                    inputName: file.originalname,
                    outputName,
                });
            } catch (error) {
                results.push({
                    ok: false,
                    inputName: file.originalname,
                    error: error.message,
                });
            }
        }

        const successItems = results.filter((item) => item.ok);
        if (successItems.length === 0) {
            res.status(422).json({ ok: false, error: 'Nenhum arquivo foi convertido.', results });
            return;
        }

        const zipPath = path.join(sessionDir, 'converted-audio.zip');
        await buildZip(
            zipPath,
            successItems.map((item) => ({
                path: path.join(sessionDir, item.outputName),
                name: item.outputName,
            })),
        );

        res.setHeader('X-Conversion-Result', Buffer.from(JSON.stringify({
            ok: true,
            successCount: successItems.length,
            failureCount: results.length - successItems.length,
            results,
        })).toString('base64'));

        res.download(zipPath, 'converted-audio.zip', async (downloadError) => {
            await Promise.all(uploadedFiles.map((file) => safeUnlink(file.path)));
            await safeRmDirectory(sessionDir);

            if (downloadError) {
                // Download interruption is not a server crash scenario.
            }
        });
    } catch (error) {
        await Promise.all(uploadedFiles.map((file) => safeUnlink(file.path)));
        await safeRmDirectory(sessionDir);
        res.status(400).json({ ok: false, error: error.message });
    }
});

app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Rota nao encontrada.' });
});

app.listen(APP_PORT, () => {
    console.log(`Conversor Web API em http://localhost:${APP_PORT}`);
});
