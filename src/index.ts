export interface Env {
  UPTIME_KV: KVNamespace;
}

export interface SiteCheck {
  name: string;
  url: string;
  timeout: number;
}

export interface UptimeData {
  status: 'up' | 'down';
  responseTime: number;
  statusCode?: number;
  error?: string;
  timestamp: number;
}

export async function checkSite(site: SiteCheck, env: Env): Promise<void> {
  const start = Date.now();
  const timestamp = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), site.timeout);
    
    const response = await fetch(site.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TeyvatArchive-Uptime-Monitor/1.0' }
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - start;
    const status: 'up' | 'down' = response.ok ? 'up' : 'down';
    
    const data: UptimeData = {
      status,
      responseTime,
      statusCode: response.status,
      timestamp
    };
    
    await env.UPTIME_KV.put(`current_${site.name}`, JSON.stringify(data));
    await env.UPTIME_KV.put(
      `history_${site.name}_${timestamp}`, 
      JSON.stringify(data),
      { expirationTtl: 30 * 24 * 60 * 60 }
    );
    
  } catch (error: any) {
    const data: UptimeData = {
      status: 'down',
      error: error.message,
      responseTime: Date.now() - start,
      timestamp
    };
    
    await env.UPTIME_KV.put(`current_${site.name}`, JSON.stringify(data));
    await env.UPTIME_KV.put(
      `history_${site.name}_${timestamp}`, 
      JSON.stringify(data),
      { expirationTtl: 30 * 24 * 60 * 60 }
    );
  }
}

export async function getStatus(env: Env): Promise<Response> {
  const sites = ['main', 'dashboard', 'api', 'cdn'];
  const statuses: Record<string, UptimeData | null> = {};
  
  for (const site of sites) {
    const data = await env.UPTIME_KV.get(`current_${site}`);
    try {
      statuses[site] = data ? JSON.parse(data) : null;
    } catch (error) {
      // Handle invalid JSON gracefully
      console.warn(`Invalid JSON data for site ${site}:`, error);
      statuses[site] = null;
    }
  }
  
  return new Response(JSON.stringify(statuses), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function getHistory(env: Env, siteName: string | null): Promise<Response> {
  if (!siteName) {
    return new Response('Site parameter required', { status: 400 });
  }
  
  const list = await env.UPTIME_KV.list({ prefix: `history_${siteName}_` });
  const history: UptimeData[] = [];
  
  for (const key of list.keys) {
    const data = await env.UPTIME_KV.get(key.name);
    if (data) {
      try {
        history.push(JSON.parse(data));
      } catch (error) {
        // Skip invalid JSON entries
        console.warn(`Invalid JSON data for key ${key.name}:`, error);
      }
    }
  }
  
  history.sort((a, b) => b.timestamp - a.timestamp);
  
  return new Response(JSON.stringify(history.slice(0, 100)), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export const MONITORED_SITES: SiteCheck[] = [
  { name: 'main', url: 'https://teyvatarchive.online/api/health', timeout: 10000 },
  { name: 'dashboard', url: 'https://dashboard.teyvatarchive.online', timeout: 10000 },
  { name: 'api', url: 'https://server.teyvatarchive.online', timeout: 10000 },
  { name: 'cdn', url: 'https://cdn.teyvatarchive.online/images/chapterIcons/UI_ChapterIcon_AkaFes.png', timeout: 10000 }
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/api/status') {
      return await getStatus(env);
    }
    
    if (url.pathname === '/api/history') {
      return await getHistory(env, url.searchParams.get('site'));
    }
    
    return new Response('Teyvat Archive Uptime Monitor API', { status: 200 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const checks = MONITORED_SITES.map(site => checkSite(site, env));
    await Promise.all(checks);
  }
};