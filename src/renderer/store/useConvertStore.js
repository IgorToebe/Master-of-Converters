import { defineStore } from 'pinia';

const SIMPLE_PRESET = {
    bitDepth: 16,
    sampleRate: 44100,
    ditherMethod: 'tpdf',
    normalizeEnabled: false,
    normalizeTargetDb: -16,
};

const LOSSLESS_FORMATS = new Set(['wav', 'aiff', 'flac']);
const SUPPORTED_INPUT_EXTENSIONS = new Set(['.mp3', '.wav', '.aif', '.aiff', '.m4a', '.ogg', '.flac', '.aac']);

const DITHER_OPTIONS = [
    {
        value: 'none',
        label: 'None',
        tooltip: '',
    },
    {
        value: 'tpdf',
        label: 'TPDF',
        tooltip: 'Padrão industrial, neutro.',
    },
    {
        value: 'shibata',
        label: 'Shibata',
        tooltip: 'Noise shaping otimizado para audiófilos.',
    },
    {
        value: 'lipshitz',
        label: 'Lipshitz',
        tooltip: '',
    },
];

function normalizePath(rawPath) {
    if (typeof rawPath !== 'string') {
        return null;
    }

    const normalized = rawPath.trim();
    return normalized.length ? normalized : null;
}

function toDisplayName(filePath) {
    const slashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return slashIndex >= 0 ? filePath.slice(slashIndex + 1) : filePath;
}

function detectInputFormat(filePath) {
    const normalized = normalizePath(filePath);
    if (!normalized) {
        return 'desconhecido';
    }

    const dotIndex = normalized.lastIndexOf('.');
    if (dotIndex < 0 || dotIndex === normalized.length - 1) {
        return 'desconhecido';
    }

    return normalized.slice(dotIndex + 1).toLowerCase();
}

function isSupportedInputPath(filePath) {
    const normalized = normalizePath(filePath);
    if (!normalized) {
        return false;
    }

    const dotIndex = normalized.lastIndexOf('.');
    if (dotIndex < 0 || dotIndex === normalized.length - 1) {
        return false;
    }

    const extension = normalized.slice(dotIndex).toLowerCase();
    return SUPPORTED_INPUT_EXTENSIONS.has(extension);
}

function isSupportedBrowserFile(file) {
    const fileName = normalizePath(file?.name || '');
    if (!fileName) {
        return false;
    }

    return isSupportedInputPath(fileName);
}

function pathKey(filePath) {
    return String(filePath || '').toLowerCase();
}

function toParentDirectory(filePath) {
    const normalized = normalizePath(filePath);
    if (!normalized) {
        return '';
    }

    const slashIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    return slashIndex > 0 ? normalized.slice(0, slashIndex) : '';
}

function hasElectronApi() {
    return typeof window !== 'undefined'
        && window.api
        && typeof window.api.onProgress === 'function'
        && typeof window.api.onFinished === 'function'
        && typeof window.api.sendConvertRequest === 'function';
}

function hasWebFileApi() {
    return typeof window !== 'undefined' && typeof window.fetch === 'function';
}

function hasFilePathResolver() {
    return typeof window !== 'undefined'
        && window.api
        && typeof window.api.getPathForFile === 'function';
}

export const useConvertStore = defineStore('convert', {
    state: () => ({
        activeTab: 'simple',
        targetFormat: 'wav',
        simpleTargetFormat: 'wav',
        expertTargetFormat: 'wav',
        simpleSettings: {
            bitDepth: SIMPLE_PRESET.bitDepth,
            sampleRate: SIMPLE_PRESET.sampleRate,
            ditherMethod: SIMPLE_PRESET.ditherMethod,
            normalizeEnabled: SIMPLE_PRESET.normalizeEnabled,
            normalizeTargetDb: SIMPLE_PRESET.normalizeTargetDb,
        },
        expertSettings: {
            bitDepth: SIMPLE_PRESET.bitDepth,
            sampleRate: SIMPLE_PRESET.sampleRate,
            ditherMethod: SIMPLE_PRESET.ditherMethod,
            normalizeEnabled: SIMPLE_PRESET.normalizeEnabled,
            normalizeTargetDb: SIMPLE_PRESET.normalizeTargetDb,
        },
        bitDepth: SIMPLE_PRESET.bitDepth,
        sampleRate: SIMPLE_PRESET.sampleRate,
        ditherMethod: SIMPLE_PRESET.ditherMethod,
        normalizeEnabled: SIMPLE_PRESET.normalizeEnabled,
        normalizeTargetDb: SIMPLE_PRESET.normalizeTargetDb,
        outputDirectory: '',
        files: [],
        status: 'idle',
        errorMessage: null,
        noticeMessage: null,
        batchProgress: 0,
        fileProgressMap: {},
        fileStatusMap: {},
        completionResult: null,
        removeProgressListener: null,
        removeFinishedListener: null,
    }),
    getters: {
        isWebRuntime: () => !hasElectronApi(),
        hasFiles: (state) => state.files.length > 0,
        fileProgressList: (state) => Object.entries(state.fileProgressMap),
        ditherOptions: () => DITHER_OPTIONS,
        isLosslessTarget: (state) => LOSSLESS_FORMATS.has(state.targetFormat),
        effectiveBitDepth: (state) => (LOSSLESS_FORMATS.has(state.targetFormat) ? Number(state.bitDepth) : undefined),
        isBitDepthReduction: (state) => Number(state.bitDepth) === 16,
        effectiveDitherMethod: (state) => {
            if (!LOSSLESS_FORMATS.has(state.targetFormat)) {
                return 'none';
            }
            return Number(state.bitDepth) === 16 ? (state.ditherMethod || 'tpdf') : 'none';
        },
    },
    actions: {
        persistCurrentTabSettings() {
            const snapshot = {
                bitDepth: Number(this.bitDepth),
                sampleRate: Number(this.sampleRate),
                ditherMethod: this.ditherMethod,
                normalizeEnabled: Boolean(this.normalizeEnabled),
                normalizeTargetDb: Number(this.normalizeTargetDb),
            };

            if (this.activeTab === 'simple') {
                this.simpleSettings = snapshot;
                return;
            }

            this.expertSettings = snapshot;
        },
        applyTabSettings(tab) {
            const source = tab === 'simple' ? this.simpleSettings : this.expertSettings;
            this.bitDepth = Number(source.bitDepth);
            this.sampleRate = Number(source.sampleRate);
            this.ditherMethod = source.ditherMethod;
            this.normalizeEnabled = Boolean(source.normalizeEnabled);
            this.normalizeTargetDb = Number(source.normalizeTargetDb);
        },
        setActiveTab(tab) {
            if (tab === 'simple' || tab === 'expert') {
                this.persistCurrentTabSettings();
                this.activeTab = tab;
                this.targetFormat = tab === 'simple' ? this.simpleTargetFormat : this.expertTargetFormat;
                this.applyTabSettings(tab);
            }
        },
        setTargetFormat(format) {
            this.targetFormat = format;
            if (this.activeTab === 'simple') {
                this.simpleTargetFormat = format;
            } else {
                this.expertTargetFormat = format;
            }
            if (!LOSSLESS_FORMATS.has(format)) {
                this.bitDepth = 16;
                this.ditherMethod = 'none';
            }
            this.persistCurrentTabSettings();
        },
        setBitDepth(value) {
            const parsed = Number(value);
            if (parsed === 16 || parsed === 24) {
                this.bitDepth = parsed;
            }
            if (this.bitDepth === 24) {
                this.ditherMethod = 'none';
            } else if (this.ditherMethod === 'none') {
                this.ditherMethod = 'tpdf';
            }
            this.persistCurrentTabSettings();
        },
        setSampleRate(value) {
            this.sampleRate = Number(value);
            this.persistCurrentTabSettings();
        },
        setDitherMethod(value) {
            if (Number(this.bitDepth) !== 16) {
                this.ditherMethod = 'none';
                this.persistCurrentTabSettings();
                return;
            }
            this.ditherMethod = value;
            this.persistCurrentTabSettings();
        },
        setNormalizeEnabled(value) {
            this.normalizeEnabled = Boolean(value);
            this.persistCurrentTabSettings();
        },
        setNormalizeTargetDb(value) {
            const numericValue = Number(value);
            if (Number.isFinite(numericValue)) {
                this.normalizeTargetDb = Math.max(-30, Math.min(-5, numericValue));
                this.persistCurrentTabSettings();
            }
        },
        setOutputDirectory(value) {
            this.outputDirectory = normalizePath(value) || '';
        },
        setIgnoredFilesNotice(ignoredCount) {
            if (!Number.isFinite(ignoredCount) || ignoredCount <= 0) {
                this.noticeMessage = null;
                return;
            }

            const plural = ignoredCount > 1 ? 's' : '';
            this.noticeMessage = `${ignoredCount} arquivo${plural} ignorado${plural} por formato invalido.`;
        },
        async chooseInputFiles() {
            if (window.api && typeof window.api.selectInputFiles === 'function') {
                try {
                    const selectedPaths = await window.api.selectInputFiles();
                    const normalizedSelection = Array.isArray(selectedPaths)
                        ? selectedPaths.map((item) => normalizePath(item)).filter(Boolean)
                        : [];

                    if (normalizedSelection.length === 0) {
                        return;
                    }

                    const currentPaths = this.files.map((item) => item.path).filter((item) => !String(item).startsWith('browser://'));
                    const summary = this.setFilesFromPaths([...currentPaths, ...normalizedSelection]);
                    this.setIgnoredFilesNotice(summary.ignoredCount);
                    this.applySimplePreset();
                } catch (error) {
                    this.status = 'error';
                    this.errorMessage = error?.message || 'Falha ao selecionar arquivos de entrada.';
                }
                return;
            }

            if (typeof document === 'undefined') {
                this.status = 'error';
                this.errorMessage = 'Nao foi possivel abrir o seletor de arquivos neste ambiente.';
                return;
            }

            const picker = document.createElement('input');
            picker.type = 'file';
            picker.multiple = true;
            picker.accept = '.mp3,.wav,.aif,.aiff,.m4a,.ogg,.flac,.aac';
            picker.onchange = () => {
                if (picker.files && picker.files.length > 0) {
                    const summary = this.setFilesFromBrowserFiles(picker.files);
                    this.setIgnoredFilesNotice(summary.ignoredCount);
                    this.applySimplePreset();
                }
            };
            picker.click();
        },
        setFilesFromBrowserFiles(fileList) {
            if (!fileList || typeof fileList.length !== 'number') {
                return;
            }

            const existingBrowserFiles = this.files
                .filter((entry) => entry.browserFile)
                .map((entry) => entry.browserFile);

            const incomingFiles = [];
            let ignoredCount = 0;
            for (let index = 0; index < fileList.length; index += 1) {
                const file = fileList[index];
                if (file && isSupportedBrowserFile(file)) {
                    incomingFiles.push(file);
                } else if (file) {
                    ignoredCount += 1;
                }
            }

            const merged = [...existingBrowserFiles, ...incomingFiles];
            const deduped = [];
            const seen = new Set();

            merged.forEach((file, index) => {
                const signature = `${file.name}:${file.size}:${file.lastModified}`;
                if (seen.has(signature)) {
                    return;
                }
                seen.add(signature);

                deduped.push({
                    path: `browser://${signature}:${index}`,
                    name: file.name,
                    inputFormat: detectInputFormat(file.name),
                    browserFile: file,
                });
            });

            const statusByPath = {};
            deduped.forEach((entry) => {
                statusByPath[entry.path] = this.fileStatusMap[entry.path] || 'queued';
            });

            this.files = deduped;
            this.fileStatusMap = statusByPath;

            return {
                acceptedCount: deduped.length,
                ignoredCount,
            };
        },
        async chooseOutputDirectory() {
            if (!window.api || typeof window.api.selectOutputDirectory !== 'function') {
                this.status = 'idle';
                this.errorMessage = 'Na versao web, os arquivos convertidos sao baixados em ZIP.';
                return;
            }

            try {
                const selectedPath = await window.api.selectOutputDirectory();
                if (selectedPath) {
                    this.setOutputDirectory(selectedPath);
                }
            } catch (error) {
                this.status = 'error';
                this.errorMessage = error?.message || 'Falha ao selecionar pasta de saida.';
            }
        },
        applySimplePreset() {
            this.simpleSettings = {
                bitDepth: SIMPLE_PRESET.bitDepth,
                sampleRate: SIMPLE_PRESET.sampleRate,
                ditherMethod: SIMPLE_PRESET.ditherMethod,
                normalizeEnabled: SIMPLE_PRESET.normalizeEnabled,
                normalizeTargetDb: SIMPLE_PRESET.normalizeTargetDb,
            };

            if (this.activeTab === 'simple') {
                this.applyTabSettings('simple');
            }
        },
        setFilesFromPaths(filePaths) {
            const incoming = Array.isArray(filePaths) ? filePaths : [];
            let ignoredCount = 0;
            const normalized = incoming
                .map((item) => normalizePath(item))
                .filter(Boolean)
                .filter((filePath) => {
                    const supported = isSupportedInputPath(filePath);
                    if (!supported) {
                        ignoredCount += 1;
                    }
                    return supported;
                })
                .map((filePath) => ({
                    path: filePath,
                    name: toDisplayName(filePath),
                    inputFormat: detectInputFormat(filePath),
                }));

            const deduped = [];
            const seen = new Set();

            normalized.forEach((entry) => {
                const key = entry.path.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    deduped.push(entry);
                }
            });

            this.files = deduped;

            const nextStatusMap = {};
            deduped.forEach((entry) => {
                nextStatusMap[entry.path] = this.fileStatusMap[entry.path] || 'queued';
            });
            this.fileStatusMap = nextStatusMap;

            return {
                acceptedCount: deduped.length,
                ignoredCount,
            };
        },
        async addDroppedFiles(fileList) {
            if (!fileList || typeof fileList.length !== 'number') {
                return;
            }

            if (!hasElectronApi()) {
                const summary = this.setFilesFromBrowserFiles(fileList);
                this.setIgnoredFilesNotice(summary.ignoredCount);
                this.applySimplePreset();
                return;
            }

            const currentPaths = this.files.map((item) => item.path);
            const droppedPaths = [];
            let ignoredCount = 0;

            for (let index = 0; index < fileList.length; index += 1) {
                const file = fileList[index];
                let resolvedPath = '';

                if (hasFilePathResolver()) {
                    resolvedPath = window.api.getPathForFile(file) || '';
                }

                const candidate = normalizePath(resolvedPath || file?.path || '');
                if (candidate && isSupportedInputPath(candidate)) {
                    droppedPaths.push(candidate);
                } else if (candidate) {
                    ignoredCount += 1;
                }
            }

            if (droppedPaths.length === 0) {
                if (ignoredCount > 0) {
                    this.status = 'idle';
                    this.errorMessage = null;
                    this.setIgnoredFilesNotice(ignoredCount);
                } else {
                    this.status = 'error';
                    this.errorMessage = 'Nao foi possivel ler os caminhos dos arquivos soltos. Use o app desktop e tente novamente.';
                }
                return;
            }

            const summary = this.setFilesFromPaths([...currentPaths, ...droppedPaths]);
            this.setIgnoredFilesNotice(summary.ignoredCount + ignoredCount);
            this.applySimplePreset();
        },
        removeFile(pathToRemove) {
            this.files = this.files.filter((item) => item.path !== pathToRemove);
            const nextProgressMap = { ...this.fileProgressMap };
            delete nextProgressMap[pathToRemove];
            this.fileProgressMap = nextProgressMap;

            const nextStatusMap = { ...this.fileStatusMap };
            delete nextStatusMap[pathToRemove];
            this.fileStatusMap = nextStatusMap;
        },
        clearFiles() {
            this.files = [];
            this.fileProgressMap = {};
            this.fileStatusMap = {};
            this.batchProgress = 0;
            this.completionResult = null;
            this.status = 'idle';
            this.errorMessage = null;
            this.noticeMessage = null;
        },
        initializeIpcListeners() {
            this.disposeIpcListeners();

            if (!hasElectronApi()) {
                return;
            }

            this.removeProgressListener = window.api.onProgress((event) => {
                if (event?.type === 'file' && event.payload?.filePath) {
                    const filePath = event.payload.filePath;
                    this.fileProgressMap = {
                        ...this.fileProgressMap,
                        [filePath]: event.payload.percent ?? 0,
                    };

                    this.fileStatusMap = {
                        ...this.fileStatusMap,
                        [filePath]: event.payload.percent >= 100 ? 'done' : 'running',
                    };
                }

                if (event?.type === 'batch') {
                    this.batchProgress = event.payload?.percent ?? 0;
                }
            });

            this.removeFinishedListener = window.api.onFinished((payload) => {
                this.completionResult = payload;
                this.status = payload?.ok ? 'done' : 'error';
                if (!payload?.ok) {
                    this.errorMessage = 'Uma ou mais conversoes falharam.';
                }

                const results = Array.isArray(payload?.results) ? payload.results : [];
                if (results.length > 0) {
                    const statusByPath = { ...this.fileStatusMap };
                    const filePathLookup = {};

                    this.files.forEach((entry) => {
                        filePathLookup[pathKey(entry.path)] = entry.path;
                    });

                    results.forEach((item) => {
                        const resolvedPath = filePathLookup[pathKey(item?.inputPath)] || item?.inputPath;
                        if (resolvedPath) {
                            statusByPath[resolvedPath] = item?.ok ? 'done' : 'error';
                        }
                    });

                    this.fileStatusMap = statusByPath;
                }
            });
        },
        disposeIpcListeners() {
            if (typeof this.removeProgressListener === 'function') {
                this.removeProgressListener();
            }
            if (typeof this.removeFinishedListener === 'function') {
                this.removeFinishedListener();
            }
            this.removeProgressListener = null;
            this.removeFinishedListener = null;
        },
        async startConversion() {
            if (!hasElectronApi()) {
                await this.startWebConversion();
                return;
            }

            const filePaths = this.files.map((item) => item.path).filter((item) => !String(item).startsWith('browser://'));

            if (filePaths.length === 0) {
                this.status = 'error';
                this.errorMessage = 'Adicione ao menos um arquivo para converter.';
                return;
            }

            this.status = 'running';
            this.errorMessage = null;
            this.noticeMessage = null;
            this.fileProgressMap = {};
            this.batchProgress = 0;
            this.completionResult = null;
            this.fileStatusMap = filePaths.reduce((acc, currentPath) => {
                acc[currentPath] = 'queued';
                return acc;
            }, {});

            try {
                await window.api.sendConvertRequest({
                    filePaths,
                    targetFormat: this.targetFormat,
                    bitDepth: this.effectiveBitDepth,
                    sampleRate: Number(this.sampleRate),
                    ditherMethod: this.effectiveDitherMethod,
                    normalizeEnabled: this.normalizeEnabled,
                    normalizeTargetDb: this.normalizeTargetDb,
                    outputDirectory: this.outputDirectory || undefined,
                });
            } catch (error) {
                this.status = 'error';
                this.errorMessage = error?.message || 'Falha ao iniciar conversão.';
            }
        },
        async startWebConversion() {
            if (!hasWebFileApi()) {
                this.status = 'error';
                this.errorMessage = 'Este ambiente não suporta upload via navegador.';
                return;
            }

            const browserEntries = this.files.filter((entry) => entry.browserFile);
            if (browserEntries.length === 0) {
                this.status = 'error';
                this.errorMessage = 'Selecione arquivos para enviar e converter.';
                return;
            }

            this.status = 'running';
            this.errorMessage = null;
            this.noticeMessage = null;
            this.batchProgress = 0;
            this.completionResult = null;
            this.fileProgressMap = browserEntries.reduce((acc, entry) => {
                acc[entry.path] = 0;
                return acc;
            }, {});
            this.fileStatusMap = browserEntries.reduce((acc, entry) => {
                acc[entry.path] = 'running';
                return acc;
            }, {});

            try {
                const formData = new FormData();
                browserEntries.forEach((entry) => {
                    formData.append('files', entry.browserFile, entry.browserFile.name);
                });
                formData.append('targetFormat', this.targetFormat);
                if (this.effectiveBitDepth != null) {
                    formData.append('bitDepth', String(this.effectiveBitDepth));
                }
                formData.append('sampleRate', String(this.sampleRate));
                formData.append('ditherMethod', this.effectiveDitherMethod);
                formData.append('normalizeEnabled', String(Boolean(this.normalizeEnabled)));
                formData.append('normalizeTargetDb', String(this.normalizeTargetDb));

                const response = await fetch('/api/convert', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    let message = `Falha na conversão web (${response.status}).`;
                    try {
                        const errorPayload = await response.json();
                        if (errorPayload?.error) {
                            message = errorPayload.error;
                        }
                    } catch {
                        // Ignore non-json errors.
                    }
                    throw new Error(message);
                }

                const zipBlob = await response.blob();
                const blobUrl = URL.createObjectURL(zipBlob);
                const anchor = document.createElement('a');
                anchor.href = blobUrl;
                anchor.download = 'converted-audio.zip';
                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);
                URL.revokeObjectURL(blobUrl);

                this.fileProgressMap = browserEntries.reduce((acc, entry) => {
                    acc[entry.path] = 100;
                    return acc;
                }, {});
                this.fileStatusMap = browserEntries.reduce((acc, entry) => {
                    acc[entry.path] = 'done';
                    return acc;
                }, {});
                this.batchProgress = 100;
                this.status = 'done';
                this.completionResult = {
                    ok: true,
                    successCount: browserEntries.length,
                    failureCount: 0,
                    mode: 'web',
                    message: 'Conversao concluida. O navegador iniciou o download do ZIP.',
                };
            } catch (error) {
                this.status = 'error';
                this.errorMessage = error?.message || 'Falha ao converter no modo web.';
                this.fileStatusMap = browserEntries.reduce((acc, entry) => {
                    acc[entry.path] = 'error';
                    return acc;
                }, {});
            }
        },
        async openOutputFolder() {
            if (!window.api || typeof window.api.openPath !== 'function') {
                this.errorMessage = 'Na versao web, os arquivos convertidos sao baixados em ZIP pelo navegador.';
                return;
            }

            const explicitOutputPath = normalizePath(this.outputDirectory);
            const resultOutputPath = Array.isArray(this.completionResult?.results)
                ? this.completionResult.results.find((entry) => entry?.ok && entry?.outputPath)?.outputPath
                : null;

            const fallbackDirectory = toParentDirectory(resultOutputPath);
            const targetDirectory = explicitOutputPath || fallbackDirectory;

            if (!targetDirectory) {
                this.errorMessage = 'Nao foi possivel determinar a pasta de saida.';
                return;
            }

            try {
                const response = await window.api.openPath(targetDirectory);
                if (!response?.ok) {
                    throw new Error(response?.error || 'Falha ao abrir a pasta de saida.');
                }
            } catch (error) {
                this.errorMessage = error?.message || 'Falha ao abrir a pasta de saida.';
            }
        },
    },
});
