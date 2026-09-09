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
    const name = String(body.campaignName || '').trim();
    const objective = String(body.objective || '').trim();
    const segment = String(body.segment || '').trim();
    const status = String(body.status || 'draft').trim();
    const cta = String(body.cta || '').trim();
    const scanPolicy = String(body.scanPolicy || '').trim();
    const personalizationMode = String(body.personalizationMode || '').trim();
    const drafts = body.drafts && typeof body.drafts === 'object' ? body.drafts : {};

    if (!name) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Campaign name is required' }) };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name,
        objective,
        target_segment: segment,
        status,
        cta,
        scan_policy: scanPolicy,
        personalization_mode: personalizationMode
      })
      .select()
      .single();

    if (campaignError) {
      return { statusCode: 500, body: JSON.stringify({ error: campaignError.message }) };
    }

    const draftRows = [
      { key: 'subject1', bodyKey: 'body1', label: 'Variant 1' },
      { key: 'subject2', bodyKey: 'body2', label: 'Variant 2' },
      { key: 'subject3', bodyKey: 'body3', label: 'Variant 3' }
    ]
      .map(({ key, bodyKey }) => {
        const subjectLine = normalizeApolloPlaceholders(drafts[key]);
        const bodyText = normalizeApolloPlaceholders(drafts[bodyKey]);
        if (!subjectLine || !bodyText) return null;

        return {
          campaign_id: campaign.id,
          subject_line: subjectLine,
          body_text: bodyText,
          status: 'draft',
          model: 'gpt-4o-mini'
        };
      })
      .filter(Boolean);

    let savedDraftCount = 0;

    if (draftRows.length) {
      const { error: draftError } = await supabase.from('email_drafts').insert(draftRows);
      if (draftError) {
        return { statusCode: 500, body: JSON.stringify({ error: draftError.message }) };
      }
      savedDraftCount = draftRows.length;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: campaign.id,
        status: campaign.status,
        savedDraftCount
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Unexpected error' })
    };
  }
};