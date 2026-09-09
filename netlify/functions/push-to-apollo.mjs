import { createClient } from '@supabase/supabase-js';

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

function apolloHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': process.env.APOLLO_API_KEY
  };
}

async function apolloFetch(path, { method = 'GET', body, query } = {}) {
  const url = new URL(path.startsWith('http') ? path : `${APOLLO_BASE}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value == null || value === '') return;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
      } else {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url, {
    method,
    headers: apolloHeaders(),
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { raw: text };
  }
  if (!response.ok) {
    const message = result.message || result.error || result.error_message || `Apollo request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = result;
    throw error;
  }
  return result;
}

function textToHtml(value) {
  const escaped = String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${part.replace(/\n/g, '<br>')}</p>`);
  return paragraphs.join('') || '<p></p>';
}

function normalizeMergeFields(value) {
  return String(value || '')
    .replace(/\{\{\s*firm_name\s*\}\}/gi, '{{company}}')
    .replace(/\{\{\s*organization_name\s*\}\}/gi, '{{company}}')
    .replace(/\[Name\]/gi, '{{first_name}}')
    .replace(/\[Firm Name\]/gi, '{{company}}')
    .replace(/\[Page Link\]/gi, '{{page_link}}');
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function resolveEmailAccountId(explicitId) {
  if (explicitId) return explicitId;
  if (process.env.APOLLO_EMAIL_ACCOUNT_ID) return process.env.APOLLO_EMAIL_ACCOUNT_ID;

  const result = await apolloFetch('/email_accounts');
  const accounts = Array.isArray(result.email_accounts) ? result.email_accounts : [];
  const preferredEmail = String(process.env.APOLLO_EMAIL || '').trim().toLowerCase();
  const active = accounts.filter((account) => account && account.active !== false && !account.revoked_at);

  if (preferredEmail) {
    const match = active.find((account) => String(account.email || '').trim().toLowerCase() === preferredEmail);
    if (match?.id) return match.id;
  }

  const fallback = active.find((account) => account.default) || active[0];
  if (fallback?.id) return fallback.id;

  throw new Error('No Apollo sending mailbox found. Set APOLLO_EMAIL_ACCOUNT_ID (or APOLLO_EMAIL) in Netlify env.');
}

async function ensurePageLinkFieldId() {
  const listed = await apolloFetch('/fields', { query: { source: 'custom' } });
  const fields = Array.isArray(listed.fields)
    ? listed.fields
    : (Array.isArray(listed.typed_custom_fields) ? listed.typed_custom_fields : []);

  const existing = fields.find((field) => {
    const name = String(field.name || field.label || '').trim().toLowerCase();
    const modality = String(field.modality || '').trim().toLowerCase();
    return modality === 'contact' && (name === 'page_link' || name === 'page link');
  });
  if (existing?.id) return existing.id;

  try {
    const created = await apolloFetch('/fields', {
      method: 'POST',
      body: { label: 'page_link', modality: 'contact', type: 'string' }
    });
    const createdFields = Array.isArray(created.typed_custom_fields)
      ? created.typed_custom_fields
      : (created.field ? [created.field] : []);
    if (createdFields[0]?.id) return createdFields[0].id;
  } catch (error) {
    // Field may already exist under a different response shape; re-list once.
    const relisted = await apolloFetch('/fields', { query: { source: 'custom' } });
    const again = Array.isArray(relisted.fields)
      ? relisted.fields
      : (Array.isArray(relisted.typed_custom_fields) ? relisted.typed_custom_fields : []);
    const match = again.find((field) => String(field.name || field.label || '').trim().toLowerCase().includes('page_link'));
    if (match?.id) return match.id;
    throw error;
  }

  return '';
}

async function findContactIdByEmail(email) {
  const result = await apolloFetch('/contacts/search', {
    method: 'POST',
    body: { q_keywords: email, per_page: 5, page: 1 }
  });
  const contacts = Array.isArray(result.contacts) ? result.contacts : [];
  const exact = contacts.find((contact) => String(contact.email || '').trim().toLowerCase() === email);
  return exact?.id || '';
}

async function upsertApolloContact(lead, pageLinkFieldId) {
  const email = String(lead.email || '').trim().toLowerCase();
  if (!email) throw new Error('Every lead needs an email before pushing to Apollo.');

  const typedCustomFields = {};
  if (pageLinkFieldId && lead.page_url) {
    typedCustomFields[pageLinkFieldId] = String(lead.page_url);
  }

  const base = {
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    email,
    title: lead.title || '',
    organization_name: lead.firm_name || lead.company || '',
    website_url: lead.website || '',
    run_dedupe: true
  };
  if (Object.keys(typedCustomFields).length) base.typed_custom_fields = typedCustomFields;

  let contactId = String(lead.apollo_contact_id || '').trim();

  if (contactId) {
    try {
      const updated = await apolloFetch(`/contacts/${contactId}`, {
        method: 'PATCH',
        body: {
          first_name: base.first_name,
          last_name: base.last_name,
          title: base.title,
          organization_name: base.organization_name,
          website_url: base.website_url,
          ...(base.typed_custom_fields ? { typed_custom_fields: base.typed_custom_fields } : {})
        }
      });
      return updated.contact?.id || contactId;
    } catch {
      contactId = '';
    }
  }

  if (!contactId) {
    contactId = await findContactIdByEmail(email);
  }

  if (contactId) {
    const updated = await apolloFetch(`/contacts/${contactId}`, {
      method: 'PATCH',
      body: {
        first_name: base.first_name,
        last_name: base.last_name,
        title: base.title,
        organization_name: base.organization_name,
        website_url: base.website_url,
        ...(base.typed_custom_fields ? { typed_custom_fields: base.typed_custom_fields } : {})
      }
    });
    return updated.contact?.id || contactId;
  }

  const created = await apolloFetch('/contacts', { method: 'POST', body: base });
  return created.contact?.id || '';
}

function buildEmailerSteps(steps) {
  const ordered = [...(steps || [])].sort((a, b) => Number(a.step_number || 0) - Number(b.step_number || 0));
  if (ordered.length < 1) throw new Error('Launch job is missing email steps.');

  return ordered.map((step, index) => {
    const previousOffset = index === 0 ? 0 : Number(ordered[index - 1].send_offset_days || 0);
    const offset = Number(step.send_offset_days || 0);
    const waitDays = Math.max(0, offset - previousOffset);
    const subject = normalizeMergeFields(step.subject_line);
    const bodyHtml = textToHtml(normalizeMergeFields(step.body_text));

    return {
      type: 'auto_email',
      wait_time: index === 0 ? 0 : waitDays,
      wait_mode: index === 0 ? 'minute' : 'day',
      emailer_touches: [
        {
          type: index === 0 ? 'new_thread' : 'reply_to_thread',
          status: 'approved',
          include_signature: true,
          emailer_template: {
            subject: index === 0 ? subject : (subject || ''),
            body_html: bodyHtml
          }
        }
      ]
    };
  });
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!process.env.APOLLO_API_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: 'APOLLO_API_KEY is not configured' }) };
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Supabase is not configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const jobId = String(body.jobId || '').trim();
    if (!jobId) return { statusCode: 400, body: JSON.stringify({ error: 'jobId is required' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    const { data: job, error: jobError } = await supabase
      .from('send_jobs')
      .select('id, campaign_id, platform, payload, status')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return { statusCode: 404, body: JSON.stringify({ error: jobError?.message || 'Launch job not found' }) };
    }

    if (String(job.platform || '').toLowerCase() !== 'apollo') {
      return { statusCode: 400, body: JSON.stringify({ error: 'This launch job is not set to Apollo.' }) };
    }

    const existingPayload = job.payload && typeof job.payload === 'object' ? job.payload : {};
    if (existingPayload.apollo_sequence_id && String(job.status || '').toLowerCase() === 'pushed') {
      return {
        statusCode: 200,
        body: JSON.stringify({
          alreadyPushed: true,
          jobId: job.id,
          sequenceId: existingPayload.apollo_sequence_id,
          sequenceName: existingPayload.apollo_sequence_name || '',
          enrolled: existingPayload.apollo_enrolled_count || 0,
          mailboxEmail: existingPayload.apollo_mailbox_email || '',
          status: job.status
        })
      };
    }

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('id', job.campaign_id)
      .single();
    if (campaignError || !campaign) {
      return { statusCode: 404, body: JSON.stringify({ error: campaignError?.message || 'Campaign not found' }) };
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('campaign_leads')
      .select('lead_id, leads(id, first_name, last_name, email, title, firm_name, company, website, page_url, apollo_contact_id)')
      .eq('campaign_id', job.campaign_id);

    if (membershipError) {
      return { statusCode: 500, body: JSON.stringify({ error: membershipError.message }) };
    }

    const leads = (memberships || [])
      .map((row) => row.leads)
      .filter((lead) => lead && String(lead.email || '').trim());

    if (!leads.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Assign at least one lead to this campaign before pushing to Apollo.' }) };
    }

    const steps = Array.isArray(existingPayload.steps) ? existingPayload.steps : [];
    if (!steps.length) {
      return { statusCode: 400, body: JSON.stringify({ error: 'This launch job has no email steps to push.' }) };
    }

    const emailAccountId = await resolveEmailAccountId(String(body.emailAccountId || '').trim());
    const mailboxLookup = await apolloFetch('/email_accounts');
    const mailbox = (mailboxLookup.email_accounts || []).find((account) => account.id === emailAccountId);
    const mailboxEmail = mailbox?.email || process.env.APOLLO_EMAIL || '';

    const pageLinkFieldId = await ensurePageLinkFieldId();
    const emailerSteps = buildEmailerSteps(steps);
    const sequenceName = `${campaign.name || 'CyRisk campaign'}`.trim().slice(0, 120);

    const sequenceResult = await apolloFetch('/sequences', {
      method: 'POST',
      body: {
        name: sequenceName,
        active: false,
        label_names: ['CyRisk Outreach'],
        emailer_steps: emailerSteps
      }
    }).catch(async (error) => {
      // Some Apollo workspaces still expect the older emailer_campaigns create path.
      if (error.status !== 404 && error.status !== 405) throw error;
      return apolloFetch('/emailer_campaigns', {
        method: 'POST',
        body: {
          name: sequenceName,
          active: false,
          label_names: ['CyRisk Outreach'],
          emailer_steps: emailerSteps
        }
      });
    });

    const sequence = sequenceResult.emailer_campaign || sequenceResult.sequence || sequenceResult;
    const sequenceId = sequence.id || sequenceResult.id;
    if (!sequenceId) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Apollo did not return a sequence id.', details: sequenceResult }) };
    }

    const contactIds = [];
    const contactErrors = [];
    for (const lead of leads) {
      try {
        const contactId = await upsertApolloContact(lead, pageLinkFieldId);
        if (!contactId) {
          contactErrors.push({ email: lead.email, error: 'No Apollo contact id returned' });
          continue;
        }
        contactIds.push(contactId);
        if (lead.id && contactId !== lead.apollo_contact_id) {
          await supabase.from('leads').update({ apollo_contact_id: contactId }).eq('id', lead.id);
        }
      } catch (error) {
        contactErrors.push({ email: lead.email, error: error.message || 'Contact upsert failed' });
      }
    }

    if (!contactIds.length) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'Could not create or update any Apollo contacts.',
          sequenceId,
          contactErrors
        })
      };
    }

    let enrolled = 0;
    const enrollErrors = [];
    for (const batch of chunk(contactIds, 40)) {
      try {
        await apolloFetch(`/emailer_campaigns/${sequenceId}/add_contact_ids`, {
          method: 'POST',
          query: {
            emailer_campaign_id: sequenceId,
            send_email_from_email_account_id: emailAccountId,
            'contact_ids[]': batch
          }
        });
        enrolled += batch.length;
      } catch (error) {
        enrollErrors.push(error.message || 'Enrollment batch failed');
      }
    }

    const nextPayload = {
      ...existingPayload,
      apollo_sequence_id: sequenceId,
      apollo_sequence_name: sequenceName,
      apollo_mailbox_id: emailAccountId,
      apollo_mailbox_email: mailboxEmail,
      apollo_enrolled_count: enrolled,
      apollo_contact_ids: contactIds,
      apollo_pushed_at: new Date().toISOString(),
      activation_required: true,
      note: 'Sequence created inactive in Apollo. Activate it in Apollo when ready to send.'
    };

    const { error: updateError } = await supabase
      .from('send_jobs')
      .update({
        status: enrolled ? 'pushed' : 'paused',
        payload: nextPayload,
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id);

    if (updateError) {
      return { statusCode: 500, body: JSON.stringify({ error: updateError.message, sequenceId, enrolled }) };
    }

    await supabase
      .from('campaigns')
      .update({ status: 'Ready - paused in Apollo', updated_at: new Date().toISOString() })
      .eq('id', job.campaign_id);

    return {
      statusCode: 200,
      body: JSON.stringify({
        jobId: job.id,
        sequenceId,
        sequenceName,
        enrolled,
        contactCount: contactIds.length,
        mailboxEmail,
        status: enrolled ? 'pushed' : 'paused',
        apolloUrl: `https://app.apollo.io/#/sequences/${sequenceId}`,
        contactErrors,
        enrollErrors,
        message: enrolled
          ? `Pushed inactive Apollo sequence with ${enrolled} contact${enrolled === 1 ? '' : 's'}. Activate it in Apollo to send.`
          : 'Sequence created in Apollo, but contact enrollment failed. Check Apollo and retry.'
      })
    };
  } catch (err) {
    return {
      statusCode: err.status && err.status >= 400 && err.status < 600 ? err.status : 500,
      body: JSON.stringify({ error: err.message || 'Unexpected error', details: err.details || undefined })
    };
  }
};
