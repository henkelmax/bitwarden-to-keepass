<script setup lang="ts">
import { ref } from 'vue';
import DropZone from './components/DropZone.vue';
import PasswordForm from './components/PasswordForm.vue';
import Result from './components/Result.vue';
import { convert, type ConversionResult } from './lib/convert';

const file = ref<File | null>(null);
const busy = ref(false);
const error = ref('');
const result = ref<ConversionResult | null>(null);

function selectFile(selected: File): void {
  file.value = selected;
  error.value = '';
  result.value = null;
}

async function run(password: string): Promise<void> {
  if (!file.value) return;
  busy.value = true;
  error.value = '';
  try {
    const bytes = new Uint8Array(await file.value.arrayBuffer());
    result.value = await convert(file.value.name, bytes, password);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

function reset(): void {
  file.value = null;
  result.value = null;
  error.value = '';
}

function downloadName(): string {
  const base = file.value?.name.replace(/\.(zip|json)$/i, '') ?? 'bitwarden';
  return `${base}.kdbx`;
}
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-slate-100">
   <div class="mx-auto max-w-2xl px-5 py-10">
    <header>
      <h1 class="text-2xl font-bold">Bitwarden -> KeePass</h1>
      <p class="mt-1 text-slate-400">
        Convert a Bitwarden/Vaultwarden export into a KeePass
        <code class="rounded bg-slate-700 px-1.5 py-0.5">.kdbx</code> database. Everything runs in
        your browser - your vault never leaves this device.
      </p>
    </header>

    <main class="mt-6">
      <template v-if="!result">
        <DropZone @file="selectFile" />
        <p v-if="file" class="mt-4 text-slate-400">
          Selected: <strong class="text-slate-100">{{ file.name }}</strong>
        </p>
        <PasswordForm v-if="file" :busy="busy" @submit="run" />
      </template>

      <Result
        v-else
        :summary="result.summary"
        :kdbx="result.kdbx"
        :download-name="downloadName()"
        @reset="reset"
      />

      <p v-if="error" class="mt-5 rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-red-400">
        {{ error }}
      </p>
    </main>
   </div>
  </div>
</template>
