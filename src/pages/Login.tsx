import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, AlertCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { OAuthProviderButton } from "../components/OAuthProviderButton";
import { consumeRedirectAfterLogin } from "../utils/redirectAfterLogin";
import toast from "react-hot-toast";

export const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { signIn, signInWithOAuth, resendVerification } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error } = await signIn(email, password);
      if (error) {
        // Check if it's an authentication error
        if (
          error.message.includes("Invalid login credentials") ||
          error.message.includes("Email not confirmed") ||
          error.message.includes("Invalid email or password")
        ) {
          setError("Invalid username or password. Please check your credentials and try again.");
        } else if (error.message.includes("Email not confirmed")) {
          setError("Please verify your email address before signing in. Check your inbox for a verification link.");
        } else {
          setError(error.message);
        }
      } else {
        toast.success("Welcome back!");
        navigate(consumeRedirectAfterLogin());
      }
    } catch (error) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "facebook" | "apple") => {
    setSocialLoading(provider);
    setError("");

    try {
      const { error } = await signInWithOAuth(provider);
      if (error) {
        setError(`Failed to sign in with ${provider}. Please try again.`);
      }
    } catch (error) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSocialLoading(null);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }

    try {
      const { error } = await resendVerification(email);
      if (error) {
        setError("Failed to resend verification email. Please try again.");
      } else {
        toast.success("Verification email sent! Check your inbox.");
      }
    } catch (error) {
      setError("An unexpected error occurred. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-barter-50 via-barter-50 to-indigo-50">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <motion.div
            className="w-20 h-20 bg-barter-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <span className="text-white font-bold text-2xl">B</span>
          </motion.div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-barter-600 to-barter-600 bg-clip-text text-transparent mb-2">
            Welcome Back
          </h1>
          <p className="text-gray-600">Sign in to continue bartering items</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8"
        >
          {/* Social Login Buttons */}
          <div className="space-y-3 mb-6">
            <OAuthProviderButton
              provider="google"
              onClick={() => handleSocialLogin("google")}
              loading={socialLoading === "google"}
              disabled={socialLoading !== null}
            />
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg"
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="flex-1">
                  <p
                    className="text-sm font-medium"
                    style={{ color: "#FF0000", fontFamily: "system-ui, -apple-system, sans-serif" }}
                  >
                    {error}
                  </p>
                  {error.includes("verify your email") && (
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      className="text-sm text-barter-600 hover:text-barter-700 font-medium underline mt-1"
                    >
                      Resend verification email
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading || socialLoading !== null}
              className="w-full bg-barter-600 text-white py-3 rounded-lg font-medium hover:bg-barter-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              whileHover={{ scale: loading || socialLoading !== null ? 1 : 1.02 }}
              whileTap={{ scale: loading || socialLoading !== null ? 1 : 0.98 }}
            >
              {loading ? <LoadingSpinner /> : "Sign In"}
            </motion.button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/forgot-password"
              className="text-barter-600 hover:text-barter-700 font-medium transition-colors hover:underline"
            >
              Forgot your password?
            </Link>
          </div>
        </motion.div>

        <div className="mt-8 text-center">
          <p className="text-gray-600">
            Don't have an account?{" "}
            <Link
              to="/register"
              className="text-barter-600 hover:text-barter-700 font-medium transition-colors hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};
