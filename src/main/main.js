const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { convertAudio, convertAudioBatch, cancelAllConversions } = require('./ffmpegService');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function shouldAllowNavigation(url) {
    if (isDev && process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) {
        return true;
    }

    return url.startsWith('file://');
}

function createMainWindow() {
    const preloadPath = path.join(__dirname, '..', 'preload', 'preload.js');
    const win = new BrowserWindow({
        width: 1200,
        height: 760,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: '#020617',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: true,
        },
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                shell.openExternal(url);
            }
        } catch {
            // Ignore malformed URLs.
        }
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (!shouldAllowNavigation(url)) {
            event.preventDefault();
        }
    });

    if (isDev && process.env.VITE_DEV_SERVER_URL) {
        win.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
    }
}

app.whenReady().then(() => {
    ipcMain.handle('shell:open-path', async (_event, targetPath) => {
        if (typeof targetPath !== 'string' || !targetPath.trim()) {
            return {
                ok: false,
                error: 'Path must be a non-empty string.',
            };
        }

        const error = await shell.openPath(targetPath);
        return {
            ok: error.length === 0,
            error: error || null,
        };
    });

    ipcMain.handle('dialog:select-output-dir', async (event) => {
        const browserWindow = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showOpenDialog(browserWindow ?? undefined, {
            properties: ['openDirectory', 'createDirectory'],
            title: 'Selecione a pasta de saida',
        });

        if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
            return null;
        }

        return result.filePaths[0] ?? null;
    });

    ipcMain.handle('dialog:select-audio-files', async (event) => {
        const browserWindow = BrowserWindow.fromWebContents(event.sender);
        const result = await dialog.showOpenDialog(browserWindow ?? undefined, {
            properties: ['openFile', 'multiSelections'],
            title: 'Selecione os arquivos de audio',
            filters: [
                {
                    name: 'Audio',
                    extensions: ['mp3', 'wav', 'aif', 'aiff', 'm4a', 'ogg', 'flac', 'aac'],
                },
                {
                    name: 'Todos os arquivos',
                    extensions: ['*'],
                },
            ],
        });

        if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
            return [];
        }

        return result.filePaths;
    });

    ipcMain.handle('audio:convert', async (event, payload) => {
        const safePayload = payload ?? {};
        const isBatchRequest = Array.isArray(safePayload.filePaths);

        if (safePayload.targetFormat != null) {
            const allowedFormats = new Set(['wav', 'aiff', 'flac', 'mp3', 'm4a', 'ogg']);
            const normalizedFormat = String(safePayload.targetFormat).trim().toLowerCase();
            if (!allowedFormats.has(normalizedFormat)) {
                throw new Error(`Unsupported target format: ${safePayload.targetFormat}`);
            }
        }

        if (safePayload.bitDepth != null && safePayload.bitDepth !== '') {
            const numericBitDepth = Number(safePayload.bitDepth);
            if (!Number.isFinite(numericBitDepth) || (numericBitDepth !== 16 && numericBitDepth !== 24)) {
                throw new Error('bitDepth must be 16 or 24.');
            }
        }

        if (safePayload.normalizeTargetDb != null && safePayload.normalizeTargetDb !== '') {
            const numericNormalizeTarget = Number(safePayload.normalizeTargetDb);
            if (!Number.isFinite(numericNormalizeTarget) || numericNormalizeTarget > -5 || numericNormalizeTarget < -30) {
                throw new Error('normalizeTargetDb must be between -30 and -5 LUFS.');
            }
        }

        if (isBatchRequest) {
            const result = await convertAudioBatch(safePayload, {
                onFileProgress: (fileProgress) => {
                    event.sender.send('audio:progress:file', fileProgress);
                },
                onBatchProgress: (batchProgress) => {
                    event.sender.send('audio:progress:batch', batchProgress);
                },
            });

            event.sender.send('audio:convert:completed', result);
            return result;
        }

        const result = await convertAudio(safePayload);
        const response = {
            ok: true,
            ...result,
        };
        event.sender.send('audio:convert:completed', response);
        return response;
    });

    ipcMain.handle('audio:cancel', async () => {
        const canceledCount = cancelAllConversions();
        return {
            ok: true,
            canceledCount,
        };
    });

    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    cancelAllConversions();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    cancelAllConversions();
});
