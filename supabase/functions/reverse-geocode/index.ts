// Server-side reverse geocoding proxy for LocationPrompt.tsx and Profile.tsx's
// getCurrentLocation(). Nominatim's usage policy requires an identifying
// User-Agent header, but browsers (Chrome specifically) silently drop custom
// User-Agent values set via fetch() -- so this can't be called directly from
// the browser. This function proxies the request server-side instead, where
// no such restriction applies.
//
// This is the first Edge Function in this codebase invoked directly from the
// browser via supabase.functions.invoke(), rather than browser-navigated
// (item-preview) or webhook-invoked (send-notification-email) -- neither of
// those needed CORS, since Supabase does not add it automatically to Edge
// Functions. This one does, so it's handled explicitly below.
//
// No Supabase client / database access needed here -- this function only
// proxies to Nominatim and returns a formatted display string.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  country?: string;
}

interface NominatimResponse {
  address?: NominatimAddress;
}

function formatLocation(address: NominatimAddress | undefined): string {
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

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;

    // Without Accept-Language, Nominatim returns names in the local language
    // of the area (e.g. "Warszawa, Polska" for a Poland pilot), not English.
    const nominatimResponse = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "Barter/1.0 (nrj.ghy@gmail.com)",
        "Accept-Language": "en",
      },
    });

    if (!nominatimResponse.ok) {
      console.error("reverse-geocode: Nominatim error", { status: nominatimResponse.status });
      return new Response(JSON.stringify({ error: "geocoding_failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data: NominatimResponse = await nominatimResponse.json();
    const location = formatLocation(data.address);

    return new Response(JSON.stringify({ location }), {
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
