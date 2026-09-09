import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const originalEmail = String(body.originalEmail || '').trim().toLowerCase();
    const lead = body.lead && typeof body.lead === 'object' ? body.lead : {};
    const email = String(lead.email || '').trim().toLowerCase();
    if (!originalEmail || !email) return { statusCode: 400, body: JSON.stringify({ error: 'Original and updated email are required' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const values = {
      first_name: lead.first_name || '', last_name: lead.last_name || '', email,
      title: lead.title || '', firm_name: lead.firm_name || '', company: lead.company || lead.firm_name || '',
      website: lead.website || '', city: lead.city || '', state: lead.state || '', country: lead.country || '',
      firm_keywords: lead.firm_keywords || '',
      updated_at: new Date().toISOString()
    };

    const query = lead.id
      ? supabase.from('leads').update(values).eq('id', lead.id).select().single()
      : supabase.from('leads').update(values).eq('email', originalEmail).select().single();
    const { data, error } = await query;
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ lead: data }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unexpected error' }) };
  }
};