import { defineStore } from 'pinia';

export const useAppStore = defineStore('app', {
    state: () => ({
        status: 'idle',
        lastResult: null,
        lastError: null,
    }),
    actions: {
        setStatus(status) {
            this.status = status;
        },
        setResult(result) {
            this.lastResult = result;
            this.lastError = null;
            this.status = 'done';
        },
        setError(error) {
            this.lastError = error;
            this.status = 'error';
        },
    },
});
