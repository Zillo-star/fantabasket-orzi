// Opt-in instrumentation for localhost development only. Never loaded by index.html.
export function installRequestMetrics({optIn = false} = {}){
  if(!optIn || !['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
    throw new Error('Profiling available only with explicit opt-in on localhost');
  }
  const original = window.fetch;
  const buckets = new Map();
  const measuredFetch = async function(input, init){
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    const rest = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    const endpoint = rest ? `PostgREST/${rest[1]}` : url.hostname.endsWith('.workers.dev') ? 'Worker' : 'other';
    const method = init?.method || input?.method || 'GET';
    const key = `${method} ${endpoint}`;
    const start = performance.now();
    const stats = buckets.get(key) || {requests:0,errors:0,responseBodyBytes:0,durationMs:0};
    buckets.set(key,stats);stats.requests++;
    try{
      const response = await original.call(this,input,init);
      if(!response.ok) stats.errors++;
      // Count decoded body bytes; not compressed network transfer or log ingestion.
      stats.responseBodyBytes += (await response.clone().arrayBuffer()).byteLength;
      return response;
    }catch(error){stats.errors++;throw error;}
    finally{stats.durationMs += performance.now()-start;}
  };
  window.fetch=measuredFetch;
  return {snapshot:()=>Object.fromEntries([...buckets].map(([key,v])=>[key,{...v}])),
    stop(){if(window.fetch===measuredFetch)window.fetch=original;}};
}
