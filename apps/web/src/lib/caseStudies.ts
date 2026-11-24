// Amzur case studies, matched to each lead by service line, industry and
// technology so reps can quote the closest proof point.
//
// Source: the 42 case studies published at https://amzur.com/case-studies/
// (read on 24 Nov 2026 through the site's public WordPress API, which also
// returns the older ones the page loads on scroll). Outcomes use the pages'
// own wording and figures; `client` holds the industry as the page states it.
// To refresh, re-read the site and regenerate this list; add new entries in
// the same shape. Services use the Lead Engine's service lines (lead.lob).
export type CaseStudy = {
  title: string;
  client?: string;
  industry?: string;
  services: string[];
  technologies?: string[];
  outcome: string;
  url?: string;
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    title: "Building EVoke, from idea to scale",
    industry: "Energy",
    client: "Energy",
    services: ["Application Development", "Cloud", "Process Automation", "Solution"],
    technologies: ["AWS", "PostgreSQL", "Redis", "Java", "Flutter", "Jenkins"],
    outcome: "4,000+ ports, 30,000+ drivers and 99.9% uptime, with the full team transferred to EVoke.",
    url: "https://amzur.com/casestudy/building-evoke-from-idea-to-scale/",
  },
  {
    title: "Ashley Stewart Modernizes Legacy Retail Operations with NetSuite ERP",
    industry: "Retail & Consumer",
    client: "Retail",
    services: ["ERP", "Legacy Modernization"],
    technologies: ["NetSuite", "Shopify", "Power BI", "AS/400", "JDA"],
    outcome: "Amzur modernised Ashley Stewart’s legacy retail operations by migrating its outdated ERP system to Oracle NetSuite, streamlining financial processes, integrations, and data management while building a scalable foundation for future growth.",
    url: "https://amzur.com/casestudy/ashley-stewart-modernizes-legacy-retail-operations-with-netsuite-erp/",
  },
  {
    title: "Cloud-based business management and sales automation platform",
    industry: "Technology",
    client: "IT / Software",
    services: ["Application Development", "Cloud"],
    technologies: ["AWS", "Lambda", "Kafka"],
    outcome: "Amzur successfully launched the SaaS solution on the cloud and allowed MAPS technologies to immediately onboard customers without compromising despite aggressive timescales. They could continue to market and win new business from large enterprises that demand the highest standards that have been inbuilt into their platform from launch.",
    url: "https://amzur.com/casestudy/cloud-based-platform-for-business-management/",
  },
  {
    title: "Modernized Retail ERP software for Khameleon Software",
    industry: "Technology",
    client: "IT / Software",
    services: ["Application Development", "Legacy Modernization", "Offshore"],
    outcome: "Improved its clientele by 4x; profit margin increased by 25%; overall 38% decrease in costs.",
    url: "https://amzur.com/casestudy/modernized-khameleon-erp-application/",
  },
  {
    title: "Retail Technology Transformation",
    industry: "Retail & Consumer",
    client: "Retail",
    services: ["Application Development", "ERP"],
    technologies: ["NetSuite", "Shopify", "Salesforce", "Power BI", "AS/400", "JDA"],
    outcome: "Reduced application complexity by 40%+ and drove a 25% increase in sales.",
    url: "https://amzur.com/casestudy/retail-technology-transformation/",
  },
  {
    title: "Nationwide Prescription Routing Through Hyperautomation",
    industry: "Healthcare",
    client: "Healthcare",
    services: ["Application Development", "Process Automation"],
    outcome: "Launched a fully automated prescription routing system in 3.5 months, using only 25% of the resources typically needed for a traditional high-code project.",
    url: "https://amzur.com/casestudy/nationwide-prescription-routing-through-hyperautomation/",
  },
  {
    title: "Driving Sales with Seamless Payment Integration on Shopify",
    industry: "Retail & Consumer",
    client: "E-commerce",
    services: ["Application Development"],
    technologies: ["Shopify", "Salesforce"],
    outcome: "25% boost in overall sales following the launch of the PLCC payment option at checkout; Enhanced customer engagement through seamless, on-brand promotions that encouraged sign-ups and repeat purchases; Higher average order value (AOV) driven by the exclusive 20% first-order discount for PLCC applicants; Improved payment flexibility, leading to reduced cart abandonment and a smoother checkout experience.",
    url: "https://amzur.com/casestudy/driving-sales-with-seamless-payment-integration-on-shopify/",
  },
  {
    title: "Custom Promotion App for a Retail eCommerce Client on Shopify",
    industry: "Retail & Consumer",
    client: "E-commerce",
    services: ["Application Development", "ERP"],
    technologies: ["NetSuite", "Shopify", "Salesforce"],
    outcome: "60% reduction in time taken to launch a new promotional campaign; Complete elimination of third-party apps previously needed for complex discounting; Improved customer experience through consistent, visible promotions across all storefront pages; Increased average order value due to tiered and conditional promotions.",
    url: "https://amzur.com/casestudy/custom-promotion-app-for-a-retail-ecommerce-client",
  },
  {
    title: "Spencer Technologies Achieves 24/7 System Reliability with Infrastructure Management Solution",
    industry: "Technology",
    client: "IT services",
    services: ["Solution"],
    outcome: "Achieved 99.99% system uptime; Zero critical incidents during implementation; 85% reduction in system vulnerabilities; Maintained 100% compliance across all systems.",
    url: "https://amzur.com/casestudy/spencer-technologies-achieves-24-7-system-reliability-with-infrastructure-management-solution/",
  },
  {
    title: "Implementing SOC-2 Compliant Infrastructure for Investment Platform",
    industry: "Financial Services",
    client: "Venture capital / investment",
    services: ["Cloud"],
    technologies: ["AWS", "Terraform"],
    outcome: "Achieved SOC-2 compliance with comprehensive security monitoring and robust threat protection, plus streamlined application deployment and an optimized containerized environment.",
    url: "https://amzur.com/casestudy/implementing-soc-2-compliant-infrastructure-for-investment-platform/",
  },
  {
    title: "Secure Database Migration for Healthcare Technology Platform",
    industry: "Healthcare",
    client: "Healthcare",
    services: ["Cloud"],
    technologies: ["AWS", "Azure", "MySQL"],
    outcome: "Zero data loss during the transition, minimal production impact and near real-time data replication, while meeting all compliance requirements.",
    url: "https://amzur.com/casestudy/secure-database-migration-for-healthcare-technology-platform/",
  },
  {
    title: "Enhancing Cloud Security for Educational Learning Platform",
    industry: "Public Sector",
    client: "Education",
    services: ["Cloud"],
    technologies: ["AWS"],
    outcome: "Achieved comprehensive compliance with round-the-clock security monitoring, swift incident detection and response, and automated security processes.",
    url: "https://amzur.com/casestudy/enhancing-cloud-security-for-educational-learning-platform/",
  },
  {
    title: "Modernizing Ruby Application Infrastructure with AWS ECS",
    industry: "Technology",
    client: "Inventory Management Software",
    services: ["Cloud"],
    technologies: ["AWS", "Terraform", "ECS", "Datadog"],
    outcome: "Eliminated version upgrade constraints, accelerated release cycles and introduced infrastructure as code for better control.",
    url: "https://amzur.com/casestudy/modernizing-ruby-application-infrastructure-with-aws-ecs/",
  },
  {
    title: "Real-Time Analytics Transforms Virtual Retail Platform Performance",
    industry: "Retail & Consumer",
    client: "Retail",
    services: ["Cloud"],
    technologies: ["AWS"],
    outcome: "20% increase in conversion rates; Better cross-selling through targeted recommendations; More effective virtual store layouts; 45% decrease in cart abandonment.",
    url: "https://amzur.com/casestudy/real-time-analytics-transforms-virtual-retail-platform-performance/",
  },
  {
    title: "Optimizing Search Infrastructure for Supply Chain Management Platform",
    industry: "Technology",
    client: "Supply Chain Management Software",
    services: ["Cloud"],
    technologies: ["AWS", "OpenSearch"],
    outcome: "Enhanced search capabilities and index management, reduced the maintenance burden and improved the user experience.",
    url: "https://amzur.com/casestudy/optimizing-search-infrastructure-for-supply-chain-management-platform/",
  },
  {
    title: "Streamlining Deployment Pipeline for Inventory Management Solution",
    industry: "Technology",
    client: "Inventory Management Software",
    services: ["Cloud"],
    technologies: ["AWS", "ECS", "Ruby on Rails"],
    outcome: "Reduced deployment time from days to one hour; Increased developer and tester confidence; Better organized user story creation; Established clear permissions and access controls.",
    url: "https://amzur.com/casestudy/streamlining-deployment-pipeline-for-inventory-management-solution/",
  },
  {
    title: "Strengthening Cloud Security for Leading Event Management Platform",
    industry: "Technology",
    client: "Event Management & Webcasting",
    services: ["Cloud"],
    technologies: ["AWS"],
    outcome: "The platform now maintains high security standards while supporting continued growth and innovation in their event management services.",
    url: "https://amzur.com/casestudy/strengthening-cloud-security-for-leading-event-management-platform/",
  },
  {
    title: "Transforming Retail Operations: How a Leading Retailer Boosted Efficiency with Comprehensive Data Migration Strategies",
    industry: "Retail & Consumer",
    client: "E-commerce",
    services: ["Application Development", "ERP"],
    technologies: ["NetSuite", "Shopify", "Salesforce"],
    outcome: "The migration process was completed with zero data loss, ensuring all critical information was accurately transferred; Automation reduced manual efforts and cut migration time by 50%; Mulesoft’s architecture managed large datasets seamlessly without performance issues; The new system provided real-time access to business data, enabling informed decision-making and agility.",
    url: "https://amzur.com/casestudy/transforming-retail-operations-how-a-leading-retailer-boosted-efficiency-with-comprehensive-data-migration-strategies/",
  },
  {
    title: "Enhancing Public Health Program Efficiency Through Hyperautomation Innovation",
    industry: "Public Sector",
    client: "Higher education / public health",
    services: ["Application Development", "Process Automation"],
    outcome: "Average time to fulfill participant change requests dropped from 5 months to just 4 days; Over 55% CapEx reduction and a 70% drop in support/maintenance costs; Onboarding and coordination across agencies, caregivers, and families improved by over 60%; Improved participant satisfaction drove wider rollout across more regions and agencies.",
    url: "https://amzur.com/casestudy/enhancing-public-health-program-efficiency-through-hyperautomation-innovation/",
  },
  {
    title: "Breaking Free from Silos: Achieving Application Rationalization Through Hyperautomation",
    industry: "Retail & Consumer",
    client: "Consumer goods",
    services: ["Application Development", "Process Automation"],
    outcome: "All in-house applications were seamlessly integrated, eliminating the need for extensive custom coding; Leadership gained instant access to up-to-date training data, enabling faster, data-driven decisions; Reporting shifted from weekly to “on demand,” providing real-time visibility into program effectiveness; Reduced Development Costs and Effort.",
    url: "https://amzur.com/casestudy/breaking-free-from-silos-achieving-application-rationalization-through-hyperautomation/",
  },
  {
    title: "Dennick FruitSource Gains Supply Chain Transparency with Customized NetSuite Shipment Tracking",
    industry: "Food & Beverage Manufacturing",
    client: "Food & beverage",
    services: ["ERP"],
    technologies: ["NetSuite"],
    outcome: "Real-time shipment status improved supply chain visibility and on-time deliveries; automated shipment updates in NetSuite kept inventory records accurate, minimizing stock-outs and overages.",
    url: "https://amzur.com/casestudy/dennick-fruitsource-gains-supply-chain-transparency-with-customized-netsuite-shipment-tracking/",
  },
  {
    title: "MyBasePay Streamlines Operations and Boosts Revenue with NetSuite",
    client: "Staffing",
    services: ["ERP"],
    technologies: ["NetSuite"],
    outcome: "50% revenue increase, with a projected jump to $35 million by year-end, and lower costs from streamlined operations.",
    url: "https://amzur.com/casestudy/mybasepay-streamlines-operations-and-boosts-revenue-with-netsuite/",
  },
  {
    title: "CRA maximized profitability and reduced manual effort through automation",
    industry: "Manufacturing",
    client: "Manufacturing",
    services: ["ERP"],
    technologies: ["NetSuite"],
    outcome: "All business data now resides in a single, cloud-based system, giving CRA a unified 360-degree view of the business.",
    url: "https://amzur.com/casestudy/cra-maximized-profitability-and-reduced-manual-effort-through-automation/",
  },
  {
    title: "Enhanced efficiency and growth: How a leading EPM solutions provider excelled with NetSuite and OpenAir Integration",
    client: "Professional services",
    services: ["ERP"],
    technologies: ["NetSuite", "OpenAir", "Salesforce"],
    outcome: "Achieved streamlined global financial processes with multi-currency handling, automated consolidation, and accurate cost tracking across subsidiaries. Reduced reliance on manual processes through automation of timesheets, expense tracking, compliance, and reporting, freeing up valuable time.",
    url: "https://amzur.com/casestudy/netsuite-openair-implementation",
  },
  {
    title: "A leading coffee roasting company improved efficiency in their accounting processes and saved time on reconciliation through automation",
    industry: "Food & Beverage Manufacturing",
    client: "Food & beverage",
    services: ["ERP"],
    technologies: ["NetSuite", "OpenAir"],
    outcome: "The connector automatically creates invoices, payments, deposits, and credit memos in NetSuite nightly, reducing processing time from over 8 hours to just 3 hours using our Restful API; Daily cash/credit statements are automated for each location/store; Setup and configuration only need to be done once, eliminating frequent setup requirements; Enhanced Sales Effectiveness: Integrated lead-to-cash management, actionable insights, and automated invoice creation have significantly streamlined their sales process.",
    url: "https://amzur.com/casestudy/customized-netsuite-pos-integration/",
  },
  {
    title: "Innovating Order Management: Ambika’s Mobile App Revolution",
    industry: "Retail & Consumer",
    client: "Retail",
    services: ["ERP"],
    technologies: ["NetSuite"],
    outcome: "Making it easier for customers to place new or recurring orders; Helping build a better relationship between AGF and their customers; Enabling new and existing customers to directly access AGF’s social media pages; Receiving feedback directly from customers.",
    url: "https://amzur.com/casestudy/innovating-order-management/",
  },
  {
    title: "Ascent OS – Transformation through Streamlined QA Process",
    industry: "Energy",
    client: "Energy",
    services: ["Application Development"],
    outcome: "Defect Removal Efficiency improved to 100% from 60%; all defects found in testing are now fixed before release.",
    url: "https://amzur.com/casestudy/ascent-os-transformation-through-streamlined-qa-process/",
  },
  {
    title: "Enhancing App Performance and User Experience for Fluid Truck",
    client: "Transportation / logistics",
    services: ["Application Development"],
    outcome: "Bug fixes during release cycles contributed to a 15% increase in the customer base, and the refined user experience led to a 10-15% rise in clients’ return on investment.",
    url: "https://amzur.com/casestudy/enhancing-app-performance-and-user-experience-for-fluid-truck/",
  },
  {
    title: "Transforming and Upgrading a Legacy System: Empowering a Public Research University’s Department of Public Health",
    industry: "Public Sector",
    client: "Education",
    services: ["Process Automation"],
    outcome: "The transformation project, encompassing over 50 pending change requests, was successfully completed within just four months. Additionally, the initial capital expenditure costs were reduced by 70%, and ongoing maintenance costs decreased by 30%.",
    url: "https://amzur.com/casestudy/transforming-and-upgrading-a-legacy-system/",
  },
  {
    title: "HVAC Servicing Company Reduces Technician Assignment Time by 50% with AI",
    client: "Professional services",
    services: ["Process Automation"],
    technologies: ["Python", "React"],
    outcome: "The average time needed to assign a technician to a service request was reduced by nearly half, freeing dispatch operators for customer service.",
    url: "https://amzur.com/casestudy/automated-technician-recommender-platform/",
  },
  {
    title: "NetSuite helps accelerate sales and manufacturing operations for provider of storm and security shutters",
    industry: "Manufacturing",
    client: "Manufacturing",
    services: ["ERP"],
    technologies: ["NetSuite"],
    outcome: "An online quote system gives the sales team quick pricing estimates; streamlined NetSuite workflows simplified bill of materials and paperwork generation, reducing costs.",
    url: "https://amzur.com/casestudy/accelerate-sales-and-manufacturing-operations-for-provider-of-storm-and-security-shutters/",
  },
  {
    title: "Accelerating Quality and Efficiency: Trxade’s Agile Transformation with Amzur’s QA engagement",
    industry: "Healthcare",
    client: "Healthcare",
    services: ["Application Development"],
    outcome: "20% improvement in product quality, with product builds now deployed more efficiently for faster time to market.",
    url: "https://amzur.com/casestudy/accelerating-quality-and-efficiency/",
  },
  {
    title: "Auto-Moderation of User Generated Content",
    industry: "Retail & Consumer",
    client: "E-commerce",
    services: ["Process Automation"],
    technologies: ["PostgreSQL"],
    outcome: "Our solution achieved a prediction precision of 94% on the test data and post-production monitoring. We also achieved a true positive rate of 80% on the test data and post-production monitoring.",
    url: "https://amzur.com/casestudy/auto-moderation-of-user-generated-content/",
  },
  {
    title: "Reducing Waste and Labor Costs in Food Retail: An Automated Quality Inspection Solution",
    industry: "Retail & Consumer",
    client: "Retail",
    services: ["Process Automation"],
    outcome: "Our automated solution has proven to be highly effective, resulting in a 25% reduction in product wastage within the first week of implementation. After four months of operation, the solution led to a further 35% reduction in manual labor costs.",
    url: "https://amzur.com/casestudy/reducing-waste-and-labor-costs-in-food-retail-an-automated-quality-inspection-solution/",
  },
  {
    title: "Custom warehouse management system on NetSuite improves inventory management and helps reduce cost",
    industry: "Manufacturing",
    client: "Machinery",
    services: ["ERP"],
    technologies: ["NetSuite", "SuiteScript"],
    outcome: "With its user-friendly interface and mobile accessibility, the new WMS has improved the inventory control and speed of daily operations; The WMS now provides real-time data entry and eliminates the need for additional user license costs in NetSuite; The order process has improved substantially with the help of automated label printing and barcoding options. The process is much faster and user friendly; The Pick, Pack, and Ship process is now more flexible and easier to manage.",
    url: "https://amzur.com/casestudy/custom-warehouse-management-system-on-netsuite-improves-inventory-management-and-helps-reduce-cost/",
  },
  {
    title: "NetSuite implementation saved costs on inventory management and modernized e-commerce application",
    industry: "Manufacturing",
    client: "Wholesale & Manufacturing",
    services: ["ERP"],
    technologies: ["NetSuite", "SuiteScript"],
    outcome: "Optimized inventory management with accurate demand forecasting; a revamped, mobile-friendly website increased sales efficiency and customer satisfaction.",
    url: "https://amzur.com/casestudy/netsuite-for-inventory-management/",
  },
  {
    title: "Managing PIM Infrastructure On AWS Cloud to optimize operational and maintenance costs",
    industry: "Technology",
    client: "HR tech",
    services: ["Application Development", "Cloud"],
    technologies: ["AWS", "Python", "Java", "Selenium"],
    outcome: "Reduced Product-to-Market time from 10 days to 10 minutes; Backup duration reduced from 48 hours to 2 hours with AWS Backup service; Improved performance of the PIM due to migrating to Nitro-based instances and 50% cost savings due to the reserved instance purchase; Overall solution has given at least 85% savings per month.",
    url: "https://amzur.com/casestudy/managing-pim-infrastructure-on-aws-cloud/",
  },
  {
    title: "Optimized P&C operations with Sapiens Stingray and dedicated team",
    industry: "Financial Services",
    client: "Insurance",
    services: ["Cloud", "Offshore"],
    technologies: ["AWS", "Python", "Sapiens"],
    outcome: "They improved and accelerated internal processes by 125%. Helped migrate AS400 from Texas to Florida and configure on the Florida network.",
    url: "https://amzur.com/casestudy/dedicated-teams-optimizing-p-and-c-operations-with-sapiens-stingray/",
  },
  {
    title: "Extending Netsuite With iTPM (Integrated Trade Promotion Management) For Consumer Goods Companies",
    industry: "Retail & Consumer",
    client: "FMCG",
    services: ["ERP"],
    technologies: ["NetSuite", "SuiteScript"],
    outcome: "Accelerated iTPM development, delivering an out-of-the-box trade promotion management solution installed as a NetSuite managed bundle.",
    url: "https://amzur.com/casestudy/extending-netsuite-with-itpm/",
  },
  {
    title: "Healthcare management solution to automate claims processing",
    industry: "Healthcare",
    client: "Healthcare",
    services: ["Application Development", "Process Automation"],
    outcome: "Bringing disparate data together to make well-informed decisions; Improving drug administration accuracy by 40%; Freeing up doctors to spend more time with patients; Error-free claim verification and processing.",
    url: "https://amzur.com/casestudy/modern-application-for-claim-processing-and-process-automation/",
  },
  {
    title: "Achieved high availability scalability through AWS Cloud",
    industry: "Technology",
    client: "Events / social media",
    services: ["Cloud"],
    technologies: ["AWS", "Docker", "ECS", "PostgreSQL", "MySQL", "Jenkins"],
    outcome: "Moved to a serverless, cloud-native architecture so Unation could handle traffic around the globe and manage customer information effectively.",
    url: "https://amzur.com/casestudy/achieved-high-availability-scalability-through-aws-cloud/",
  },
  {
    title: "Streamlining the school accreditation process through AWS Cloud solutions",
    industry: "Public Sector",
    client: "Education",
    services: ["Application Development", "Cloud"],
    technologies: ["AWS", "MySQL", "Ruby on Rails"],
    outcome: "FCIS saved 10% of its operational costs and up to 30% of time spent on data management.",
    url: "https://amzur.com/casestudy/aws-cloud-for-streamlining-school-accreditation-process/",
  },
];

// Topics shared between a lead's need and a case study, beyond service line,
// industry and technology. Each is one pattern matched as whole words.
const TOPICS: [string, RegExp][] = [
  ['AI / ML', /\b(ai|artificial intelligence|machine learning|ml|llm|gen ?ai|computer vision|recommend\w*|predict\w*|moderation)\b/],
  ['automation', /\b(automat\w+|hyperautomation|rpa|low[- ]code|workflow)\b/],
  ['cloud migration', /\b(migrat\w+|cloud|aws|azure|serverless)\b/],
  ['security / compliance', /\b(security|secure|soc ?-?2|hipaa|compliance|vulnerab\w+|iam|encryption)\b/],
  ['DevOps / reliability', /\b(devops|ci\/cd|pipeline|deployment|uptime|reliab\w+|infrastructure|kubernetes|docker|terraform|monitoring)\b/],
  ['data / analytics', /\b(data|analytics|dashboards?|reporting|power bi|tableau|search)\b/],
  ['QA / testing', /\b(qa|quality assurance|testing|test automation|defects?)\b/],
  ['e-commerce / payments', /\b(e-?commerce|shopify|checkout|payments?|storefront|promotion\w*)\b/],
  ['inventory / supply chain', /\b(inventory|warehouse|wms|supply chain|shipment|logistics|order management)\b/],
  ['finance / accounting', /\b(financ\w+|accounting|invoic\w+|billing|revenue|consolidation|general ledger)\b/],
  ['legacy modernization', /\b(legacy|moderni[sz]\w*|mainframe|as\/?400|end[- ]of[- ]life|technical debt|replace\w*)\b/],
  ['mobile apps', /\b(mobile|ios|android|flutter|react native|app store)\b/],
  ['healthcare workflows', /\b(patient|clinical|claims?|prescription|pharmac\w+|ehr|emr)\b/],
  ['product engineering', /\b(saas|platform|product|startup|scale)\b/],
];

const wholeWord = (needle: string) =>
  new RegExp(`(^|[^a-z0-9])${needle.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);

/**
 * The best-matching case studies for a lead, strongest first (up to 2).
 * Score: same service line 3, same industry 2, each shared technology 1,
 * each shared topic 1 (up to 3), stated figures 0.5 (tie-breaker).
 */
export function matchCaseStudies(lead: any, themes: string[]): { study: CaseStudy; reasons: string[] }[] {
  const req = lead.signals?.requirement || {};
  const text = [
    req.headline,
    req.summary,
    ...(req.sections || []).flatMap((section: any) => section.bullets || []),
    lead.signals?.sourceTitle,
    lead.signals?.searchContext,
    lead.intentSignal,
    ...(lead.signals?.apollo?.company?.relevantTech || []),
    ...themes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const leadTopics = TOPICS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);

  return CASE_STUDIES.map((study) => {
    const reasons: string[] = [];
    let score = 0;
    if (study.services.includes(lead.lob)) {
      score += 3;
      reasons.push('same service');
    }
    if (study.industry && study.industry === lead.industry) {
      score += 2;
      reasons.push(`same industry (${study.industry})`);
    }
    const tech = (study.technologies || []).filter((t) => wholeWord(t).test(text));
    if (tech.length) {
      score += tech.length;
      reasons.push(`same technology (${tech.join(', ')})`);
    }
    const studyText = `${study.title} ${study.outcome} ${(study.technologies || []).join(' ')}`.toLowerCase();
    const topics = leadTopics.filter((name) => TOPICS.find(([n]) => n === name)![1].test(studyText)).slice(0, 3);
    if (topics.length) {
      score += topics.length;
      reasons.push(`similar work (${topics.join(', ')})`);
    }
    if (/\d/.test(study.outcome)) score += 0.5;
    return { study, reasons, score };
  })
    .filter((m) => m.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ study, reasons }) => ({ study, reasons }));
}
