<script setup lang="ts">
//license GPL Jonas Immanuel Frey
import { ref } from "vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: "confirm", dontShowAgain: boolean): void;
  (e: "cancel"): void;
}>();

const dontShowAgain = ref(false);

function onConfirm() {
  emit("confirm", dontShowAgain.value);
}
</script>

<template>
  <div v-if="open" class="backdrop" role="dialog" aria-modal="true" @click.self="emit('cancel')">
    <div class="modal">
      <h2>Lovely Labels is free &amp; open source</h2>
      <p>
        If it saved you time, a small tip helps keep it ad-free and improving.
        No pressure &mdash; your download is ready either way.
      </p>
      <div class="actions">
        <a
          class="kofi"
          href="https://ko-fi.com/veryos"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="heart" aria-hidden="true">&#9829;</span>
          Tip on Ko-fi
        </a>
        <button type="button" class="primary" @click="onConfirm">Download STL</button>
      </div>
      <label class="dont-show">
        <input v-model="dontShowAgain" type="checkbox" />
        Don't show this again
      </label>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(5, 7, 12, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: #1a1d27;
  border: 1px solid #2a2f3d;
  border-radius: 8px;
  padding: 1.25rem 1.4rem;
  width: min(420px, 92vw);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  letter-spacing: 0.02em;
}
p {
  margin: 0 0 1rem 0;
  color: #b6bccf;
  font-size: 0.85rem;
  line-height: 1.45;
}
.actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.kofi {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #ff5e5b;
  color: #fff;
  text-decoration: none;
  padding: 0.5rem 0.8rem;
  border-radius: 5px;
  font-weight: 600;
  font-size: 0.82rem;
}
.kofi:hover { background: #ff7a78; }
.heart { font-size: 0.9rem; }
.primary {
  background: #6f8cff;
  color: #0d1018;
  border: none;
  padding: 0.5rem 0.9rem;
  border-radius: 5px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  letter-spacing: 0.02em;
}
.primary:hover { background: #8aa1ff; }
.dont-show {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.9rem;
  color: #8b94aa;
  font-size: 0.78rem;
  cursor: pointer;
}
</style>
