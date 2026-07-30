import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import Login from './components/Login'
import Header from './components/Header'
import Dashboard from './components/Dashboard'
import UserManagement from './components/UserManagement'

export default function App() {
  const { user, loading, isAdmin } = useAuth()
  const [activeView, setActiveView] = useState('dashboard')

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header activeView={activeView} onNavigate={setActiveView} />
      {activeView === 'users' && isAdmin ? (
        <UserManagement />
      ) : (
        <Dashboard />
      )}
    </div>
  )
}
