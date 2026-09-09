const APOLLO_ENRICH_URL = process.env.APOLLO_ENRICH_URL || 'https://api.apollo.io/api/v1/people/match';

function normalizePerson(person, source) {
  const organization = person.organization || {};
  const contact = person.contact || {};
  return {
    ...source,
    apollo_contact_id: person.id || contact.id || source.apollo_contact_id || '',
    apollo_organization_id: person.organization_id || organization.id || source.apollo_organization_id || '',
    first_name: person.first_name || contact.first_name || source.first_name || '',
    last_name: person.last_name || contact.last_name || source.last_name || '',
    email: person.email || contact.email || source.email || '',
    title: person.title || contact.title || source.title || '',
    firm_name: organization.name || contact.organization_name || source.firm_name || '',
    company: organization.name || contact.organization_name || source.company || source.firm_name || '',
    website: organization.website_url || source.website || '',
    linkedin_url: person.linkedin_url || contact.linkedin_url || source.linkedin_url || '',
    city: person.city || source.city || '',
    state: person.state || source.state || '',
    country: person.country || source.country || ''
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!process.env.APOLLO_API_KEY) return { statusCode: 503, body: JSON.stringify({ error: 'APOLLO_API_KEY is not configured' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const leads = Array.isArray(body.leads) ? body.leads.slice(0, 10) : [];
    if (!leads.length) return { statusCode: 400, body: JSON.stringify({ error: 'Select at least one Apollo prospect' }) };

    const enriched = [];
    const failed = [];
    for (const lead of leads) {
      if (!lead.apollo_contact_id) {
        failed.push({ lead, reason: 'Missing Apollo person ID' });
        continue;
      }

      const response = await fetch(APOLLO_ENRICH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.APOLLO_API_KEY },
        body: JSON.stringify({ id: lead.apollo_contact_id, reveal_personal_emails: false })
      });
      const result = await response.json();
      if (!response.ok) {
        failed.push({ lead, reason: result.message || result.error || 'Apollo enrichment failed' });
        continue;
      }

      const person = result.person || result.contact;
      if (!person) {
        failed.push({ lead, reason: 'Apollo returned no person record' });
        continue;
      }
      enriched.push(normalizePerson(person, lead));
    }

    return { statusCode: 200, body: JSON.stringify({ enriched, enrichedCount: enriched.length, failed, failedCount: failed.length }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unexpected error' }) };
  }
};