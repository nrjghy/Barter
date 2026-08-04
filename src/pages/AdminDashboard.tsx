import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { BackBar } from '../components/BackBar';
import { supabase } from '../lib/supabase';
import { TABLES } from '../services/config';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, Trash2, Edit3, Search, ChevronLeft, ChevronRight, Shield, AlertCircle, Flag, MessageSquare, Tag, AlertTriangle } from 'lucide-react';

type AdminTab = 'listings' | 'reports' | 'issues' | 'suggestions' | 'disputes';

interface AdminListingRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  condition: string;
  image_urls: string[] | null;
  estimated_value: number | null;
  is_active: boolean;
  created_at: string;
  user_id: string;
  users: {
    id: string;
    username: string;
    location: string | null;
    avatar_url: string | null;
    rating: number | null;
    is_demo: boolean | null;
    role: string | null;
    created_at: string;
  };
}

interface AdminReportRow {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  reporter: { username: string } | null;
  reported_user: { username: string } | null;
  reported_item: { title: string } | null;
}

interface AdminIssueRow {
  id: string;
  title: string;
  description: string;
  issue_type: string;
  status: string;
  image_urls: string[] | null;
  created_at: string;
  reporter: { username: string } | null;
}

interface AdminCategorySuggestionRow {
  id: string;
  title: string;
  category_suggestion: string;
  created_at: string;
  owner: { username: string } | null;
}

interface AdminDisputeRow {
  id: string;
  dispute_reason: string | null;
  completed_at: string;
  disputed_at: string;
  dispute_deadline: string;
  completed_by_user: { username: string } | null;
  disputed_by_user: { username: string } | null;
  connection: {
    id: string;
    user_1: { username: string } | null;
    user_2: { username: string } | null;
  } | null;
}

export const AdminDashboard: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<AdminListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [filterDemo, setFilterDemo] = useState<boolean | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDemoListings, setShowDemoListings] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('listings');

  const [reports, setReports] = useState<AdminReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);

  const [issues, setIssues] = useState<AdminIssueRow[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<AdminCategorySuggestionRow[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const [disputes, setDisputes] = useState<AdminDisputeRow[]>([]);
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [disputesError, setDisputesError] = useState<string | null>(null);

  const fetchAdminListings = async () => {
    if (!user || user.role !== 'admin') {
      setError('Access Denied: You must be an administrator to view this page.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from(TABLES.ITEMS)
        .select(
          `
          id,
          title,
          description,
          category,
          condition,
          image_urls,
          estimated_value,
          is_active,
          created_at,
          user_id,
          users!inner (
            id,
            username,
            location,
            avatar_url,
            rating,
            is_demo,
            role,
            created_at
          )
        `,
          { count: 'exact' }
        );

      if (filterActive !== null) {
        query = query.eq('is_active', filterActive);
      }
      // Local showDemoListings toggle takes priority, matching the old
      // Edge Function's filter_demo query param behavior.
      if (!showDemoListings) {
        query = query.eq('users.is_demo', false);
      } else if (filterDemo !== null) {
        query = query.eq('users.is_demo', filterDemo);
      }
      if (searchTerm) {
        query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      const offset = page * limit;
      query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      setListings((data as unknown as AdminListingRow[]) || []);
      setTotal(count || 0);
    } catch (err) {
      console.error('Error fetching admin listings:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      toast.error('Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchAdminListings();
    }
  }, [user, authLoading, page, limit, sortBy, sortOrder, filterActive, filterDemo, searchTerm, showDemoListings]);

  const fetchReports = async () => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const { data, error } = await supabase
        .from(TABLES.REPORTS)
        .select(
          `
          id,
          reason,
          description,
          status,
          created_at,
          reporter:users!reporter_id ( username ),
          reported_user:users!reported_user_id ( username ),
          reported_item:items!reported_item_id ( title )
        `
        )
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports((data as unknown as AdminReportRow[]) || []);
    } catch (err) {
      console.error('Error fetching admin reports:', err);
      setReportsError(err instanceof Error ? err.message : 'Failed to load reports.');
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchIssues = async () => {
    setIssuesLoading(true);
    setIssuesError(null);
    try {
      const { data, error } = await supabase
        .from(TABLES.ISSUES)
        .select(
          `
          id,
          title,
          description,
          issue_type,
          status,
          image_urls,
          created_at,
          reporter:users!user_id ( username )
        `
        )
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIssues((data as unknown as AdminIssueRow[]) || []);
    } catch (err) {
      console.error('Error fetching admin issues:', err);
      setIssuesError(err instanceof Error ? err.message : 'Failed to load issues.');
    } finally {
      setIssuesLoading(false);
    }
  };

  const fetchCategorySuggestions = async () => {
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const { data, error } = await supabase
        .from(TABLES.ITEMS)
        .select(
          `
          id,
          title,
          category_suggestion,
          created_at,
          owner:users!user_id ( username )
        `
        )
        .eq('category', 'Other')
        .not('category_suggestion', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSuggestions((data as unknown as AdminCategorySuggestionRow[]) || []);
    } catch (err) {
      console.error('Error fetching category suggestions:', err);
      setSuggestionsError(err instanceof Error ? err.message : 'Failed to load category suggestions.');
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const fetchDisputes = async () => {
    setDisputesLoading(true);
    setDisputesError(null);
    try {
      const { data, error } = await supabase
        .from(TABLES.TRADE_COMPLETIONS)
        .select(
          `
          id,
          dispute_reason,
          completed_at,
          disputed_at,
          dispute_deadline,
          completed_by_user:users!completed_by ( username ),
          disputed_by_user:users!disputed_by ( username ),
          connection:connections!connection_id (
            id,
            user_1:users!user_id_1 ( username ),
            user_2:users!user_id_2 ( username )
          )
        `
        )
        .not('disputed_at', 'is', null)
        .order('disputed_at', { ascending: false });

      if (error) throw error;
      setDisputes((data as unknown as AdminDisputeRow[]) || []);
    } catch (err) {
      console.error('Error fetching admin disputes:', err);
      setDisputesError(err instanceof Error ? err.message : 'Failed to load disputes.');
    } finally {
      setDisputesLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user || user.role !== 'admin') return;
    if (activeTab === 'reports') fetchReports();
    if (activeTab === 'issues') fetchIssues();
    if (activeTab === 'suggestions') fetchCategorySuggestions();
    if (activeTab === 'disputes') fetchDisputes();
  }, [activeTab, user, authLoading]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-700 mb-2">Error</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <Shield className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-yellow-700 mb-2">Access Denied</h2>
          <p className="text-yellow-600 mb-4">You do not have permission to view this page.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-6xl mx-auto">
      <BackBar title="Admin console" onBack={() => navigate('/profile')} />

      <div className="px-4 py-4">
        <div className="flex items-center space-x-3 mb-6">
          <Shield className="w-8 h-8 text-barter-600" />
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        </div>
  
        {/* Tab Switcher */}
        <div className="flex bg-white rounded-xl shadow-sm p-1 mb-6 gap-1">
          {([
            { key: 'listings', label: 'Listings', icon: Eye },
            { key: 'reports', label: 'Reports', icon: Flag },
            { key: 'issues', label: 'Issues', icon: MessageSquare },
            { key: 'suggestions', label: 'Category Suggestions', icon: Tag },
            { key: 'disputes', label: 'Disputes', icon: AlertTriangle },
          ] as { key: AdminTab; label: string; icon: typeof Eye }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 flex-1 justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === key ? 'bg-barter-100 text-barter-700' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
  
        {activeTab === 'listings' && (
        <>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-2xl font-bold text-gray-900">{total}</div>
            <div className="text-sm text-gray-600">Total Listings</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-2xl font-bold text-green-600">
              {listings.filter(item => item.is_active).length}
            </div>
            <div className="text-sm text-gray-600">Active Listings</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-2xl font-bold text-blue-600">
              {listings.filter(item => item.users.is_demo).length}
            </div>
            <div className="text-sm text-gray-600">Demo Listings</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="text-2xl font-bold text-barter-600">
              {new Set(listings.map(item => item.user_id)).size}
            </div>
            <div className="text-sm text-gray-600">Unique Users</div>
          </div>
        </div>
  
        {/* Filters and Search */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by title or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
              />
            </div>
  
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
            >
              <option value="created_at">Created At</option>
              <option value="title">Title</option>
              <option value="category">Category</option>
            </select>
  
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
  
            <select
              value={filterActive === null ? 'all' : filterActive.toString()}
              onChange={(e) => setFilterActive(e.target.value === 'all' ? null : e.target.value === 'true')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
  
            <select
              value={filterDemo === null ? 'all' : filterDemo.toString()}
              onChange={(e) => setFilterDemo(e.target.value === 'all' ? null : e.target.value === 'true')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
            >
              <option value="all">All User Types</option>
              <option value="true">Demo Users Only</option>
              <option value="false">Regular Users Only</option>
            </select>
          </div>
        </div>
  
        {/* Demo Listings Toggle */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <span className="text-lg font-semibold text-gray-900">Demo Listings Filter</span>
            </div>
            <label className="flex items-center space-x-3 cursor-pointer">
              <span className="text-sm text-gray-700">Show Demo Listings</span>
              <input
                type="checkbox"
                checked={showDemoListings}
                onChange={(e) => setShowDemoListings(e.target.checked)}
                className="rounded border-gray-300 text-barter-600 focus:ring-barter-600"
              />
            </label>
          </div>
          <div className="mt-2 text-sm text-gray-600">
            {showDemoListings 
              ? 'Currently showing all listings including demo users' 
              : 'Currently hiding listings from demo users'
            }
          </div>
        </div>
  
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No listings found</h3>
            <p className="text-gray-600">Adjust your filters or search terms to see results.</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-xl shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Seller
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Condition
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {listings.map((item) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-12 w-12">
                          {item.image_urls && item.image_urls.length > 0 ? (
                            <img 
                              className="h-12 w-12 rounded-lg object-cover" 
                              src={item.image_urls[0]} 
                              alt={item.title}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-gray-200" />
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 max-w-xs truncate">
                            {item.title}
                          </div>
                          <div className="text-sm text-gray-500 max-w-xs truncate">
                            {item.description || 'No description'}
                          </div>
                          {item.estimated_value != null && item.estimated_value > 0 && (
                            <div className="text-sm font-medium text-green-600">
                              ${item.estimated_value}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{item.users.username}</div>
                      <div className="text-sm text-gray-500">{item.users.location || 'No location'}</div>
                      <div className="flex items-center space-x-2 mt-1">
                        {item.users.is_demo && (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            Demo
                          </span>
                        )}
                        {item.users.role === 'admin' && (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-barter-100 text-barter-800">
                            Admin
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.condition}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        item.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => navigate(`/item/${item.id}`)}
                          className="text-barter-600 hover:text-barter-800 p-1 rounded-md hover:bg-gray-100 transition-colors"
                          title="View Item"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toast.info('Edit functionality coming soon')}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded-md hover:bg-gray-100 transition-colors"
                          title="Edit Item"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toast.info('Delete functionality coming soon')}
                          className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-gray-100 transition-colors"
                          title="Delete Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
  
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6 bg-white rounded-xl shadow-sm p-4">
            <button
              onClick={() => setPage(prev => Math.max(0, prev - 1))}
              disabled={page === 0 || loading}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>
            
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700">
                Page {page + 1} of {totalPages}
              </span>
              <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm flex items-center justify-center">
                Demo filter above
              </div>
            </div>
            
            <button
              onClick={() => setPage(prev => Math.min(totalPages - 1, prev + 1))}
              disabled={page === totalPages - 1 || loading}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
        </>
        )}
  
        {activeTab === 'reports' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {reportsLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : reportsError ? (
              <div className="text-center py-12 text-red-600">{reportsError}</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-12">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No reports</h3>
                <p className="text-gray-600">Nothing has been reported yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reporter</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reported User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reported Item</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reports.map((report) => (
                      <tr key={report.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.reason}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{report.description || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            {report.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.reporter?.username ?? '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{report.reported_user?.username ?? '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.reported_item?.title ?? 'No item (user report)'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(report.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
  
        {activeTab === 'issues' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {issuesLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : issuesError ? (
              <div className="text-center py-12 text-red-600">{issuesError}</div>
            ) : issues.length === 0 ? (
              <div className="text-center py-12">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No issues</h3>
                <p className="text-gray-600">Nothing has been reported yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Image</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reporter</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {issues.map((issue) => (
                      <tr key={issue.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {issue.image_urls && issue.image_urls.length > 0 ? (
                            <img src={issue.image_urls[0]} alt="Attached" className="h-12 w-12 rounded-lg object-cover" />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-gray-100" />
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 max-w-xs truncate">{issue.title}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{issue.description}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{issue.issue_type}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            {issue.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{issue.reporter?.username ?? '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(issue.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
  
        {activeTab === 'suggestions' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {suggestionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : suggestionsError ? (
              <div className="text-center py-12 text-red-600">{suggestionsError}</div>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-12">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No category suggestions</h3>
                <p className="text-gray-600">Nobody has suggested a new category yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Title</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Suggested Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {suggestions.map((suggestion) => (
                      <tr key={suggestion.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 max-w-xs truncate">{suggestion.title}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{suggestion.category_suggestion}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{suggestion.owner?.username ?? '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(suggestion.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
  
        {activeTab === 'disputes' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {disputesLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : disputesError ? (
              <div className="text-center py-12 text-red-600">{disputesError}</div>
            ) : disputes.length === 0 ? (
              <div className="text-center py-12">
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No disputes</h3>
                <p className="text-gray-600">No trade completions have been disputed yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Connection</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completed By</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disputed By</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dispute Deadline</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disputed At</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {disputes.map((dispute) => (
                      <tr key={dispute.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {dispute.connection?.user_1?.username ?? '—'} ↔ {dispute.connection?.user_2?.username ?? '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{dispute.completed_by_user?.username ?? '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{dispute.disputed_by_user?.username ?? '—'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{dispute.dispute_reason || '—'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(dispute.dispute_deadline).toLocaleDateString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(dispute.disputed_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};