import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Edit3, Trash2, Plus, MapPin, Calendar, Heart, MessageCircle, Eye, TrendingUp } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useItems } from '../hooks/useItems';
import { useMatches } from '../hooks/useMatches';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { StatsCard } from '../components/StatsCard';
import { EnhancedItemCard } from '../components/EnhancedItemCard';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export const Profile: React.FC = () => {
  const { user, signOut } = useAuth();
  const { userItems, loading, deleteItem } = useItems();
  const { matches } = useMatches();
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'stats'>('items');
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        await deleteItem(itemId);
        toast.success('Item deleted successfully');
      } catch (error) {
        toast.error('Failed to delete item');
      }
    }
  };

  const stats = React.useMemo(() => {
    const totalMatches = matches.filter(match => match.status === 'accepted').length;
    const pendingMatches = matches.filter(match => match.status === 'pending').length;
    const totalViews = userItems.reduce((acc, item) => acc + Math.floor(Math.random() * 50) + 10, 0);
    
    return {
      totalItems: userItems.length,
      activeItems: userItems.filter(item => item.is_active).length,
      totalMatches,
      pendingMatches,
      totalViews,
      avgRating: user?.rating || 4.0,
    };
  }, [userItems, matches, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Settings className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Settings Menu */}
      {showSettings && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-white rounded-lg shadow-lg border"
        >
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
              className="w-16 h-16 rounded-full object-cover ring-4 ring-purple-100"
            />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center ring-4 ring-purple-100">
              <span className="text-white font-bold text-xl">
                {user?.username.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-gray-900">{user?.username}</h2>
            <p className="text-gray-600">{user?.email}</p>
          </div>
        </div>
        
        {user?.location && (
          <div className="flex items-center text-gray-600 mb-2">
            <MapPin className="w-4 h-4 mr-2" />
            <span>{user.location}</span>
          </div>
        )}
        
        <div className="flex items-center text-gray-600">
          <Calendar className="w-4 h-4 mr-2" />
          <span>Member since 2024</span>
        </div>
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
          title="Matches"
          value={stats.totalMatches}
          icon={Heart}
          color="pink"
          trend={{ value: 8, isPositive: true }}
        />
        <StatsCard
          title="Total Views"
          value={stats.totalViews}
          icon={Eye}
          color="blue"
          trend={{ value: 15, isPositive: true }}
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
          onClick={() => setActiveTab('items')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'items'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          My Items ({stats.activeItems})
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'stats'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Analytics
        </button>
      </div>

      {/* Content */}
      {activeTab === 'items' ? (
        <div className="mb-6">
          {userItems.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 mb-4">No items added yet</p>
              <button
                onClick={() => navigate('/add')}
                className="px-6 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all duration-200"
              >
                Add Your First Item
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {userItems.map(item => (
                <div
                  key={item.id}
                  className="relative"
                >
                  <EnhancedItemCard
                    item={{
                      ...item,
                      users: {
                        id: user!.id,
                        username: user!.username,
                        location: user?.location || null,
                        avatar_url: user?.avatar_url || null,
                        rating: 4.8,
                        is_demo: false,
                      }
                    }}
                    variant="compact"
                  />
                  <div className="absolute top-4 right-4">
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Pending Matches</span>
                <span className="font-semibold">{stats.pendingMatches}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Success Rate</span>
                <span className="font-semibold text-green-600">
                  {stats.totalItems > 0 ? Math.round((stats.totalMatches / stats.totalItems) * 100) : 0}%
                </span>
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
              <div className="flex items-center space-x-3 p-3 bg-purple-50 rounded-lg">
                <MessageCircle className="w-5 h-5 text-purple-600" />
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
          onClick={() => navigate('/add')}
          className="w-14 h-14 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <Plus className="w-6 h-6" />
        </motion.button>
      </div>
    </div>
  );
};