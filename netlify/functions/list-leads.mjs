import { createClient } from '@supabase/supabase-js';

const LEAD_SELECT_FULL = 'id, first_name, last_name, email, title, firm_name, company, website, city, state, country, page_url, status, source, source_query, firm_keywords, apollo_contact_id, campaign_leads(campaign_id, status, campaigns(id, name, status))';
const LEAD_SELECT_BASIC = 'id, first_name, last_name, email, title, firm_name, company, website, city, state, country, page_url, status, source, source_query, apollo_contact_id, campaign_leads(campaign_id, status, campaigns(id, name, status))';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    let { data, error } = await supabase
      .from('leads')
      .select(LEAD_SELECT_FULL)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error && /firm_keywords/i.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('leads')
        .select(LEAD_SELECT_BASIC)
        .order('created_at', { ascending: false })
        .limit(500));
    }

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ leads: data || [] }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unexpected error' }) };
  }
};
