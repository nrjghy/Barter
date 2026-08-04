import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "../components/LoadingSpinner";
import toast from "react-hot-toast";

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error } = await resetPassword(email);
      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        toast.success("Password reset email sent! Check your inbox.");
      }
    } catch (error) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-barter-50 via-barter-50 to-indigo-50">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Check Your Email</h2>
            <p className="text-gray-600 mb-6">
              We've sent a password reset link to <strong>{email}</strong>. Please check your inbox and click the link
              to reset your password.
            </p>
            <div className="space-y-3">
              <Link
                to="/login"
                className="block w-full bg-barter-600 text-white py-3 rounded-lg font-medium hover:bg-barter-700 transition-all duration-200"
              >
                Back to Sign In
              </Link>
              <button
                onClick={() => {
                  setSuccess(false);
                  setEmail("");
                }}
                className="w-full text-gray-600 hover:text-gray-800 py-2 font-medium transition-colors"
              >
                Send Another Email
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

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
            Reset Password
          </h1>
          <p className="text-gray-600">Enter your email to receive a reset link</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                  placeholder="Enter your email address"
                  required
                />
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg"
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-sm font-medium text-red-600">{error}</p>
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              className="w-full bg-barter-600 text-white py-3 rounded-lg font-medium hover:bg-barter-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
            >
              {loading ? <LoadingSpinner /> : "Send Reset Link"}
            </motion.button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-barter-600 hover:text-barter-700 font-medium transition-colors hover:underline"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Sign In
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
