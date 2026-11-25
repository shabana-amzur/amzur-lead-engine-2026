// Inbound: people who come to amzur.com.
//
//   GET  /api/inbound/tracker.js        The script amzur.com loads (one Google Tag Manager tag)
//   POST /api/inbound/event             A page view, or time spent / scroll depth on it
//   POST /api/inbound/form              A contact-form fill: becomes (or updates) an inbound lead
//   GET  /api/inbound/visitors          Recent visitors for the dashboard's Website visitors view
//   GET  /api/inbound/leads/:id/journey The pages an inbound lead read, in order
//
// Events arrive from visitors' browsers as text/plain JSON (navigator.sendBeacon),
// so no CORS preflight is needed. Only pages on INBOUND_ALLOWED_HOSTS
// (default amzur.com) are accepted. No IP address is stored: the visitor's
// country and city come from the hosting provider's location headers.
import express, { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { trackerScript } from '../lib/trackerScript';
import { inferLob, classifyIndustry, LOB_SERVICES } from '../services/discoveryEngine.js';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const inbound = require('../lib/inbound');

const router = Router();
router.use(express.text({ type: 'text/plain', limit: '64kb' }));

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|preview|facebookexternalhit|linkedinbot|embedly/i;
const ID = /^[A-Za-z0-9_-]{8,64}$/;

function body(req: Request): any {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body || {};
}

const header = (req: Request, name: string) => {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value) || '';
};

// Visitor's location from Vercel's edge headers (nothing locally).
function locationOf(req: Request) {
  const country = header(req, 'x-vercel-ip-country').toUpperCase() || null;
  let city: string | null = header(req, 'x-vercel-ip-city') || null;
  try {
    city = city ? decodeURIComponent(city) : null;
  } catch {
    // keep as is
  }
  return { country, city };
}

const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname || '/';
  } catch {
    return '/';
  }
};

// Small per-instance limit on form posts from one address (spam guard).
const formHits = new Map<string, number[]>();
function tooManyForms(req: Request) {
  const key = header(req, 'x-forwarded-for').split(',')[0].trim() || req.ip || 'unknown';
  const now = Date.now();
  const recent = (formHits.get(key) || []).filter((t) => now - t < 3600000);
  recent.push(now);
  formHits.set(key, recent);
  return recent.length > 10;
}

// ---- tracker script ----
router.get('/tracker.js', (req: Request, res: Response) => {
  const proto = header(req, 'x-forwarded-proto') || req.protocol;
  const apiBase = process.env.PUBLIC_API_URL || `${proto}://${req.get('host')}`;
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  // helmet defaults to same-origin; amzur.com must be able to load this.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(trackerScript(apiBase));
});

// ---- page views ----
router.post('/event', async (req: Request, res: Response) => {
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  try {
    if (BOT.test(header(req, 'user-agent'))) return res.status(204).end();
    const event = body(req);
    if (!ID.test(event.viewId || '') || !ID.test(event.visitorId || '')) return res.status(204).end();

    if (event.type === 'engage') {
      await prisma.webVisit.updateMany({
        where: { id: event.viewId, visitorId: event.visitorId },
        data: {
          engagedSec: Math.max(0, Math.min(Number(event.engagedSec) || 0, 6 * 3600)),
          scrollPct: Math.max(0, Math.min(Number(event.scrollPct) || 0, 100)),
        },
      });
      return res.status(204).end();
    }

    if (event.type !== 'view' || !ID.test(event.sessionId || '') || !inbound.isAllowedPage(event.url)) {
      return res.status(204).end();
    }
    const where = inbound.classifySource({ referrer: event.referrer, utm: event.utm || {}, pageUrl: event.url });
    const { country, city } = locationOf(req);
    // A visitor who already filled in the form stays linked to their lead.
    const known = await prisma.webVisit.findFirst({ where: { visitorId: event.visitorId, leadId: { not: null } }, select: { leadId: true } });
    await prisma.webVisit.create({
      data: {
        id: event.viewId,
        visitorId: event.visitorId,
        sessionId: event.sessionId,
        url: inbound.clip(event.url, 1000),
        path: inbound.clip(pathOf(event.url), 500),
        title: event.title ? inbound.clip(event.title, 300) : null,
        referrer: event.referrer ? inbound.clip(event.referrer, 1000) : null,
        source: where.source,
        medium: where.medium,
        campaign: where.campaign,
        country,
        city,
        leadId: known?.leadId || null,
      },
    });
    res.status(204).end();
  } catch (error: any) {
    // Duplicate view ids (a resent beacon) are fine.
    if (error?.code !== 'P2002') console.error('Inbound event failed:', error?.message);
    res.status(204).end();
  }
});

// ---- form fills ----
router.post('/form', async (req: Request, res: Response) => {
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  try {
    if (BOT.test(header(req, 'user-agent'))) return res.status(204).end();
    if (tooManyForms(req)) return res.status(429).json({ error: 'Too many submissions' });
    const event = body(req);
    if (!inbound.isAllowedPage(event.pageUrl)) return res.status(400).json({ error: 'Page not allowed' });

    const fields = inbound.readFormFields(Array.isArray(event.fields) ? event.fields.slice(0, 40) : []);
    if (!inbound.EMAIL.test(fields.email)) return res.status(400).json({ error: 'A valid email is required' });

    const visitorId = ID.test(event.visitorId || '') ? event.visitorId : null;
    const { country, city } = locationOf(req);
    const now = new Date();
    const submission = {
      at: now.toISOString(),
      message: fields.message || null,
      pageUrl: inbound.clip(event.pageUrl, 1000),
      pageTitle: event.pageTitle ? inbound.clip(event.pageTitle, 300) : null,
      formId: event.formId ? String(event.formId).slice(0, 40) : null,
    };

    // First touch: the visitor's earliest tracked page view, else what the browser kept.
    const firstVisit = visitorId
      ? await prisma.webVisit.findFirst({ where: { visitorId }, orderBy: { createdAt: 'asc' } })
      : null;
    const ft = event.firstTouch || {};
    const firstTouch = firstVisit
      ? {
          source: firstVisit.source,
          medium: firstVisit.medium,
          campaign: firstVisit.campaign,
          referrer: firstVisit.referrer,
          landingPage: firstVisit.url,
          firstSeenAt: firstVisit.createdAt.toISOString(),
        }
      : {
          ...inbound.classifySource({ referrer: ft.referrer || event.referrer, utm: ft.utm || event.utm || {}, pageUrl: ft.landing || event.pageUrl }),
          referrer: ft.referrer || event.referrer || null,
          landingPage: ft.landing || event.pageUrl,
          firstSeenAt: ft.at || now.toISOString(),
        };
    const cameFrom = inbound.sourceLabel(firstTouch);

    // One lead per email address: a second enquiry is added to the same lead.
    const existing = await prisma.lead.findFirst({
      where: { signals: { path: ['inbound', 'email'], equals: fields.email } },
    });
    let leadId: string;

    if (existing) {
      const signals: any = existing.signals || {};
      const previous = signals.inbound || {};
      const message = fields.message || previous.message;
      leadId = existing.id;
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          signals: {
            ...signals,
            postedAt: now.toISOString(),
            inbound: {
              ...previous,
              name: fields.name || previous.name,
              phone: fields.phone || previous.phone,
              company: fields.company || previous.company,
              jobTitle: fields.jobTitle || previous.jobTitle,
              message,
              pageUrl: submission.pageUrl,
              submittedAt: submission.at,
              consentMarketing: !!event.consentMarketing || !!previous.consentMarketing,
              submissions: [...(previous.submissions || []), submission].slice(-20),
              visitorIds: [...new Set([...(previous.visitorIds || []), visitorId].filter(Boolean))].slice(-10),
            },
            requirement: {
              ...(signals.requirement || {}),
              headline: inbound.headlineFrom(message, signals.requirement?.headline),
              summary: message,
            },
          },
        },
      });
    } else {
      const domain = inbound.emailDomain(fields.email);
      const businessEmail = inbound.isBusinessEmail(fields.email);
      const company = fields.company || (businessEmail ? inbound.companyFromDomain(domain) : null);
      const text = `${fields.message} ${fields.company} ${submission.pageTitle || ''}`;
      const lob = inferLob(text);
      const industry = classifyIndustry(text, company || '');
      const region = inbound.regionOfCountry(country);
      const facts = [
        fields.name && { label: 'Name', value: fields.name },
        { label: 'Email', value: fields.email },
        fields.phone && { label: 'Phone', value: fields.phone },
        fields.jobTitle && { label: 'Title', value: fields.jobTitle },
        company && { label: 'Company', value: fields.company ? company : `${company} (from the email domain)` },
        { label: 'Came from', value: cameFrom },
        { label: 'Form on', value: submission.pageTitle || pathOf(submission.pageUrl) },
      ].filter(Boolean);
      const created = await prisma.lead.create({
        data: {
          companyName: company || fields.name || fields.email,
          industry,
          website: businessEmail ? `https://${domain}` : null,
          employees: null,
          revenue: null,
          hq: [city, country].filter(Boolean).join(', ') || null,
          lob,
          intentSignal: 'Contacted Amzur through the website',
          recommendedService: (LOB_SERVICES as Record<string, string>)[lob],
          leadScore: 90,
          source: `amzur.com contact form (${cameFrom})`,
          outreachEmail: fields.email,
          signals: {
            leadType: 'inbound_form',
            dataSource: 'amzur.com',
            postedAt: submission.at,
            postedAtSource: 'Form submitted',
            postedAtChecked: true,
            requirementChecked: true,
            // A personal email gives nothing to look the company up by.
            companyChecked: !businessEmail,
            geography: region,
            location: [city, country].filter(Boolean).join(', ') || null,
            whyThisLead: ['Contacted Amzur through amzur.com', `Came from ${cameFrom}`],
            techStack: [],
            sourceTitle: submission.pageTitle,
            searchContext: inbound.clip(fields.message, 500),
            requirement: {
              kind: 'inbound',
              headline: inbound.headlineFrom(fields.message, 'Website enquiry'),
              summary: fields.message || null,
              facts,
              sections: [],
              from: 'amzur.com contact form',
            },
            ...(businessEmail ? { company: { website: `https://${domain}`, websiteSource: 'Work email domain' } } : {}),
            inbound: {
              name: fields.name || null,
              email: fields.email,
              phone: fields.phone || null,
              company: fields.company || null,
              jobTitle: fields.jobTitle || null,
              businessEmail,
              message: fields.message || null,
              pageUrl: submission.pageUrl,
              pageTitle: submission.pageTitle,
              formId: submission.formId,
              submittedAt: submission.at,
              consentMarketing: !!event.consentMarketing,
              country,
              city,
              firstTouch,
              submissions: [submission],
              visitorIds: visitorId ? [visitorId] : [],
            },
          },
        },
      });
      leadId = created.id;
      console.log(`📥 Inbound lead: ${created.companyName} (${cameFrom})`);
    }

    // Everything this visitor read before (and after) now shows on the lead.
    if (visitorId) await prisma.webVisit.updateMany({ where: { visitorId }, data: { leadId } });
    res.status(204).end();
  } catch (error: any) {
    console.error('Inbound form failed:', error?.message);
    res.status(500).json({ error: 'Could not record the form' });
  }
});

// ---- dashboard: recent visitors ----
router.get('/visitors', async (req: Request, res: Response) => {
  try {
    const days = Math.min(Math.max(parseInt(String(req.query.days), 10) || 30, 1), 90);
    const since = new Date(Date.now() - days * 86400000);
    const visits = await prisma.webVisit.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      take: 20000,
    });

    const byVisitor = new Map<string, any>();
    const pageCounts = new Map<string, { path: string; title: string | null; views: number; visitors: Set<string> }>();
    const sourceCounts = new Map<string, Set<string>>();
    for (const v of visits) {
      let visitor = byVisitor.get(v.visitorId);
      if (!visitor) {
        visitor = {
          visitorId: v.visitorId,
          firstSeen: v.createdAt,
          lastSeen: v.createdAt,
          source: v.source,
          medium: v.medium,
          campaign: v.campaign,
          landingPage: v.path,
          country: v.country,
          city: v.city,
          sessions: new Set<string>(),
          pages: [] as { path: string; title: string | null; at: Date; engagedSec: number | null }[],
          engagedSec: 0,
          leadId: null as string | null,
        };
        byVisitor.set(v.visitorId, visitor);
      }
      visitor.lastSeen = v.createdAt;
      visitor.sessions.add(v.sessionId);
      visitor.pages.push({ path: v.path, title: v.title, at: v.createdAt, engagedSec: v.engagedSec });
      visitor.engagedSec += v.engagedSec || 0;
      if (v.leadId) visitor.leadId = v.leadId;
      if (!visitor.country && v.country) visitor.country = v.country;

      const page = pageCounts.get(v.path) || { path: v.path, title: v.title, views: 0, visitors: new Set<string>() };
      page.views++;
      page.visitors.add(v.visitorId);
      if (!page.title && v.title) page.title = v.title;
      pageCounts.set(v.path, page);
    }
    for (const visitor of byVisitor.values()) {
      const label = inbound.sourceLabel({ source: visitor.source, medium: visitor.medium });
      if (!sourceCounts.has(label)) sourceCounts.set(label, new Set());
      sourceCounts.get(label)!.add(visitor.visitorId);
    }

    const leadIds = [...new Set([...byVisitor.values()].map((v) => v.leadId).filter(Boolean))] as string[];
    const leads = leadIds.length
      ? await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, companyName: true } })
      : [];
    const leadName = new Map(leads.map((lead) => [lead.id, lead.companyName]));

    const visitors = [...byVisitor.values()]
      .map((v) => ({
        visitorId: v.visitorId,
        firstSeen: v.firstSeen,
        lastSeen: v.lastSeen,
        cameFrom: inbound.sourceLabel({ source: v.source, medium: v.medium }),
        campaign: v.campaign,
        landingPage: v.landingPage,
        country: v.country,
        region: inbound.regionOfCountry(v.country),
        city: v.city,
        sessions: v.sessions.size,
        pageViews: v.pages.length,
        engagedSec: v.engagedSec,
        // Most recent pages first, without repeats.
        pages: v.pages
          .slice()
          .reverse()
          .filter((p: any, i: number, all: any[]) => all.findIndex((q) => q.path === p.path) === i)
          .slice(0, 8)
          .map((p: any) => ({ path: p.path, title: p.title })),
        leadId: v.leadId,
        leadName: v.leadId ? leadName.get(v.leadId) || null : null,
      }))
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

    res.json({
      days,
      totals: {
        visitors: visitors.length,
        returning: visitors.filter((v) => v.sessions > 1).length,
        pageViews: visits.length,
        formFills: visitors.filter((v) => v.leadId).length,
      },
      sources: [...sourceCounts.entries()]
        .map(([label, ids]) => ({ label, visitors: ids.size }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 10),
      topPages: [...pageCounts.values()]
        .map((p) => ({ path: p.path, title: p.title, views: p.views, visitors: p.visitors.size }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 10),
      visitors: visitors.slice(0, 200),
    });
  } catch (error: any) {
    console.error('Visitors summary failed:', error?.message);
    res.status(500).json({ error: 'Could not load website visitors' });
  }
});

// ---- lead page: what an inbound lead read ----
router.get('/leads/:id/journey', async (req: Request, res: Response) => {
  try {
    const visits = await prisma.webVisit.findMany({
      where: { leadId: req.params.id },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
    res.json({
      visits: visits.map((v) => ({
        at: v.createdAt,
        path: v.path,
        url: v.url,
        title: v.title,
        cameFrom: inbound.sourceLabel({ source: v.source, medium: v.medium }),
        sessionId: v.sessionId,
        engagedSec: v.engagedSec,
        scrollPct: v.scrollPct,
      })),
    });
  } catch (error: any) {
    console.error('Journey failed:', error?.message);
    res.status(500).json({ error: 'Could not load the visitor journey' });
  }
});

export default router;
