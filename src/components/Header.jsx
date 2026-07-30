import { useAuth } from '../context/AuthContext'

export default function Header({ onNavigate, activeView }) {
  const { user, logout, isAdmin } = useAuth()

  const roleLabels = {
    admin: 'مدير',
    data_entry: 'موظف إدخال',
    viewer: 'مشاهدة',
  }

  return (
    <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">SubTrack</h1>
              <p className="text-xs text-slate-400">إدارة المشتركين</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {isAdmin && (
              <button
                onClick={() => onNavigate('users')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeView === 'users'
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className="hidden sm:inline">إدارة المستخدمين</span>
                  <span className="sm:hidden">المستخدمون</span>
                </span>
              </button>
            )}

            <button
              onClick={() => onNavigate('dashboard')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeView === 'dashboard'
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span className="hidden sm:inline">لوحة التحكم</span>
                <span className="sm:hidden">الرئيسية</span>
              </span>
            </button>

            <div className="flex items-center gap-3 pr-3 sm:pr-4 border-r border-white/10">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-white">{user?.username}</p>
                <p className="text-xs text-slate-400">{roleLabels[user?.role] || user?.role}</p>
              </div>
              <div className="w-9 h-9 bg-primary-600/20 border border-primary-500/30 rounded-full flex items-center justify-center text-primary-300 font-semibold text-sm">
                {user?.username?.charAt(0)?.toUpperCase()}
              </div>
              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-danger-400 hover:bg-danger-500/10 rounded-lg transition-all"
                title="تسجيل الخروج"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
