import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null,
    user: null,
    profile: null,
    loading: false,
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => !!state.session,
    role: (state) => state.profile?.rol || null,
  },
  actions: {
    async init() {
      const { data } = await supabase.auth.getSession()
      this.session = data.session
      this.user = data.session?.user || null
      if (this.user) {
        await this.fetchProfile()
      }
      supabase.auth.onAuthStateChange((_event, session) => {
        this.session = session
        this.user = session?.user || null
        if (this.user) {
          this.fetchProfile()
        } else {
          this.profile = null
        }
      })
      this.initialized = true
    },

    async fetchProfile() {
      if (!this.user) return
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', this.user.id)
        .single()
      if (!error) {
        this.profile = data
      }
    },

    async signIn(email, password) {
      this.loading = true
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        await this.fetchProfile()
        return { success: true }
      } catch (error) {
        return { success: false, error: error.message }
      } finally {
        this.loading = false
      }
    },

    async signOut() {
      await supabase.auth.signOut()
      this.session = null
      this.user = null
      this.profile = null
    },
  },
})
