window.CyRiskShared = {
  escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    ));
  },

  async withButtonBusy(button, action, busyLabel) {
    if (!button || button.disabled) return;
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${busyLabel}`;
    try {
      return await action();
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = originalHtml;
    }
  },

  setStatus(el, message, type = '') {
    if (!el) return;
    el.textContent = message || '';
    el.className = 'status-message';
    if (type) el.classList.add(type);
  },

  formatLeadStatus(status) {
    const value = String(status || 'new').trim().toLowerCase();
    if (value === 'needs_review') return 'Needs review';
    if (!value) return 'New';
    return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  },

  leadEmailKey(lead) {
    return (lead.email || '').trim().toLowerCase();
  },

  leadCampaignNames(lead) {
    return (lead.campaign_leads || [])
      .map((membership) => membership.campaigns?.name || '')
      .filter(Boolean);
  },

  leadFirmKeywords(lead) {
    const direct = String(lead?.firm_keywords || '').trim();
    if (direct) return direct;
    const sourceQuery = String(lead?.source_query || '').trim();
    if (!sourceQuery) return '';
    if (sourceQuery.includes('|')) return sourceQuery.split('|').slice(1).join('|').trim();
    return sourceQuery;
  },

  navigateTo(href) {
    const target = String(href || '').trim();
    if (!target) return;
    window.location.href = target;
  },

  bindNavButtons(root = document) {
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-nav-href]');
      if (!button || button.disabled || button.classList.contains('is-disabled')) return;
      event.preventDefault();
      this.navigateTo(button.getAttribute('data-nav-href'));
    });
  },

  topbar(active) {
    const links = [
      { href: 'index.html', id: 'workflow', label: 'Campaign workflow' },
      { href: 'leads.html', id: 'leads', label: 'Leads' },
      { href: 'campaigns.html', id: 'campaigns', label: 'Campaigns' },
      { href: 'launches.html', id: 'launches', label: 'Launches' }
    ];
    return `
      <header class="topbar">
        <a class="brand" href="index.html" style="text-decoration:none;">
          <span class="brand-mark"></span>
          CyRisk Outreach
        </a>
        <nav class="hub-nav" aria-label="Primary">
          ${links.map((link) => `<a href="${link.href}" class="${active === link.id ? 'is-active' : ''}">${link.label}</a>`).join('')}
        </nav>
        <div class="status-pill">Sales workspace</div>
      </header>
    `;
  }
};
