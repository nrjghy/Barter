import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Dashboard } from "./pages/Dashboard";
import { AddToy } from "./pages/AddToy";
import { Profile } from "./pages/Profile";
import { Chat } from "./pages/Chat";
import { ChatThread } from "./pages/ChatThread";
import { MarkTradeComplete } from "./pages/MarkTradeComplete";
import { ReviewWrite } from "./pages/ReviewWrite";
import { MyStuff } from "./pages/MyStuff";
import { ItemDetail } from "./pages/ItemDetail";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AuthCallback } from "./pages/AuthCallback";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Account } from "./pages/Account";
import { AccountDeleted } from "./pages/AccountDeleted";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useEffect } from "react";
import { identifyUser } from "./lib/analytics";

const AppContent: React.FC = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      identifyUser(user.id);
    }
  }, [user?.id]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
        <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/account-deleted" element={<AccountDeleted />} />
        <Route path="/" element={<Layout />}>
          <Route
            index
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/item/:id"
            element={
              <ProtectedRoute>
                <ItemDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add"
            element={
              <ProtectedRoute>
                <AddToy />
              </ProtectedRoute>
            }
          />
          <Route
            path="/edit/:itemId"
            element={
              <ProtectedRoute>
                <AddToy />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-stuff"
            element={
              <ProtectedRoute>
                <MyStuff />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:connectionId"
            element={
              <ProtectedRoute>
                <ChatThread />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:connectionId/trade-complete"
            element={
              <ProtectedRoute>
                <MarkTradeComplete />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trade-completion/:tradeCompletionId/review"
            element={
              <ProtectedRoute>
                <ReviewWrite />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
