import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import AuthModal from './components/AuthModal'
import AIPage from './pages/AIPage'

export default function App() {
  const auth = useAuth()
  const theme = useTheme()

  return (
    <>
      <AIPage auth={auth} theme={theme} />
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
