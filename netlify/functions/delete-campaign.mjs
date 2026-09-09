import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const campaignId = String(body.campaignId || '').trim();

    if (!campaignId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Campaign ID is required' }) };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId)
      .select('id, name')
      .maybeSingle();

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Campaign not found' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ deleted: true, id: data.id, name: data.name })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Unexpected error' })
    };
  }
};
