const APOLLO_SEARCH_URL = process.env.APOLLO_SEARCH_URL || 'https://api.apollo.io/api/v1/mixed_people/api_search';

function normalizePerson(person) {
  const organization = person.organization || {};
  const email = person.email || person.contact_email || '';
  return {
    apollo_contact_id: person.id || person.contact_id || '',
    apollo_organization_id: organization.id || person.organization_id || '',
    first_name: person.first_name || '',
    last_name: person.last_name || '',
    email,
    title: person.title || '',
    firm_name: organization.name || person.organization_name || '',
    company: organization.name || person.organization_name || '',
    website: organization.website_url || person.organization_website_url || '',
    linkedin_url: person.linkedin_url || '',
    city: person.city || '',
    state: person.state || '',
    country: person.country || ''
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!process.env.APOLLO_API_KEY) return { statusCode: 503, body: JSON.stringify({ error: 'APOLLO_API_KEY is not configured' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const page = Math.max(1, Number(body.page) || 1);
    const perPage = Math.min(25, Math.max(1, Number(body.perPage) || 10));
    const maxPerCompany = Math.min(5, Math.max(1, Number(body.maxPerCompany) || 1));
    const titles = Array.isArray(body.titles) ? body.titles.filter(Boolean).slice(0, 10) : [];
    const keywords = String(body.keywords || '').trim();

    const searchBody = {
      page,
      per_page: perPage,
      person_titles: titles,
      q_organization_keyword_tags: keywords ? keywords.split(',').map((item) => item.trim()).filter(Boolean) : [],
      contact_email_status: ['verified']
    };

    const response = await fetch(APOLLO_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.APOLLO_API_KEY },
      body: JSON.stringify(searchBody)
    });
    const result = await response.json();
    if (!response.ok) return { statusCode: response.status, body: JSON.stringify({ error: result.message || result.error || 'Apollo search failed' }) };

    const people = Array.isArray(result.people) ? result.people : (Array.isArray(result.contacts) ? result.contacts : []);
    const companyCounts = new Map();
    const limitedPeople = people.filter((person) => {
      const company = String(person.organization?.name || person.organization_name || 'unknown').trim().toLowerCase();
      const count = companyCounts.get(company) || 0;
      if (count >= maxPerCompany) return false;
      companyCounts.set(company, count + 1);
      return true;
    });

    const rawPagination = result.pagination && typeof result.pagination === 'object' ? result.pagination : {};
    const totalEntries = Number(rawPagination.total_entries ?? result.total_entries ?? 0) || 0;
    const totalPages = Number(
      rawPagination.total_pages
      ?? (perPage > 0 && totalEntries > 0 ? Math.ceil(totalEntries / perPage) : 0)
    ) || 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        people: limitedPeople.map(normalizePerson),
        pagination: {
          page: Number(rawPagination.page) || page,
          per_page: Number(rawPagination.per_page) || perPage,
          total_entries: totalEntries,
          total_pages: totalPages,
          returned: people.length,
          shown: limitedPeople.length
        },
        query: { titles, keywords, page, perPage, maxPerCompany }
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unexpected error' }) };
  }
};