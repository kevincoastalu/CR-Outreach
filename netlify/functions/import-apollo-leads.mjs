import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const leads = Array.isArray(body.leads) ? body.leads : [];
    const sourceQuery = String(body.sourceQuery || '').trim();
    if (!leads.length) return { statusCode: 400, body: JSON.stringify({ error: 'Select at least one Apollo lead' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const imported = [];
    const skipped = [];

    for (const lead of leads.slice(0, 100)) {
      const apolloId = String(lead.apollo_contact_id || '').trim();
      const email = String(lead.email || '').trim().toLowerCase();
      if (!apolloId && !email) {
        skipped.push({ reason: 'missing Apollo ID and email', lead });
        continue;
      }

      let existingQuery = supabase.from('leads').select('id').limit(1);
      existingQuery = apolloId ? existingQuery.eq('apollo_contact_id', apolloId) : existingQuery.eq('email', email);
      const { data: existing, error: lookupError } = await existingQuery;
      if (lookupError) return { statusCode: 500, body: JSON.stringify({ error: lookupError.message }) };

      const row = {
        first_name: lead.first_name || '', last_name: lead.last_name || '', email,
        title: lead.title || '', firm_name: lead.firm_name || '', company: lead.company || lead.firm_name || '',
        website: lead.website || '', linkedin_url: lead.linkedin_url || '', city: lead.city || '', state: lead.state || '', country: lead.country || '',
        apollo_contact_id: apolloId || null, apollo_organization_id: lead.apollo_organization_id || null,
        source: 'apollo', source_query: sourceQuery, source_imported_at: new Date().toISOString(), status: 'needs_review'
      };

      const operation = existing?.length
        ? supabase.from('leads').update(row).eq('id', existing[0].id).select().single()
        : supabase.from('leads').insert(row).select().single();
      const { data, error } = await operation;
      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      imported.push(data);
    }

    return { statusCode: 200, body: JSON.stringify({ imported: imported.length, skipped: skipped.length, leads: imported }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unexpected error' }) };
  }
};