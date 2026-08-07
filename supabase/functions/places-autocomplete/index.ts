// Server-side autocomplete proxy for Profile.tsx's manual location entry.
// LocationIQ's Autocomplete API requires an API key, which must stay
// server-side -- this proxies the request so the key never reaches the
// browser, following the same invoked-from-browser + explicit-CORS pattern
// established by reverse-geocode.
//
// The `layers` request param (city, suburb, neighbourhood, county, state,
// country) is only a soft preference on LocationIQ's side, not a hard
// filter -- confirmed live: a "Mokotow" query still returned a former
// detention facility and a tram depot alongside genuine district results.
// So results are additionally filtered server-side on OSM's `class` field,
// keeping only "place" (settlements/districts, e.g. suburb/neighbourhood)
// and "boundary" (administrative areas -- many European city districts are
// tagged this way instead of "place") and dropping everything else
// (amenity, historic, railway, tourism, etc.). Since filtering happens
// after LocationIQ's own limit is applied, we request more results than we
// need (LOCATIONIQ_FETCH_LIMIT) and truncate to the real limit
// (RESULT_LIMIT) after filtering, so a noisy query doesn't come back with
// fewer than 5 genuine results.
//
// Country bias/restriction (countrycodes param) deliberately omitted per
// explicit product decision, even though this is a Poland-first pilot.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOCATIONIQ_FETCH_LIMIT = "10";
const RESULT_LIMIT = 5;
const ALLOWED_CLASSES = new Set(["place", "boundary"]);

interface LocationIQSuggestion {
  lat: string;
  lon: string;
  display_name: string;
  class?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    // Re-validate the minimum-length rule server-side rather than trusting
    // the frontend's debounce/min-char gate, matching this project's
    // established pattern of RPCs re-validating client-enforced rules.
    if (typeof query !== "string" || query.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "query must be a string of at least 3 characters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = Deno.env.get("LOCATIONIQ_API_KEY");
    if (!apiKey) {
      console.error("places-autocomplete: LOCATIONIQ_API_KEY not set");
      return new Response(JSON.stringify({ error: "not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      limit: LOCATIONIQ_FETCH_LIMIT,
      layers: "city,suburb,neighbourhood,county,state,country",
      "accept-language": "en",
    });

    const locationIqUrl = `https://api.locationiq.com/v1/autocomplete?${params.toString()}`;

    const locationIqResponse = await fetch(locationIqUrl);

    // LocationIQ returns 404 for "no results", not an error condition --
    // an empty dropdown, not a failed request.
    if (locationIqResponse.status === 404) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!locationIqResponse.ok) {
      console.error("places-autocomplete: LocationIQ error", {
        status: locationIqResponse.status,
      });
      return new Response(JSON.stringify({ error: "autocomplete_failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data: LocationIQSuggestion[] = await locationIqResponse.json();

    // lat/lon come back as strings from LocationIQ -- parsed here so the
    // frontend receives real numbers ready to store alongside the label.
    // Filtered to place/boundary class only (see header comment), then
    // truncated to the real result limit.
    const suggestions = data
      .filter((item) => item.class !== undefined && ALLOWED_CLASSES.has(item.class))
      .slice(0, RESULT_LIMIT)
      .map((item) => ({
        label: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));

    return new Response(JSON.stringify({ suggestions }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("places-autocomplete: unexpected error", error);
    return new Response(JSON.stringify({ error: "unexpected_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
