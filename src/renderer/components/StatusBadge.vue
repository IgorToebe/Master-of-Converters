<script setup>
const props = defineProps({
  status: {
    type: String,
    default: 'idle',
  },
});

const statusClasses = {
  idle: 'bg-slate-700/60 text-slate-100',
  running: 'bg-amber-500/20 text-amber-200',
  done: 'bg-emerald-500/20 text-emerald-200',
  error: 'bg-rose-500/20 text-rose-200',
};
</script>

<template>
  <span
    class="inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
    :class="statusClasses[status] ?? statusClasses.idle"
  >
    {{ status }}
  </span>
</template>
