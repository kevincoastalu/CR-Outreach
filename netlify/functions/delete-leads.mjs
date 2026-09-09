import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const emails = Array.isArray(body.emails)
      ? [...new Set(body.emails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))]
      : [];

    if (!emails.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Select at least one lead to delete' }) };
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
      return { statusCode: 404, body: JSON.stringify({ error: 'No matching leads found to delete' }) };
    }

    const leadIds = leads.map((lead) => lead.id);

    const { error: membershipError } = await supabase
      .from('campaign_leads')
      .delete()
      .in('lead_id', leadIds);

    if (membershipError) {
      return { statusCode: 500, body: JSON.stringify({ error: membershipError.message }) };
    }

    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .in('id', leadIds);

    if (deleteError) {
      return { statusCode: 500, body: JSON.stringify({ error: deleteError.message }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        deleted: leads.length,
        requested: emails.length,
        emails: leads.map((lead) => lead.email)
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Unexpected error' })
    };
  }
};
