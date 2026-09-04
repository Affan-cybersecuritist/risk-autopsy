import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* The dashboard is the product - open, read-only risk analysis.
            Auth only shows up where it means something: verifying identity
            at the moment of approving a policy (see ApprovalModal). */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/account" element={<Login />} />
      </Routes>
    </BrowserRouter>
  )
}
