<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { AudioLines, BadgeInfo, ChevronDown, FolderInput, FolderOpen, Play, SlidersHorizontal } from 'lucide-vue-next';
import { useConvertStore } from '@/store/useConvertStore';

const convertStore = useConvertStore();
const {
  activeTab,
  targetFormat,
  bitDepth,
  sampleRate,
  ditherMethod,
  normalizeEnabled,
  normalizeTargetDb,
  outputDirectory,
  files,
  status,
  errorMessage,
  noticeMessage,
  batchProgress,
  completionResult,
  ditherOptions,
  fileStatusMap,
  isLosslessTarget,
  isBitDepthReduction,
  effectiveDitherMethod,
  isWebRuntime,
} = storeToRefs(convertStore);

const isDragOver = ref(false);
const ditherMenuOpen = ref(false);
const ditherMenuRef = ref(null);
const hoveredDither = ref('');

const statusText = computed(() => {
  if (status.value === 'running') {
    return 'Convertendo';
  }
  if (status.value === 'done') {
    return 'Concluido';
  }
  if (status.value === 'error') {
    return 'Erro';
  }
  return 'Pronto';
});

const statusClass = computed(() => {
  if (status.value === 'running') {
    return 'text-amber-300 bg-amber-400/10 border-amber-300/30';
  }
  if (status.value === 'done') {
    return 'text-emerald-300 bg-emerald-400/10 border-emerald-300/30';
  }
  if (status.value === 'error') {
    return 'text-rose-300 bg-rose-400/10 border-rose-300/30';
  }
  return 'text-cyan-200 bg-cyan-400/10 border-cyan-300/30';
});

const isRunning = computed(() => status.value === 'running');
const selectedDitherOption = computed(() => ditherOptions.value.find((item) => item.value === effectiveDitherMethod.value) || ditherOptions.value[0]);
const hoveredDitherOption = computed(() => ditherOptions.value.find((item) => item.value === hoveredDither.value) || null);
const isDitherLocked = computed(() => !isLosslessTarget.value || !isBitDepthReduction.value);
const outputFormatOptions = [
  { value: 'wav', label: 'WAV' },
  { value: 'aiff', label: 'AIFF' },
  { value: 'flac', label: 'FLAC' },
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'ogg', label: 'OGG' },
];

function setSimpleTab() {
  convertStore.setActiveTab('simple');
}

function setExpertTab() {
  convertStore.setActiveTab('expert');
}

function handleDragEnter() {
  isDragOver.value = true;
}

function handleDragLeave(event) {
  const nextTarget = event.relatedTarget;
  if (!nextTarget) {
    isDragOver.value = false;
  }
}

function handleDrop(event) {
  event.preventDefault();
  isDragOver.value = false;
  convertStore.addDroppedFiles(event.dataTransfer?.files);
}

function startConversion() {
  convertStore.startConversion();
}

function chooseOutputDirectory() {
  convertStore.chooseOutputDirectory();
}

function chooseInputFiles() {
  convertStore.chooseInputFiles();
}

function toggleDitherMenu() {
  ditherMenuOpen.value = !ditherMenuOpen.value;
  if (!ditherMenuOpen.value) {
    hoveredDither.value = '';
  }
}

function closeDitherMenu() {
  ditherMenuOpen.value = false;
  hoveredDither.value = '';
}

function selectDitherMethod(value) {
  convertStore.setDitherMethod(value);
  closeDitherMenu();
}

function handleOutsideClick(event) {
  if (!ditherMenuOpen.value) {
    return;
  }

  if (ditherMenuRef.value && !ditherMenuRef.value.contains(event.target)) {
    closeDitherMenu();
  }
}

function clearBatch() {
  convertStore.clearFiles();
}

function openOutputFolder() {
  convertStore.openOutputFolder();
}

function getFileStatus(filePath) {
  return fileStatusMap.value[filePath] || 'queued';
}

function getFileStatusLabel(filePath) {
  const value = getFileStatus(filePath);
  if (value === 'running') {
    return 'Running';
  }
  if (value === 'done') {
    return 'Done';
  }
  if (value === 'error') {
    return 'Error';
  }
  return 'Queued';
}

function getFileStatusClass(filePath) {
  const value = getFileStatus(filePath);
  if (value === 'running') {
    return 'status-chip status-chip-running';
  }
  if (value === 'done') {
    return 'status-chip status-chip-done';
  }
  if (value === 'error') {
    return 'status-chip status-chip-error';
  }
  return 'status-chip status-chip-queued';
}

function getPathLabel(filePath) {
  if (String(filePath || '').startsWith('browser://')) {
    return 'Upload via navegador';
  }
  return filePath;
}

const canOpenOutputFolder = computed(() => !isWebRuntime.value && status.value === 'done' && (Boolean(outputDirectory.value) || Boolean(completionResult.value?.outputDirectory) || Boolean(completionResult.value?.results?.length)));

onMounted(() => {
  convertStore.initializeIpcListeners();
  document.addEventListener('click', handleOutsideClick);
});

onUnmounted(() => {
  convertStore.disposeIpcListeners();
  document.removeEventListener('click', handleOutsideClick);
});
</script>

<template>
  <main class="theme-shell relative mx-auto min-h-screen w-full max-w-6xl px-5 py-8 md:px-10">
    <div class="theme-atmosphere pointer-events-none absolute inset-0 -z-10" />

    <header class="glass-panel slime-panel rounded-3xl p-6 md:p-8">
      <div class="banner-wrap mb-6">
        <img src="/cabecalho.png" alt="Master of Converters" class="banner-image">
      </div>

      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="slime-icon-frame rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-cyan-200">
            <AudioLines class="h-7 w-7" />
          </div>
          <div>
            <h1 class="text-3xl font-semibold tracking-tight text-slate-100">Conversor de Áudio</h1>
            <p class="mt-1 text-sm text-slate-300">Laboratório de conversão de áudio em lote {{ isWebRuntime ? '(Web)' : '(Desktop)' }}</p>
          </div>
        </div>

        <span class="slime-status-pill rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em]" :class="statusClass">
          {{ statusText }}
        </span>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-4">
        <div class="md:col-span-4 flex items-end justify-end">
          <div class="inline-flex rounded-2xl border border-white/15 bg-slate-900/60 p-1">
            <button
              class="tab-btn"
              :class="activeTab === 'simple' ? 'tab-btn-active' : 'tab-btn-idle'"
              @click="setSimpleTab"
            >
              <FolderInput class="h-4 w-4" />
              Simple
            </button>
            <button
              class="tab-btn"
              :class="activeTab === 'expert' ? 'tab-btn-active' : 'tab-btn-idle'"
              @click="setExpertTab"
            >
              <SlidersHorizontal class="h-4 w-4" />
              Expert
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div class="grave-card rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2">
          <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">Saida</p>
          <p class="mt-1 truncate text-sm text-slate-200">{{ isWebRuntime ? 'Download automatico em arquivo ZIP' : (outputDirectory || 'Mesmo diretorio dos arquivos de origem') }}</p>
        </div>
        <button v-if="!isWebRuntime" class="ghost-btn" @click="chooseOutputDirectory">
          <FolderOpen class="h-4 w-4" />
          Selecionar pasta
        </button>
      </div>
    </header>

    <section class="glass-panel mt-6 rounded-3xl p-6 md:p-8">
      <div v-if="activeTab === 'simple'" class="grid gap-6">
        <div class="grid gap-4 md:grid-cols-2">
          <label>
            <span class="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Formato de saida</span>
            <select
              :value="targetFormat"
              class="field-base"
              @change="convertStore.setTargetFormat($event.target.value)"
            >
              <option v-for="option in outputFormatOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <div class="rounded-xl border border-white/10 bg-slate-950/45 px-4 py-3">
            <p class="text-[11px] uppercase tracking-[0.16em] text-slate-400">Formato de entrada</p>
            <p class="mt-1 text-sm text-slate-200">Detectado automaticamente musica a musica</p>
          </div>
        </div>

        <div
          class="dropzone slime-dropzone flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed p-8 text-center"
          :class="isDragOver ? 'border-cyan-200 bg-cyan-300/15 shadow-[0_0_0_1px_rgba(125,211,252,0.35)]' : 'border-slate-400/30 bg-slate-950/40'"
          @dragenter.prevent="handleDragEnter"
          @dragover.prevent="handleDragEnter"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
        >
          <p class="text-xl font-medium tracking-wide text-slate-100">Arraste e solte seus arquivos aqui</p>
          <p class="mt-2 max-w-lg text-sm text-slate-300">
            Ao soltar arquivos, o preset Simple e aplicado automaticamente: 16-bit, 44.1kHz e TPDF.
          </p>
          <button class="ghost-btn mt-5" :disabled="isRunning" @click="chooseInputFiles">
            <FolderInput class="h-4 w-4" />
            Selecionar arquivos
          </button>
          <p class="mt-5 text-xs uppercase tracking-[0.2em] text-slate-400">{{ files.length }} arquivo(s) carregado(s)</p>
        </div>

        <div v-if="files.length" class="slime-table-wrap overflow-hidden rounded-2xl border border-white/15 bg-slate-950/45">
          <table class="slime-table w-full border-collapse text-sm">
            <thead class="bg-slate-900/80 text-xs uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th class="px-4 py-3 text-left">Arquivo</th>
                <th class="px-4 py-3 text-left">Entrada</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="file in files" :key="`simple-${file.path}`" class="border-t border-white/10">
                <td class="px-4 py-3 text-slate-100">{{ file.name }}</td>
                <td class="px-4 py-3 text-slate-300">{{ String(file.inputFormat || 'desconhecido').toUpperCase() }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex justify-center">
          <div class="flex flex-wrap justify-center gap-3">
            <button class="ghost-btn" :disabled="isRunning" @click="chooseInputFiles">
              <FolderInput class="h-4 w-4" />
              Selecionar arquivos
            </button>
            <button class="action-btn" :disabled="isRunning || !files.length" @click="startConversion">
              <Play class="h-4 w-4" />
              Start
            </button>
            <button class="ghost-btn" :disabled="isRunning || !files.length" @click="clearBatch">
              Limpar lote
            </button>
          </div>
        </div>
      </div>

      <div v-else class="grid gap-6">
        <div class="grid gap-4 md:grid-cols-3">
          <label>
            <span class="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Formato de saida</span>
            <select
              :value="targetFormat"
              class="field-base"
              @change="convertStore.setTargetFormat($event.target.value)"
            >
              <option v-for="option in outputFormatOptions" :key="`expert-${option.value}`" :value="option.value">{{ option.label }}</option>
            </select>
          </label>

          <label>
            <span class="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Bit Depth</span>
            <select
              :value="bitDepth"
              class="field-base"
              :disabled="!isLosslessTarget"
              @change="convertStore.setBitDepth($event.target.value)"
            >
              <option :value="16">16</option>
              <option :value="24">24</option>
            </select>
          </label>

          <label>
            <span class="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Sample Rate</span>
            <select
              :value="sampleRate"
              class="field-base"
              @change="convertStore.setSampleRate($event.target.value)"
            >
              <option :value="44100">44.1 kHz</option>
              <option :value="48000">48 kHz</option>
              <option :value="96000">96 kHz</option>
            </select>
          </label>

          <label>
            <span class="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-400">
              Dither Method
              <BadgeInfo class="h-3.5 w-3.5 text-cyan-200" />
            </span>
            <div ref="ditherMenuRef" class="relative">
              <button class="field-base dither-trigger" type="button" :disabled="isDitherLocked" @click="toggleDitherMenu">
                <span>{{ selectedDitherOption?.label }}</span>
                <ChevronDown class="h-4 w-4 text-slate-300" />
              </button>

              <div v-if="ditherMenuOpen" class="dither-menu">
                <button
                  v-for="option in ditherOptions"
                  :key="option.value"
                  type="button"
                  class="dither-option"
                  :class="option.value === ditherMethod ? 'dither-option-active' : ''"
                  @mouseenter="hoveredDither = option.value"
                  @mouseleave="hoveredDither = ''"
                  @focus="hoveredDither = option.value"
                  @blur="hoveredDither = ''"
                  @click="selectDitherMethod(option.value)"
                >
                  <span>{{ option.label }}</span>
                  <span v-if="option.value === ditherMethod" class="text-[10px] uppercase tracking-[0.14em] text-cyan-200">Ativo</span>
                </button>
              </div>

              <div v-if="ditherMenuOpen && hoveredDitherOption?.tooltip" class="dither-tooltip">
                {{ hoveredDitherOption.tooltip }}
              </div>
            </div>
            <p v-if="isDitherLocked" class="mt-2 text-xs text-slate-400">
              Dither desligado automaticamente para conversão sem redução de 24 para 16 ou para formatos com perdas.
            </p>
          </label>

          <label>
            <span class="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Normalizacao</span>
            <div class="field-base flex items-center justify-between gap-3">
              <span class="text-slate-200">Ativar loudness normalizado</span>
              <input
                :checked="normalizeEnabled"
                type="checkbox"
                class="h-4 w-4 accent-cyan-300"
                @change="convertStore.setNormalizeEnabled($event.target.checked)"
              >
            </div>
          </label>

          <label>
            <span class="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Alvo de Loudness (LUFS)</span>
            <input
              :value="normalizeTargetDb"
              type="number"
              min="-30"
              max="-5"
              step="1"
              class="field-base"
              :disabled="!normalizeEnabled"
              @input="convertStore.setNormalizeTargetDb($event.target.value)"
            >
          </label>
        </div>

        <div class="slime-table-wrap overflow-hidden rounded-2xl border border-white/15 bg-slate-950/45">
          <table class="slime-table w-full border-collapse text-sm">
            <thead class="bg-slate-900/80 text-xs uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th class="px-4 py-3 text-left">Arquivo</th>
                <th class="px-4 py-3 text-left">Entrada</th>
                <th class="px-4 py-3 text-left">Caminho</th>
                <th class="px-4 py-3 text-left">Status e Progresso</th>
                <th class="px-4 py-3 text-right">Acao</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!files.length">
                <td colspan="5" class="px-4 py-7 text-center text-sm text-slate-400">
                  Nenhum arquivo no lote. Use a aba Simple para arrastar e soltar.
                </td>
              </tr>
              <tr v-for="file in files" :key="file.path" class="border-t border-white/10">
                <td class="px-4 py-3 text-slate-100">{{ file.name }}</td>
                <td class="px-4 py-3 text-slate-300">{{ String(file.inputFormat || 'desconhecido').toUpperCase() }}</td>
                <td class="max-w-[340px] truncate px-4 py-3 text-slate-400">{{ getPathLabel(file.path) }}</td>
                <td class="px-4 py-3 text-slate-200">
                  <div class="grid gap-1.5 ooze-progress-cell">
                    <span :class="getFileStatusClass(file.path)">{{ getFileStatusLabel(file.path) }}</span>
                    <span>{{ Math.round(convertStore.fileProgressMap[file.path] || 0) }}%</span>
                    <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/70">
                      <div
                        class="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all"
                        :style="{ width: `${Math.round(convertStore.fileProgressMap[file.path] || 0)}%` }"
                      />
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 text-right">
                  <button class="text-xs font-medium uppercase tracking-[0.14em] text-rose-300 transition hover:text-rose-200" @click="convertStore.removeFile(file.path)">
                    Remover
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex justify-center">
          <div class="flex flex-wrap justify-center gap-3">
            <button class="ghost-btn" :disabled="isRunning" @click="chooseInputFiles">
              <FolderInput class="h-4 w-4" />
              Selecionar arquivos
            </button>
            <button class="action-btn" :disabled="isRunning || !files.length" @click="startConversion">
              <Play class="h-4 w-4" />
              Start
            </button>
            <button class="ghost-btn" :disabled="isRunning || !files.length" @click="clearBatch">
              Limpar lote
            </button>
          </div>
        </div>
      </div>

      <div class="mt-6 grid gap-4">
        <div class="grave-card rounded-2xl border border-white/15 bg-slate-900/70 p-4">
          <div class="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-slate-400">
            <span>Progresso global</span>
            <span>{{ batchProgress }}%</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-slate-700/70">
            <div class="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all" :style="{ width: `${batchProgress}%` }" />
          </div>
        </div>

        <div class="grave-card rounded-2xl border border-white/15 bg-slate-900/70 p-4 text-xs text-slate-200">
          <p v-if="noticeMessage" class="mb-2 text-amber-200">Aviso: {{ noticeMessage }}</p>
          <p v-if="errorMessage" class="text-rose-300">Erro: {{ errorMessage }}</p>
          <pre v-else-if="completionResult" class="whitespace-pre-wrap">{{ JSON.stringify(completionResult, null, 2) }}</pre>
          <p v-else>Aguardando conversão...</p>

          <div class="mt-3">
            <button v-if="!isWebRuntime" class="ghost-btn" :disabled="!canOpenOutputFolder" @click="openOutputFolder">
              <FolderOpen class="h-4 w-4" />
              Abrir pasta de saida
            </button>
            <p v-else class="text-slate-300">No modo web, o navegador faz o download do ZIP ao finalizar.</p>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
