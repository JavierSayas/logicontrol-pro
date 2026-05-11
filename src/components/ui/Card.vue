<script setup>
defineProps({
  padding: { type: String, default: 'md' },
  hoverable: { type: Boolean, default: false },
  flush: { type: Boolean, default: false },
})

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}
</script>

<template>
  <div
    :class="[
      'bg-white border border-slate-200 rounded-2xl shadow-sm',
      flush ? '' : paddingClasses[padding],
      hoverable ? 'transition-colors hover:border-slate-300' : '',
    ]"
  >
    <slot />
  </div>
</template>
