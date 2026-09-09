import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const campaignId = String(body.campaignId || '').trim();
    const emails = Array.isArray(body.emails)
      ? [...new Set(body.emails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))]
      : [];

    if (!campaignId) return { statusCode: 400, body: JSON.stringify({ error: 'Choose a campaign first' }) };
    if (!emails.length) return { statusCode: 400, body: JSON.stringify({ error: 'Select at least one lead' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: leads, error: leadError } = await supabase.from('leads').select('id, email').in('email', emails);
    if (leadError) return { statusCode: 500, body: JSON.stringify({ error: leadError.message }) };

    if (!leads?.length) return { statusCode: 400, body: JSON.stringify({ error: 'Selected leads must be saved before assignment' }) };

    const rows = leads.map((lead) => ({ campaign_id: campaignId, lead_id: lead.id, status: 'queued' }));
    const { error: assignmentError } = await supabase.from('campaign_leads').upsert(rows, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true });
    if (assignmentError) return { statusCode: 500, body: JSON.stringify({ error: assignmentError.message }) };

    return { statusCode: 200, body: JSON.stringify({ assigned: leads.length, requested: emails.length }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unexpected error' }) };
  }
};