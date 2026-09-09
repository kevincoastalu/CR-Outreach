import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const leads = Array.isArray(body.leads) ? body.leads : [];

    if (!leads.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No leads provided' }) };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const rows = leads.map((lead) => ({
      first_name: lead.first_name || '',
      last_name: lead.last_name || '',
      email: lead.email || '',
      title: lead.title || '',
      firm_name: lead.firm_name || '',
      company: lead.company || lead.firm_name || '',
      website: lead.website || '',
      city: lead.city || '',
      state: lead.state || '',
      country: lead.country || '',
      slug: lead.slug || '',
      page_url: lead.page_url || '',
      source: 'csv-upload',
      status: 'new'
    }));

    const { data, error } = await supabase.from('leads').insert(rows).select();

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ count: data.length, leads: data })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Unexpected error' })
    };
  }
};
