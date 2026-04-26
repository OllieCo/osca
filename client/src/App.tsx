import { Routes, Route, NavLink } from "react-router-dom"
import AgentPage from "./pages/AgentPage"
import ChatPage from "./pages/ChatPage"

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-6">
        <span className="font-semibold text-gray-800 text-sm tracking-wide">Dispatcher</span>
        <nav className="flex gap-4 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? "text-blue-600 font-medium" : "text-gray-500 hover:text-gray-800"
            }
          >
            Agent
          </NavLink>
          <NavLink
            to="/chat"
            className={({ isActive }) =>
              isActive ? "text-blue-600 font-medium" : "text-gray-500 hover:text-gray-800"
            }
          >
            Chat
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<AgentPage />} />
          <Route path="/chat" element={<ChatPage />} />
        </Routes>
      </main>
    </div>
  )
}
