import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const root = process.cwd();
const outDir = path.join(root, 'dist-electron');
const ffmpegResourceDir = path.join(root, 'build-resources', 'ffmpeg-bin');

function stageFfmpegResources() {
	fs.rmSync(ffmpegResourceDir, { recursive: true, force: true });
	fs.mkdirSync(ffmpegResourceDir, { recursive: true });

	const ffmpegStaticPath = require('ffmpeg-static');
	if (!ffmpegStaticPath || typeof ffmpegStaticPath !== 'string') {
		throw new Error('ffmpeg-static did not return a binary path.');
	}

	const normalizedFfmpegPath = path.resolve(ffmpegStaticPath);
	if (!fs.existsSync(normalizedFfmpegPath)) {
		throw new Error(`ffmpeg binary not found at: ${normalizedFfmpegPath}`);
	}

	const ffmpegTargetName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
	fs.copyFileSync(normalizedFfmpegPath, path.join(ffmpegResourceDir, ffmpegTargetName));

	const ffprobeSourceName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
	const ffprobeSourcePath = path.join(path.dirname(normalizedFfmpegPath), ffprobeSourceName);
	if (fs.existsSync(ffprobeSourcePath)) {
		const ffprobeTargetName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
		fs.copyFileSync(ffprobeSourcePath, path.join(ffmpegResourceDir, ffprobeTargetName));
	}
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'main'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'preload'), { recursive: true });

stageFfmpegResources();

fs.copyFileSync(path.join(root, 'src', 'main', 'main.js'), path.join(outDir, 'main', 'main.js'));
fs.copyFileSync(path.join(root, 'src', 'main', 'ffmpegService.js'), path.join(outDir, 'main', 'ffmpegService.js'));
fs.copyFileSync(path.join(root, 'src', 'preload', 'preload.js'), path.join(outDir, 'preload', 'preload.js'));

console.log('Electron files prepared in dist-electron and FFmpeg resources staged.');
