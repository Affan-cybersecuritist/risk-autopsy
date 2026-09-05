import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import RequireAuth from './components/RequireAuth'
import AppBoot from './components/AppBoot'

export default function App() {
  return (
    <AppBoot>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/account" element={<Login />} />
        </Routes>
      </BrowserRouter>
    </AppBoot>
  )
}
