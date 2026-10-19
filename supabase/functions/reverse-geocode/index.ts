// Server-side reverse geocoding proxy for LocationPrompt.tsx, Profile.tsx's
// getCurrentLocation(), AddEditItem.tsx and the admin dashboard. It is called
// directly from the browser via supabase.functions.invoke(), so it handles CORS
// explicitly (Supabase does not add it automatically to Edge Functions), and it
// keeps the geocoding API key server-side.
//
// Provider: LocationIQ (same LOCATIONIQ_API_KEY secret as places-autocomplete).
// Until October 2026 this called nominatim.openstreetmap.org directly. On
// 2026-10-19 Nominatim began answering every request from Supabase's edge with
// "403 Access denied" (see operations.osmfoundation.org/policies/nominatim/),
// on both Barter2 and Barter-dev, so this function returned 502 and the app
// fell back to "Unknown location" and the default currency. The response
// contract below ({ location, countryCode }) is unchanged, so no frontend
// change was needed.
//
// countryCode is the ISO 3166-1 alpha-2 code uppercased (e.g. "PL"). It powers
// users.default_currency, derived client-side via the country-to-currency
// package, so a Poland-based signup defaults to PLN.
//
// normalizecity=1 asks LocationIQ to fill a missing `city` from the next
// available element (district, town, village, municipality and so on); the
// fallback chain in formatLocation() still covers anything left over.
//
// No Supabase client / database access needed here.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface GeocodeAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  country?: string;
  country_code?: string;
}

interface GeocodeResponse {
  address?: GeocodeAddress;
}

function formatLocation(address: GeocodeAddress | undefined): string {
  const place = address?.city ?? address?.town ?? address?.village ?? address?.municipality ?? address?.county;

  if (place && address?.country) return `${place}, ${address.country}`;
  if (place) return place;
  if (address?.country) return address.country;
  return "Unknown location";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lng } = await req.json();

    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(JSON.stringify({ error: "lat and lng must be numbers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOCATIONIQ_API_KEY");
    if (!apiKey) {
      console.error("reverse-geocode: LOCATIONIQ_API_KEY not set");
      return new Response(JSON.stringify({ error: "not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Without accept-language the provider returns names in the local language
    // of the area (e.g. "Warszawa, Polska" for a Poland pilot), not English.
    const params = new URLSearchParams({
      key: apiKey,
      lat: String(lat),
      lon: String(lng),
      format: "json",
      addressdetails: "1",
      normalizecity: "1",
      "accept-language": "en",
    });

    const geocodeResponse = await fetch(`https://api.locationiq.com/v1/reverse?${params.toString()}`);

    if (!geocodeResponse.ok) {
      // Log the status only: the request URL contains the API key.
      console.error("reverse-geocode: LocationIQ error", { status: geocodeResponse.status });
      return new Response(JSON.stringify({ error: "geocoding_failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data: GeocodeResponse = await geocodeResponse.json();
    const location = formatLocation(data.address);
    const countryCode = data.address?.country_code ? data.address.country_code.toUpperCase() : null;

    return new Response(JSON.stringify({ location, countryCode }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("reverse-geocode: unexpected error", error);
    return new Response(JSON.stringify({ error: "unexpected_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
