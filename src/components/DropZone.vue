<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{ file: [file: File] }>();
const dragging = ref(false);
const input = ref<HTMLInputElement>();

function pick(list: FileList | null): void {
  const file = list?.[0];
  if (file) emit('file', file);
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  pick(event.dataTransfer?.files ?? null);
}
</script>

<template>
  <div
    class="cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors"
    :class="dragging ? 'border-blue-500 bg-slate-800' : 'border-slate-700 bg-slate-800/50 hover:border-blue-500'"
    @click="input?.click()"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <input
      ref="input"
      type="file"
      accept=".zip,.json"
      class="hidden"
      @change="pick(($event.target as HTMLInputElement).files)"
    />
    <p class="font-semibold">Drop your Bitwarden export here</p>
    <p class="mt-1 text-sm text-slate-400">
      or click to choose a file -
      <code class="rounded bg-slate-700 px-1.5 py-0.5">.zip (with attachments)</code> or
      <code class="rounded bg-slate-700 px-1.5 py-0.5">.json</code>
    </p>
  </div>
</template>
