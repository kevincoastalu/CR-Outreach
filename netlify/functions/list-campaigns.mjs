import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    let { data, error } = await supabase
      .from('campaigns')
      .select('id, name, objective, target_segment, status, cta, personalization_mode, created_at, email_drafts(*), send_jobs(*), campaign_leads(lead_id, status)')
      .order('created_at', { ascending: false })
      .limit(12);

    if (error && /column .* does not exist|schema cache/i.test(error.message)) {
      ({ data, error } = await supabase
        .from('campaigns')
        .select('id, name, objective, target_segment, status, created_at, email_drafts(*), send_jobs(*), campaign_leads(lead_id, status)')
        .order('created_at', { ascending: false })
        .limit(12));
    }

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ campaigns: data || [] })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Unexpected error' })
    };
  }
};