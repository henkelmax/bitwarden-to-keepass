<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { ConversionSummary } from '../lib/convert';

const props = defineProps<{
  summary: ConversionSummary;
  kdbx: Uint8Array;
  downloadName: string;
}>();
const emit = defineEmits<{ reset: [] }>();

const blob = new Blob([props.kdbx as BlobPart], { type: 'application/octet-stream' });
const url = URL.createObjectURL(blob);
onBeforeUnmount(() => URL.revokeObjectURL(url));

const downloaded = ref(false);

const rows = computed(() => [
  { label: 'Entries', value: props.summary.entries },
  { label: 'Folders', value: props.summary.folders },
  { label: 'Attachments', value: props.summary.attachments },
  { label: 'TOTP secrets', value: props.summary.totp },
  { label: 'SSH keys', value: props.summary.sshKeys },
]);
</script>

<template>
  <div class="mt-6">
    <p class="text-lg font-semibold text-green-400">✓ Database created</p>

    <ul class="my-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
      <li
        v-for="row in rows"
        :key="row.label"
        class="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center"
      >
        <span class="block text-2xl font-bold">{{ row.value }}</span>
        <span class="text-xs text-slate-400">{{ row.label }}</span>
      </li>
    </ul>

    <p class="text-sm text-slate-400">
      An "Original Bitwarden export" entry with the full export is included as a backup.
    </p>

    <div class="mt-4 flex flex-wrap gap-3">
      <a :href="url" :download="downloadName" @click="downloaded = true">
        <button class="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-500">
          Download .kdbx
        </button>
      </a>
      <button
        class="rounded-lg bg-slate-700 px-4 py-2.5 font-semibold text-white hover:bg-slate-600"
        @click="emit('reset')"
      >
        Convert another
      </button>
    </div>

    <p
      v-if="downloaded"
      class="mt-4 rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-red-400"
    >
      Now delete the original <code class="rounded bg-slate-700 px-1.5 py-0.5">.zip</code>/<code
        class="rounded bg-slate-700 px-1.5 py-0.5"
        >.json</code
      >
      export - it holds your entire vault in plaintext, unencrypted.
    </p>
  </div>
</template>
