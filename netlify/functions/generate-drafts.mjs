import OpenAI from 'openai';

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
    const leads = Array.isArray(body.leads) ? body.leads : [];
    const segment = String(body.segment || '').trim();
    const objective = String(body.objective || '').trim();
    const cta = body.cta || 'Reply with a domain or matter they want checked.';
    const personalizationMode = body.personalizationMode || 'Email only';
    const solutionContext = String(body.solutionContext || '').trim();
    const referenceDocuments = Array.isArray(body.referenceDocuments) ? body.referenceDocuments : [];

    if (!segment || !objective || !solutionContext) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Audience, objective, and solution context are required' }) };
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
      Write 3 short B2B outreach email variants.
      Audience (write specifically for these people; match their role, industry language, and priorities): ${segment}
      Company: CyRisk
      Product: Insight Engine
      Objective (primary instruction for what the outreach copy should achieve): ${objective}
      CTA: ${cta}
      Solution context: ${solutionContext}
      Reference material: ${referenceDocuments.map((document) => `${document.name}: ${document.text}`).join('\n')}
      Tone: concise, credible, non-pushy, professional, and appropriate for the Audience.
      Avoid: spammy language, exaggerated claims, scheduling links, and generic copy that ignores the Audience.
      Personalization mode: ${personalizationMode}
      Treat Audience as required context for who the email is speaking to and how it should sound.
      Treat Objective as the user's prompt for what this outreach should accomplish and emphasize.
      Align every subject and body with the Audience and Objective, and end toward the CTA.
      Use only these Apollo merge fields when personalization is needed: {{first_name}}, {{firm_name}}, {{sender_name}}.
      Do not use {{page_link}} because this MVP does not use landing pages.
      Do not use bracket placeholders such as [Name] or [Your Name].
      Return valid JSON with keys: subject1, body1, subject2, body2, subject3, body3.
    `;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a B2B outbound copywriter. Customize every draft to the provided Audience and Objective.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    });

    const content = completion.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    const variants = Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, normalizeApolloPlaceholders(value)])
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ variants, count: leads.length })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Unexpected error' })
    };
  }
};
