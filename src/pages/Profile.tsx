import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Settings,
  Edit3,
  Trash2,
  Plus,
  MapPin,
  Calendar,
  Heart,
  MessageCircle,
  Eye,
  TrendingUp,
  Navigation,
  Lock,
  Shield,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useItems } from "../hooks/useItems";
import { useTradeCompletions } from "../hooks/useTradeCompletions";
import { useReviews } from "../hooks/useReviews";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { BackBar } from "../components/BackBar";
import { StatsCard } from "../components/StatsCard";
import { EnhancedItemCard } from "../components/EnhancedItemCard";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

export const Profile: React.FC = () => {
  const { user, signOut, updateProfile, updatePassword } = useAuth();
  const { userItems, loading, deleteItem } = useItems();
  const { completedTradeCount } = useTradeCompletions();
  const { reviews, reviewsLoading, reviewsError } = useReviews();
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"items" | "stats" | "reviews">("items");
  const [locationLoading, setLocationLoading] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [profileData, setProfileData] = useState({
    username: user?.username || "",
    location: user?.location || "",
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out successfully");
    } catch (error) {
      toast.error("Failed to sign out");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (window.confirm("Are you sure you want to delete this item?")) {
      try {
        await deleteItem(itemId);
        toast.success("Item deleted successfully");
      } catch (error) {
        toast.error("Failed to delete item");
      }
    }
  };

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser");
      return;
    }

    setLocationLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          // Reverse geocode to a human-readable address via the reverse-geocode
          // Edge Function, falling back to raw coordinates if that call fails.
          const { data: geocodeData, error: geocodeError } = await supabase.functions.invoke("reverse-geocode", {
            body: { lat: latitude, lng: longitude },
          });
          const locationString =
            geocodeError || !geocodeData?.location
              ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
              : geocodeData.location;

          const { error } = await updateProfile({
            ...profileData,
            location: locationString,
            latitude,
            longitude,
          });

          if (error) {
            console.error("Location update error:", error);
            toast.error("Failed to update location");
          } else {
            setProfileData((prev) => ({ ...prev, location: locationString }));
            toast.success("Location updated successfully!");
          }
        } catch (error) {
          console.error("Unexpected location update error:", error);
          toast.error("Failed to update location");
        } finally {
          setLocationLoading(false);
        }
      },
      () => {
        toast.error("Failed to get current location");
        setLocationLoading(false);
      }
    );
  };

  const handleSaveProfile = async () => {
    try {
      const { error } = await updateProfile(profileData);
      if (error) {
        console.error("Profile update error:", error);
        toast.error("Failed to update profile");
      } else {
        toast.success("Profile updated successfully!");
        setEditingProfile(false);
      }
    } catch (error) {
      console.error("Unexpected profile update error:", error);
      toast.error("Failed to update profile");
    }
  };

  const stats = React.useMemo(() => {
    return {
      totalItems: userItems.length,
      activeItems: userItems.filter((item) => item.is_active).length,
      completedTrades: completedTradeCount,
      avgRating: 4.0, // TODO: Get actual rating from user profile
    };
  }, [userItems, completedTradeCount]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <BackBar
        title="Profile"
        onBack={() => navigate(-1)}
        action={
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        }
      />

      <div className="px-4 py-4">
        {/* Settings Menu */}
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-white rounded-lg shadow-lg border"
          >
            <button
              onClick={() => {
                setEditingProfile(!editingProfile);
                setShowSettings(false);
                setProfileData({
                  username: user?.username || "",
                  location: user?.location || "",
                });
              }}
              className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors mb-2"
            >
              Edit Profile
            </button>
            <button
              onClick={() => {
                setShowSettings(false);
                navigate("/account");
              }}
              className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors mb-2"
            >
              Account
            </button>
            {user?.role === "admin" && (
              <button
                onClick={() => {
                  setShowSettings(false);
                  navigate("/admin");
                }}
                className="w-full flex items-center space-x-2 text-left px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors mb-2"
              >
                <Shield className="w-4 h-4" />
                <span>Admin console</span>
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </motion.div>
        )}
  
        {/* User Info */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-gray-100">
          <div className="flex items-center space-x-4 mb-4">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.username}
                className="w-16 h-16 rounded-full object-cover ring-4 ring-barter-100"
              />
            ) : (
              <div className="w-16 h-16 bg-barter-600 rounded-full flex items-center justify-center ring-4 ring-barter-100">
                <span className="text-white font-bold text-xl">{user?.username.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div>
              {editingProfile ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={profileData.username}
                    onChange={(e) => setProfileData((prev) => ({ ...prev, username: e.target.value }))}
                    className="text-xl font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-barter-600 focus:outline-none"
                    placeholder="Username"
                  />
                  <p className="text-gray-600">{user?.email}</p>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900">{user?.username}</h2>
                  <p className="text-gray-600">{user?.email}</p>
                </>
              )}
            </div>
          </div>
  
          <div className="flex items-center text-gray-600 mb-2">
            <MapPin className="w-4 h-4 mr-2" />
            {editingProfile ? (
              <div className="flex-1 flex items-center space-x-2">
                <input
                  type="text"
                  value={profileData.location}
                  onChange={(e) => setProfileData((prev) => ({ ...prev, location: e.target.value }))}
                  className="flex-1 bg-transparent border-b border-gray-300 focus:border-barter-600 focus:outline-none"
                  placeholder="Enter your location"
                />
                <button
                  onClick={getCurrentLocation}
                  disabled={locationLoading}
                  className="flex items-center space-x-1 px-3 py-1 bg-barter-100 text-barter-700 rounded-lg hover:bg-barter-200 transition-colors disabled:opacity-50"
                >
                  {locationLoading ? (
                    <LoadingSpinner />
                  ) : (
                    <>
                      <Navigation className="w-4 h-4" />
                      <span className="text-xs">GPS</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <span>{user?.location || "No location set"}</span>
            )}
          </div>
  
          {/* Password Change Section */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={() => setShowPasswordModal(true)}
              className="flex items-center space-x-2 text-barter-600 hover:text-barter-700 font-medium transition-colors hover:underline"
            >
              <Lock className="w-4 h-4" />
              <span>Change Password</span>
            </button>
          </div>
  
          <div className="flex items-center text-gray-600">
            <Calendar className="w-4 h-4 mr-2" />
            <span>Member since 2024</span>
          </div>
  
          {editingProfile && (
            <div className="flex space-x-3 mt-4 pt-4 border-t">
              <button
                onClick={() => setEditingProfile(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={!user}
                className={`flex-1 px-4 py-2 bg-barter-600 text-white rounded-lg transition-all duration-200 ${
                  !user ? "opacity-50 cursor-not-allowed" : "hover:bg-barter-700"
                }`}
              >
                Save
              </button>
            </div>
          )}
        </div>
  
        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatsCard
            title="Total Items"
            value={stats.totalItems}
            icon={Plus}
            color="purple"
            trend={{ value: 12, isPositive: true }}
          />
          <StatsCard
            title="Trades completed"
            value={stats.completedTrades}
            icon={Heart}
            color="pink"
            trend={{ value: 8, isPositive: true }}
          />
          <StatsCard
            title="Rating"
            value={stats.avgRating.toFixed(1)}
            icon={TrendingUp}
            color="green"
            trend={{ value: 5, isPositive: true }}
          />
        </div>
  
        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button
            onClick={() => setActiveTab("items")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "items" ? "bg-white text-barter-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            My Items ({stats.activeItems})
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "stats" ? "bg-white text-barter-600 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Analytics
          </button>
        </div>
  
        {/* Content */}
        {activeTab === "items" ? (
          <div className="mb-6">
            {userItems.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-600 mb-4">No items added yet</p>
                <button
                  onClick={() => navigate("/add")}
                  className="px-6 py-2 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-all duration-200"
                >
                  Add Your First Item
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {userItems.map((item) => {
                  console.log("Item data:", item); // Debug logging
                  return (
                    <div key={item.id} className="relative">
                      <EnhancedItemCard item={item} variant="compact" />
                      <div className="absolute top-4 right-4">
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === "reviews" ? (
          <div className="space-y-4">
            {reviewsLoading ? (
              <LoadingSpinner />
            ) : reviewsError ? (
              <div className="text-center py-8 text-red-600">Error loading reviews: {reviewsError.message}</div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-600 mb-4">No reviews yet</p>
                <p className="text-sm text-gray-500">Complete trades to receive reviews from other users</p>
              </div>
            ) : (
              reviews.map((review) => (
                <div key={review.id} className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-barter-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {review.reviewer.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{review.reviewer.username}</h4>
                        <div className="flex items-center space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <span
                              key={i}
                              className={`text-sm ${i < review.rating ? "text-yellow-400" : "text-gray-300"}`}
                            >
                              ⭐
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">{new Date(review.created_at).toLocaleDateString()}</span>
                  </div>
  
                  {review.comment && <p className="text-gray-700 mb-3">{review.comment}</p>}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Detailed Analytics */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Overview</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Active Listings</span>
                  <span className="font-semibold">{stats.activeItems}</span>
                </div>
              </div>
            </div>
  
            {/* Recent Activity */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                  <Heart className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">New match received</p>
                    <p className="text-xs text-gray-600">2 hours ago</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                  <Eye className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Your item was viewed 12 times</p>
                    <p className="text-xs text-gray-600">5 hours ago</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-3 bg-barter-50 rounded-lg">
                  <MessageCircle className="w-5 h-5 text-barter-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">New message received</p>
                    <p className="text-xs text-gray-600">1 day ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
  
        {/* Add Item Button */}
        <div className="fixed bottom-20 right-4">
          <motion.button
            onClick={() => navigate("/add")}
            className="w-14 h-14 bg-barter-600 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Plus className="w-6 h-6" />
          </motion.button>
        </div>
  
        {/* Password Change Modal */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-4">Change Password</h3>
  
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPasswordLoading(true);
                  setPasswordError("");
  
                  if (passwordData.newPassword !== passwordData.confirmPassword) {
                    setPasswordError("New passwords do not match.");
                    setPasswordLoading(false);
                    return;
                  }
  
                  if (passwordData.newPassword.length < 6) {
                    setPasswordError("New password must be at least 6 characters long.");
                    setPasswordLoading(false);
                    return;
                  }
  
                  try {
                    const { error } = await updatePassword(passwordData.newPassword);
                    if (error) {
                      setPasswordError(error.message);
                    } else {
                      toast.success("Password updated successfully!");
                      setShowPasswordModal(false);
                      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
                    }
                  } catch (error) {
                    setPasswordError("An unexpected error occurred. Please try again.");
                  } finally {
                    setPasswordLoading(false);
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                    placeholder="Enter new password"
                    required
                    minLength={6}
                  />
                </div>
  
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                    placeholder="Confirm new password"
                    required
                    minLength={6}
                  />
                </div>
  
                {passwordError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{passwordError}</p>
                  </div>
                )}
  
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
                      setPasswordError("");
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className="flex-1 px-4 py-2 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-all duration-200 disabled:opacity-50"
                  >
                    {passwordLoading ? <LoadingSpinner /> : "Update Password"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};
