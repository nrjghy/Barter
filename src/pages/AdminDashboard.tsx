import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { BackBar } from '../components/BackBar';
import { supabase } from '../lib/supabase';
import { TABLES } from '../services/config';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, Trash2, Edit3, Search, ChevronLeft, ChevronRight, Shield, AlertCircle, Flag, MessageSquare, Tag, AlertTriangle, Users, Ban, ShieldCheck, ShieldOff, KeyRound, MapPin, Navigation, Camera, Star, X, Copy } from 'lucide-react';
import { ITEM_CATEGORIES, ITEM_CONDITIONS } from '../types';
import { AdminService, AdminUserRow, ItemService } from '../services';
import { useShowError } from '../hooks/useShowError';
import { copyToClipboard } from '../utils/share';

// Curated dropdown list, mirrors AddEditItem.tsx -- not the full ISO 4217 list.
const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CZK', 'HUF', 'RON', 'SEK', 'NOK', 'DKK', 'CHF', 'UAH'];

// Same shape as AddEditItem.tsx's PhotoItem -- existing (already-uploaded) and
// newly-picked photos are interchangeable entries in the same ordered array.
type AdminPhotoItem = { type: 'existing'; url: string } | { type: 'new'; file: File; preview: string };

type AdminTab = 'listings' | 'reports' | 'issues' | 'suggestions' | 'disputes' | 'users';

const AdminDetailField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{label}</div>
    <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">{children}</div>
  </div>
);

const formatFullTimestamp = (iso: string) => new Date(iso).toLocaleString();

// An issue's description sometimes embeds technical details written by
// IssueReportDialog's prefill (see ReportErrorContext/openReport) -- a
// Sentry event ID and/or an ERROR_CODES-style token -- inline as plain
// text, since `issues` has no dedicated jsonb column for this (see README).
// Simple pattern match, not a real parser: a Sentry event ID is a 32-char
// hex string, an error code is an UPPER_SNAKE_CASE token. Never throws --
// a non-match just means no extract row renders.
const SENTRY_EVENT_ID_PATTERN = /\b[0-9a-f]{32}\b/i;
const ERROR_CODE_PATTERN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

function extractTechnicalTokens(description: string): { sentryEventId: string | null; errorCode: string | null } {
  const sentryMatch = description.match(SENTRY_EVENT_ID_PATTERN);
  const errorCodeMatch = description.match(ERROR_CODE_PATTERN);
  return {
    sentryEventId: sentryMatch ? sentryMatch[0] : null,
    errorCode: errorCodeMatch ? errorCodeMatch[0] : null,
  };
}

interface AdminListingRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  category_suggestion: string | null;
  condition: string;
  image_urls: string[] | null;
  tags: string[] | null;
  estimated_value: number | null;
  value_currency: string | null;
  listing_type: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
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
  const { user, loading: authLoading, resetPassword } = useAuth();
  const navigate = useNavigate();
  const showError = useShowError();
  const [listings, setListings] = useState<AdminListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [filterDemo, setFilterDemo] = useState<boolean | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDemoListings, setShowDemoListings] = useState(false);
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [filterUserName, setFilterUserName] = useState<string | null>(null);
  const [cancelingItem, setCancelingItem] = useState<AdminListingRow | null>(null);
  const [editingItem, setEditingItem] = useState<AdminListingRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCategorySuggestion, setEditCategorySuggestion] = useState('');
  const [editCondition, setEditCondition] = useState('');
  const [editEstimatedValue, setEditEstimatedValue] = useState('');
  const [editValueCurrency, setEditValueCurrency] = useState('PLN');
  const [editTagsInput, setEditTagsInput] = useState('');
  const [editPhotos, setEditPhotos] = useState<AdminPhotoItem[]>([]);
  const [editLocation, setEditLocation] = useState('');
  const [editLatitude, setEditLatitude] = useState<number | null>(null);
  const [editLongitude, setEditLongitude] = useState<number | null>(null);
  const [editLocationLoading, setEditLocationLoading] = useState(false);
  const [editLocationSuggestions, setEditLocationSuggestions] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [showEditLocationDropdown, setShowEditLocationDropdown] = useState(false);
  const editLocationSearchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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

  // Click-to-expand detail view, shared across the four raw-data tabs
  // (Reports, Issues, Category Suggestions, Disputes) -- Listings and Users
  // already have real interactivity and aren't part of this.
  const [detailRow, setDetailRow] = useState<
    | { tab: 'reports'; data: AdminReportRow }
    | { tab: 'issues'; data: AdminIssueRow }
    | { tab: 'suggestions'; data: AdminCategorySuggestionRow }
    | { tab: 'disputes'; data: AdminDisputeRow }
    | null
  >(null);

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersPage, setUsersPage] = useState(0);
  const [usersLimit] = useState(10);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSearch, setUsersSearch] = useState('');
  const [banningUser, setBanningUser] = useState<AdminUserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUserRow | null>(null);
  const [promotingUser, setPromotingUser] = useState<AdminUserRow | null>(null);
  const [userActionBusy, setUserActionBusy] = useState(false);

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
          category_suggestion,
          condition,
          image_urls,
          tags,
          estimated_value,
          value_currency,
          listing_type,
          location,
          latitude,
          longitude,
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

      if (filterUserId) {
        query = query.eq('user_id', filterUserId);
      }
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
      const message =
        err instanceof Error ? err.message :
        (err && typeof err === "object" && "message" in err) ? String((err as { message: unknown }).message) :
        "An unknown error occurred.";
      setError(message);
      toast.error('Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchAdminListings();
    }
  }, [user, authLoading, page, limit, sortBy, sortOrder, filterActive, filterDemo, searchTerm, showDemoListings, filterUserId]);

  // Changing what the result set even is (filters/search) should snap back
  // to page 0 -- unlike page/limit/sortBy/sortOrder, which are the
  // legitimate ways to move within an already-defined result set.
  useEffect(() => {
    setPage(0);
  }, [filterActive, filterDemo, searchTerm, showDemoListings, filterUserId]);

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
      const message =
        err instanceof Error ? err.message :
        (err && typeof err === "object" && "message" in err) ? String((err as { message: unknown }).message) :
        'Failed to load reports.';
      setReportsError(message);
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
      const message =
        err instanceof Error ? err.message :
        (err && typeof err === "object" && "message" in err) ? String((err as { message: unknown }).message) :
        'Failed to load issues.';
      setIssuesError(message);
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
      const message =
        err instanceof Error ? err.message :
        (err && typeof err === "object" && "message" in err) ? String((err as { message: unknown }).message) :
        'Failed to load category suggestions.';
      setSuggestionsError(message);
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
      const message =
        err instanceof Error ? err.message :
        (err && typeof err === "object" && "message" in err) ? String((err as { message: unknown }).message) :
        'Failed to load disputes.';
      setDisputesError(message);
    } finally {
      setDisputesLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const { data, error } = await AdminService.listUsers(usersSearch || null, usersLimit, usersPage * usersLimit);

      if (error) throw new Error(error.message);

      setUsers(data || []);
      setUsersTotal(data && data.length > 0 ? data[0].full_count : 0);
    } catch (err) {
      console.error('Error fetching admin users:', err);
      const message = err instanceof Error ? err.message : 'Failed to load users.';
      setUsersError(message);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user || user.role !== 'admin') return;
    if (activeTab === 'reports') fetchReports();
    if (activeTab === 'issues') fetchIssues();
    if (activeTab === 'suggestions') fetchCategorySuggestions();
    if (activeTab === 'disputes') fetchDisputes();
    if (activeTab === 'users') fetchUsers();
  }, [activeTab, user, authLoading, usersPage, usersSearch]);

  // Changing the search resets to page 0, same fix as the Listings tab's
  // filter-change effect -- don't reintroduce the stale-page bug here.
  useEffect(() => {
    setUsersPage(0);
  }, [usersSearch]);

  useEffect(() => {
    if (!detailRow) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailRow(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [detailRow]);

  const handleCopyToken = async (label: string, value: string) => {
    if (await copyToClipboard(value)) {
      toast.success(`${label} copied`);
    } else {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const handleResetPassword = async (row: AdminUserRow) => {
    const { error } = await resetPassword(row.email);
    if (error) {
      showError(error);
      return;
    }
    toast.success(`Password reset email sent to ${row.email}`);
  };

  const handleToggleBanned = async (row: AdminUserRow, banned: boolean) => {
    setUserActionBusy(true);
    try {
      const { error } = await AdminService.setUserBanned(row.id, banned);
      if (error) {
        showError(error);
        return;
      }
      toast.success(banned ? `${row.username} suspended` : `${row.username} unbanned`);
      setBanningUser(null);
      fetchUsers();
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleDeleteUser = async (row: AdminUserRow) => {
    setUserActionBusy(true);
    try {
      const { error } = await AdminService.deleteUser(row.id);
      if (error) {
        showError(error);
        return;
      }
      toast.success(`${row.username}'s account deleted`);
      setDeletingUser(null);
      fetchUsers();
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleSetRole = async (row: AdminUserRow, role: 'user' | 'admin') => {
    setUserActionBusy(true);
    try {
      const { error } = await AdminService.setUserRole(row.id, role);
      if (error) {
        showError(error);
        return;
      }
      toast.success(role === 'admin' ? `${row.username} promoted to admin` : `${row.username} demoted to user`);
      setPromotingUser(null);
      fetchUsers();
    } finally {
      setUserActionBusy(false);
    }
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remainingSlots = 10 - editPhotos.length;
    const validFiles = files.filter((file) => file.type.startsWith('image/'));
    if (validFiles.length > remainingSlots) {
      toast.error(remainingSlots <= 0 ? 'Maximum 10 images allowed' : `You can add up to ${remainingSlots} more photo${remainingSlots === 1 ? '' : 's'}`);
      return;
    }

    Promise.all(
      validFiles.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          })
      )
    ).then((previews) => {
      const newPhotos: AdminPhotoItem[] = validFiles.map((file, i) => ({ type: 'new', file, preview: previews[i] }));
      setEditPhotos((prev) => [...prev, ...newPhotos]);
    });

    e.target.value = '';
  };

  const handleRemoveEditPhoto = (index: number) => {
    setEditPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSetPrimaryEditPhoto = (index: number) => {
    setEditPhotos((prev) => {
      if (index === 0) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
  };

  const getCurrentEditLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by this browser');
      return;
    }
    setEditLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const { data: geocodeData, error: geocodeError } = await supabase.functions.invoke('reverse-geocode', {
            body: { lat: latitude, lng: longitude },
          });
          const locationString = geocodeError || !geocodeData?.location ? 'Unknown location' : geocodeData.location;
          setEditLocation(locationString);
          setEditLatitude(latitude);
          setEditLongitude(longitude);
        } catch {
          toast.error('Failed to get location');
        } finally {
          setEditLocationLoading(false);
        }
      },
      () => {
        toast.error('Failed to get current location');
        setEditLocationLoading(false);
      }
    );
  };

  const handleSaveEditItem = async () => {
    if (!editingItem || !user) return;
    setSavingEdit(true);
    try {
      const combinedImageUrls = editPhotos.map((photo) => (photo.type === 'existing' ? photo.url : photo.preview));
      const tags = editTagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const finalCategorySuggestion = editCategory === 'Other' ? editCategorySuggestion || undefined : undefined;
      const finalEstimatedValue =
        editingItem.listing_type === 'giveaway' ? 0 : editEstimatedValue.trim() === '' ? 0 : parseFloat(editEstimatedValue);

      const { error } = await ItemService.adminUpdateItem(
        editingItem.id,
        {
          title: editTitle,
          description: editDescription,
          category: editCategory,
          categorySuggestion: finalCategorySuggestion,
          condition: editCondition,
          estimatedValue: finalEstimatedValue,
          valueCurrency: editValueCurrency,
          tags,
          imageUrls: combinedImageUrls,
          location: editLocation.trim() || undefined,
          latitude: editLatitude,
          longitude: editLongitude,
        },
        user.id
      );

      if (error) {
        showError(error);
        return;
      }

      toast.success('Listing updated');
      setEditingItem(null);
      fetchAdminListings();
    } finally {
      setSavingEdit(false);
    }
  };

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
    <div className="max-w-6xl mx-auto pt-16">
      <BackBar title="Admin console" onBack={() => navigate(-1)} />

      <div className="px-4 py-4">
        <div className="flex items-center space-x-3 mb-6">
          <Shield className="w-8 h-8 text-barter-600" />
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        </div>
  
        {/* Tab Switcher */}
        <div className="flex bg-white rounded-xl shadow-sm p-1 mb-6 gap-1 overflow-x-auto">
          {([
            { key: 'listings', label: 'Listings', icon: Eye },
            { key: 'reports', label: 'Reports', icon: Flag },
            { key: 'issues', label: 'Issues', icon: MessageSquare },
            { key: 'suggestions', label: 'Category Suggestions', icon: Tag },
            { key: 'disputes', label: 'Disputes', icon: AlertTriangle },
            { key: 'users', label: 'Users', icon: Users },
          ] as { key: AdminTab; label: string; icon: typeof Eye }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 flex-shrink-0 whitespace-nowrap justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
  
        {filterUserId && (
          <button
            onClick={() => { setFilterUserId(null); setFilterUserName(null); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-4 rounded-full bg-barter-100 text-barter-800 text-sm font-medium hover:bg-barter-200 transition-colors"
          >
            Showing items for @{filterUserName} <span className="font-bold">×</span>
          </button>
        )}

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
                              {item.estimated_value} {item.value_currency}
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
                          onClick={() => {
                            setEditingItem(item);
                            setEditTitle(item.title ?? '');
                            setEditDescription(item.description ?? '');
                            setEditCategory(item.category);
                            setEditCategorySuggestion(item.category_suggestion ?? '');
                            setEditCondition(item.condition);
                            setEditEstimatedValue(item.estimated_value != null ? String(item.estimated_value) : '');
                            setEditValueCurrency(item.value_currency ?? 'PLN');
                            setEditTagsInput((item.tags ?? []).join(', '));
                            setEditPhotos((item.image_urls ?? []).map((url) => ({ type: 'existing', url })));
                            setEditLocation(item.location ?? '');
                            setEditLatitude(item.latitude ?? null);
                            setEditLongitude(item.longitude ?? null);
                          }}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded-md hover:bg-gray-100 transition-colors"
                          title="Edit Item"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setCancelingItem(item)}
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

        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.45)]" onClick={() => !savingEdit && setEditingItem(null)} />
            <div className="relative w-full max-w-lg bg-white rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
              <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-4">Edit listing</div>

              <div className="space-y-4">
                {/* Listing type -- locked, same as AddEditItem.tsx */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Listing type</label>
                  <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                    {editingItem.listing_type === 'giveaway' ? 'Giveaway' : 'Trade'}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Listing type can't be changed after an item is created.</p>
                </div>

                {/* Photos */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Photos (Up to 10 images)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {editPhotos.map((photo, index) => (
                      <div key={index} className="relative">
                        <img
                          src={photo.type === 'existing' ? photo.url : photo.preview}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-20 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => handleSetPrimaryEditPhoto(index)}
                          disabled={index === 0}
                          aria-label={index === 0 ? 'Primary photo' : 'Set as primary photo'}
                          className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                            index === 0 ? 'bg-yellow-400 text-white' : 'bg-white/80 text-gray-500 hover:bg-white hover:text-yellow-500'
                          }`}
                        >
                          <Star className="w-3 h-3" fill={index === 0 ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveEditPhoto(index)}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {editPhotos.length < 10 && (
                      <label className="flex flex-col items-center justify-center h-20 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                        <Camera className="w-5 h-5 mb-1 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-500">Add</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleEditImageChange} multiple />
                      </label>
                    )}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                  >
                    {ITEM_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {editCategory === 'Other' && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Suggest a category name (optional)</label>
                      <input
                        type="text"
                        value={editCategorySuggestion}
                        onChange={(e) => setEditCategorySuggestion(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                        placeholder="e.g. Board Games"
                      />
                    </div>
                  )}
                </div>

                {/* Condition */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Condition</label>
                  <select
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                  >
                    {ITEM_CONDITIONS.map((cond) => (
                      <option key={cond} value={cond}>{cond}</option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                  <div className="flex items-center text-gray-600">
                    <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                    <div className="flex-1 flex items-center space-x-2 relative">
                      <input
                        type="text"
                        value={editLocation}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEditLocation(value);
                          setEditLatitude(null);
                          setEditLongitude(null);

                          if (editLocationSearchTimeoutRef.current) {
                            clearTimeout(editLocationSearchTimeoutRef.current);
                          }

                          const trimmed = value.trim();
                          if (trimmed.length < 3) {
                            setEditLocationSuggestions([]);
                            setShowEditLocationDropdown(false);
                            return;
                          }

                          editLocationSearchTimeoutRef.current = setTimeout(async () => {
                            try {
                              const { data, error } = await supabase.functions.invoke('places-autocomplete', {
                                body: { query: trimmed },
                              });
                              if (error) {
                                setEditLocationSuggestions([]);
                                setShowEditLocationDropdown(false);
                                return;
                              }
                              setEditLocationSuggestions(data?.suggestions || []);
                              setShowEditLocationDropdown(true);
                            } catch {
                              setEditLocationSuggestions([]);
                              setShowEditLocationDropdown(false);
                            }
                          }, 350);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setShowEditLocationDropdown(false);
                        }}
                        onBlur={() => setShowEditLocationDropdown(false)}
                        className="flex-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                        placeholder="Enter this item's location"
                      />
                      <button
                        type="button"
                        onClick={getCurrentEditLocation}
                        disabled={editLocationLoading}
                        className="flex items-center space-x-1 px-3 py-2 bg-barter-100 text-barter-700 rounded-lg hover:bg-barter-200 transition-colors disabled:opacity-50"
                      >
                        {editLocationLoading ? <LoadingSpinner /> : <><Navigation className="w-4 h-4" /><span className="text-xs">GPS</span></>}
                      </button>
                      {showEditLocationDropdown && editLocationSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-56 overflow-y-auto">
                          {editLocationSuggestions.map((suggestion, index) => (
                            <button
                              key={`${suggestion.label}-${index}`}
                              type="button"
                              onMouseDown={async () => {
                                let locationString = suggestion.label;
                                try {
                                  const { data: geocodeData, error: geocodeError } = await supabase.functions.invoke('reverse-geocode', {
                                    body: { lat: suggestion.lat, lng: suggestion.lng },
                                  });
                                  if (!geocodeError && geocodeData?.location) {
                                    locationString = geocodeData.location;
                                  }
                                } catch {
                                  // fall back to suggestion.label
                                }
                                setEditLocation(locationString);
                                setEditLatitude(suggestion.lat);
                                setEditLongitude(suggestion.lng);
                                setShowEditLocationDropdown(false);
                                setEditLocationSuggestions([]);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              {suggestion.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Estimated value */}
                {editingItem.listing_type !== 'giveaway' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Estimated value (optional)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={editEstimatedValue}
                        onChange={(e) => setEditEstimatedValue(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                      />
                      <select
                        value={editValueCurrency}
                        onChange={(e) => setEditValueCurrency(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                      >
                        {[...new Set([...CURRENCIES, editValueCurrency])].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={editTagsInput}
                    onChange={(e) => setEditTagsInput(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                    placeholder="e.g. vintage, wood, rare"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveEditItem}
                disabled={savingEdit}
                className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2 mt-5 disabled:opacity-60"
              >
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => setEditingItem(null)}
                disabled={savingEdit}
                className="w-full py-3.5 rounded-xl bg-transparent text-gray-600 text-sm font-bold disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {cancelingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.45)]" onClick={() => setCancelingItem(null)} />
            <div className="relative w-full max-w-md bg-white rounded-2xl p-5 mx-4">
              <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Cancel this listing?</div>
              <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-4">
                "{cancelingItem.title}" — this can't be undone. Anyone currently connected over it will be notified
                it's no longer available.
              </div>
              <button
                onClick={() => setCancelingItem(null)}
                className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2"
              >
                Keep listing
              </button>
              <button
                onClick={async () => {
                  const { data, error } = await supabase.rpc('admin_cancel_item', {
                    target_item_id: cancelingItem.id,
                  });
                  if (error || data?.error) {
                    showError({ message: data?.error ?? error?.message ?? 'Failed to cancel listing', code: error?.code });
                    return;
                  }
                  toast.success('Listing cancelled');
                  setCancelingItem(null);
                  fetchAdminListings();
                }}
                className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(50%_0.15_30)] text-sm font-bold"
              >
                Cancel listing
              </button>
            </div>
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
                      <tr
                        key={report.id}
                        onClick={() => setDetailRow({ tab: 'reports', data: report })}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
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
                      <tr
                        key={issue.id}
                        onClick={() => setDetailRow({ tab: 'issues', data: issue })}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
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
                      <tr
                        key={suggestion.id}
                        onClick={() => setDetailRow({ tab: 'suggestions', data: suggestion })}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
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
                      <tr
                        key={dispute.id}
                        onClick={() => setDetailRow({ tab: 'disputes', data: dispute })}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
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

        {detailRow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.45)]" onClick={() => setDetailRow(null)} />
            <div className="relative w-full max-w-lg bg-white rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="text-base font-extrabold text-[oklch(22%_0.02_100)]">
                  {detailRow.tab === 'reports' && 'Report details'}
                  {detailRow.tab === 'issues' && 'Issue details'}
                  {detailRow.tab === 'suggestions' && 'Category suggestion details'}
                  {detailRow.tab === 'disputes' && 'Dispute details'}
                </div>
                <button onClick={() => setDetailRow(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {detailRow.tab === 'reports' && (
                <div className="space-y-4">
                  <AdminDetailField label="Reason">{detailRow.data.reason}</AdminDetailField>
                  <AdminDetailField label="Status">{detailRow.data.status}</AdminDetailField>
                  <AdminDetailField label="Description">{detailRow.data.description || '—'}</AdminDetailField>
                  <AdminDetailField label="Reporter">{detailRow.data.reporter?.username ?? '—'}</AdminDetailField>
                  <AdminDetailField label="Reported user">{detailRow.data.reported_user?.username ?? '—'}</AdminDetailField>
                  <AdminDetailField label="Reported item">{detailRow.data.reported_item?.title ?? 'No item (user report)'}</AdminDetailField>
                  <AdminDetailField label="Created">{formatFullTimestamp(detailRow.data.created_at)}</AdminDetailField>
                </div>
              )}

              {detailRow.tab === 'issues' && (
                <div className="space-y-4">
                  <AdminDetailField label="Title">{detailRow.data.title}</AdminDetailField>
                  <AdminDetailField label="Type">{detailRow.data.issue_type}</AdminDetailField>
                  <AdminDetailField label="Status">{detailRow.data.status}</AdminDetailField>
                  <AdminDetailField label="Description">
                    {detailRow.data.description}
                    {(() => {
                      const { sentryEventId, errorCode } = extractTechnicalTokens(detailRow.data.description);
                      if (!sentryEventId && !errorCode) return null;
                      return (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {sentryEventId && (
                            <button
                              type="button"
                              onClick={() => handleCopyToken('Sentry event ID', sentryEventId)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 text-xs font-mono text-gray-700 hover:bg-gray-200"
                            >
                              <Copy className="w-3 h-3" /> {sentryEventId}
                            </button>
                          )}
                          {errorCode && (
                            <button
                              type="button"
                              onClick={() => handleCopyToken('Error code', errorCode)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 text-xs font-mono text-gray-700 hover:bg-gray-200"
                            >
                              <Copy className="w-3 h-3" /> {errorCode}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </AdminDetailField>
                  <AdminDetailField label="Reporter">{detailRow.data.reporter?.username ?? '—'}</AdminDetailField>
                  <AdminDetailField label="Created">{formatFullTimestamp(detailRow.data.created_at)}</AdminDetailField>
                  {detailRow.data.image_urls && detailRow.data.image_urls.length > 0 && (
                    <AdminDetailField label={detailRow.data.image_urls.length > 1 ? 'Images' : 'Image'}>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {detailRow.data.image_urls.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={url}
                              alt="Attached"
                              className="max-h-80 w-auto rounded-lg object-contain border border-gray-200"
                            />
                          </a>
                        ))}
                      </div>
                    </AdminDetailField>
                  )}
                </div>
              )}

              {detailRow.tab === 'suggestions' && (
                <div className="space-y-4">
                  <AdminDetailField label="Item title">{detailRow.data.title}</AdminDetailField>
                  <AdminDetailField label="Suggested category">{detailRow.data.category_suggestion}</AdminDetailField>
                  <AdminDetailField label="Owner">{detailRow.data.owner?.username ?? '—'}</AdminDetailField>
                  <AdminDetailField label="Created">{formatFullTimestamp(detailRow.data.created_at)}</AdminDetailField>
                </div>
              )}

              {detailRow.tab === 'disputes' && (
                <div className="space-y-4">
                  <AdminDetailField label="Connection">
                    {detailRow.data.connection?.user_1?.username ?? '—'} ↔ {detailRow.data.connection?.user_2?.username ?? '—'}
                  </AdminDetailField>
                  <AdminDetailField label="Completed by">{detailRow.data.completed_by_user?.username ?? '—'}</AdminDetailField>
                  <AdminDetailField label="Disputed by">{detailRow.data.disputed_by_user?.username ?? '—'}</AdminDetailField>
                  <AdminDetailField label="Dispute reason">{detailRow.data.dispute_reason || '—'}</AdminDetailField>
                  <AdminDetailField label="Trade completed at">{formatFullTimestamp(detailRow.data.completed_at)}</AdminDetailField>
                  <AdminDetailField label="Disputed at">{formatFullTimestamp(detailRow.data.disputed_at)}</AdminDetailField>
                  <AdminDetailField label="Dispute deadline">{formatFullTimestamp(detailRow.data.dispute_deadline)}</AdminDetailField>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
        <>
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by username or email..."
              value={usersSearch}
              onChange={(e) => setUsersSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {usersLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : usersError ? (
            <div className="text-center py-12 text-red-600">{usersError}</div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No users found</h3>
              <p className="text-gray-600">Adjust your search to see results.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rating</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Connections</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Signed Up</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Sign In</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((row) => {
                    const isSelf = row.id === user.id;
                    const isBanned = !!row.banned_until;
                    const isAdmin = row.role === 'admin';
                    return (
                      <tr
                        key={row.id}
                        onClick={() => {
                          setFilterUserId(row.id);
                          setFilterUserName(row.username);
                          setActiveTab('listings');
                        }}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{row.username}</div>
                          <div className="text-sm text-gray-500">{row.email}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {row.is_demo && (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Demo</span>
                            )}
                            {row.is_curator && (
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">Curator</span>
                            )}
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-700">
                              {row.signup_provider === 'google' ? 'Google' : row.signup_provider === 'email' ? 'Email' : (row.signup_provider ?? 'Unknown')}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            isAdmin ? 'bg-barter-100 text-barter-800' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {row.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {row.rating != null ? `${row.rating.toFixed(1)} (${row.total_ratings ?? 0})` : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.item_count}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.connection_count}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {row.last_sign_in_at ? new Date(row.last_sign_in_at).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            isBanned ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {isBanned ? 'Suspended' : 'Active'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleResetPassword(row)}
                              className="text-barter-600 hover:text-barter-800 p-1 rounded-md hover:bg-gray-100 transition-colors"
                              title="Reset password"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => (isBanned ? handleToggleBanned(row, false) : setBanningUser(row))}
                              disabled={isSelf}
                              className="text-yellow-600 hover:text-yellow-800 p-1 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title={isBanned ? 'Unban' : 'Suspend'}
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => (isAdmin ? handleSetRole(row, 'user') : setPromotingUser(row))}
                              disabled={isSelf}
                              className="text-blue-600 hover:text-blue-800 p-1 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title={isAdmin ? 'Demote to user' : 'Promote to admin'}
                            >
                              {isAdmin ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setDeletingUser(row)}
                              disabled={isSelf}
                              className="text-red-600 hover:text-red-900 p-1 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Delete account"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {Math.ceil(usersTotal / usersLimit) > 1 && (
          <div className="flex justify-between items-center mt-6 bg-white rounded-xl shadow-sm p-4">
            <button
              onClick={() => setUsersPage(prev => Math.max(0, prev - 1))}
              disabled={usersPage === 0 || usersLoading}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>
            <span className="text-sm text-gray-700">
              Page {usersPage + 1} of {Math.ceil(usersTotal / usersLimit)}
            </span>
            <button
              onClick={() => setUsersPage(prev => Math.min(Math.ceil(usersTotal / usersLimit) - 1, prev + 1))}
              disabled={usersPage >= Math.ceil(usersTotal / usersLimit) - 1 || usersLoading}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {banningUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.45)]" onClick={() => !userActionBusy && setBanningUser(null)} />
            <div className="relative w-full max-w-md bg-white rounded-2xl p-5 mx-4">
              <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Suspend this user?</div>
              <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-4">
                "{banningUser.username}" will be unable to log in until unbanned.
              </div>
              <button
                onClick={() => setBanningUser(null)}
                disabled={userActionBusy}
                className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => handleToggleBanned(banningUser, true)}
                disabled={userActionBusy}
                className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(50%_0.15_30)] text-sm font-bold disabled:opacity-60"
              >
                {userActionBusy ? 'Suspending…' : 'Suspend user'}
              </button>
            </div>
          </div>
        )}

        {deletingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.45)]" onClick={() => !userActionBusy && setDeletingUser(null)} />
            <div className="relative w-full max-w-md bg-white rounded-2xl p-5 mx-4">
              <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Delete this account?</div>
              <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-4">
                This is permanent — "{deletingUser.username}"'s profile, listings, and messages will be removed and
                their active items cancelled. Some trade and dispute records may be retained as required by law.
              </div>
              <button
                onClick={() => setDeletingUser(null)}
                disabled={userActionBusy}
                className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2 disabled:opacity-60"
              >
                Keep account
              </button>
              <button
                onClick={() => handleDeleteUser(deletingUser)}
                disabled={userActionBusy}
                className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(50%_0.15_30)] text-sm font-bold disabled:opacity-60"
              >
                {userActionBusy ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        )}

        {promotingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.45)]" onClick={() => !userActionBusy && setPromotingUser(null)} />
            <div className="relative w-full max-w-md bg-white rounded-2xl p-5 mx-4">
              <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Promote to admin?</div>
              <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-4">
                "{promotingUser.username}" will gain full access to this admin console.
              </div>
              <button
                onClick={() => setPromotingUser(null)}
                disabled={userActionBusy}
                className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSetRole(promotingUser, 'admin')}
                disabled={userActionBusy}
                className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(50%_0.15_30)] text-sm font-bold disabled:opacity-60"
              >
                {userActionBusy ? 'Promoting…' : 'Promote to admin'}
              </button>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
};