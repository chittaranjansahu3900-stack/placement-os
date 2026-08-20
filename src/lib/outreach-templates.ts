export const OUTREACH_PERSONA_TEMPLATES: Record<string, string> = {
  "IT/Product": `Subject: Campus hiring partnership with {{company_name}}

Dear {{contact_title}} {{contact_last_name}},

I am reaching out from our placement team to explore campus hiring opportunities with {{company_name}}. Our cohort includes candidates with product thinking, software, analytics, and cross-functional problem-solving experience who can contribute across engineering, product, customer success, and business roles.

We would be glad to share the batch profile and discuss a role-specific campus process at your convenience.

Regards,
{{sender_name}}
{{sender_email}}`,
  BFSI: `Subject: Campus talent for BFSI roles at {{company_name}}

Dear {{contact_title}} {{contact_last_name}},

We would like to invite {{company_name}} to engage with our current cohort for banking, financial services, insurance, risk, operations, and relationship-management opportunities. The batch brings a mix of quantitative ability, commercial judgment, and prior industry exposure.

May we schedule a brief conversation to understand your hiring plan and share relevant candidate profiles?

Regards,
{{sender_name}}
{{sender_email}}`,
  Consulting: `Subject: Consulting campus engagement — {{company_name}}

Dear {{contact_title}} {{contact_last_name}},

I am writing to explore a campus engagement with {{company_name}}. Our students are trained in structured problem solving, research, analytics, stakeholder communication, and team-based case work, with experience across several industries.

We can tailor the process to your preferred case, interview, and assessment format and share a focused candidate pool.

Regards,
{{sender_name}}
{{sender_email}}`,
  "Core/Manufacturing": `Subject: Campus hiring for operations and core-industry roles

Dear {{contact_title}} {{contact_last_name}},

Our placement team would value the opportunity to partner with {{company_name}} for operations, supply chain, manufacturing, procurement, project, and general-management roles. The cohort combines management training with diverse technical and on-ground work experience.

Please let us know a suitable time to discuss your talent requirements and the upcoming campus calendar.

Regards,
{{sender_name}}
{{sender_email}}`,
  "FMCG & Sales": `Subject: Sales and marketing talent from our current cohort

Dear {{contact_title}} {{contact_last_name}},

We are keen to explore campus opportunities with {{company_name}} across sales, marketing, category, distribution, and customer-facing roles. Our students bring strong communication, market analysis, execution discipline, and readiness for field-intensive assignments.

We would be happy to share the batch profile and coordinate a hiring process aligned to your requirements.

Regards,
{{sender_name}}
{{sender_email}}`,
  Startup: `Subject: Versatile campus talent for {{company_name}}

Dear {{contact_title}} {{contact_last_name}},

I am reaching out to explore how our students could support {{company_name}} in high-ownership roles across growth, product, operations, founder's office, analytics, and business development. The cohort is comfortable with ambiguity, rapid learning, and cross-functional execution.

We can coordinate a focused, fast campus process and share profiles matched to your immediate priorities.

Regards,
{{sender_name}}
{{sender_email}}`,
  "PSU/Government": `Subject: Institutional campus recruitment engagement

Dear {{contact_title}} {{contact_last_name}},

On behalf of our placement team, I would like to invite {{company_name}} to consider our current cohort for suitable management and specialist opportunities. We can support the documentation, eligibility screening, scheduling, and formal campus process required by your recruitment norms.

Kindly share the appropriate procedure or contact for taking this engagement forward.

Regards,
{{sender_name}}
{{sender_email}}`,
  "Analytics & Data": `Subject: Analytics and data talent for {{company_name}}

Dear {{contact_title}} {{contact_last_name}},

We would like to explore campus roles with {{company_name}} across business analytics, data-led strategy, reporting, risk, operations analytics, and decision support. Our students combine quantitative coursework with business context and stakeholder communication.

We can share profiles aligned to your tools, domain, and experience criteria and arrange an efficient assessment process.

Regards,
{{sender_name}}
{{sender_email}}`,
};

export function outreachTemplate(category: string, storedTemplate: string): string {
  return storedTemplate.trim() || OUTREACH_PERSONA_TEMPLATES[category] || "";
}

export function renderOutreachTemplate(template: string, values: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => values[key]?.trim() || "");
}
