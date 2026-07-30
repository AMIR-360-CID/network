import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

const SESSION_KEY = 'subtrack_session'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed && parsed.id && parsed.username && parsed.role) {
          setUser(parsed)
        }
      } catch {
        localStorage.removeItem(SESSION_KEY)
      }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (username, password) => {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, role, is_active')
      .eq('username', username)
      .eq('password', password)
      .maybeSingle()

    if (error) {
      return { success: false, error: 'حدث خطأ في الاتصال بقاعدة البيانات' }
    }

    if (!data) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }
    }

    if (data.is_active === false) {
      return { success: false, error: 'هذا الحساب معطل. يرجى الاتصال بالمدير' }
    }

    const session = {
      id: data.id,
      username: data.username,
      role: data.role,
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser(session)

    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', data.id)

    return { success: true }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }, [])

  const isAdmin = user?.role === 'admin'
  const isDataEntry = user?.role === 'data_entry'
  const isViewer = user?.role === 'viewer'

  const value = {
    user,
    loading,
    login,
    logout,
    isAdmin,
    isDataEntry,
    isViewer,
    canDelete: isAdmin,
    canManageUsers: isAdmin,
    canEdit: isAdmin || isDataEntry,
    canPay: isAdmin || isDataEntry,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
