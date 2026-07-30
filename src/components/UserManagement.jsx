import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import AddUserModal from './AddUserModal'
import EditUserModal from './EditUserModal'

export default function UserManagement() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editUser, setEditUser] = useState(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const { data, error: fetchError } = await supabase
        .from('users')
        .select('id, username, role, is_active, created_at, last_login')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setUsers(data || [])
    } catch (err) {
      setError('فشل في جلب المستخدمين: ' + err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const toggleActive = async (userId, currentActive) => {
    if (userId === currentUser?.id) {
      setError('لا يمكنك تعطيل حسابك الخاص')
      return
    }
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ is_active: !currentActive })
        .eq('id', userId)

      if (updateError) throw updateError

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_active: !currentActive } : u))
      )
    } catch (err) {
      setError('فشل في تحديث حالة المستخدم: ' + err.message)
    }
  }

  const changeRole = async (userId, newRole) => {
    if (userId === currentUser?.id && newRole !== 'admin') {
      setError('لا يمكنك تغيير دور حسابك الخاص')
      return
    }
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId)

      if (updateError) throw updateError

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      )
    } catch (err) {
      setError('فشل في تغيير الدور: ' + err.message)
    }
  }

  const deleteUser = async (userId) => {
    if (userId === currentUser?.id) {
      setError('لا يمكنك حذف حسابك الخاص')
      return
    }
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return

    try {
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', userId)

      if (deleteError) throw deleteError

      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } catch (err) {
      setError('فشل في حذف المستخدم: ' + err.message)
    }
  }

  const roleLabels = {
    admin: 'مدير',
    data_entry: 'موظف إدخال',
    viewer: 'مشاهدة',
  }

  const roleColors = {
    admin: 'bg-primary-500/20 text-primary-300 border-primary-500/30',
    data_entry: 'bg-warning-500/20 text-warning-300 border-warning-500/30',
    viewer: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">إدارة المستخدمين</h2>
            <p className="text-slate-400">إضافة وإدارة حسابات الموظفين والصلاحيات</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-primary-600/20 text-sm whitespace-nowrap"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            إضافة مستخدم
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-danger-500/10 border border-danger-500/30 rounded-xl px-4 py-3 text-danger-100 text-sm">
            {error}
          </div>
        )}

        <div className="bg-slate-800/30 border border-white/5 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-slate-400">لا يوجد مستخدمون</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">اسم المستخدم</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">الدور</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">الحالة</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider hidden sm:table-cell">آخر دخول</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary-600/20 border border-primary-500/30 rounded-full flex items-center justify-center text-primary-300 font-semibold text-xs">
                            {u.username?.charAt(0)?.toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-white">{u.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer ${roleColors[u.role]} bg-transparent focus:outline-none focus:ring-1 focus:ring-primary-500`}
                        >
                          <option value="admin" className="bg-slate-800">مدير</option>
                          <option value="data_entry" className="bg-slate-800">موظف إدخال</option>
                          <option value="viewer" className="bg-slate-800">مشاهدة</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <button
                          onClick={() => toggleActive(u.id, u.is_active)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${u.is_active ? 'bg-success-600' : 'bg-slate-600'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${u.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400 hidden sm:table-cell">
                        {u.last_login ? new Date(u.last_login).toLocaleDateString('ar') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditUser(u)}
                            className="p-1.5 bg-warning-500/10 hover:bg-warning-500/20 text-warning-400 rounded-lg transition-all"
                            title="تعديل"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteUser(u.id)}
                            className="p-1.5 bg-danger-500/10 hover:bg-danger-500/20 text-danger-400 rounded-lg transition-all"
                            title="حذف"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onAdded={(newUser) => {
            setUsers((prev) => [newUser, ...prev])
          }}
        />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onUpdated={(updatedUser) => {
            setUsers((prev) =>
              prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
            )
          }}
        />
      )}
    </div>
  )
}
