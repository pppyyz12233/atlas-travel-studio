import { createPortal } from 'react-dom'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import AuthModal from './components/AuthModal'
import AIPage from './pages/AIPage'
import HomePage from './pages/HomePage'
import ExplorePage from './pages/ExplorePage'
import TripsPage from './pages/TripsPage'
import TripDetailPage from './pages/TripDetailPage'
import DestinationDetailPage from './pages/DestinationDetailPage'
import AppFrame from './app/AppFrame'
import { RouterProvider, useRouter } from './app/router'
import { JourneyProvider } from './app/JourneyProvider'
import { ToastProvider } from './app/Toast'

function Routes({ auth, theme }: {
  auth: ReturnType<typeof useAuth>
  theme: ReturnType<typeof useTheme>
}) {
  const { route } = useRouter()
  switch (route.name) {
    case 'plan':
      return <AIPage auth={auth} theme={theme} />
    case 'explore':
      return <ExplorePage />
    case 'destination':
      return route.sessionId ? <DestinationDetailPage destinationId={route.sessionId} /> : <ExplorePage />
    case 'trips':
      return <TripsPage auth={auth} />
    case 'trip':
      return route.sessionId ? <TripDetailPage sessionId={route.sessionId} /> : <HomePage />
    default:
      return <HomePage />
  }
}

export default function App() {
  const auth = useAuth()
  const theme = useTheme()

  return (
    <RouterProvider>
      <JourneyProvider>
        <ToastProvider>
          <AppFrame auth={auth} theme={theme}>
            <Routes auth={auth} theme={theme} />
          </AppFrame>
          {auth.showAuthModal && createPortal(
            <AuthModal
              onClose={() => auth.setShowAuthModal(false)}
              onLogin={auth.login}
              onLoginByPhone={auth.loginByPhone}
              onRegister={auth.register}
            />,
            document.body,
          )}
        </ToastProvider>
      </JourneyProvider>
    </RouterProvider>
  )
}
