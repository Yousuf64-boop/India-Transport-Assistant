const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const config = {
  functionUrl: url ? `${url.replace(/\/$/, '')}/functions/v1/transport-info` : '',
  anonKey: anonKey ?? '',
  isConfigured: Boolean(url && anonKey),
};
