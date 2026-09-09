import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const campaignId = String(body.campaignId || '').trim();
    const removeFromAll = Boolean(body.removeFromAll);
    const emails = Array.isArray(body.emails)
      ? [...new Set(body.emails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))]
      : [];

    if (!emails.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Select at least one lead' }) };
    }
    if (!removeFromAll && !campaignId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Choose a campaign to remove from' }) };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('id, email')
      .in('email', emails);

    if (leadError) {
      return { statusCode: 500, body: JSON.stringify({ error: leadError.message }) };
    }

    if (!leads?.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Selected leads must be saved before updating assignment' }) };
    }

    const leadIds = leads.map((lead) => lead.id);
    let query = supabase.from('campaign_leads').delete().in('lead_id', leadIds);
    if (!removeFromAll) {
      query = query.eq('campaign_id', campaignId);
    }

    const { data, error: deleteError } = await query.select('lead_id, campaign_id');
    if (deleteError) {
      return { statusCode: 500, body: JSON.stringify({ error: deleteError.message }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        removed: Array.isArray(data) ? data.length : 0,
        leadCount: leads.length,
        requested: emails.length,
        removeFromAll
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Unexpected error' })
    };
  }
};
