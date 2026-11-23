// A vocabulary of skills with the different ways people write them, so "JS", "javascript" and
// "Java Script" count as one skill. Not exhaustive: terms outside it are still compared by the
// keyword-overlap part of the match score. Add entries here as real JDs expose gaps.

// [canonical name, ...other spellings]
const VOCAB: string[][] = [
  // Languages and frameworks
  ["java", "core java", "java8", "java 8", "j2ee"], ["javascript", "js", "ecmascript", "es6"], ["typescript", "ts"], ["python"], ["c++", "cpp"], ["c#", "csharp"], [".net", "dotnet", "asp.net", "dot net"],
  ["golang", "go lang"], ["php"], ["ruby", "ruby on rails", "rails"], ["kotlin"], ["swift"], ["scala"], ["r programming"], ["sql", "t-sql", "pl/sql", "plsql"],
  ["react", "reactjs", "react.js"], ["angular", "angularjs"], ["vue", "vuejs", "vue.js"], ["node.js", "nodejs", "node js", "node"], ["express", "expressjs"], ["spring boot", "springboot", "spring"], ["django"], ["flask"], ["fastapi"],
  ["html", "html5"], ["css", "css3"], ["tailwind", "tailwindcss"], ["next.js", "nextjs"], ["graphql"], ["rest api", "restful", "rest apis", "restful api"], ["microservices", "micro services"],
  // Data, cloud, devops
  ["postgresql", "postgres"], ["mysql"], ["mongodb", "mongo"], ["oracle"], ["redis"], ["elasticsearch"], ["kafka"], ["spark", "pyspark"], ["hadoop"], ["airflow"],
  ["aws", "amazon web services", "ec2", "s3"], ["azure", "microsoft azure"], ["gcp", "google cloud"], ["docker"], ["kubernetes", "k8s"], ["terraform"], ["jenkins"], ["ci/cd", "cicd", "ci cd", "continuous integration"], ["git", "github", "gitlab"], ["linux", "unix"],
  ["machine learning", "ml"], ["deep learning"], ["nlp", "natural language processing"], ["data science"], ["data analysis", "data analytics"], ["power bi", "powerbi"], ["tableau"], ["excel", "ms excel", "microsoft excel", "advanced excel"], ["tally", "tally erp", "tally prime"],
  ["selenium"], ["manual testing"], ["automation testing", "test automation"], ["jira"], ["agile", "scrum"], ["sap", "sap erp"], ["sap fico", "fico"], ["salesforce"],
  // HR and recruitment
  ["recruitment", "talent acquisition", "recruiting", "end to end recruitment"], ["sourcing", "candidate sourcing"], ["payroll", "payroll processing"], ["compliance", "statutory compliance"], ["employee relations"], ["onboarding"], ["hrms", "hris"],
  ["performance management"], ["training and development", "learning and development", "l&d"], ["industrial relations"], ["pf", "provident fund", "epf"], ["esi", "esic"], ["labour law", "labor law", "labour laws"], ["hr operations"], ["hr policies"],
  // Finance and accounts
  ["accounting", "accounts"], ["accounts payable", "payables"], ["accounts receivable", "receivables"], ["gst", "gst filing"], ["tds"], ["taxation", "direct tax", "indirect tax"], ["audit", "auditing", "internal audit"], ["financial reporting", "mis reporting"], ["budgeting", "forecasting"], ["reconciliation", "bank reconciliation"], ["ifrs", "ind as"],
  // Sales, marketing, operations
  ["sales", "business development"], ["b2b sales"], ["lead generation"], ["crm"], ["account management", "key account management"], ["negotiation"], ["digital marketing"], ["seo"], ["sem", "google ads"], ["social media marketing"], ["content writing", "copywriting"],
  ["supply chain"], ["logistics"], ["procurement", "purchasing", "sourcing and procurement"], ["inventory management", "inventory"], ["warehouse management"], ["vendor management"], ["production planning", "ppc"], ["quality control", "qc"], ["quality assurance", "qa"], ["lean", "six sigma", "kaizen"], ["autocad"], ["textile", "garment", "apparel"],
  ["customer service", "customer support"], ["project management"], ["stakeholder management"], ["team management", "people management", "team leadership"], ["communication skills", "communication"],
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

interface Entry {
  canonical: string;
  re: RegExp;
}

// Whole-word match that still works for "c++", "c#" and ".net" (plain \b does not).
const ENTRIES: Entry[] = VOCAB.map(([canonical, ...aliases]) => ({
  canonical: canonical!,
  re: new RegExp(`(?<![a-z0-9+#.])(?:${[canonical!, ...aliases].map((a) => escape(a).replace(/\s+/g, "[\\s-]+")).join("|")})(?![a-z0-9+#])`, "i"),
}));

/** Canonical skill names that appear in the text. */
export function findKnownSkills(text: string): Set<string> {
  const flat = text.toLowerCase();
  const found = new Set<string>();
  for (const e of ENTRIES) if (e.re.test(flat)) found.add(e.canonical);
  return found;
}
