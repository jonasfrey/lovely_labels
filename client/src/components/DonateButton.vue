<script setup lang="ts">
//license GPL Jonas Immanuel Frey
</script>

<template>
  <a
    class="donate"
    href="https://ko-fi.com/veryos"
    target="_blank"
    rel="noopener noreferrer"
    title="Support Lovely Labels on Ko-fi"
  >
    <span class="heart" aria-hidden="true">&#9829;</span>
    <span>Donate</span>
  </a>
</template>

<style scoped>
.donate {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #ff5e5b;
  color: #fff;
  text-decoration: none;
  padding: 0.4rem 0.7rem;
  border-radius: 5px;
  font-weight: 600;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
}
.donate:hover { background: #ff7a78; }
.heart { font-size: 0.9rem; }
</style>
