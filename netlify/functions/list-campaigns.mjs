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

    const campaignId = String(event.queryStringParameters?.id || '').trim();
    const fullSelect = 'id, name, objective, target_segment, status, cta, personalization_mode, solution_context, source_documents, created_at, email_drafts(*), send_jobs(*), campaign_leads(lead_id, status)';
    const basicSelect = 'id, name, objective, target_segment, status, created_at, email_drafts(*), send_jobs(*), campaign_leads(lead_id, status)';

    if (campaignId) {
      let { data, error } = await supabase
        .from('campaigns')
        .select(fullSelect)
        .eq('id', campaignId)
        .maybeSingle();

      if (error && /column .* does not exist|schema cache/i.test(error.message)) {
        ({ data, error } = await supabase
          .from('campaigns')
          .select(basicSelect)
          .eq('id', campaignId)
          .maybeSingle());
      }

      if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      }
      if (!data) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Campaign not found' }) };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ campaigns: [data], campaign: data })
      };
    }

    let { data, error } = await supabase
      .from('campaigns')
      .select(fullSelect)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error && /column .* does not exist|schema cache/i.test(error.message)) {
      ({ data, error } = await supabase
        .from('campaigns')
        .select(basicSelect)
        .order('created_at', { ascending: false })
        .limit(50));
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
