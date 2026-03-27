interface Window {
  api?: {
    sendConvertRequest: (data: {
      filePaths?: string[];
      targetFormat?: string;
      bitDepth?: number;
      sampleRate?: number;
      ditherMethod?: string;
      normalizeEnabled?: boolean;
      normalizeTargetDb?: number;
      outputDirectory?: string;
      inputPath?: string;
      outputPath?: string;
      audioBitrate?: string;
    }) => Promise<any>;
    cancelConvertRequest: () => Promise<{ ok: boolean; canceledCount: number }>;
    selectInputFiles: () => Promise<string[]>;
    selectOutputDirectory: () => Promise<string | null>;
    openPath: (targetPath: string) => Promise<{ ok: boolean; error: string | null }>;
    getPathForFile: (file: File) => string;
    onProgress: (callback: (payload: {
      type: 'file' | 'batch';
      payload: any;
    }) => void) => () => void;
    onFinished: (callback: (payload: any) => void) => () => void;
  };
}
