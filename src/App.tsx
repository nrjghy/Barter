import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Discover } from "./pages/Discover";
import { AddEditItem } from "./pages/AddEditItem";
import { Profile } from "./pages/Profile";
import { Chat } from "./pages/Chat";
import { ChatThread } from "./pages/ChatThread";
import { MarkTradeComplete } from "./pages/MarkTradeComplete";
import { OfferComposer } from "./pages/OfferComposer";
import { ReviewWrite } from "./pages/ReviewWrite";
import { MyStuff } from "./pages/MyStuff";
import { ItemDetail } from "./pages/ItemDetail";
import { UserListings } from "./pages/UserListings";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AuthCallback } from "./pages/AuthCallback";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Account } from "./pages/Account";
import { NotificationSettings } from "./pages/NotificationSettings";
import { AccountDeleted } from "./pages/AccountDeleted";
import { Groups } from "./pages/Groups";
import { GroupDetail } from "./pages/GroupDetail";
import { GroupJoin } from "./pages/GroupJoin";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useEffect } from "react";
import { identifyUser } from "./lib/analytics";

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const AppContent: React.FC = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      identifyUser(user.id);
    }
  }, [user?.id]);

  return (
    <Router>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
        <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/account-deleted" element={<AccountDeleted />} />
        <Route path="/join/:token" element={<GroupJoin />} />
        <Route path="/" element={<Layout />}>
          <Route
            index
            element={
              <ProtectedRoute>
                <Discover />
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
            path="/user/:userId"
            element={
              <ProtectedRoute>
                <UserListings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add"
            element={
              <ProtectedRoute>
                <AddEditItem />
              </ProtectedRoute>
            }
          />
          <Route
            path="/edit/:itemId"
            element={
              <ProtectedRoute>
                <AddEditItem />
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
            path="/notification-settings"
            element={
              <ProtectedRoute>
                <NotificationSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups"
            element={
              <ProtectedRoute>
                <Groups />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/:groupId"
            element={
              <ProtectedRoute>
                <GroupDetail />
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
            path="/chat/:connectionId/offer"
            element={
              <ProtectedRoute>
                <OfferComposer />
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
