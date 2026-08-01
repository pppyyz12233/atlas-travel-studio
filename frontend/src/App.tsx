import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import Layout from './components/Layout'
import AuthModal from './components/AuthModal'
import HomePage from './pages/HomePage'
import AIPage from './pages/AIPage'
import HistoryPage from './pages/HistoryPage'
import ProfilePage from './pages/ProfilePage'

export default function App() {
  const auth = useAuth()
  const theme = useTheme()

  return (
    <>
      <Routes>
        <Route path="/" element={<Layout auth={auth} theme={theme} />}>
          <Route index element={<HomePage />} />
          <Route path="ai" element={<AIPage auth={auth} />} />
          <Route path="history" element={<HistoryPage auth={auth} />} />
          <Route path="profile" element={<ProfilePage auth={auth} />} />
          <Route path="*" element={<Navigate to="/ai" replace />} />
        </Route>
      </Routes>

      {auth.showAuthModal && (
        <AuthModal
          onClose={() => auth.setShowAuthModal(false)}
          onLogin={auth.login}
          onLoginByPhone={auth.loginByPhone}
          onRegister={auth.register}
        />
      )}
    </>
  )
}
