<script setup>
defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'md' },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
})

const variantClasses = {
  primary: 'text-white bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400',
  secondary: 'text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-900 disabled:text-slate-300 disabled:border-slate-100',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:text-slate-300',
  danger: 'text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400',
  success: 'text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400',
}

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-md',
  md: 'px-3.5 py-2 text-sm gap-2 rounded-lg',
  lg: 'px-4 py-2.5 text-sm gap-2 rounded-lg',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center font-semibold transition-colors disabled:cursor-not-allowed',
      variantClasses[variant],
      sizeClasses[size],
      block ? 'w-full' : '',
    ]"
  >
    <slot />
  </button>
</template>
