import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the user's access token from the request header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: No Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')

    // Verify the user's token and get their user ID
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      console.error('Auth error:', authError?.message);
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch the user's role from the public.users table
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !userProfile || userProfile.role !== 'admin') {
      console.error('Profile error or not admin:', profileError?.message || 'User is not admin');
      return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse query parameters for filtering, sorting, and pagination
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '0')
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const sortBy = url.searchParams.get('sort_by') || 'created_at'
    const sortOrder = url.searchParams.get('sort_order') || 'desc'
    const filterActive = url.searchParams.get('filter_active')
    const filterDemo = url.searchParams.get('filter_demo')
    const search = url.searchParams.get('search')

    const offset = page * limit

    let query = supabaseAdmin
      .from('items')
      .select(`
        *,
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
      `, { count: 'exact' })

    if (filterActive !== null) {
      query = query.eq('is_active', filterActive === 'true')
    }
    if (filterDemo !== null) {
      query = query.eq('users.is_demo', filterDemo === 'true')
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
    }

    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1)

    const { data: items, error, count } = await query

    if (error) throw error

    return new Response(
      JSON.stringify({
        items,
        total: count,
        page,
        limit
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})