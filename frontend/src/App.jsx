import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import BottomNav from './components/BottomNav'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import CookbookPage from './pages/CookbookPage'
import FeedPage from './pages/FeedPage'
import AddRecipePage from './pages/AddRecipePage'
import SearchPage from './pages/SearchPage'
import ProfilePage from './pages/ProfilePage'
import RecipeDetailPage from './pages/RecipeDetailPage'
import UserProfilePage from './pages/UserProfilePage'

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      {children}
      <BottomNav />
    </>
  )
}

function PublicOnlyRoute({ children }) {
  const { user } = useAuth()
  if (user) return <Navigate to="/cookbook" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
      <Route path="/cookbook" element={<ProtectedRoute><CookbookPage /></ProtectedRoute>} />
      <Route path="/feed" element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />
      <Route path="/add" element={<ProtectedRoute><AddRecipePage /></ProtectedRoute>} />
      <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/recipe/:id" element={<ProtectedRoute><RecipeDetailPage /></ProtectedRoute>} />
      <Route path="/user/:username" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/cookbook" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
