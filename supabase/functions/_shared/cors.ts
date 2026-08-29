// Shared CORS headers for AuthentiChain Edge Functions
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // functions.invoke is same-origin; open CORS keeps direct API use simple
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
