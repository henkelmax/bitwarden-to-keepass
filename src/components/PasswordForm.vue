<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ busy: boolean }>();
const emit = defineEmits<{ submit: [password: string] }>();

const password = ref('');
const confirm = ref('');
const show = ref(false);

const tooShort = computed(() => password.value.length > 0 && password.value.length < 8);
const mismatch = computed(() => confirm.value.length > 0 && password.value !== confirm.value);
const valid = computed(
  () => password.value.length >= 8 && password.value === confirm.value && !props.busy,
);

function submit(): void {
  if (valid.value) emit('submit', password.value);
}

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 focus:outline-2 focus:outline-blue-500';
</script>

<template>
  <form class="mt-6 flex flex-col gap-4" @submit.prevent="submit">
    <label class="flex flex-col gap-1.5 text-sm text-slate-400">
      New master password for the KeePass database
      <input
        :type="show ? 'text' : 'password'"
        v-model="password"
        autocomplete="new-password"
        :class="inputClass"
      />
    </label>
    <label class="flex flex-col gap-1.5 text-sm text-slate-400">
      Confirm password
      <input
        :type="show ? 'text' : 'password'"
        v-model="confirm"
        autocomplete="new-password"
        :class="inputClass"
      />
    </label>

    <label class="flex items-center gap-2 text-sm text-slate-400">
      <input type="checkbox" v-model="show" />
      Show passwords
    </label>

    <p v-if="tooShort" class="text-sm text-red-400">Use at least 8 characters.</p>
    <p v-else-if="mismatch" class="text-sm text-red-400">Passwords do not match.</p>

    <button
      type="submit"
      :disabled="!valid"
      class="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {{ props.busy ? 'Converting…' : 'Convert to KeePass' }}
    </button>
  </form>
</template>
