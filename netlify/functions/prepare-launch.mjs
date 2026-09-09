import { createClient } from '@supabase/supabase-js';

function normalizeApolloPlaceholders(value) {
  return String(value || '')
    .replace(/\[Name\]/gi, '{{first_name}}')
    .replace(/\[Your Name\]/gi, '{{sender_name}}')
    .replace(/\[Firm Name\]/gi, '{{firm_name}}')
    .replace(/\[Page Link\]/gi, '{{page_link}}');
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const campaignId = String(body.campaignId || '').trim();
    const platform = String(body.platform || '').trim().toLowerCase();
    const senderMailbox = String(body.senderMailbox || '').trim();
    const leads = Array.isArray(body.leads) ? body.leads : [];
    const drafts = body.drafts && typeof body.drafts === 'object' ? body.drafts : {};

    if (!campaignId) return { statusCode: 400, body: JSON.stringify({ error: 'Save the campaign before preparing launch' }) };
    if (!['apollo', 'instantly'].includes(platform)) return { statusCode: 400, body: JSON.stringify({ error: 'Choose Apollo or Instantly' }) };
    if (!senderMailbox) return { statusCode: 400, body: JSON.stringify({ error: 'Sending mailbox is required' }) };
    if (!leads.length) return { statusCode: 400, body: JSON.stringify({ error: 'At least one lead is required' }) };

    const missingEmails = leads.filter((lead) => !String(lead.email || '').trim());
    if (missingEmails.length) return { statusCode: 400, body: JSON.stringify({ error: 'Every lead must have an email address' }) };

    const steps = [1, 2, 3].map((stepNumber) => ({
      step_number: stepNumber,
      send_offset_days: [0, 4, 8][stepNumber - 1],
      subject_line: normalizeApolloPlaceholders(drafts[`subject${stepNumber}`]),
      body_text: normalizeApolloPlaceholders(drafts[`body${stepNumber}`])
    }));

    if (steps.some((step) => !step.subject_line || !step.body_text)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'All three subject and body variants are required' }) };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const payload = {
      campaign_id: campaignId,
      platform,
      sender_mailbox: senderMailbox,
      contacts: leads.map((lead) => ({
        first_name: lead.first_name || '',
        last_name: lead.last_name || '',
        email: lead.email,
        title: lead.title || '',
        firm_name: lead.firm_name || lead.company || '',
        page_link: lead.page_url || lead.page_link || ''
      })),
      steps,
      activation_required: true
    };

    const { error: campaignError } = await supabase
      .from('campaigns')
      .update({ status: 'approved' })
      .eq('id', campaignId);

    if (campaignError) return { statusCode: 500, body: JSON.stringify({ error: campaignError.message }) };

    const { data: job, error: jobError } = await supabase
      .from('send_jobs')
      .insert({ campaign_id: campaignId, platform, payload, status: 'paused' })
      .select('id, platform, status')
      .single();

    if (jobError) return { statusCode: 500, body: JSON.stringify({ error: jobError.message }) };

    return { statusCode: 200, body: JSON.stringify({ jobId: job.id, platform: job.platform, status: job.status }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unexpected error' }) };
  }
};